// Domain types for the Shamela reader.
//
// IDs are assigned once at ingest and never regenerated. Translation cards
// (and, in v2, highlights and notes) anchor to block IDs, so a re-import that
// renumbered blocks would orphan every annotation the user has made.

import type {
  ProviderId,
  TranslationErrorKind,
  TranslationUsage,
} from './translation/TranslationProvider';

export type { ProviderId, TranslationUsage };

export type StructureProfile = 'generic' | 'hadith-commentary';

/**
 * The three card-panel scopes. Persisted in AppSettings, so it lives here
 * rather than in the panel that renders it; the scoping functions themselves
 * are in ui/reader/cardLayout.ts.
 */
export type PanelScope = 'visible' | 'section' | 'all';

/**
 * One recommended work — a pointer to a book, never the book.
 *
 * ---------------------------------------------------------------------------
 * Why the app ships a list of IDs and not the texts
 *
 * Most of the works involved are modern and under copyright: Ibn ʿUthaymīn died
 * in 2001 and other commentators in this space are living. Putting their text
 * inside a distributed application is redistribution. Shipping a list of
 * Shamela IDs is not — it is a bibliography.
 *
 * The classical layer (an-Nawawī, Ibn Ḥajar, Ibn Daqīq al-ʿĪd, al-Fayyūmī)
 * raises no such question, but one mechanism for both is simpler than two, and
 * it keeps the install small and the recommendations updatable without a
 * release.
 *
 * Every factual field here — title, author, category, page count — is read off
 * Shamela by scripts/build-catalog.ts rather than typed in, so a wrong ID
 * fails when the catalog is built instead of on someone's first run.
 * ---------------------------------------------------------------------------
 */
export interface CatalogEntry {
  shamelaId: number;
  /** As Shamela prints it. */
  title: string;
  titleEn: string;
  author: string;
  role: Book['role'];
  /** Shamela's own category, e.g. "شروح الحديث". */
  category: string;
  /** How the first-run screen groups it: purpose, not Shamela's taxonomy. */
  group: string;
  /** Read from the pager, so the size is honest before committing to it. */
  approxPages: number;
  description: string;
  /** Pre-selected in the default first-run set. */
  recommended: boolean;
}

export interface Catalog {
  version: number;
  updatedAt: string;
  entries: CatalogEntry[];
}

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
  type: 'quran' | 'hadith';
  reference: string; // "2:255" | "2:255-2:257" | "riyadussalihin:412"
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

/**
 * Fields shared by everything that can appear in the right-hand panel.
 * v2 adds HighlightCard and NoteCard alongside TranslationCard; they anchor the
 * same way and render in the same list.
 */
export interface CardBase {
  id: string;
  bookId: string;
  kind: string;
  startBlockId: string;
  startOffset: number; // char offset within the start block
  endBlockId: string;
  endOffset: number;
  createdAt: number;
  /**
   * Presentation only, and persisted so it survives a restart.
   *
   * Collapsing never touches the cache, the anchor, or the card's existence —
   * it is emphatically not a soft delete. A translation the user paid for and
   * may want mid-lesson must never have to be discarded to keep the panel
   * readable.
   */
  collapsed: boolean;
}

export type CardStatus = 'loading' | 'complete' | 'error';

export interface TranslationCard extends CardBase {
  kind: 'translation';
  sourceText: string; // exact Arabic selected
  segments: TranslatedSegment[];
  profileId: string;
  promptVersion: number;
  glossaryHash: string;
  /**
   * Which service and which model produced this. Recorded on the card, not
   * just in settings, because the user is preparing lessons he will teach from
   * and needs to know at a glance whether a translation came from the free tier
   * or from Sonnet before he relies on it.
   */
  providerId: ProviderId;
  model: string;
  cacheKey: string;
  status: CardStatus;
  /** Token counts as the provider reported them. */
  usage?: TranslationUsage;
  /** Estimated USD. Null where the provider is billed in requests, not money. */
  costUsd?: number | null;
  /** Raw model output, kept when JSON parsing failed so nothing is lost. */
  rawResponse?: string;
  error?: string;
  /** Distinguishes "your key is wrong" from "wait a minute". */
  errorKind?: TranslationErrorKind;
  usedExternalLookup?: boolean;
}

