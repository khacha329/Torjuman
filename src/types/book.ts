// Books and their content: pages, table of contents, blocks, dictionary entries.
// Re-exported by index.ts: outside types/, import them from `types`.

import type { StructureProfile } from './reader';

export type ImportStatus = 'pending' | 'in-progress' | 'complete' | 'failed';

export interface Book {
  id: string; // "shamela-9260"
  shamelaId: number; // 9260
  title: string;
  author: string;
  publisher: string;
  edition: string;
  volumeCount: number;
  category: string; // Shamela category, e.g. "شروح الحديث"
  structureProfile: StructureProfile;
  importedAt: number;
  importStatus: ImportStatus;
  totalPages: number;
  fetchedPages: number;
  /**
   * Shamela page index at which each print volume starts, read from the "ج"
   * dropdown on any content page. volumeStarts[0] is the first page of volume
   * 1. Used to resolve a page's volume without re-parsing.
   */
  volumeStarts: number[];
  /**
   * sunnah.com collection whose numbering this book's hadith numbers follow,
   * or null when they cannot be mapped. Ibn ʿUthaymīn's sharḥ keeps
   * an-Nawawī's numbering, so for it the number in the text *is* the reference.
   */
  hadithCollection: string | null;
  /**
   * How many name-index entries existed when this book's entities were built.
   *
   * The marked-name layer is derived from the imported biographical works, so
   * it can only be as complete as that index was at detection time — and
   * detection ran once, on first open, gated on the book having no entities at
   * all. Import a dictionary afterwards and nothing rebuilt: the book had
   * thousands of verse and ḥadīth entities, so the gate held, and no name was
   * ever marked. That is exactly what happened, and the manual "Re-detect"
   * button was the only way out of it.
   *
   * Recording the size the layer was built against turns "have any entities"
   * into "are the entities current", so importing or finishing a biographical
   * work heals itself on the next open. `undefined` on a book detected before
   * this existed, which reads as stale and rebuilds once.
   */
  nameIndexSize?: number;
  /**
   * A dictionary is imported through the same pipeline but plays a different
   * role: it is looked up, not read. Dictionaries stay out of the library grid
   * and live in Settings → Reference works.
   */
  /**
   * `reference` is a work consulted rather than read through — Fatḥ al-Bārī,
   * an-Nawawī's sharḥ. Like a dictionary it stays out of the reading library,
   * but unlike one it is a search target for Explain.
   */
  role: 'reading' | 'dictionary' | 'reference';
}

/**
 * One root's entry in a dictionary, located by the root index.
 *
 * Built from the table of contents rather than the body: in al-Miṣbāḥ al-Munīr
 * the TOC's leaf entries *are* the roots, printed as "(ء ب ب)", so the whole
 * index falls out of the skeleton the importer already parses.
 */
export interface DictionaryEntry {
  id: string;
  bookId: string;
  /** "ءبب" — spaces removed, hamza folded to ء as the index prints it. */
  root: string;
  /** "ء ب ب" — as printed. */
  rootDisplay: string;
  pageIndex: number;
  volume: number | null;
  printPage: number | null;
}

export interface TocNode {
  id: string;
  bookId: string;
  parentId: string | null;
  title: string;
  pageIndex: number; // Shamela sequential page index
  order: number;
  depth: number;
}

export interface Page {
  id: string; // `${bookId}:p${pageIndex}`
  bookId: string;
  pageIndex: number; // Shamela sequential index (the URL segment)
  volume: number | null; // ج
  printPage: number | null; // ص
  rawHtml: string; // kept so the parser can be improved and re-run offline
  fetchedAt: number;
}

export type BlockType =
  | 'chapter_title' // كتاب / باب headings
  | 'quran' // Qurʾānic verse
  | 'hadith_matn' // the hadith text itself
  | 'takhrij' // متفق عليه، رواه مسلم، etc.
  | 'sharh' // Ibn ʿUthaymīn's commentary — the default body type
  | 'poetry'
  | 'body'; // generic fallback

/**
 * Inline runs inside a block's display text.
 *
 * This field is an addition to the original spec's Block, forced by the real
 * markup: in book 9260 a Qurʾānic verse is almost never its own paragraph. It
 * appears mid-sentence inside a commentary paragraph, wrapped in a styled span,
 * followed by a reference span:
 *
 *   ... كما قال الله تعالى: (وَإِذْ تَأَذَّنَ رَبُّكُمْ ...) (إبراهيم: ٧) . وفي قصتهم ...
 *
 * A single `type` per block cannot express that. Recording the runs by
 * character offset keeps `text` completely lossless (offsets index into it and
 * nothing is rewritten) while letting the reader style verses inline, letting
 * structure detection see where a verse ends, and letting the translator prompt
 * mark verses precisely.
 */
export interface InlineSpan {
  start: number; // inclusive char offset into Block.text
  end: number; // exclusive
  kind: InlineSpanKind;
  /** For `quran_ref`: the parsed "surah:ayah" when the sūra name resolved. */
  reference?: string;
}

export type InlineSpanKind =
  | 'quran' // verse text
  | 'quran_ref' // the (سورة: آية) citation that follows it
  | 'quote' // a quoted lemma or prophetic speech in ((...))
  | 'emphasis'; // Shamela's bolded lead-in phrases

export interface Block {
  id: string; // `${bookId}:b${monotonicCounter}` — IMMUTABLE
  bookId: string;
  pageId: string;
  order: number; // global ordering across the book
  type: BlockType;
  text: string; // display text, harakāt PRESERVED
  normalized: string; // search index only — never displayed
  contentHash: string; // SHA-256 of `text`, for drift detection
  hadithNumber: string | null;
  tocNodeId: string | null;
  spans: InlineSpan[];
  /** Shamela's own per-paragraph anchor ("p3"), for deep-linking back. */
  anchor: string | null;
}
