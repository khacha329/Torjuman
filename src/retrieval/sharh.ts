import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Block, Book } from '../types';
import { normalize } from '../lib/arabic';
import { recordRetrieval } from '../app/retrievalLog';

// Finding a ḥadīth's commentary in an imported sharḥ, by its own words.
//
// ---------------------------------------------------------------------------
// Why the matn is the key, and a number is not
//
// Riyāḍ aṣ-Ṣāliḥīn numbers its ḥadīth 1..1896. Ṣaḥīḥ Muslim numbers its own
// differently, Sharḥ an-Nawawī follows Muslim, and Fatḥ al-Bārī follows
// al-Bukhārī. There is no arithmetic between those numberings, so linking them
// means a cross-reference table — thousands of hand-verified pairs, per work,
// wrong in a way nobody would notice until a lesson.
//
// The text itself is the key that every work already shares. Searching for the
// matn finds the passage in whichever commentary is imported, with no table to
// build and none to maintain.
//
// ---------------------------------------------------------------------------
// Shingles, because narrations differ
//
// An exact substring search is the obvious implementation and it fails on
// exactly the cases that matter. The same ḥadīth reaches two collections
// through different chains, and the wording differs — a clause added, a synonym,
// a different opening formula. `searchBlocks` finds a literal substring, so one
// changed word in the middle defeats the whole query.
//
// So the matn is cut into overlapping short runs and each is searched
// separately. A block that matches several independent runs is the passage,
// even where no single long run matches. This is the approach verse detection
// already uses against the muṣḥaf, applied to a corpus that is stored rather
// than bundled.
//
// ---------------------------------------------------------------------------
// Not an-Nawawī
//
// Nothing here names a work. A commentary is any imported `reference` book in
// Shamela's own «شروح الحديث» category, which is metadata the importer already
// stores — so Fatḥ al-Bārī, Sharḥ an-Nawawī and anything else the reader adds
// appear as siblings, in one list, with no code change and no special case.
// ---------------------------------------------------------------------------

/** Shamela's own category for ḥadīth commentaries. */
export const COMMENTARY_CATEGORY = 'شروح الحديث';

export function isCommentaryWork(book: Book): boolean {
  return book.role === 'reference' && book.category.includes(COMMENTARY_CATEGORY);
}

/**
 * Words per shingle.
 *
 * Four is short enough to survive a differing clause and long enough not to be
 * a common phrase: «قال رسول الله صلى» would match half the book, but four
 * content words from the middle of a matn are effectively unique to it.
 */
const SHINGLE_WORDS = 4;

/** How many shingles to try. Bounds the work at ten passes over the index. */
const MAX_SHINGLES = 10;

/** Hits kept per shingle. A shingle matching more blocks than this is generic. */
const PER_SHINGLE_LIMIT = 40;

/**
 * Independent shingles a block must match to be accepted.
 *
 * Two, not one. A single four-word run can coincide — formulaic openings recur
 * across ḥadīth — and returning the wrong commentary for a ḥadīth the reader is
 * about to teach from is worse than returning nothing. Two runs from different
 * parts of the same matn landing in the same block is not a coincidence.
 */
const MIN_SHINGLE_HITS = 2;

/** How far the commentary may run before it is cut off. */
const MAX_COMMENTARY_BLOCKS = 60;

export interface SharhPassage {
  book: Book;
  /** The block in the commentary carrying the matn. */
  matnBlock: Block;
  /** What follows it, up to the next ḥadīth. */
  commentary: Block[];
  /** How many independent shingles landed here, of how many tried. */
  shingleHits: number;
  shinglesTried: number;
  /** True when the commentary hit the cap rather than a boundary. */
  truncated: boolean;
}

/**
 * Overlapping word-runs drawn evenly across the matn.
 *
 * Spread rather than consecutive: ten shingles from the opening words would all
 * fail together on a narration whose opening formula differs, which is the
 * commonest difference of all. Sampling across the whole matn means a divergent
 * opening costs one shingle, not all of them.
 */
export function matnShingles(matn: string, count = MAX_SHINGLES): string[] {
  const words = normalize(matn).split(' ').filter(Boolean);
  if (words.length < SHINGLE_WORDS) return [];

  const last = words.length - SHINGLE_WORDS;
  const wanted = Math.min(count, last + 1);
  const shingles: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < wanted; i++) {
    const at = wanted === 1 ? 0 : Math.round((i * last) / (wanted - 1));
    const shingle = words.slice(at, at + SHINGLE_WORDS).join(' ');
    if (!seen.has(shingle)) {
      seen.add(shingle);
      shingles.push(shingle);
    }
  }

  return shingles;
}