/**
 * A preparation mark: what will be passed over in a session, and what will be
 * read out.
 *
 * The mapping mirrors the user's practice with a printed copy — highlight what
 * you skip, underline what you mention — so there is no new convention to
 * learn. Marks are visual only. They never hide, collapse, reorder or filter
 * anything; the book is read through normally and the marks are interpreted
 * while reading, exactly as pen marks would be.
 */
export interface Mark {
  id: string;
  bookId: string;
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  kind: 'skip' | 'read';
  /**
   * A block mark covers a whole paragraph and comes from the margin; a span
   * mark comes from a selection. Span always wins over block when they
   * overlap — an underlined sentence inside a highlighted paragraph is the
   * intended appearance, not a conflict.
   */
  scope: 'block' | 'span';
  note: string | null;
  createdAt: number;
  /** Only meaningful for marks that carry a note and so appear as cards. */
  collapsed: boolean;
}

/** One block's share of a mark, for rendering. */
export interface MarkRange {
  mark: Mark;
  blockId: string;
  start: number;
  end: number;
}

/**
 * A mark with a note, shown in the card panel.
 *
 * Bare marks are deliberately absent from the panel: a prepared volume holds
 * thousands of them and they would drown the cards.
 */
export interface NoteCard extends CardBase {
  kind: 'note';
  markId: string;
  markKind: Mark['kind'];
  note: string;
  sourceText: string;
}

/** A passage from the user's own library, cited to ج/ص. */
export interface LocalSourceRef {
  bookId: string;
  blockId: string;
  bookTitle: string;
  volume: number | null;
  printPage: number | null;
  excerpt: string;
}

/** A web source. Weaker than a local one, and marked as such. */
export interface WebSourceRef {
  url: string;
  title: string;
  siteName: string;
  /** One or two sentences. This card points at sources; it does not replace them. */
  excerpt: string;
}

/**
 * An answer to "what does this phrase mean", as distinct from "what does it
 * say" — a research question rather than a translation one.
 *
 * It never modifies the translation card it hangs from. It renders beneath it,
 * visually distinct, collapsible, and independently deletable.
 */
export interface ExplanationCard extends CardBase {
  kind: 'explanation';
  /** The translation card this attaches to, when the phrase falls inside one. */
  parentCardId: string | null;
  /** The phrase that was asked about. */
  query: string;
  explanation: string;
  localSources: LocalSourceRef[];
  webSources: WebSourceRef[];
  status: CardStatus;
  providerId: ProviderId;
  model: string;
  usage?: TranslationUsage;
  costUsd?: number | null;
  error?: string;
  errorKind?: TranslationErrorKind;
}

export type Card = TranslationCard | NoteCard | ExplanationCard;

/**
 * An English gloss for a single word, in the sense it carries in its sentence.
 *
 * Cached by normalized word form, so a repeated word is free and works offline
 * afterwards. Deliberately separate from the glossary: these are transient
 * lookups, not terminology decisions, and they never write to it.
 */
export interface WordGloss {
  /** Normalized form — the cache key. */
  word: string;
  /** As it appeared, harakāt intact. */
  display: string;
  root: string;
  meaning: string;
  note: string | null;
  isTechnicalTerm: boolean;
  model: string;
  createdAt: number;
}

export interface TranslationProfile {
  id: string;
  name: string;
  version: number; // bump on ANY edit — invalidates cache
  systemPrompt: string;
  useTransliteration: boolean; // default: false
  allowExternalLookup: boolean; // default: false
  /** A profile pins both the service and the model it runs on. */
  providerId: ProviderId;
  model: string;
}

