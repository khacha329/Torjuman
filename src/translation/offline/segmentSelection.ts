import type { Block, Entity, TranslatedSegment } from '../../types';
import type { QuranEnglish, QuranIndex } from '../../quran/quranIndex';
import { renderTakhrij } from '../../lib/takhrij';
import { HADITH_QUOTED_IN_PART } from '../../retrieval/enrich';

// Splitting a selection into pieces BEFORE any model sees it.
//
// ===========================================================================
// THE INVARIANT THIS FILE EXISTS TO ENFORCE
//
// A ḥadīth with no offline source must never reach the translation model.
// Not as a fallback, not as a last resort, not by any path.
//
// Everything else here degrades gracefully — a rough rendering of Ibn
// ʿUthaymīn's commentary is just rough, and the user can see that it is. But a
// machine-translated ḥadīth sitting beside verified content in the same card is
// exactly the failure the entity pipeline was built to prevent. Arabic plus an
// honest note is the correct output there.
//
// So this is structural, not a rule someone has to remember. The function
// returns two things: segments that are already finished, and a list of plain
// prose spans. Scripture never appears in the second list, so the offline
// provider — which only ever receives that list — has no way to reach it. The
// guard is the shape of the data, not a conditional.
// ===========================================================================

export interface ProseSpan {
  /** Index into the returned segments array, so the result slots back in. */
  slot: number;
  text: string;
}

export interface SegmentedSelection {
  /**
   * One entry per piece of the selection, in order. Scripture entries are
   * already complete; prose entries are placeholders awaiting translation.
   */
  segments: TranslatedSegment[];
  /** The ONLY text a model is permitted to see. */
  prose: ProseSpan[];
}

export const HADITH_NO_OFFLINE_SOURCE =
  'No verified English translation is available offline for this ḥadīth. It is shown in Arabic only — a machine translation is deliberately not produced for hadith text.';

export const QURAN_OFFLINE_NOTE = 'English: Dr. Mustafa Khattab, The Clear Qurʾān (bundled).';

/**
 * One block's share of a verse or ḥadīth. `entity` is the verse or ḥadīth it
 * is a share of; a ḥadīth piece has none when it is the part of a
 * `hadith_matn` block that no ḥadīth entity covers (FOUND_ISSUES 71).
 */
type Piece = { start: number; end: number } & (
  | { type: 'quran'; entity: Entity }
  | { type: 'hadith'; entity?: Entity }
);

/**
 * Cut the selected text at the boundaries of the verses and ḥadīth it
 * contains, resolved or not (FOUND_ISSUES 68). Marked names (`narrator`,
 * `person`) cut nothing (FOUND_ISSUES 61). A `hadith_matn` block is ḥadīth
 * by its type, whether or not an entity marks it (FOUND_ISSUES 71).
 *
 * Offsets are block-relative, so the selection is walked block by block and the
 * entity ranges intersecting it are projected onto the selected substring.
 */
