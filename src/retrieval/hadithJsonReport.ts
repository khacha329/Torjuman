import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Book, HadithJsonEntry, QulResource } from '../types';
import { letterFold } from '../lib/arabic';
import { agreement, agrees, chooseCandidate, NEIGHBOUR_WINDOW, type Agreement } from './hadithJson';
import { matnShingles, stripApparatus } from './sharh';

// The hadith-json match report, run on the device against an imported book.
//
// The same measurement `npm run report:hadith-json` makes over the fixtures
// (scripts/hadithMatch.ts), which hold six ḥadīth; the tablet has the whole
// book. It uses the app's own `chooseCandidate`, so what it reports is what a
// tap would do. Nothing is written.
//
// ---------------------------------------------------------------------------
// Why each miss gets a reason (docs/plans/hadith-text-matching.md, step 0b)
//
// The owner's first run on book 9260 matched 96.6% and left 56 numbers. "Cut
// matns" was the guess, but a clean prefix or suffix of the dataset's text
// still agrees — the shingles come from the BOOK's matn — so the likelier
// failures are a gap inside the matn, a matn too short to shingle, the apparatus
// stripper eating real matn, a number that drifted beyond the window, or a
// different wording. Reading 56 blocks by eye to tell those apart is the job
// this does instead. The reason is diagnostic only: nothing here changes what
// a tap shows.
// ---------------------------------------------------------------------------

export type MissReason =
  /** The dataset has no ḥadīth at this number (past its end, or a gap). */
  | 'no-entry'
  /**
   * Under four words even before stripping, and not taken by the short-
   * quotation rule either (`shortQuoteHolds`: under three words, or the phrase
   * is missing from its own number or also in a neighbour).
   */
  | 'too-short'
  /**
   * The stripper (`stripApparatus`) is what failed it. Either it left under
   * four words that the short-quotation rule did not take (one it took counts
   * in `byNumber`), or the UNSTRIPPED matn agrees with its own number or a
   * neighbour in the window while the stripped one does not. The second
   * happens two ways (review of 17ac63a): `agrees` is a ratio over at most ten
   * evenly drawn runs, and runs from the isnād or a takhrīj-like phrase can be
   * hits that the stripped text, resampled over fewer words, loses; and the
   * regexes are not word-anchored, so «ورواه», «فأخرجه» or «قالوا» are cut
   * mid-word and leave a fragment in an edge run (FOUND_ISSUES 74).
   */
  | 'over-stripped'
  /** Agrees with a dataset number outside the ±window. */
  | 'drifted'
  /** Its own number agrees in part: a cut, an elision, or a variant clause. */
  | 'partial'
  /** No shingle hits its own number and nothing in reach agrees. */
  | 'different-wording';

export const MISS_REASON_LABELS: Record<MissReason, string> = {
  'no-entry': 'no ḥadīth at that number',
  'too-short': 'too short to check',
  'over-stripped': 'over-stripped',
  drifted: 'number drifted',
  partial: 'partial match',
  'different-wording': 'different wording',
};

export interface UnmatchedHadith {
  number: number;
  /** The matn's opening words, number prefix removed, so it can be found in the book. */
  firstWords: string;
  reason: MissReason;
  /** Folded words before and after `stripApparatus`: a large drop is over-stripping. */
  wordsBefore: number;
  wordsAfter: number;
  /** The book matn's shingles against the dataset's ḥadīth at the same number. */
  own: Agreement;
  /**
   * The longest run of consecutive words (stripped book matn, folded) that the
   * dataset's ḥadīth at the same number also contains, in order. The plan's
   * measure for step 2: whether a gap-tolerant run rule would have found it.
   */
  ownRunWords: number;
  /** The best-agreeing number OUTSIDE the ±window, when one agrees. */
  bestElsewhere?: { number: number; offset: number; hits: number; tried: number };
}

export interface DeviceMatchReport {
  bookTitle: string;
  collection: string;
  /** Matn blocks that carry a number — the ones a tap can look up. */
  numbered: number;
  byNumber: number;
  byNeighbour: number;
  unmatched: UnmatchedHadith[];
  /** Matn blocks with no number at all: not measurable, listed for scale. */
  unnumbered: number;
}

const BOOK_NUMBER = /^\s*[٠-٩0-9]+\s*(?:\/\s*[٠-٩0-9]+\s*)?[-ـ–—]\s*/u;

/** As `matnShingles`: a run is four words, ten runs drawn evenly. */
const SHINGLE_WORDS = 4;
const SHINGLE_COUNT = 10;

export function firstWords(matn: string, count = 8): string {
  return matn.replace(BOOK_NUMBER, '').trim().split(/\s+/).slice(0, count).join(' ');
}

function words(text: string): string[] {
  return letterFold(text).split(' ').filter(Boolean);
}

/** `matnShingles`' sampling over words already chosen — here, unstripped. */
function spreadShingles(list: string[]): string[] {
  if (list.length < SHINGLE_WORDS) return [];
  const last = list.length - SHINGLE_WORDS;
  const wanted = Math.min(SHINGLE_COUNT, last + 1);
  const out = new Set<string>();
  for (let i = 0; i < wanted; i++) {
    const at = wanted === 1 ? 0 : Math.round((i * last) / (wanted - 1));
    out.add(list.slice(at, at + SHINGLE_WORDS).join(' '));
  }
  return [...out];
}

