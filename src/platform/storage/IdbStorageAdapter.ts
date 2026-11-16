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
import { letterFold } from '../../lib/arabic';
import type {
  PageMeta,
  SearchHit,
  StorageAdapter,
  WorkBundle,
  WorkRestoreReport,
} from './StorageAdapter';
import { BOOK_STORES, DB_NAME, DB_VERSION, type Schema, upgradeDatabase } from './idbSchema';
import { purgeIndex } from './idbPurge';
import {
  clearAllStores,
  countStoreRows,
  listStoreNames,
  putStoreRows,
  readStoreRows,
} from './idbTransfer';
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

// This file and the idb*.ts files beside it are the ONLY code that talks to
// IndexedDB (restructure Phase 4 is moving this class's code into them, store
// group by store group). Everything else goes through the StorageAdapter
// interface, so replacing this with native SQLite under Capacitor touches
// nothing else.

/** Minimal per-block record kept in memory for search. */
interface SearchEntry {
  id: string;
  normalized: string;
  /**
   * Letters and single spaces only.
   *
   * Reader search wants `normalized`, which keeps punctuation, because a
   * reader types punctuation. Matching one book's passage against another's
   * wants this: the two editors punctuate differently, and a colon or a
   * doubled bracket in one and not the other defeats an otherwise exact run.
   * Computed once, when the index loads.
   */
  folded: string;
}

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
    await this.handle.put('books', book);
  }

  async getBook(id: string): Promise<Book | undefined> {
    return this.handle.get('books', id);
  }

  async listBooks(): Promise<Book[]> {
    const books = await this.handle.getAll('books');
    return books.sort((a, b) => b.importedAt - a.importedAt);
  }

  async deleteBook(id: string): Promise<void> {
    const db = this.handle;
    for (const store of BOOK_STORES) {
      await purgeIndex(this.handle, store, 'byBook', id);
    }
    // Narrator profiles are filed by SHARD, not by book, so they are not in
    // the loop above. A Taqrīb import's profiles belong to this book and must
    // go with it; an installed Itqan shard belongs to no book and must not.
    await this.deleteNarratorShard(`taqrib:${id}`);

    // The book row goes last. An interrupted removal then still lists the book,
    // so pressing Remove again finishes the job; deleting the row first would
    // strand every other store's rows with nothing left to reach them by.
    await db.delete('books', id);
    await db.delete('crawlStates', id);
    await db.delete('positions', id);
    this.searchIndex.delete(id);
  }

  // ------------------------------------------------------------------ toc

  async putTocNodes(nodes: TocNode[]): Promise<void> {
    const tx = this.handle.transaction('tocNodes', 'readwrite');
    await Promise.all(nodes.map((node) => tx.store.put(node)));
    await tx.done;
  }

  async listTocNodes(bookId: string): Promise<TocNode[]> {
    const nodes = await this.handle.getAllFromIndex('tocNodes', 'byBook', bookId);
    return nodes.sort((a, b) => a.order - b.order);
  }

  // ---------------------------------------------------------------- pages

  async putPage(page: Page): Promise<void> {
    await this.handle.put('pages', page);
  }

  async getPage(bookId: string, pageIndex: number): Promise<Page | undefined> {
    return this.handle.get('pages', `${bookId}:p${pageIndex}`);
  }

  /**
   * Reads only the compound index keys, never the records themselves — the
   * stored HTML for a whole book is tens of megabytes and must not be pulled
   * into memory just to work out which pages are missing.
   */
  async listFetchedPageIndices(bookId: string): Promise<number[]> {
    const tx = this.handle.transaction('pages', 'readonly');
    const indices: number[] = [];
    let cursor = await tx.store
      .index('byBookPage')
      .openKeyCursor(IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity]));
    while (cursor) {
      indices.push(cursor.key[1]);
      cursor = await cursor.continue();
    }
    await tx.done;
    return indices.sort((a, b) => a - b);
  }

  /**
   * Cursors the page records and keeps only the three numbers the reader needs.
   * The stored HTML passes through but is never retained, so the ج/ص margin
   * costs a few hundred kilobytes of live memory instead of the whole book.
   */
  async listPageMeta(bookId: string): Promise<PageMeta[]> {
    const meta: PageMeta[] = [];
    const tx = this.handle.transaction('pages', 'readonly');
    let cursor = await tx.store
      .index('byBookPage')
      .openCursor(IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity]));
    while (cursor) {
      meta.push({
        pageIndex: cursor.value.pageIndex,
        volume: cursor.value.volume,
        printPage: cursor.value.printPage,
      });
      cursor = await cursor.continue();
    }
    await tx.done;
    return meta;
  }

  async countPages(bookId: string): Promise<number> {
    return this.handle.countFromIndex('pages', 'byBook', bookId);
  }

  // --------------------------------------------------------------- blocks

  async putBlocks(blocks: Block[]): Promise<void> {
    if (blocks.length === 0) return;
    const tx = this.handle.transaction('blocks', 'readwrite');
    await Promise.all(blocks.map((block) => tx.store.put(block)));
    await tx.done;
    this.searchIndex.delete(blocks[0].bookId);
  }

  async deleteBlocksForPage(pageId: string): Promise<void> {
    const tx = this.handle.transaction('blocks', 'readwrite');
    let cursor = await tx.store.index('byPage').openCursor(pageId);
    let bookId: string | null = null;
    while (cursor) {
      bookId = cursor.value.bookId;
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
    if (bookId) this.searchIndex.delete(bookId);
  }

  async listBlocksForPage(pageId: string): Promise<Block[]> {
    const blocks = await this.handle.getAllFromIndex('blocks', 'byPage', pageId);
    return blocks.sort((a, b) => a.order - b.order);
  }

  async listBlocks(bookId: string): Promise<Block[]> {
    const blocks = await this.handle.getAllFromIndex('blocks', 'byBook', bookId);
    return blocks.sort((a, b) => a.order - b.order);
  }

  async getBlock(id: string): Promise<Block | undefined> {
    return this.handle.get('blocks', id);
  }

  async countBlocks(bookId: string): Promise<number> {
    return this.handle.countFromIndex('blocks', 'byBook', bookId);
  }

  private async loadSearchIndex(bookId: string): Promise<SearchEntry[]> {
    const cached = this.searchIndex.get(bookId);
    if (cached) return cached;

    const entries: SearchEntry[] = [];
    const tx = this.handle.transaction('blocks', 'readonly');
    let cursor = await tx.store.index('byBookOrder').openCursor(
      IDBKeyRange.bound([bookId, -Infinity], [bookId, Infinity]),
    );
    while (cursor) {
      entries.push({
        id: cursor.value.id,
        normalized: cursor.value.normalized,
        folded: letterFold(cursor.value.normalized),
      });
      cursor = await cursor.continue();
    }
    await tx.done;

    this.searchIndex.set(bookId, entries);
    return entries;
  }

  /**
   * Search on letters alone, for matching a passage across two books.
   *
   * Same scan as `searchBlocks`, against the folded field. Separate rather
   * than a flag because the two have different meanings: one answers "where
   * did the reader's words occur", the other "is this the same passage".
   */
  async searchBlocksLoose(
    bookId: string,
    foldedQuery: string,
    limit: number,
  ): Promise<SearchHit[]> {
    if (!foldedQuery) return [];
    const entries = await this.loadSearchIndex(bookId);

    const hits: SearchHit[] = [];
    for (const entry of entries) {
      const at = entry.folded.indexOf(foldedQuery);
      if (at === -1) continue;
      const block = await this.getBlock(entry.id);
      if (!block) continue;
      hits.push({ block, matchStart: at, matchLength: foldedQuery.length });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  async searchBlocks(
    bookId: string,
    normalizedQuery: string,
    limit: number,
  ): Promise<SearchHit[]> {
    if (!normalizedQuery) return [];
    const entries = await this.loadSearchIndex(bookId);

    const hits: SearchHit[] = [];
    for (const entry of entries) {
      const at = entry.normalized.indexOf(normalizedQuery);
      if (at === -1) continue;
      const block = await this.getBlock(entry.id);
      if (!block) continue;
      hits.push({ block, matchStart: at, matchLength: normalizedQuery.length });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  // ------------------------------------------------------------- entities

  async putEntities(entities: Entity[]): Promise<void> {
    if (entities.length === 0) return;
    for (let i = 0; i < entities.length; i += 500) {
      const tx = this.handle.transaction('entities', 'readwrite');
      await Promise.all(entities.slice(i, i + 500).map((entity) => tx.store.put(entity)));
      await tx.done;
    }
  }

  async listEntities(bookId: string): Promise<Entity[]> {
    return this.handle.getAllFromIndex('entities', 'byBook', bookId);
  }

  async clearEntities(bookId: string): Promise<void> {
    await purgeIndex(this.handle, 'entities', 'byBook', bookId);
  }

  // ----------------------------------------------------------- dictionary

  async putDictionaryEntries(entries: DictionaryEntry[]): Promise<void> {
    if (entries.length === 0) return;
    for (let i = 0; i < entries.length; i += 500) {
      const tx = this.handle.transaction('dictionaryEntries', 'readwrite');
      await Promise.all(entries.slice(i, i + 500).map((entry) => tx.store.put(entry)));
      await tx.done;
    }
  }

  async listDictionaryEntries(bookId: string): Promise<DictionaryEntry[]> {
    return this.handle.getAllFromIndex('dictionaryEntries', 'byBook', bookId);
  }

  async clearDictionaryEntries(bookId: string): Promise<void> {
    await purgeIndex(this.handle, 'dictionaryEntries', 'byBook', bookId);
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
    await this.handle.put('crawlStates', state);
  }

  async getCrawlState(bookId: string): Promise<CrawlState | undefined> {
    return this.handle.get('crawlStates', bookId);
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
    const db = this.handle;
    const books = await db.getAll('books');

    return {
      version: DB_VERSION,
      exportedAt: Date.now(),
      referencedBooks: books.map((book) => ({
        shamelaId: book.shamelaId,
        bookId: book.id,
        title: book.title,
      })),
      cards: await db.getAll('cards'),
      explanationCards: await db.getAll('explanationCards'),
      sharhCards: await db.getAll('sharhCards'),
      marks: await db.getAll('marks'),
      glossary: await db.getAll('glossary'),
      profiles: await db.getAll('profiles'),
      positions: await db.getAll('positions'),
      wordGlosses: await db.getAll('wordGlosses'),
      quranVerses: await db.getAll('quranVerses'),
      hadiths: await db.getAll('hadiths'),
      shareRecords: await db.getAll('shareRecords'),
      settings: (await this.getSettings()) ?? null,
    };
  }

  async importWork(bundle: WorkBundle): Promise<WorkRestoreReport> {
    const db = this.handle;

    const write = async <
      K extends 'cards' | 'explanationCards' | 'sharhCards' | 'marks' | 'glossary' | 'profiles' |
        'positions' | 'wordGlosses' | 'quranVerses' | 'hadiths' | 'shareRecords',
    >(
      store: K,
      rows: Schema[K]['value'][] | undefined,
    ) => {
      if (!rows || rows.length === 0) return;
      for (let i = 0; i < rows.length; i += 500) {
        const tx = db.transaction(store, 'readwrite');
        await Promise.all(rows.slice(i, i + 500).map((row) => tx.store.put(row as never)));
        await tx.done;
      }
    };

    await write('cards', bundle.cards);
    await write('explanationCards', bundle.explanationCards);
    await write('sharhCards', bundle.sharhCards);
    await write('marks', bundle.marks);
    await write('glossary', bundle.glossary);
    await write('profiles', bundle.profiles);
    await write('positions', bundle.positions);
    await write('wordGlosses', bundle.wordGlosses);
    await write('quranVerses', bundle.quranVerses);
    await write('hadiths', bundle.hadiths);
    // Absent on a backup written before shares existed, which `write` handles.
    await write('shareRecords', bundle.shareRecords);
    if (bundle.settings) await this.putSettings(bundle.settings);

    // Work anchored to a book that is not on this device restores fine — block
    // IDs are deterministic, so it will bind correctly once that book is
    // imported. Say which ones are missing rather than failing.
    const present = new Set((await db.getAll('books')).map((book) => book.shamelaId));
    const missingBooks = (bundle.referencedBooks ?? [])
      .filter((entry) => !present.has(entry.shamelaId))
      .map((entry) => ({ shamelaId: entry.shamelaId, title: entry.title }));

    this.searchIndex.clear();

    return {
      restoredCards: (bundle.cards?.length ?? 0) + (bundle.explanationCards?.length ?? 0),
      restoredMarks: bundle.marks?.length ?? 0,
      missingBooks,
    };
  }
}
