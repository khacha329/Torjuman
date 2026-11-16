import { openDB, type IDBPDatabase } from 'idb';
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
  HadithRecord,
  Page,
  QulCompilation,
  QulEntry,
  QulResource,
  QuranVerse,
  ReadingPosition,
  ShareRecord,
  TocNode,
  TranslationCard,
  TranslationProfile,
  WordGloss,
  StoredNarratorProfile,
} from '../../types';
import type {
  PageMeta,
  SearchHit,
  StorageAdapter,
  WorkBundle,
  WorkRestoreReport,
} from './StorageAdapter';
import { DB_NAME, DB_VERSION, type Schema, upgradeDatabase } from './idbSchema';
import {
  clearAllStores,
  countStoreRows,
  listStoreNames,
  putStoreRows,
  readStoreRows,
} from './idbTransfer';
import {
  clearDictionaryEntries,
  clearEntities,
  countBlocks,
  countPages,
  deleteBlocksForPage,
  deleteBook,
  getBlock,
  getBook,
  getCrawlState,
  getPage,
  listBlocks,
  listBlocksForPage,
  listBooks,
  listDictionaryEntries,
  listEntities,
  listFetchedPageIndices,
  listPageMeta,
  listTocNodes,
  putBlocks,
  putBook,
  putCrawlState,
  putDictionaryEntries,
  putEntities,
  putPage,
  putTocNodes,
  searchBlocks,
  searchBlocksLoose,
  type SearchEntry,
} from './idbLibrary';
import {
  clearBiographyEntries,
  deleteNarratorShard,
  deleteQulResource,
  findNarratorProfiles,
  getHadith,
  getQulCompilation,
  getQulEntries,
  getQulEntry,
  getQuranVerse,
  listBiographyEntries,
  listNarratorShards,
  listQulResources,
  putBiographyEntries,
  putHadith,
  putNarratorProfiles,
  putQulCompilation,
  putQulEntries,
  putQulResource,
  putQuranVerse,
} from './idbReference';
import {
  deleteCard,
  deleteExplanationCard,
  deleteGlossaryEntry,
  deleteMarks,
  deleteProfile,
  deleteShareRecord,
  deleteSharhCard,
  getCardByCacheKey,
  getProfile,
  getReadingPosition,
  getSettings,
  getWordGloss,
  listCards,
  listExplanationCards,
  listGlossary,
  listMarks,
  listProfiles,
  listShareRecords,
  listSharhCards,
  listWordGlosses,
  putCard,
  putExplanationCard,
  putGlossaryEntry,
  putMarks,
  putProfile,
  putReadingPosition,
  putSettings,
  putShareRecord,
  putSharhCard,
  putWordGloss,
} from './idbWork';
import { exportWork, importWork } from './idbBackup';

// This file and the idb*.ts files beside it are the ONLY code that talks to
// IndexedDB (restructure Phase 4 moved this class's code into them by store
// group; the class keeps the StorageAdapter methods and hands each data
// method to its group). Everything else goes through the StorageAdapter
// interface, so replacing this with native SQLite under Capacitor touches
// nothing else.
//
// Over 500 lines only because it imports each group's functions by name and
// lists every StorageAdapter method as a one-line delegate: no logic is left
// here to split. The schema and its upgrade are in idbSchema.ts.

export class IdbStorageAdapter implements StorageAdapter {
  private db: IDBPDatabase<Schema> | null = null;

  /**
   * Lazily built, per book. Searching ~50k blocks by substring is the one query
   * IndexedDB cannot serve from an index: Arabic attaches clitics (و، ال، ب،
   * ف) to the front of words, so a prefix index would miss "والمراقبة" when the
   * user searches "مراقبة". Reading the book's blocks once and keeping the
   * normalized strings in memory makes every subsequent search a plain
   * indexOf — a few tens of milliseconds — and costs ~15 MB for six volumes.
   * Invalidated whenever blocks for that book are written.
   */
  private searchIndex = new Map<string, SearchEntry[]>();

  async init(): Promise<void> {
    this.db = await openDB<Schema>(DB_NAME, DB_VERSION, {
      upgrade: upgradeDatabase,
    });
  }