/** `agreement`, against an already folded and padded haystack. */
function agreementOn(shingles: string[], haystack: string): Agreement {
  if (shingles.length === 0) return { hits: 0, tried: 0 };
  return { hits: shingles.filter((s) => haystack.includes(` ${s} `)).length, tried: shingles.length };
}

/**
 * Longest common run of consecutive words. Two rolling rows: the book matn is
 * a few hundred words at most and this runs only for misses.
 */
export function longestCommonRun(a: string[], b: string[]): number {
  let best = 0;
  let previous = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const row = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        row[j] = previous[j - 1] + 1;
        if (row[j] > best) best = row[j];
      }
    }
    previous = row;
  }
  return best;
}

/**
 * Why a numbered matn did not confirm, in the plan's order: no entry, too
 * short, over-stripped, drifted, partial, different wording.
 *
 * `haystackOf` returns an entry's folded Arabic padded with spaces; the caller
 * caches it, because a drift check folds the whole collection once per miss.
 */
export function classifyMiss(
  matn: string,
  number: number,
  entries: Map<number, HadithJsonEntry>,
  haystackOf: (entry: HadithJsonEntry) => string,
): UnmatchedHadith {
  const unnumbered = matn.replace(BOOK_NUMBER, '');
  const before = words(unnumbered);
  const after = words(stripApparatus(unnumbered));
  const ownEntry = entries.get(number);
  const own = ownEntry ? agreement(matn, ownEntry.arabic) : { hits: 0, tried: 0 };

  const base = {
    number,
    firstWords: firstWords(matn),
    wordsBefore: before.length,
    wordsAfter: after.length,
    own,
    ownRunWords: ownEntry ? longestCommonRun(after, haystackOf(ownEntry).trim().split(' ')) : 0,
  };

  if (!ownEntry) return { ...base, reason: 'no-entry' };
  if (before.length < SHINGLE_WORDS) return { ...base, reason: 'too-short' };
  if (after.length < SHINGLE_WORDS) return { ...base, reason: 'over-stripped' };

  // The plan's test: does the matn agree if the apparatus is NOT stripped,
  // against the same numbers chooseCandidate tries?
  const raw = spreadShingles(before);
  for (let offset = -NEIGHBOUR_WINDOW; offset <= NEIGHBOUR_WINDOW; offset++) {
    const entry = entries.get(number + offset);
    if (entry && agrees(agreementOn(raw, haystackOf(entry)))) {
      return { ...base, reason: 'over-stripped' };
    }
  }

  // Outside the window only: a neighbour that agreed would already have matched.
  const shingles = matnShingles(unnumbered);
  let best: UnmatchedHadith['bestElsewhere'];
  for (const entry of entries.values()) {
    if (Math.abs(entry.number - number) <= NEIGHBOUR_WINDOW) continue;
    const result = agreementOn(shingles, haystackOf(entry));
    if (!agrees(result)) continue;
    if (!best || result.hits / result.tried > best.hits / best.tried) {
      best = { number: entry.number, offset: entry.number - number, hits: result.hits, tried: result.tried };
    }
  }
  if (best) return { ...base, reason: 'drifted', bestElsewhere: best };

  return { ...base, reason: own.hits > 0 ? 'partial' : 'different-wording' };
}

/** Let the UI paint between batches; a book has over a thousand ḥadīth to check. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function matchBookAgainstCollection(
  storage: StorageAdapter,
  book: Book,
  resource: QulResource,
  onProgress?: (done: number, total: number) => void,
): Promise<DeviceMatchReport> {
  const slug = resource.collection ?? '';
  const keys = Array.from({ length: resource.entryCount }, (_, i) => `${slug}:${i + 1}`);
  const rows = await storage.getQulEntries(resource.id, keys);
  const entries = new Map<number, HadithJsonEntry>();
  for (const row of rows) if (row.value.t === 'hadith-json') entries.set(row.value.number, row.value);

  const folded = new Map<number, string>();
  const haystackOf = (entry: HadithJsonEntry) => {
    let text = folded.get(entry.number);
    if (text === undefined) {
      text = ` ${letterFold(entry.arabic)} `;
      folded.set(entry.number, text);
    }
    return text;
  };

  const blocks = (await storage.listBlocks(book.id)).filter((block) => block.type === 'hadith_matn');
  const numbered = blocks.filter((block) => block.hadithNumber !== null);

  let byNumber = 0;
  let byNeighbour = 0;
  const unmatched: UnmatchedHadith[] = [];

  for (let i = 0; i < numbered.length; i++) {
    const block = numbered[i];
    const number = Number(block.hadithNumber);
    const match = chooseCandidate(number, block.text, (n) => entries.get(n));
    if (!match) {
      unmatched.push(classifyMiss(block.text, number, entries, haystackOf));
      // A miss costs a pass over the whole collection; paint after each.
      await tick();
    } else if (match.offset === 0) byNumber++;
    else byNeighbour++;

    if (i % 25 === 24) {
      onProgress?.(i + 1, numbered.length);
      await tick();
    }
  }
  onProgress?.(numbered.length, numbered.length);

  return {
    bookTitle: book.title,
    collection: slug,
    numbered: numbered.length,
    byNumber,
    byNeighbour,
    unmatched,
    unnumbered: blocks.length - numbered.length,
  };
}