export function segmentSelection(options: {
  blocks: Block[];
  entities: Entity[];
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  quran: QuranIndex;
  english: QuranEnglish;
  /** Verified hadith translations already cached locally, keyed by reference. */
  hadithLookup: (
    reference: string,
  ) => { arabic: string; english: string; source?: 'sunnah.com' | 'hadith-json' } | null;
}): SegmentedSelection {
  const { blocks, entities, quran, english } = options;

  const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
  const startOrder = orderOf.get(options.startBlockId) ?? 0;
  const endOrder = orderOf.get(options.endBlockId) ?? 0;

  const segments: TranslatedSegment[] = [];
  const prose: ProseSpan[] = [];
  /**
   * The segment each verse was emitted as, by entity id, and the block its
   * text last came from: a verse across a block edge has a share in each
   * block, and only the first is a segment (FOUND_ISSUES 69).
   */
  const verseSegments = new Map<string, { slot: number; block: Block }>();
  /** The block the last prose text came from, for the join to the next (FOUND_ISSUES 70). */
  let proseBlock: Block | null = null;

  for (const block of blocks) {
    if (block.order < startOrder || block.order > endOrder) continue;

    const from = block.id === options.startBlockId ? options.startOffset : 0;
    const to = block.id === options.endBlockId ? options.endOffset : block.text.length;
    if (to <= from) continue;

    // Entities overlapping this block's share of the selection.
    const covering: Piece[] = [];
    for (const entity of entities) {
      // An unresolved entity is cut out like any other. The detector marks a
      // ḥadīth `unresolved` when its matn carries no number: it is still a
      // ḥadīth, only one with nothing to look up, so it is emitted with the
      // no-offline-source note. Until FOUND_ISSUES 68 every unresolved entity
      // was skipped here, which left an unnumbered matn in the prose, where
      // the on-device model translated it. (No detector marks a verse
      // `unresolved` — an unmatched verse is left unmarked — but one would be
      // emitted with QURAN_UNRESOLVED_NOTE, not handed to the model.)
      //
      // Only verses and ḥadīth are cut out of the prose. A marked name
      // ('narrator', 'person') is a reading aid, not a passage, and stays in
      // the prose around it. Until FOUND_ISSUES 61 it was emitted as a ḥadīth:
      // on device a name in the selection was cut from the prose, shown
      // untranslated with the no-offline-source note, and, inside a ḥadīth,
      // shown twice.
      if (entity.type !== 'quran' && entity.type !== 'hadith') continue;

      const entityStart = entity.startBlockId === block.id ? entity.startOffset : 0;
      const entityEnd = entity.endBlockId === block.id ? entity.endOffset : block.text.length;
      const touchesBlock =
        entity.startBlockId === block.id ||
        entity.endBlockId === block.id ||
        ((orderOf.get(entity.startBlockId) ?? 0) < block.order &&
          (orderOf.get(entity.endBlockId) ?? 0) > block.order);
      if (!touchesBlock) continue;

      const overlapStart = Math.max(entityStart, from);
      const overlapEnd = Math.min(entityEnd, to);
      if (overlapEnd > overlapStart) {
        const share = { start: overlapStart, end: overlapEnd, entity };
        covering.push(entity.type === 'quran' ? { ...share, type: 'quran' } : { ...share, type: 'hadith' });
      }
    }

    // A matn block is ḥadīth by its type, not because an entity says so.
    // Until FOUND_ISSUES 71 the cut relied on entities alone, and the
    // reader's entities start as [] and load afterwards — or never, when the load
    // fails or a shared chapter carries none — so a translation run in that
    // window put every matn block into the prose, where the model translated
    // it. Every part of the block's share that no ḥadīth entity covers becomes
    // a ḥadīth piece of its own: with no entities, the whole share; with the
    // detector's entity, which spans the whole block, nothing is added. Such a
    // piece has no reference, so nothing is looked up for it and it carries
    // the no-offline-source note — the honest output for a ḥadīth the cut
    // cannot name.
    //
    // This is what keeps the invariant structural here: the ḥadīth pieces of a
    // matn block now cover its share end to end, and the walk below emits
    // prose only where no piece covers the text, so a matn block yields no
    // prose at all, whatever the entities are.
    if (block.type === 'hadith_matn') covering.push(...uncoveredMatn(covering, from, to));

    // At one start, the longer piece first, so a verse quoted inside a ḥadīth
    // that begins at the same offset is inside the ḥadīth, not before it. On
    // an exact tie, the ḥadīth first: otherwise the order the entities came in
    // decides, and the detector stores a block's verses before its ḥadīth, so
    // the verse would be emitted and the ḥadīth skipped as lying inside it —
    // its segment, note and any verified English missing from the card
    // (FOUND_ISSUES 72; the skip is 61's).
    const rank = (piece: Piece) => (piece.type === 'hadith' ? 0 : 1);
    covering.sort((a, b) => a.start - b.start || b.end - a.end || rank(a) - rank(b));

    // Walk the block's share, emitting prose between pieces. A piece that
    // lies wholly inside one already emitted (a verse quoted in a ḥadīth) is
    // skipped, and one that runs past it emits only the part not yet shown.
    // (Until FOUND_ISSUES 61 each piece was sliced from its own start after
    // `cursor` had moved past it, so overlapping text appeared twice.) Neither
    // changes what reaches the model: prose is only ever the gap before a
    // piece and the tail after the last, and only `pushProse` adds to `prose`.
    // A skipped verse is still read inside the ḥadīth's Arabic, without its
    // own bundled English; see FOUND_ISSUES 61.
    let cursor = from;
    for (const piece of covering) {
      if (piece.end <= cursor) continue;
      const start = Math.max(piece.start, cursor);
      if (start > cursor) {
        pushProse(block.text.slice(cursor, start), block);
      }
      pushEntity(piece, block.text.slice(start, piece.end), block);
      cursor = piece.end;
    }
    if (cursor < to) pushProse(block.text.slice(cursor, to), block);
  }

  return { segments, prose };

  function pushProse(text: string, block: Block): void {
    if (text.trim() === '') return;

    // A takhrīj formula is finished here, from the fixed table, and never
    // enters `prose` — so the on-device model does not see it and cannot
    // produce a fourth wording for «متفق عليه». The same table runs on the
    // cloud path in retrieval/enrich.ts, which is what makes the two agree.
    //
    // This recognises a formula that occupies a whole span, which is the shape
    // the pipeline produces: the parser marks takhrīj as its own block type,
    // and entity boundaries cut the text at the end of a matn. A formula
    // trailing a longer sentence is left to the translator, as before.
    const takhrij = renderTakhrij(text);
    if (takhrij) {
      segments.push({
        type: 'prose',
        arabic: text,
        english: takhrij.english,
        source: 'takhrij-table',
      });
      return;
    }

    // Merge with a preceding prose segment so a sentence broken only by
    // whitespace is not translated as two fragments. Two prose texts of one
    // block always have a piece's segment between them (a later share of a
    // verse, which adds none, starts its block), so this only ever joins one
    // block's last prose to the next block's first, and what stands between
    // them is `blockJoin`'s. Until FOUND_ISSUES 70 it was
    // nothing: the last word of one block and the first of the next reached
    // the model as one word. A newline between two paragraphs of a page keeps
    // them two sentences, since `splitSentences` cuts at it; a space across a
    // page break keeps a sentence that Shamela broke there whole, and one that
    // ended there is still cut at its terminator. (Joining every edge with a
    // newline would have split each sentence that runs over a page.)
    const previous = segments[segments.length - 1];
    if (previous && previous.type === 'prose' && previous.english === '' && proseBlock) {
      previous.arabic += blockJoin(proseBlock, block) + text;
      const slot = prose[prose.length - 1];
      slot.text = previous.arabic;
      proseBlock = block;
      return;
    }

    const slot = segments.length;
    segments.push({ type: 'prose', arabic: text, english: '', source: 'model' });
    prose.push({ slot, text });
    proseBlock = block;
  }

  function pushEntity(piece: Piece, sourceText: string, block: Block): void {
    if (piece.type === 'quran') {
      const { entity } = piece;

      // A later block's share of a verse already in the card. Until
      // FOUND_ISSUES 69 each share was a segment of its own, and each carried
      // the whole muṣḥaf text and English, so a verse across a page break
      // showed twice. The first share's segment already shows the whole
      // verse; only where the verse has no muṣḥaf text, so the segment shows
      // the book's words, does this share carry on its Arabic. The walk emits
      // a verse's share in a block before anything else there (it starts at
      // the block's offset 0) and leaves it last in the block before (it runs
      // to the end), so that segment is the last one; the check is a guard.
      const earlier = verseSegments.get(entity.id);
      if (earlier) {
        if (entity.textUthmani === undefined && earlier.slot === segments.length - 1) {
          segments[earlier.slot].arabic += blockJoin(earlier.block, block) + sourceText;
          earlier.block = block;
        }
        return;
      }

      // Retrieved from the bundled muṣḥaf, never generated.
      const range = quran.flatRangeOf(entity.reference);
      const englishText = range ? english.range(range[0], range[1]) : '';

      verseSegments.set(entity.id, { slot: segments.length, block });
      segments.push({
        type: 'quran',
        arabic: entity.textUthmani ?? sourceText,
        english: englishText,
        source: englishText ? 'quran.com' : undefined,
        reference: entity.reference,
        note: englishText ? QURAN_OFFLINE_NOTE : QURAN_UNRESOLVED_NOTE,
      });
      return;
    }

    // ---- the invariant ----------------------------------------------------
    // A hadith is emitted here and NOWHERE else, and it is never added to
    // `prose`. Whether a verified translation exists only decides what English
    // it carries; it never decides whether a model gets to see it. A piece
    // with no entity (the uncovered part of a matn block, FOUND_ISSUES 71)
    // has no reference, so it is never looked up.
    const reference = piece.entity?.reference ?? '';
    const verified = reference ? options.hadithLookup(reference) : null;

    // A verified translation is of the whole ḥadīth, and its Arabic (when it
    // has one: sunnah.com's) is the whole ḥadīth too. Shown only when the
    // selection holds the whole of it. A selection of part of it keeps the
    // book's selected words, with the whole ḥadīth's English and the card
    // path's note for a partial quotation (FOUND_ISSUES 73; the owner's
    // answer, 2026-11-26, as Q5 of docs/plans/hadith-text-matching.md is for
    // the card path). Until 73 a part showed the whole verified Arabic and
    // English, more than was selected, with nothing saying so.
    const whole = piece.entity !== undefined && selectsWhole(piece.entity);

    segments.push({
      type: 'hadith',
      arabic: (whole && verified?.arabic) || sourceText,
      english: verified?.english ?? '',
      source: verified ? (verified.source ?? 'sunnah.com') : undefined,
      reference: reference || undefined,
      note: verified ? (whole ? undefined : HADITH_QUOTED_IN_PART) : HADITH_NO_OFFLINE_SOURCE,
    });
  }

  /**
   * Whether the selection runs from the entity's start to its end, or past
   * both. An entity whose blocks are not in `blocks` is not held whole.
   */
  function selectsWhole(entity: Entity): boolean {
    const first = orderOf.get(entity.startBlockId);
    const last = orderOf.get(entity.endBlockId);
    if (first === undefined || last === undefined) return false;
    const startsByIt =
      startOrder < first || (startOrder === first && options.startOffset <= entity.startOffset);
    const endsByIt = endOrder > last || (endOrder === last && options.endOffset >= entity.endOffset);
    return startsByIt && endsByIt;
  }
}

