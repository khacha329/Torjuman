import type { Block, Entity } from '../types';
import { newId } from '../lib/id';
import { normalize } from '../lib/arabic';
import { foldName, narratorSpanIn } from '../retrieval/narrator';
import { MIN_MATCH_WORDS, quranFold, type QuranIndex } from './quranIndex';
import { detectPersonSpans, type PersonIndex } from '../biography/detectNames';

// Locating quoted verses and hadiths in a book's blocks.
//
// ---------------------------------------------------------------------------
// Detection is driven by content, not by delimiters.
//
// Scanning for delimited spans fails on this text in four separate ways, and
// each one produces a silently unmarked verse:
//
//   * The delimiter sets are mixed. ASCII ( ), ornate ﴿ ﴾, and curly { } all
//     occur, sometimes mismatched — an ASCII opener closed by an ornate closer.
//     Checked across the fixtures, book 9260 uses ASCII parentheses and not one
//     ornate bracket, so a scan for the ornate pair alone finds nothing at all.
//   * Citations use the same delimiters as quotations, so any paired scan
//     yields (التوبة: ١٢٣) as a candidate verse.
//   * Short phrases are woven into the commentary with no delimiters at all.
//   * A quotation crossing a page break leaves its delimiters unbalanced.
//
// So the muṣḥaf itself is the evidence: a block's words are matched against the
// Qurʾān index and extended greedily. Delimiters are then used only to tidy the
// edges of a span that has already been proved. A citation needs no special
// case — it is a reference, not verse text, so it is simply not in the corpus.
// ---------------------------------------------------------------------------

/**
 * Any of these is accepted on either side, without requiring a matched pair.
 * Openers and closers are kept separate only so the tint extends the right way.
 */
const OPENERS = '(﴿{⟨《「';
const CLOSERS = ')﴾}⟩》」';

/** How far into the following block to look for a quotation's continuation. */
const LOOKAHEAD_WORDS = 40;

export interface DetectionDeps {
  quran: QuranIndex;
  /** sunnah.com collection this book's hadith numbers map to, if any. */
  hadithCollection: string | null;
  /**
   * Names from the imported biographical works, for inline marking.
   *
   * Empty when no such work is imported, and that is the normal state rather
   * than a degraded one: no names are marked, and every name remains reachable
   * by selection exactly as before. Importing a biographical dictionary later
   * and regenerating is what turns the layer on — which is why this is a
   * parameter rather than something detection reads for itself.
   */
  people?: PersonIndex;
}

/** A word of block text, with its place in both the original and the fold. */
interface Word {
  blockId: string;
  /** Offsets into the original block text, harakāt intact. */
  start: number;
  end: number;
  /** Offset into the concatenated folded string for this scan window. */
  foldedStart: number;
  foldedLength: number;
  folded: string;
}

/**
 * Tokenise into words, folding each one and recording where it lands in both
 * representations.
 *
 * The mapping back to original offsets is the part that matters: an entity's
 * offsets must point into the display text so the tint aligns exactly with the
 * verse, harakāt and all. Nothing is ever anchored to the folded form.
 */
function tokenise(blocks: Block[], limitLastBlockTo?: number): Word[] {
  const words: Word[] = [];
  let foldedCursor = 0;

  for (const [blockIndex, block] of blocks.entries()) {
    const pattern = /\S+/gu;
    let match: RegExpExecArray | null;
    let taken = 0;

    while ((match = pattern.exec(block.text)) !== null) {
      if (
        limitLastBlockTo !== undefined &&
        blockIndex === blocks.length - 1 &&
        taken >= limitLastBlockTo
      ) {
        break;
      }
      taken++;

      // Strip delimiters and punctuation off the edges so a word carrying an
      // opening paren still folds to the same thing as one that does not.
      let start = match.index;
      let end = match.index + match[0].length;
      while (start < end && isEdgePunctuation(block.text[start])) start++;
      while (end > start && isEdgePunctuation(block.text[end - 1])) end--;
      if (end <= start) continue;

      const folded = quranFold(block.text.slice(start, end));
      if (folded.length === 0) continue;

      words.push({
        blockId: block.id,
        start,
        end,
        foldedStart: foldedCursor,
        foldedLength: folded.length,
        folded,
      });
      foldedCursor += folded.length;
    }
  }

  return words;
}