  private get handle(): IDBPDatabase<Schema> {
    if (!this.db) throw new Error('StorageAdapter.init() has not been awaited');
    return this.db;
  }

  /**
   * The handle, fetched when a moved group function first needs it rather than
   * when the class calls it: a method that returns early without touching the
   * database (an empty write) still resolves before `init`, as it always has.
   */
  private readonly lazyHandle = (): IDBPDatabase<Schema> => this.handle;

  // ---------------------------------------------------------------- books

  async putBook(book: Book): Promise<void> {
    return putBook(this.lazyHandle, book);
  }

  async getBook(id: string): Promise<Book | undefined> {
    return getBook(this.lazyHandle, id);
  }

  async listBooks(): Promise<Book[]> {
    return listBooks(this.lazyHandle);
  }

  async deleteBook(id: string): Promise<void> {
    return deleteBook(this.lazyHandle, this.searchIndex, id);
  }

  // ------------------------------------------------------------------ toc

  async putTocNodes(nodes: TocNode[]): Promise<void> {
    return putTocNodes(this.lazyHandle, nodes);
  }

  async listTocNodes(bookId: string): Promise<TocNode[]> {
    return listTocNodes(this.lazyHandle, bookId);
  }

  // ---------------------------------------------------------------- pages

  async putPage(page: Page): Promise<void> {
    return putPage(this.lazyHandle, page);
  }

  async getPage(bookId: string, pageIndex: number): Promise<Page | undefined> {
    return getPage(this.lazyHandle, bookId, pageIndex);
  }

  async listFetchedPageIndices(bookId: string): Promise<number[]> {
    return listFetchedPageIndices(this.lazyHandle, bookId);
  }

  async listPageMeta(bookId: string): Promise<PageMeta[]> {
    return listPageMeta(this.lazyHandle, bookId);
  }

  async countPages(bookId: string): Promise<number> {
    return countPages(this.lazyHandle, bookId);
  }

  // --------------------------------------------------------------- blocks

  async putBlocks(blocks: Block[]): Promise<void> {
    return putBlocks(this.lazyHandle, this.searchIndex, blocks);
  }

  async deleteBlocksForPage(pageId: string): Promise<void> {
    return deleteBlocksForPage(this.lazyHandle, this.searchIndex, pageId);
  }

  async listBlocksForPage(pageId: string): Promise<Block[]> {
    return listBlocksForPage(this.lazyHandle, pageId);
  }

  async listBlocks(bookId: string): Promise<Block[]> {
    return listBlocks(this.lazyHandle, bookId);
  }

  async getBlock(id: string): Promise<Block | undefined> {
    return getBlock(this.lazyHandle, id);
  }

  async countBlocks(bookId: string): Promise<number> {
    return countBlocks(this.lazyHandle, bookId);
  }

  async searchBlocksLoose(
    bookId: string,
    foldedQuery: string,
    limit: number,
  ): Promise<SearchHit[]> {
    return searchBlocksLoose(this.lazyHandle, this.searchIndex, bookId, foldedQuery, limit);
  }

  async searchBlocks(
    bookId: string,
    normalizedQuery: string,
    limit: number,
  ): Promise<SearchHit[]> {
    return searchBlocks(this.lazyHandle, this.searchIndex, bookId, normalizedQuery, limit);
  }

  // ------------------------------------------------------------- entities

  async putEntities(entities: Entity[]): Promise<void> {
    return putEntities(this.lazyHandle, entities);
  }

  async listEntities(bookId: string): Promise<Entity[]> {
    return listEntities(this.lazyHandle, bookId);
  }

  async clearEntities(bookId: string): Promise<void> {
    return clearEntities(this.lazyHandle, bookId);
  }

  // ----------------------------------------------------------- dictionary

  async putDictionaryEntries(entries: DictionaryEntry[]): Promise<void> {
    return putDictionaryEntries(this.lazyHandle, entries);
  }

  async listDictionaryEntries(bookId: string): Promise<DictionaryEntry[]> {
    return listDictionaryEntries(this.lazyHandle, bookId);
  }

  async clearDictionaryEntries(bookId: string): Promise<void> {
    return clearDictionaryEntries(this.lazyHandle, bookId);
  }

  // ---------------------------------------------------------------- marks

  async putMarks(marks: Mark[]): Promise<void> {
    return putMarks(this.lazyHandle, marks);
  }

