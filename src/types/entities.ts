// Verses, ḥadīth and names found in the text, and translated segments.
// Re-exported by index.ts: outside types/, import them from `types`.

/**
 * A quoted verse or hadith, located in the text and resolved to a reference.
 *
 * Entities are derived data, kept in their own store. Detection can be improved
 * and re-run for a whole book without touching blocks, cards, or annotations —
 * `regenerateEntities` is a supported operation, not a migration.
 */
export interface Entity {
  id: string;
  bookId: string;
  /**
   * The same multi-block anchor shape translation cards use. A quotation can
   * straddle a page break, and therefore a block boundary, so an entity is not
   * confined to one block.
   */
  startBlockId: string;
  startOffset: number; // within the start block's display text
  endBlockId: string;
  endOffset: number; // within the end block's display text
  /**
   * 'narrator' is the one pre-marked *name* in the app, and deliberately the
   * only one. A ḥadīth's narrator sits in a structurally identifiable slot —
   * after عن/حدثنا/أخبرنا inside a hadith_matn block — which makes it a
   * high-precision, low-volume case: one per ḥadīth, in a known position.
   * Every other name is looked up on demand from the selection rail, because
   * tinting the hundreds a six-volume commentary mentions would bury the
   * marks, verses and translated ranges already competing for the same
   * visual channels.
   */
  /**
   * 'person' is the second marked name layer, added in Amendment 17 Part 5, and
   * it is the opposite trade to 'narrator': low precision of *identity* in
   * exchange for coverage. A narrator is one man in a known slot; a person is
   * any multi-word name that appears in an imported biographical index, marked
   * without deciding which of the people bearing it is meant. Both open the
   * same lookup, which shows every candidate — so marking is a claim that this
   * is a name, never a claim about whose.
   *
   * It renders in colour rather than as a background tint, because names are
   * frequent enough that another background layer would bury the marks, verses
   * and translated ranges already competing for that channel.
   */
  type: 'quran' | 'hadith' | 'narrator' | 'person';
  reference: string; // "2:255" | "2:255-2:257" | "riyadussalihin:412" | folded name
  matchQuality: 'exact' | 'partial' | 'unresolved';
  detectedAt: number;
  /** Muṣḥaf text for a resolved verse, so the sheet needs no network at all. */
  textUthmani?: string;
  /** Human label, e.g. "al-Baqarah 255". */
  label?: string;
  /** Words matched against the muṣḥaf; drives the diagnostics view. */
  matchedWords?: number;
}

/** One block's share of an entity, for rendering. */
export interface EntityRange {
  entity: Entity;
  blockId: string;
  start: number;
  end: number;
}

export type SegmentType = 'quran' | 'hadith' | 'poetry' | 'prose';

export interface TranslatedSegment {
  type: SegmentType;
  arabic: string;
  english: string;
  /**
   * Where the English came from. `offline` marks output from the on-device
   * translation model and must stay visually distinct from cloud output — a
   * card produced offline should never be mistaken for a Sonnet card when
   * preparing a lesson from it.
   *
   * `takhrij-table` marks a rendering taken from the fixed lookup table in
   * lib/takhrij.ts. It is deliberately its own source rather than being folded
   * into `model`: those thirty formulae are rendered identically on every path,
   * at no cost, and the card should say so.
   */
  source?: 'quran.com' | 'sunnah.com' | 'model' | 'offline' | 'takhrij-table' | 'dorar.net';
  reference?: string; // "2:255" or "Riyad as-Salihin 1"
  note?: string; // e.g. "Poem summarized rather than translated"
  uncertainTerms?: string[];
}