/** Every imported work that could carry a commentary on a ḥadīth. */
export async function commentaryWorks(storage: StorageAdapter): Promise<Book[]> {
  const books = await storage.listBooks();
  return books.filter(isCommentaryWork);
}

/**
 * The passage in `book` that carries this matn, and the commentary after it.
 *
 * Returns null when nothing matched well enough, which is a normal answer: not
 * every ḥadīth in one collection is commented on in another.
 */
export async function findSharh(
  storage: StorageAdapter,
  book: Book,
  matn: string,
): Promise<SharhPassage | null> {
  const shingles = matnShingles(matn);

  const note = (
    outcome: 'hit' | 'no-match' | 'data-absent' | 'lookup-failed',
    summary: string,
    extra: [string, string][] = [],
  ) =>
    recordRetrieval({
      kind: 'hadith',
      outcome,
      query: `sharḥ in ${book.title}`,
      summary,
      detail: [
        ['bookId', book.id],
        ['shingles tried', String(shingles.length)],
        ['first shingle', shingles[0] ?? '(none)'],
        ...extra,
      ],
    });

  if (shingles.length === 0) {
    note('lookup-failed', 'The matn was too short to build a search key from.');
    return null;
  }

  // Score by how many DISTINCT shingles reach each block. A block matching one
  // shingle twice is not better evidence than a block matching it once.
  const score = new Map<string, { block: Block; hits: number }>();

  for (const shingle of shingles) {
    const hits = await storage.searchBlocks(book.id, shingle, PER_SHINGLE_LIMIT);
    for (const hit of hits) {
      const existing = score.get(hit.block.id);
      if (existing) existing.hits += 1;
      else score.set(hit.block.id, { block: hit.block, hits: 1 });
    }
  }

  const best = [...score.values()].sort(
    (a, b) => b.hits - a.hits || a.block.order - b.block.order,
  )[0];

  if (!best || best.hits < MIN_SHINGLE_HITS) {
    note(
      'no-match',
      best
        ? `The best block matched only ${best.hits} of ${shingles.length} shingles, ` +
            `below the ${MIN_SHINGLE_HITS} needed. No passage is shown rather than ` +
            `a passage that might be a different ḥadīth.`
        : 'No block in this work matched any part of the matn.',
      [['blocks touched', String(score.size)]],
    );
    return null;
  }

  const { commentary, truncated } = await followingBlocks(storage, best.block);

  note('hit', `Matched ${best.hits} of ${shingles.length} shingles.`, [
    ['block', best.block.id],
    ['commentary blocks', String(commentary.length)],
    ['runners-up', String(score.size - 1)],
  ]);

  return {
    book,
    matnBlock: best.block,
    commentary,
    shingleHits: best.hits,
    shinglesTried: shingles.length,
    truncated,
  };
}

/**
 * The page index a block sits on.
 *
 * Page ids are built as `${bookId}:p${pageIndex}` — by IdbStorageAdapter.getPage
 * and by the importer, in one format — and this is the only way back from a
 * block to the page after it without loading the whole book. Null when the id
 * does not have that shape, in which case the commentary stops at the end of
 * the block's own page rather than guessing.
 */
function pageIndexOf(pageId: string): number | null {
  const match = /:p(\d+)$/.exec(pageId);
  return match ? Number(match[1]) : null;
}

/**
 * Blocks after the matn, to the next ḥadīth.
 *
 * Walks page by page rather than loading the book: a six-volume sharḥ is tens
 * of thousands of blocks, and this runs when the reader taps a button and
 * expects an answer.
 */
async function followingBlocks(
  storage: StorageAdapter,
  matnBlock: Block,
): Promise<{ commentary: Block[]; truncated: boolean }> {
  const commentary: Block[] = [];
  let pageIndex = pageIndexOf(matnBlock.pageId);
  let pageId: string | null = matnBlock.pageId;

  while (pageId && commentary.length < MAX_COMMENTARY_BLOCKS) {
    const blocks = await storage.listBlocksForPage(pageId);

    for (const block of blocks) {
      if (block.order <= matnBlock.order) continue;
      // The next ḥadīth ends this one's commentary. Its own matn block is not
      // included: it belongs to the next entry, not this one.
      if (block.type === 'hadith_matn') {
        return { commentary, truncated: false };
      }
      commentary.push(block);
      if (commentary.length >= MAX_COMMENTARY_BLOCKS) {
        return { commentary, truncated: true };
      }
    }

    if (pageIndex === null) break;
    pageIndex += 1;
    const next = await storage.getPage(matnBlock.bookId, pageIndex);
    pageId = next ? next.id : null;
  }

  return { commentary, truncated: commentary.length >= MAX_COMMENTARY_BLOCKS };
}
