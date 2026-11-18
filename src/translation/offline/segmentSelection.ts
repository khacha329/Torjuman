import type { Block, Entity, TranslatedSegment } from '../../types';
import type { QuranEnglish, QuranIndex } from '../../quran/quranIndex';
import { renderTakhrij } from '../../lib/takhrij';

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

interface Piece {
  start: number;
  end: number;
  entity?: Entity;
}

/**
 * Cut the selected text at the boundaries of the verses and ḥadīth it
 * contains, resolved or not (FOUND_ISSUES 68). Marked names (`narrator`,
 * `person`) cut nothing (FOUND_ISSUES 61).
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
  hadithLookup: (reference: string) => { arabic: string; english: string } | null;
}): SegmentedSelection {
  const { blocks, entities, quran, english } = options;

  const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
  const startOrder = orderOf.get(options.startBlockId) ?? 0;
  const endOrder = orderOf.get(options.endBlockId) ?? 0;

  const segments: TranslatedSegment[] = [];
  const prose: ProseSpan[] = [];

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
        covering.push({ start: overlapStart, end: overlapEnd, entity });
      }
    }

    // At one start, the longer piece first, so a verse quoted inside a ḥadīth
    // that begins at the same offset is inside the ḥadīth, not before it. On
    // an exact tie, the ḥadīth first: otherwise the order the entities came in
    // decides, and the detector stores a block's verses before its ḥadīth, so
    // the verse would be emitted and the ḥadīth skipped as lying inside it —
    // its segment, note and any verified English missing from the card
    // (FOUND_ISSUES 72; the skip is 61's).
    const rank = (piece: Piece) => (piece.entity?.type === 'hadith' ? 0 : 1);
    covering.sort((a, b) => a.start - b.start || b.end - a.end || rank(a) - rank(b));

    // Walk the block's share, emitting prose between entities. A piece that
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
        pushProse(block.text.slice(cursor, start));
      }
      pushEntity(piece.entity!, block.text.slice(start, piece.end));
      cursor = piece.end;
    }
    if (cursor < to) pushProse(block.text.slice(cursor, to));
  }

  return { segments, prose };

  function pushProse(text: string): void {
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
    // whitespace is not translated as two fragments.
    const previous = segments[segments.length - 1];
    if (previous && previous.type === 'prose' && previous.english === '') {
      previous.arabic += text;
      const slot = prose[prose.length - 1];
      slot.text = previous.arabic;
      return;
    }

    const slot = segments.length;
    segments.push({ type: 'prose', arabic: text, english: '', source: 'model' });
    prose.push({ slot, text });
  }

  function pushEntity(entity: Entity, sourceText: string): void {
    if (entity.type === 'quran') {
      // Retrieved from the bundled muṣḥaf, never generated.
      const range = quran.flatRangeOf(entity.reference);
      const englishText = range ? english.range(range[0], range[1]) : '';

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
    // it carries; it never decides whether a model gets to see it.
    const verified = entity.reference ? options.hadithLookup(entity.reference) : null;

    segments.push({
      type: 'hadith',
      arabic: verified?.arabic || sourceText,
      english: verified?.english ?? '',
      source: verified ? 'sunnah.com' : undefined,
      reference: entity.reference || undefined,
      note: verified ? undefined : HADITH_NO_OFFLINE_SOURCE,
    });
  }
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
