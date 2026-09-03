import type {
  AppSettings,
  BiographyEntry,
  Block,
  Book,
  CrawlState,
  DictionaryEntry,
  Entity,
  ExplanationCard,
  SharhCard,
  GlossaryEntry,
  Mark,
  WordGloss,
  HadithRecord,
  Page,
  QulCompilation,
  QulEntry,
  QulResource,
  QuranVerse,
  ReadingPosition,
  TocNode,
  TranslationCard,
  TranslationProfile,
} from '../../types';
import type { StoredNarratorProfile } from '../../biography/narratorProfile';

// The only interface the app knows about for persistence.
//
// The IndexedDB implementation lives in IdbStorageAdapter.ts and is the single
// file in the codebase that mentions IndexedDB. Swapping in native SQLite under
// Capacitor means writing one more implementation of this interface; no caller
// changes.

/**
 * The user's own work: small, precious, irreplaceable.
 *
 * Book *content* is deliberately absent — it is regenerable, it is enormous,
 * and it moves as its own per-book file (see src/library/transfer.ts). Because
 * block IDs are deterministic, this bundle restores cleanly onto a device where
 * the books were imported separately, which is the normal path to a new device.
 *
 * API keys are never included, in this or any other export.
 */
export interface WorkBundle {
  version: number;
  exportedAt: number;
  /** Shamela IDs of the books this work refers to, so gaps can be reported. */
  referencedBooks: { shamelaId: number; bookId: string; title: string }[];
  cards: TranslationCard[];
  explanationCards: ExplanationCard[];
  sharhCards: SharhCard[];
  marks: Mark[];
  glossary: GlossaryEntry[];
  profiles: TranslationProfile[];
  positions: ReadingPosition[];
  wordGlosses: WordGloss[];
  quranVerses: QuranVerse[];
  hadiths: HadithRecord[];
  settings: AppSettings | null;
}

/** What a work restore found missing. */
export interface WorkRestoreReport {
  restoredCards: number;
  restoredMarks: number;
  missingBooks: { shamelaId: number; title: string }[];
}

export interface PageMeta {
  pageIndex: number;
  volume: number | null;
  printPage: number | null;
}

export interface SearchHit {
  block: Block;
  /** Offset of the match within `block.normalized`. */
  matchStart: number;
  matchLength: number;
}

export interface StorageAdapter {
  init(): Promise<void>;

  // Books
  putBook(book: Book): Promise<void>;
  getBook(id: string): Promise<Book | undefined>;
  listBooks(): Promise<Book[]>;
  deleteBook(id: string): Promise<void>;

  // Table of contents
  putTocNodes(nodes: TocNode[]): Promise<void>;
  listTocNodes(bookId: string): Promise<TocNode[]>;

  // Pages
  putPage(page: Page): Promise<void>;
  getPage(bookId: string, pageIndex: number): Promise<Page | undefined>;
  /** Page indices already stored, ascending. Used to find crawl gaps. */
  listFetchedPageIndices(bookId: string): Promise<number[]>;
  /**
   * Volume and print-page numbers for every stored page, without retaining the
   * stored HTML. The reader needs ج/ص for the margin and for jump-to-page.
   */
  listPageMeta(bookId: string): Promise<PageMeta[]>;
  countPages(bookId: string): Promise<number>;

  // Blocks
  putBlocks(blocks: Block[]): Promise<void>;
  deleteBlocksForPage(pageId: string): Promise<void>;
  /** Blocks already stored for a page, in order. Used to keep IDs stable. */
  listBlocksForPage(pageId: string): Promise<Block[]>;
  listBlocks(bookId: string): Promise<Block[]>;
  getBlock(id: string): Promise<Block | undefined>;
  countBlocks(bookId: string): Promise<number>;
  searchBlocks(bookId: string, normalizedQuery: string, limit: number): Promise<SearchHit[]>;

  // Entities (derived; safe to regenerate)
  putEntities(entities: Entity[]): Promise<void>;
  listEntities(bookId: string): Promise<Entity[]>;
  /** Drop a book's entities so detection can be re-run over it. */
  clearEntities(bookId: string): Promise<void>;

  // Dictionary
  putDictionaryEntries(entries: DictionaryEntry[]): Promise<void>;
  listDictionaryEntries(bookId: string): Promise<DictionaryEntry[]>;
  clearDictionaryEntries(bookId: string): Promise<void>;