export interface GlossaryEntry {
  id: string;
  arabic: string;
  english: string;
  note: string | null;
  addedAt: number;
}

/** Cached Qurʾān verse, keyed by "surah:ayah". */
export interface QuranVerse {
  reference: string; // "2:255"
  arabic: string;
  english: string;
  translationName: string;
  fetchedAt: number;
}

/** Cached hadith, keyed by a normalized "collection:number" reference. */
export interface HadithRecord {
  reference: string; // "riyadussalihin:1"
  collection: string;
  number: string;
  arabic: string;
  english: string;
  grade: string | null;
  sourceUrl: string | null;
  fetchedAt: number;
  /** Which HadithSource produced this record. */
  sourceId?: HadithSourceId;
  /**
   * Every grading of THIS narration, in Arabic, as dorar states them.
   *
   * A list, never one. dorar is a full-text search, so a query returns every
   * narration carrying that wording; the records kept here are the ones whose
   * narrator matches the book's, and within those, several scholars grading the
   * same narration differently is normal. That disagreement is information the
   * user needs when preparing a lesson — merging it, averaging it, or picking a
   * representative would resolve a scholarly dispute on his behalf.
   *
   * Empty means no record matched the narrator. That is shown as "no grading
   * found", because an unmatched grading is worse than an absent one.
   */
  gradings?: HadithAttribution[];
  /** The narrator read out of the book, which the gradings were matched on. */
  narrator?: string | null;
}

export type HadithSourceId = 'sunnah' | 'dorar';

export interface HadithAttribution {
  /** الراوي — the companion who narrated it. */
  rawi: string | null;
  /** المحدث — the scholar whose grading this is. */
  mohdith: string | null;
  /** المصدر — the book the grading was printed in. */
  book: string | null;
  /** الصفحة أو الرقم */
  numberOrPage: string | null;
  /** خلاصة حكم المحدث — the grade itself. */
  grade: string | null;
  /** التخريج — where else it is reported. */
  takhrij: string | null;
}

// ------------------------------------------------------------------ QUL
//
// Resources downloaded from the Qurʾān Universal Library and imported from a
// file. Every one of them is keyed by sūrah or by sūrah:āyah, which is why they
// resolve through an entity's already-known reference with no search and no
// inference — and why every lookup below is offline and deterministic.

export type QulResourceKind = 'tafsir' | 'ayah-matching' | 'topics' | 'surah-info';

export interface QulResource {
  id: string;
  kind: QulResourceKind;
  /** Taken from the file's own contents where it says, else from its name. */
  name: string;
  fileName: string;
  /** Bytes of the imported file, so the list can say what deleting reclaims. */
  byteSize: number;
  entryCount: number;
  /** What was actually read. SQLite is normalized away at import; see qul/sqlite.ts. */
  format: 'json' | 'sqlite';
  importedAt: number;
}

/**
 * One row of an imported resource.
 *
 * A single store holds all four kinds, discriminated by `value.t`. They share a
 * shape — key in, record out — so one store and one index serve every lookup,
 * and deleting a resource is one range delete rather than four.
 */
export interface QulEntry {
  /** `${resourceId}|${key}` */
  id: string;
  resourceId: string;
  /**
   * The lookup key. What it means depends on the resource kind:
   *   tafsir         "2:255"        — every āyah, group members included
   *   ayah-matching  "2:255"
   *   topics         "ayah:2:255" and "topic:1837"
   *   surah-info     "2"
   */
  key: string;
  value: QulEntryValue;
}

export type QulEntryValue =
  | TafsirPassage
  | TafsirPointer
  | AyahMatches
  | TopicRecord
  | TopicsForAyah
  | SurahInfo;