  async listMarks(bookId: string): Promise<Mark[]> {
    return listMarks(this.lazyHandle, bookId);
  }

  async deleteMarks(ids: string[]): Promise<void> {
    return deleteMarks(this.lazyHandle, ids);
  }

  // ---------------------------------------------------------------- cards

  async putCard(card: TranslationCard): Promise<void> {
    return putCard(this.lazyHandle, card);
  }

  async listCards(bookId: string): Promise<TranslationCard[]> {
    return listCards(this.lazyHandle, bookId);
  }

  async getCardByCacheKey(cacheKey: string): Promise<TranslationCard | undefined> {
    return getCardByCacheKey(this.lazyHandle, cacheKey);
  }

  async deleteCard(id: string): Promise<void> {
    return deleteCard(this.lazyHandle, id);
  }

  // ------------------------------------------------------------- profiles

  async putProfile(profile: TranslationProfile): Promise<void> {
    return putProfile(this.lazyHandle, profile);
  }

  async listProfiles(): Promise<TranslationProfile[]> {
    return listProfiles(this.lazyHandle);
  }

  async getProfile(id: string): Promise<TranslationProfile | undefined> {
    return getProfile(this.lazyHandle, id);
  }

  async deleteProfile(id: string): Promise<void> {
    return deleteProfile(this.lazyHandle, id);
  }

  // ------------------------------------------------------------- glossary

  async putGlossaryEntry(entry: GlossaryEntry): Promise<void> {
    return putGlossaryEntry(this.lazyHandle, entry);
  }

  async listGlossary(): Promise<GlossaryEntry[]> {
    return listGlossary(this.lazyHandle);
  }

  async deleteGlossaryEntry(id: string): Promise<void> {
    return deleteGlossaryEntry(this.lazyHandle, id);
  }

  // ------------------------------------------------------ retrieval cache

  async putQuranVerse(verse: QuranVerse): Promise<void> {
    return putQuranVerse(this.lazyHandle, verse);
  }

  async getQuranVerse(reference: string): Promise<QuranVerse | undefined> {
    return getQuranVerse(this.lazyHandle, reference);
  }

  async putHadith(record: HadithRecord): Promise<void> {
    return putHadith(this.lazyHandle, record);
  }

  async getHadith(reference: string): Promise<HadithRecord | undefined> {
    return getHadith(this.lazyHandle, reference);
  }

  // ------------------------------------------------------------------ QUL

  async putQulResource(resource: QulResource): Promise<void> {
    return putQulResource(this.lazyHandle, resource);
  }

  // ---------------------------------------------------------------- biography

  async putBiographyEntries(entries: BiographyEntry[]): Promise<void> {
    return putBiographyEntries(this.lazyHandle, entries);
  }

  async listBiographyEntries(bookId?: string): Promise<BiographyEntry[]> {
    return listBiographyEntries(this.lazyHandle, bookId);
  }

  async clearBiographyEntries(bookId: string): Promise<void> {
    return clearBiographyEntries(this.lazyHandle, bookId);
  }

  async listQulResources(): Promise<QulResource[]> {
    return listQulResources(this.lazyHandle);
  }

  async deleteQulResource(id: string): Promise<void> {
    return deleteQulResource(this.lazyHandle, id);
  }

  async putQulEntries(entries: QulEntry[]): Promise<void> {
    return putQulEntries(this.lazyHandle, entries);
  }

  async getQulEntry(resourceId: string, key: string): Promise<QulEntry | undefined> {
    return getQulEntry(this.lazyHandle, resourceId, key);
  }

  async getQulEntries(resourceId: string, keys: string[]): Promise<QulEntry[]> {
    return getQulEntries(this.lazyHandle, resourceId, keys);
  }

  async putQulCompilation(record: QulCompilation): Promise<void> {
    return putQulCompilation(this.lazyHandle, record);
  }

  async getQulCompilation(cacheKey: string): Promise<QulCompilation | undefined> {
    return getQulCompilation(this.lazyHandle, cacheKey);
  }

  // ---------------------------------------------------------------- crawl

  async putCrawlState(state: CrawlState): Promise<void> {
    return putCrawlState(this.lazyHandle, state);
  }