function isEdgePunctuation(char: string): boolean {
  return (
    OPENERS.includes(char) ||
    CLOSERS.includes(char) ||
    '.,;:!؟،؛"\'“”‘’*ـ-–—[]'.includes(char)
  );
}

interface Candidate {
  startWord: number;
  endWord: number; // exclusive
  corpusFrom: number;
  corpusTo: number;
  ambiguous: boolean;
}

/** Scan one window of words for every verse it contains. */
function scanWindow(words: Word[], quran: QuranIndex): Candidate[] {
  if (words.length === 0) return [];

  const folded = words.map((word) => word.foldedStart);
  const foldedText = rebuildFolded(words);

  const found: Candidate[] = [];
  let wordIndex = 0;

  while (wordIndex < words.length) {
    const run = quran.locate(foldedText, folded[wordIndex]);
    if (!run) {
      wordIndex++;
      continue;
    }

    // Round the matched character span outward to whole words: entities are
    // anchored at word granularity so the tint never bisects a word.
    let startWord = wordIndex;
    while (startWord > 0 && words[startWord - 1].foldedStart >= run.queryFrom) startWord--;

    let endWord = startWord;
    while (
      endWord < words.length &&
      words[endWord].foldedStart + words[endWord].foldedLength <= run.queryTo
    ) {
      endWord++;
    }

    if (endWord - startWord >= MIN_MATCH_WORDS) {
      found.push({
        startWord,
        endWord,
        corpusFrom: run.corpusFrom,
        corpusTo: run.corpusTo,
        ambiguous: run.ambiguous,
      });
      wordIndex = Math.max(endWord, wordIndex + 1);
    } else {
      wordIndex++;
    }
  }

  return longestNonOverlapping(found);
}

function rebuildFolded(words: Word[]): string {
  // Folded offsets were assigned contiguously at tokenise time, so the window's
  // folded text is exactly its words' folds concatenated in order.
  return words.map((word) => word.folded).join('');
}

/** Where matches overlap, keep the longest. */
function longestNonOverlapping(candidates: Candidate[]): Candidate[] {
  const sorted = [...candidates].sort(
    (a, b) => b.endWord - b.startWord - (a.endWord - a.startWord),
  );
  const kept: Candidate[] = [];

  for (const candidate of sorted) {
    const clashes = kept.some(
      (existing) =>
        candidate.startWord < existing.endWord && existing.startWord < candidate.endWord,
    );
    if (!clashes) kept.push(candidate);
  }

  return kept.sort((a, b) => a.startWord - b.startWord);
}

/**
 * Detect every entity in a book's blocks.
 *
 * Blocks must be in reading order — cross-block matching depends on it.
 */