  // Marks
  putMarks(marks: Mark[]): Promise<void>;
  listMarks(bookId: string): Promise<Mark[]>;
  deleteMarks(ids: string[]): Promise<void>;

  // Cards
  putCard(card: TranslationCard): Promise<void>;
  listCards(bookId: string): Promise<TranslationCard[]>;
  getCardByCacheKey(cacheKey: string): Promise<TranslationCard | undefined>;
  deleteCard(id: string): Promise<void>;

  // Translation profiles
  putProfile(profile: TranslationProfile): Promise<void>;
  listProfiles(): Promise<TranslationProfile[]>;
  getProfile(id: string): Promise<TranslationProfile | undefined>;
  deleteProfile(id: string): Promise<void>;

  // Glossary
  putGlossaryEntry(entry: GlossaryEntry): Promise<void>;
  listGlossary(): Promise<GlossaryEntry[]>;
  deleteGlossaryEntry(id: string): Promise<void>;

  // Retrieval caches
  putQuranVerse(verse: QuranVerse): Promise<void>;
  getQuranVerse(reference: string): Promise<QuranVerse | undefined>;
  putHadith(record: HadithRecord): Promise<void>;
  getHadith(reference: string): Promise<HadithRecord | undefined>;

  // QUL resources
  //
  // Imported once from a file the user downloaded, then queried entirely
  // locally: every lookup is by sūrah or sūrah:āyah, which the entity already
  // knows, so none of these ever needs a search, an inference or a network.
  putQulResource(resource: QulResource): Promise<void>;
  listQulResources(): Promise<QulResource[]>;
  /** Removes the resource and every entry belonging to it. */
  deleteQulResource(id: string): Promise<void>;
  putQulEntries(entries: QulEntry[]): Promise<void>;
  getQulEntry(resourceId: string, key: string): Promise<QulEntry | undefined>;
  /** Several keys at once — the Topics tab needs a topic per ID. */
  getQulEntries(resourceId: string, keys: string[]): Promise<QulEntry[]>;

  // Biographical name index, derived from each work's own table of contents
  putBiographyEntries(entries: BiographyEntry[]): Promise<void>;
  /** Every imported work's entries when `bookId` is omitted. */
  listBiographyEntries(bookId?: string): Promise<BiographyEntry[]>;
  clearBiographyEntries(bookId: string): Promise<void>;

  // Compiled views — the one generated thing in the QUL feature
  putQulCompilation(record: QulCompilation): Promise<void>;
  getQulCompilation(cacheKey: string): Promise<QulCompilation | undefined>;

  // Crawl bookkeeping
  putCrawlState(state: CrawlState): Promise<void>;
  getCrawlState(bookId: string): Promise<CrawlState | undefined>;

  // Reading position
  putReadingPosition(position: ReadingPosition): Promise<void>;
  getReadingPosition(bookId: string): Promise<ReadingPosition | undefined>;

  // Settings
  putSettings(settings: AppSettings): Promise<void>;
  getSettings(): Promise<AppSettings | undefined>;

  // Explanation cards
  putExplanationCard(card: ExplanationCard): Promise<void>;
  listExplanationCards(bookId: string): Promise<ExplanationCard[]>;
  deleteExplanationCard(id: string): Promise<void>;

  // Retrieved commentary, anchored in the book being read.
  putSharhCard(card: SharhCard): Promise<void>;
  listSharhCards(bookId: string): Promise<SharhCard[]>;
  deleteSharhCard(id: string): Promise<void>;

  // Imported narrator profiles, looked up through a multiEntry index rather
  // than by reading the store: there are tens of thousands of them.
  putNarratorProfiles(profiles: StoredNarratorProfile[]): Promise<void>;
  findNarratorProfiles(naming: string): Promise<StoredNarratorProfile[]>;
  listNarratorShards(): Promise<{ shard: string; count: number }[]>;
  deleteNarratorShard(shard: string): Promise<void>;

  // Word gloss cache
  putWordGloss(gloss: WordGloss): Promise<void>;
  getWordGloss(word: string): Promise<WordGloss | undefined>;
  listWordGlosses(): Promise<WordGloss[]>;

  // Work backup — user work only, never book content and never API keys
  exportWork(): Promise<WorkBundle>;
  importWork(bundle: WorkBundle): Promise<WorkRestoreReport>;
}