/**
 * What stands between two blocks' text where one span runs on from the first
 * into the second.
 *
 * A block is one paragraph of a Shamela page (`shamela/parsePage.ts` makes one
 * per `<p>`), and a page break is not a paragraph's end: Shamela breaks pages
 * mid-sentence (the reason `ingest/crawler.ts` detects entities over the
 * whole book). So two blocks of one page are two paragraphs, and a newline
 * stands between them; a block that opens the next page may carry on the
 * sentence before it, and a space does.
 */
function blockJoin(previous: Block, next: Block): string {
  return previous.pageId === next.pageId ? '\n' : ' ';
}

/**
 * The parts of a matn block's share [from, to) that no ḥadīth piece covers,
 * as ḥadīth pieces with no entity (FOUND_ISSUES 71). Verses are not counted
 * as cover: a verse quoted in a matn is inside the ḥadīth (FOUND_ISSUES 61),
 * so a piece added here that encloses it reads it in the ḥadīth's Arabic, as
 * the detector's whole-block entity does. (A verse that straddles the edge
 * between such a piece and a ḥadīth entity's piece, in either direction,
 * overlaps both: the piece it starts in is shown whole, so the verse's opening
 * reads twice, there and in its muṣḥaf text; the verse is emitted with that
 * whole text; and the piece it runs into is shown from where the verse ends.
 * A verse that starts where such a piece starts and runs longer is emitted
 * first, and the piece is shown from its end or not at all. This is 61's
 * verse across a ḥadīth's edge. None of it is prose.)
 */