  async getCrawlState(bookId: string): Promise<CrawlState | undefined> {
    return getCrawlState(this.lazyHandle, bookId);
  }

  // ------------------------------------------------------------- position

  async putReadingPosition(position: ReadingPosition): Promise<void> {
    return putReadingPosition(this.lazyHandle, position);
  }

  async getReadingPosition(bookId: string): Promise<ReadingPosition | undefined> {
    return getReadingPosition(this.lazyHandle, bookId);
  }

  // ------------------------------------------------------------- settings

  async putSettings(settings: AppSettings): Promise<void> {
    return putSettings(this.lazyHandle, settings);
  }

  async getSettings(): Promise<AppSettings | undefined> {
    return getSettings(this.lazyHandle);
  }

  // --------------------------------------------- explanations and glosses

  async putExplanationCard(card: ExplanationCard): Promise<void> {
    return putExplanationCard(this.lazyHandle, card);
  }

  async listExplanationCards(bookId: string): Promise<ExplanationCard[]> {
    return listExplanationCards(this.lazyHandle, bookId);
  }

  async deleteExplanationCard(id: string): Promise<void> {
    return deleteExplanationCard(this.lazyHandle, id);
  }

  // -------------------------------------------------------------- sharḥ

  async putSharhCard(card: SharhCard): Promise<void> {
    return putSharhCard(this.lazyHandle, card);
  }

  async listSharhCards(bookId: string): Promise<SharhCard[]> {
    return listSharhCards(this.lazyHandle, bookId);
  }

  async deleteSharhCard(id: string): Promise<void> {
    return deleteSharhCard(this.lazyHandle, id);
  }

  // ---------------------------------------------------- narrator profiles

  async putNarratorProfiles(profiles: StoredNarratorProfile[]): Promise<void> {
    return putNarratorProfiles(this.lazyHandle, profiles);
  }

  async findNarratorProfiles(naming: string): Promise<StoredNarratorProfile[]> {
    return findNarratorProfiles(this.lazyHandle, naming);
  }

  async listNarratorShards(): Promise<{ shard: string; count: number }[]> {
    return listNarratorShards(this.lazyHandle);
  }

  async deleteNarratorShard(shard: string): Promise<void> {
    return deleteNarratorShard(this.lazyHandle, shard);
  }

  // -------------------------------------------------------- shared chapters

  async putShareRecord(record: ShareRecord): Promise<void> {
    return putShareRecord(this.lazyHandle, record);
  }

  async listShareRecords(): Promise<ShareRecord[]> {
    return listShareRecords(this.lazyHandle);
  }

  async deleteShareRecord(id: string): Promise<void> {
    return deleteShareRecord(this.lazyHandle, id);
  }

  async putWordGloss(gloss: WordGloss): Promise<void> {
    return putWordGloss(this.lazyHandle, gloss);
  }

  async getWordGloss(word: string): Promise<WordGloss | undefined> {
    return getWordGloss(this.lazyHandle, word);
  }

  async listWordGlosses(): Promise<WordGloss[]> {
    return listWordGlosses(this.lazyHandle);
  }

  // ------------------------------------------------------ device transfer

  get schemaVersion(): number {
    return DB_VERSION;
  }

  listStoreNames(): string[] {
    return listStoreNames(this.lazyHandle);
  }

  async countStoreRows(store: string): Promise<number> {
    return countStoreRows(this.lazyHandle, store);
  }

  async readStoreRows(
    store: string,
    after: unknown,
    limit: number,
  ): Promise<{ rows: unknown[]; lastKey: unknown }> {
    return readStoreRows(this.lazyHandle, store, after, limit);
  }

  async putStoreRows(store: string, rows: unknown[]): Promise<void> {
    return putStoreRows(this.lazyHandle, this.searchIndex, store, rows);
  }

  async clearAllStores(): Promise<void> {
    return clearAllStores(this.lazyHandle, this.searchIndex);
  }

  // ---------------------------------------------------------- work backup

  async exportWork(): Promise<WorkBundle> {
    return exportWork(this.lazyHandle);
  }

  async importWork(bundle: WorkBundle): Promise<WorkRestoreReport> {
    return importWork(this.lazyHandle, this.searchIndex, bundle);
  }
}