export function detectEntities(
  bookId: string,
  blocks: Block[],
  deps: DetectionDeps,
): Entity[] {
  const entities: Entity[] = [];
  const now = Date.now();

  const byId = new Map(blocks.map((block) => [block.id, block]));

  for (const [index, block] of blocks.entries()) {
    // Set by the ḥadīth branch below, and read by the name scan after it: the
    // narrator occupies the same characters the name scan would match, and the
    // two layers must not both claim it.
    let narratorSpan: { start: number; end: number; name: string } | null = null;

    // Each block is scanned together with a lookahead into the next, so a
    // quotation cut in half by a page break is matched as one run and produces
    // a single entity whose start and end blocks differ.
    const next = blocks[index + 1];
    const window = next ? [block, next] : [block];
    const words = tokenise(window, next ? LOOKAHEAD_WORDS : undefined);

    for (const candidate of scanWindow(words, deps.quran)) {
      const first = words[candidate.startWord];
      const last = words[candidate.endWord - 1];

      // A run lying entirely in the lookahead belongs to the next block's own
      // scan; skipping it here stops every verse being found twice.
      if (first.blockId !== block.id) continue;

      const described = deps.quran.describeCorpusRange(
        candidate.corpusFrom,
        candidate.corpusTo,
      );

      const startBlock = byId.get(first.blockId)!;
      const endBlock = byId.get(last.blockId)!;

      entities.push({
        id: newId('ent'),
        bookId,
        startBlockId: first.blockId,
        startOffset: extendToDelimiter(startBlock.text, first.start, 'open'),
        endBlockId: last.blockId,
        endOffset: extendToDelimiter(endBlock.text, last.end, 'close'),
        type: 'quran',
        reference: described.reference,
        matchQuality: candidate.ambiguous ? 'partial' : 'exact',
        detectedAt: now,
        textUthmani: described.textUthmani,
        label: deps.quran.describe(described),
        matchedWords: candidate.endWord - candidate.startWord,
      });
    }

    // Ḥadīth. The parser already pulled the number off the matn at import, and
    // for a sharḥ that keeps an-Nawawī's numbering that number *is* the
    // reference — no inference, no fuzzy text matching.
    //
    // -----------------------------------------------------------------------
    // Identification and retrieval are separate questions, and conflating them
    // is what previously made every ḥadīth in an unmapped book untappable.
    //
    //   identification  Which ḥadīth is this?      the number, from the book
    //   retrieval       Is there verified English? sunnah.com, needs a network
    //
    // `hadithCollection` answers only the second: it names the sunnah.com
    // collection this book's numbering maps to, and it is null for every book
    // except Riyāḍ aṣ-Ṣāliḥīn. Gating the entity on it meant that in the sharḥ
    // of the Arbaʿīn — where the numbering is perfectly well defined by the
    // book itself — no ḥadīth was marked at all.
    //
    // A ḥadīth's identity comes from the book. When retrieval has nothing to
    // add, the entity still exists and the sheet says so honestly; that note is
    // the correct output, and it is never replaced with a machine translation.
    // 'unresolved' now means only what it says: the ḥadīth could not be
    // identified from the book, which here means the matn carried no number.
    // -----------------------------------------------------------------------
    if (block.type === 'hadith_matn') {
      const number = block.hadithNumber;
      entities.push({
        id: newId('ent'),
        bookId,
        startBlockId: block.id,
        startOffset: 0,
        endBlockId: block.id,
        endOffset: block.text.length,
        type: 'hadith',
        // Scoped to the book when no collection is known, because the record is
        // cached under this string: a bare "12" would serve one book's ḥadīth
        // from another book's cache entry.
        reference: number
          ? deps.hadithCollection
            ? `${deps.hadithCollection}:${number}`
            : `${bookId}#${number}`
          : '',
        matchQuality: number ? 'exact' : 'unresolved',
        detectedAt: now,
        // Without this the panel title for an unmapped book would read
        // "shamela-21812#12". The reference stays the cache key; this is what
        // the reader sees.
        label: number && !deps.hadithCollection ? `Ḥadīth ${number}` : undefined,
      });

      // The narrator, and only the narrator.
      //
      // This is the one name in the app that is pre-marked, because it is the
      // one that sits in a structurally identifiable slot: after عن/حدثنا/
      // أخبرنا, inside a matn block, one per ḥadīth. High precision, low
      // volume. Every other name is looked up on demand from the rail —
      // tinting the hundreds a six-volume commentary mentions would bury the
      // marks, verses and translated ranges that already compete for the same
      // visual channels.
      //
      // Nested inside the ḥadīth entity above, which is why flattenAnnotations
      // resolves the narrowest covering entity rather than the first.
      const span = narratorSpanIn(block.text);
      narratorSpan = span;
      if (span) {
        entities.push({
          id: newId('ent'),
          bookId,
          startBlockId: block.id,
          startOffset: span.start,
          endBlockId: block.id,
          endOffset: span.end,
          type: 'narrator',
          // The folded name, so tapping it can go straight to the biographical
          // index without re-reading the isnād.
          reference: foldName(span.name),
          matchQuality: 'exact',
          detectedAt: now,
          label: span.name,
        });
      }
    }

    // -----------------------------------------------------------------------
    // Names from the imported biographical works.
    //
    // Every block, not only a matn: the whole point is the names the
    // commentary mentions in passing, which is where a reader stops and
    // wonders who is meant.
    //
    // Marked `partial`, never `exact`. The distinction is real and load-bearing
    // — a verse resolves to one place in the muṣḥaf and a numbered ḥadīth to
    // one record, but «أبو حفص» resolves to a list, and this layer deliberately
    // does not choose from it. `partial` is what that means: located, not
    // identified. It still renders, because markableByBlock drops only
    // `unresolved`.
    // -----------------------------------------------------------------------
    if (deps.people) {
      for (const person of detectPersonSpans(block.text, deps.people)) {
        // The narrator branch above already marked this name, in these exact
        // characters. Two entities over one name would leave the reader two
        // targets and let the narrowest-covering rule choose between them on a
        // tie-break that means nothing.
        if (
          narratorSpan &&
          person.start < narratorSpan.end &&
          narratorSpan.start < person.end
        ) {
          continue;
        }

        entities.push({
          id: newId('ent'),
          bookId,
          startBlockId: block.id,
          startOffset: person.start,
          endBlockId: block.id,
          endOffset: person.end,
          type: 'person',
          reference: person.reference,
          matchQuality: 'partial',
          detectedAt: now,
          label: person.text,
        });
      }
    }
  }

  return entities;
}