function uncoveredMatn(pieces: readonly Piece[], from: number, to: number): Piece[] {
  const hadith = pieces.filter((piece) => piece.type === 'hadith').sort((a, b) => a.start - b.start);
  const gaps: Piece[] = [];
  let at = from;
  for (const piece of hadith) {
    if (piece.start > at) gaps.push({ start: at, end: piece.start, type: 'hadith' });
    at = Math.max(at, piece.end);
  }
  if (at < to) gaps.push({ start: at, end: to, type: 'hadith' });
  return gaps;
}

const QURAN_UNRESOLVED_NOTE =
  'The verse could not be resolved against the bundled muṣḥaf, so no English is shown. A machine translation of scripture is deliberately not produced.';

/**
 * Slot translated prose back into the segments it came from.
 *
 * Only prose slots are ever written to. Scripture segments were finished before
 * the model ran and are returned untouched.
 */
export function applyProseTranslations(
  segmented: SegmentedSelection,
  translations: string[],
): TranslatedSegment[] {
  const segments = segmented.segments.map((segment) => ({ ...segment }));

  for (const [index, span] of segmented.prose.entries()) {
    const translated = translations[index];
    if (translated === undefined) continue;
    segments[span.slot] = {
      ...segments[span.slot],
      english: translated,
      source: 'offline',
    };
  }

  return segments;
}