/**
 * A passage of commentary, with every āyah it covers.
 *
 * Tafsīr routinely treats several āyāt as one unit — al-Muyassar does it 625
 * times — and the passage is written to be read whole. `ayahKeys` carries the
 * group so the sheet can say "this covers 4:66–68" rather than silently
 * returning a passage that talks about more than the āyah that was tapped.
 */
export interface TafsirPassage {
  t: 'passage';
  text: string;
  ayahKeys: string[];
}

/**
 * A group member pointing at the passage that covers it.
 *
 * QUL's own JSON does exactly this — the leader carries the text, the other
 * members carry the leader's key as a bare string — and keeping it rather than
 * duplicating the text saves about a third of the file.
 */
export interface TafsirPointer {
  t: 'pointer';
  to: string;
}

export interface AyahMatch {
  ayahKey: string;
  matchedWords: number;
  coverage: number;
  score: number;
}

export interface AyahMatches {
  t: 'matches';
  matches: AyahMatch[];
}

export interface TopicRecord {
  t: 'topic';
  topicId: number;
  name: string;
  arabicName: string;
  description: string;
  ayahKeys: string[];
}

/** The reverse index, built at import so a lookup never scans 2,500 topics. */
export interface TopicsForAyah {
  t: 'topics-for-ayah';
  topicIds: number[];
}

export interface SurahInfo {
  t: 'surah';
  surahNumber: number;
  surahName: string;
  text: string;
  shortText: string;
}

/**
 * A compiled narrative over one āyah's retrieved material.
 *
 * This is the one generated thing in the QUL feature, so it is kept in its own
 * store, badged as generated wherever it is shown, and never allowed to stand
 * in for a source tab. Cached by āyah and by the exact set of resources that
 * fed it: install another tafsīr and the compilation is regenerated rather than
 * silently describing itself as covering material it never saw.
 */
export interface QulCompilation {
  cacheKey: string;
  ayahKey: string;
  resourceIds: string[];
  providerId: ProviderId;
  model: string;
  text: string;
  createdAt: number;
  usage?: TranslationUsage;
  costUsd?: number | null;
}

/** Per-page crawl bookkeeping. Kept apart from Page so gaps are cheap to find. */
export interface CrawlState {
  bookId: string;
  status: 'idle' | 'running' | 'paused' | 'complete';
  nextPage: number;
  failedPages: number[];
  updatedAt: number;
}

export interface ReadingPosition {
  bookId: string;
  blockOrder: number;
  updatedAt: number;
}

/**
 * Everything except the two API keys, which live in localStorage (see
 * app/secrets.ts). Keeping them out of this record keeps them out of the
 * backup file, which the user may well copy between devices or email himself.
 */
export interface AppSettings {
  /**
   * The provider the settings screen is currently showing. The provider that
   * actually runs a translation comes from the active profile, which pins both
   * provider and model.
   */
  providerId: ProviderId;
  activeProfileId: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  panelWidth: number; // px, persisted divider position
  panelCollapsed: boolean;
  /**
   * Which cards the panel shows.
   *
   * 'visible' follows the reader continuously, showing only cards anchored to
   * what is on screen; 'section' is the current chapter or bāb; 'all' is the
   * whole book, ordered by position. Persisted, so the choice survives a
   * restart — but 'visible' is the default and the working view.
   */
  panelScope: PanelScope;
  quranTranslationId: number;
  quranTranslationName: string;
  /**
   * Which ḥadīth service is consulted. sunnah.com takes precedence whenever its
   * key is present: it is the only one of the two that carries a verified
   * English translation. dorar.net is selected for its grading and takhrīj,
   * which sunnah.com's API does not expose — not as a translation source.
   */
  hadithSourceId: HadithSourceId;
  /**
   * The Compile action on a Qurʾān entity sheet. Off by default, and stays off:
   * the retrieved tabs are the primary interface and the compiled view is an
   * addition to them, never a replacement.
   */
  compileEnabled: boolean;
}