/**
 * Delimiters as a refinement, not a gate.
 *
 * The span is already proved by content; if a recognised delimiter sits just
 * outside it, the tint is extended over it so the marked region looks complete
 * rather than starting one character inside the bracket. Any opener is accepted
 * against any closer — this text mismatches them regularly.
 */
function extendToDelimiter(text: string, offset: number, side: 'open' | 'close'): number {
  if (side === 'open') {
    let cursor = offset;
    while (cursor > 0 && /\s/.test(text[cursor - 1])) cursor--;
    return cursor > 0 && OPENERS.includes(text[cursor - 1]) ? cursor - 1 : offset;
  }

  let cursor = offset;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
  return cursor < text.length && CLOSERS.includes(text[cursor]) ? cursor + 1 : offset;
}

/** Which sunnah.com collection a book's hadith numbering follows. */
export function hadithCollectionFor(title: string): string | null {
  return normalize(title).includes(normalize('رياض الصالحين')) ? 'riyadussalihin' : null;
}

/**
 * Blocks holding a delimiter-paired span that produced no match.
 *
 * This is the diagnostic worth reading. It surfaces both detection failures and
 * text corrupted by the Shamela parse, at import time rather than mid-lesson.
 */
export function unmatchedDelimitedSpans(
  blocks: Block[],
  entities: Entity[],
): { blockId: string; text: string }[] {
  const covered = new Map<string, [number, number][]>();
  for (const entity of entities) {
    if (entity.matchQuality === 'unresolved') continue;
    const list = covered.get(entity.startBlockId) ?? [];
    list.push([entity.startOffset, entity.endOffset]);
    covered.set(entity.startBlockId, list);
  }

  const problems: { blockId: string; text: string }[] = [];
  const paired = new RegExp(`[${escapeClass(OPENERS)}]([^${escapeClass(CLOSERS)}]{16,})[${escapeClass(CLOSERS)}]`, 'gu');

  for (const block of blocks) {
    paired.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = paired.exec(block.text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      // Citations are supposed to produce no match; they are not failures.
      // Both shapes occur: "(البينة: ٥)" and "(الحج: من الآية٣٧)".
      if (
        match[1].length < 48 &&
        /[:：]/u.test(match[1]) &&
        /[٠-٩0-9]/u.test(match[1])
      ) {
        continue;
      }
      // Quoted prophetic speech is not Qurʾān either.
      if (match[1].startsWith('(')) continue;

      const overlaps = (covered.get(block.id) ?? []).some(
        ([from, to]) => start < to && from < end,
      );
      if (!overlaps) {
        problems.push({ blockId: block.id, text: match[1].slice(0, 120) });
      }
    }
  }

  return problems;
}

function escapeClass(chars: string): string {
  return chars.replace(/[\\\]^-]/g, '\\$&');
}
