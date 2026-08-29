import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type {
  AppSettings,
  BiographyEntry,
  Block,
  Book,
  CrawlState,
  DictionaryEntry,
  Entity,
  ExplanationCard,
  GlossaryEntry,
  Mark,
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
  WordGloss,
} from '../../types';
import type {
  PageMeta,
  SearchHit,
  StorageAdapter,
  WorkBundle,
  WorkRestoreReport,
} from './StorageAdapter';

// This is the ONLY file that talks to IndexedDB. Everything else goes through
// the StorageAdapter interface, so replacing this with native SQLite under
// Capacitor touches nothing else.

const DB_NAME = 'shamela-reader';
// Schema history: v2 added entities, v3 reshaped them to a multi-block anchor,
// v4 added marks, v5 the dictionary root index, v6 explanation cards and the
// word-gloss cache, v7 imported QUL resources and their compiled views.
// Entities are derived, so an upgrade drops and rebuilds that store rather than
// migrating it; nothing else is touched.
// 8 adds biographyEntries. The store is derived from each book's own table of
// contents, so it is created empty and rebuilt on demand rather than migrated.
const DB_VERSION = 8;
const SETTINGS_KEY = 'app';

interface Schema extends DBSchema {
  books: { key: string; value: Book };
  tocNodes: { key: string; value: TocNode; indexes: { byBook: string } };
  pages: {
    key: string;
    value: Page;
    indexes: { byBook: string; byBookPage: [string, number] };
  };
  blocks: {
    key: string;
    value: Block;
    indexes: { byBook: string; byPage: string; byBookOrder: [string, number] };
  };
  entities: {
    key: string;
    value: Entity;
    indexes: { byBook: string; byStartBlock: string };
  };
  dictionaryEntries: {
    key: string;
    value: DictionaryEntry;
    indexes: { byBook: string; byRoot: string };
  };
  marks: {
    key: string;
    value: Mark;
    indexes: { byBook: string; byStartBlock: string };
  };
  cards: {
    key: string;
    value: TranslationCard;
    indexes: { byBook: string; byCacheKey: string };
  };
  explanationCards: {
    key: string;
    value: ExplanationCard;
    indexes: { byBook: string };
  };
  wordGlosses: { key: string; value: WordGloss };
  qulResources: { key: string; value: QulResource };
  qulEntries: {
    key: string;
    value: QulEntry;
    indexes: { byResource: string; byResourceKey: [string, string] };
  };
  qulCompilations: { key: string; value: QulCompilation };
  biographyEntries: {
    key: string;
    value: BiographyEntry;
    indexes: { byBook: string };
  };
  profiles: { key: string; value: TranslationProfile };
  glossary: { key: string; value: GlossaryEntry };
  quranVerses: { key: string; value: QuranVerse };
  hadiths: { key: string; value: HadithRecord };
  crawlStates: { key: string; value: CrawlState };
  positions: { key: string; value: ReadingPosition };
  settings: { key: string; value: AppSettings & { key: string } };
}

/** Minimal per-block record kept in memory for search. */
interface SearchEntry {
  id: string;
  normalized: string;
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
      upgrade(db, oldVersion) {
        if (oldVersion >= 1) {
          // Upgrading an existing database: only touch what changed. Blocks,
          // cards, marks and the glossary are left exactly as they are.
          // Entities are derived, so that store is dropped and rebuilt by
          // detection rather than migrated.
          if (db.objectStoreNames.contains('entities')) {
            db.deleteObjectStore('entities');
          }
          const entities = db.createObjectStore('entities', { keyPath: 'id' });
          entities.createIndex('byBook', 'bookId');
          entities.createIndex('byStartBlock', 'startBlockId');

          if (!db.objectStoreNames.contains('marks')) {
            const marks = db.createObjectStore('marks', { keyPath: 'id' });
            marks.createIndex('byBook', 'bookId');
            marks.createIndex('byStartBlock', 'startBlockId');
          }
          if (!db.objectStoreNames.contains('dictionaryEntries')) {
            const dictionary = db.createObjectStore('dictionaryEntries', { keyPath: 'id' });
            dictionary.createIndex('byBook', 'bookId');
            dictionary.createIndex('byRoot', 'root');
          }
          if (!db.objectStoreNames.contains('explanationCards')) {
            const explanations = db.createObjectStore('explanationCards', { keyPath: 'id' });
            explanations.createIndex('byBook', 'bookId');
          }
          if (!db.objectStoreNames.contains('wordGlosses')) {
            db.createObjectStore('wordGlosses', { keyPath: 'word' });
          }
          if (!db.objectStoreNames.contains('qulResources')) {
            db.createObjectStore('qulResources', { keyPath: 'id' });
            const qulEntries = db.createObjectStore('qulEntries', { keyPath: 'id' });
            qulEntries.createIndex('byResource', 'resourceId');
            qulEntries.createIndex('byResourceKey', ['resourceId', 'key']);
            db.createObjectStore('qulCompilations', { keyPath: 'cacheKey' });
          }
          if (!db.objectStoreNames.contains('biographyEntries')) {
            const biography = db.createObjectStore('biographyEntries', { keyPath: 'id' });
            biography.createIndex('byBook', 'bookId');
          }
          return;
        }

        db.createObjectStore('books', { keyPath: 'id' });

        const toc = db.createObjectStore('tocNodes', { keyPath: 'id' });
        toc.createIndex('byBook', 'bookId');

        const pages = db.createObjectStore('pages', { keyPath: 'id' });
        pages.createIndex('byBook', 'bookId');
        pages.createIndex('byBookPage', ['bookId', 'pageIndex']);

        const blocks = db.createObjectStore('blocks', { keyPath: 'id' });
        blocks.createIndex('byBook', 'bookId');
        blocks.createIndex('byPage', 'pageId');
        blocks.createIndex('byBookOrder', ['bookId', 'order']);

        const entities = db.createObjectStore('entities', { keyPath: 'id' });
        entities.createIndex('byBook', 'bookId');
        entities.createIndex('byStartBlock', 'startBlockId');

        const dictionary = db.createObjectStore('dictionaryEntries', { keyPath: 'id' });
        dictionary.createIndex('byBook', 'bookId');
        dictionary.createIndex('byRoot', 'root');

        // Indexed by startBlockId so the virtualized reader can look up the
        // marks for the blocks on screen without scanning thousands.
        const marks = db.createObjectStore('marks', { keyPath: 'id' });
        marks.createIndex('byBook', 'bookId');
        marks.createIndex('byStartBlock', 'startBlockId');

        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('byBook', 'bookId');
        cards.createIndex('byCacheKey', 'cacheKey');

        const explanations = db.createObjectStore('explanationCards', { keyPath: 'id' });
        explanations.createIndex('byBook', 'bookId');

        db.createObjectStore('wordGlosses', { keyPath: 'word' });

        // One store for all four QUL resource kinds. They share a shape — key
        // in, record out — so a single compound index serves every lookup and
        // deleting a resource is one range delete rather than four.
        db.createObjectStore('qulResources', { keyPath: 'id' });
        const qulEntries = db.createObjectStore('qulEntries', { keyPath: 'id' });
        qulEntries.createIndex('byResource', 'resourceId');
        qulEntries.createIndex('byResourceKey', ['resourceId', 'key']);
        db.createObjectStore('qulCompilations', { keyPath: 'cacheKey' });

        // Derived from each book's contents, so indexed only by book: a lookup
        // reads every imported biographical work anyway, and there are three of
        // them at most.
        const biography = db.createObjectStore('biographyEntries', { keyPath: 'id' });
        biography.createIndex('byBook', 'bookId');

        db.createObjectStore('profiles', { keyPath: 'id' });
        db.createObjectStore('glossary', { keyPath: 'id' });
        db.createObjectStore('quranVerses', { keyPath: 'reference' });
        db.createObjectStore('hadiths', { keyPath: 'reference' });
        db.createObjectStore('crawlStates', { keyPath: 'bookId' });
        db.createObjectStore('positions', { keyPath: 'bookId' });
        db.createObjectStore('settings', { keyPath: 'key' });
      },
    });
  }

  private get handle(): IDBPDatabase<Schema> {
    if (!this.db) throw new Error('StorageAdapter.init() has not been awaited');
    return this.db;
  }

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
    for (const store of [
      'tocNodes',
      'pages',
      'blocks',
      'entities',
      'dictionaryEntries',
      'marks',
      'cards',
      'explanationCards',
    ] as const) {
      const tx = db.transaction(store, 'readwrite');
      let cursor = await tx.store.index('byBook').openCursor(id);
      while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
      }
      await tx.done;
    }
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
      entries.push({ id: cursor.value.id, normalized: cursor.value.normalized });
      cursor = await cursor.continue();
    }
    await tx.done;

    this.searchIndex.set(bookId, entries);
    return entries;
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
    const tx = this.handle.transaction('entities', 'readwrite');
    let cursor = await tx.store.index('byBook').openCursor(bookId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
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
    const tx = this.handle.transaction('dictionaryEntries', 'readwrite');
    let cursor = await tx.store.index('byBook').openCursor(bookId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }

  // ---------------------------------------------------------------- marks

  async putMarks(marks: Mark[]): Promise<void> {
    if (marks.length === 0) return;
    const tx = this.handle.transaction('marks', 'readwrite');
    await Promise.all(marks.map((mark) => tx.store.put(mark)));
    await tx.done;
  }

  async listMarks(bookId: string): Promise<Mark[]> {
    return this.handle.getAllFromIndex('marks', 'byBook', bookId);
  }

  async deleteMarks(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const tx = this.handle.transaction('marks', 'readwrite');
    await Promise.all(ids.map((id) => tx.store.delete(id)));
    await tx.done;
  }

  // ---------------------------------------------------------------- cards

  async putCard(card: TranslationCard): Promise<void> {
    await this.handle.put('cards', card);
  }

  async listCards(bookId: string): Promise<TranslationCard[]> {
    return this.handle.getAllFromIndex('cards', 'byBook', bookId);
  }

  async getCardByCacheKey(cacheKey: string): Promise<TranslationCard | undefined> {
    return this.handle.getFromIndex('cards', 'byCacheKey', cacheKey);
  }

  async deleteCard(id: string): Promise<void> {
    await this.handle.delete('cards', id);
  }

  // ------------------------------------------------------------- profiles

  async putProfile(profile: TranslationProfile): Promise<void> {
    await this.handle.put('profiles', profile);
  }

  async listProfiles(): Promise<TranslationProfile[]> {
    return this.handle.getAll('profiles');
  }

  async getProfile(id: string): Promise<TranslationProfile | undefined> {
    return this.handle.get('profiles', id);
  }

  async deleteProfile(id: string): Promise<void> {
    await this.handle.delete('profiles', id);
  }

  // ------------------------------------------------------------- glossary

  async putGlossaryEntry(entry: GlossaryEntry): Promise<void> {
    await this.handle.put('glossary', entry);
  }

  async listGlossary(): Promise<GlossaryEntry[]> {
    const entries = await this.handle.getAll('glossary');
    return entries.sort((a, b) => a.addedAt - b.addedAt);
  }

  async deleteGlossaryEntry(id: string): Promise<void> {
    await this.handle.delete('glossary', id);
  }

  // ------------------------------------------------------ retrieval cache

  async putQuranVerse(verse: QuranVerse): Promise<void> {
    await this.handle.put('quranVerses', verse);
  }

  async getQuranVerse(reference: string): Promise<QuranVerse | undefined> {
    return this.handle.get('quranVerses', reference);
  }

  async putHadith(record: HadithRecord): Promise<void> {
    await this.handle.put('hadiths', record);
  }

  async getHadith(reference: string): Promise<HadithRecord | undefined> {
    return this.handle.get('hadiths', reference);
  }

  // ------------------------------------------------------------------ QUL

  async putQulResource(resource: QulResource): Promise<void> {
    await this.handle.put('qulResources', resource);
  }

  // ---------------------------------------------------------------- biography

  async putBiographyEntries(entries: BiographyEntry[]): Promise<void> {
    const transaction = this.handle.transaction('biographyEntries', 'readwrite');
    await Promise.all(entries.map((entry) => transaction.store.put(entry)));
    await transaction.done;
  }

  async listBiographyEntries(bookId?: string): Promise<BiographyEntry[]> {
    if (bookId === undefined) return this.handle.getAll('biographyEntries');
    return this.handle.getAllFromIndex('biographyEntries', 'byBook', bookId);
  }

  async clearBiographyEntries(bookId: string): Promise<void> {
    const transaction = this.handle.transaction('biographyEntries', 'readwrite');
    const index = transaction.store.index('byBook');
    let cursor = await index.openCursor(IDBKeyRange.only(bookId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await transaction.done;
  }

  async listQulResources(): Promise<QulResource[]> {
    const all = await this.handle.getAll('qulResources');
    return all.sort((a, b) => a.name.localeCompare(b.name));
  }

  async deleteQulResource(id: string): Promise<void> {
    // Entries first: a resource row with no entries reads as "installed but
    // empty", which is a worse state to be interrupted in than orphaned rows.
    const transaction = this.handle.transaction(['qulEntries', 'qulResources'], 'readwrite');
    const index = transaction.objectStore('qulEntries').index('byResource');
    let cursor = await index.openCursor(IDBKeyRange.only(id));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await transaction.objectStore('qulResources').delete(id);
    await transaction.done;
  }

  async putQulEntries(entries: QulEntry[]): Promise<void> {
    const transaction = this.handle.transaction('qulEntries', 'readwrite');
    await Promise.all(entries.map((entry) => transaction.store.put(entry)));
    await transaction.done;
  }

  async getQulEntry(resourceId: string, key: string): Promise<QulEntry | undefined> {
    return this.handle.get('qulEntries', `${resourceId}|${key}`);
  }

  async getQulEntries(resourceId: string, keys: string[]): Promise<QulEntry[]> {
    const transaction = this.handle.transaction('qulEntries', 'readonly');
    const found = await Promise.all(
      keys.map((key) => transaction.store.get(`${resourceId}|${key}`)),
    );
    await transaction.done;
    return found.filter((entry): entry is QulEntry => entry !== undefined);
  }

  async putQulCompilation(record: QulCompilation): Promise<void> {
    await this.handle.put('qulCompilations', record);
  }

  async getQulCompilation(cacheKey: string): Promise<QulCompilation | undefined> {
    return this.handle.get('qulCompilations', cacheKey);
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
    await this.handle.put('positions', position);
  }

  async getReadingPosition(bookId: string): Promise<ReadingPosition | undefined> {
    return this.handle.get('positions', bookId);
  }

  // ------------------------------------------------------------- settings

  async putSettings(settings: AppSettings): Promise<void> {
    await this.handle.put('settings', { ...settings, key: SETTINGS_KEY });
  }

  async getSettings(): Promise<AppSettings | undefined> {
    const stored = await this.handle.get('settings', SETTINGS_KEY);
    if (!stored) return undefined;
    const { key: _key, ...settings } = stored;
    return settings;
  }

  // --------------------------------------------- explanations and glosses

  async putExplanationCard(card: ExplanationCard): Promise<void> {
    await this.handle.put('explanationCards', card);
  }

  async listExplanationCards(bookId: string): Promise<ExplanationCard[]> {
    return this.handle.getAllFromIndex('explanationCards', 'byBook', bookId);
  }

  async deleteExplanationCard(id: string): Promise<void> {
    await this.handle.delete('explanationCards', id);
  }

  async putWordGloss(gloss: WordGloss): Promise<void> {
    await this.handle.put('wordGlosses', gloss);
  }

  async getWordGloss(word: string): Promise<WordGloss | undefined> {
    return this.handle.get('wordGlosses', word);
  }

  async listWordGlosses(): Promise<WordGloss[]> {
    return this.handle.getAll('wordGlosses');
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
      marks: await db.getAll('marks'),
      glossary: await db.getAll('glossary'),
      profiles: await db.getAll('profiles'),
      positions: await db.getAll('positions'),
      wordGlosses: await db.getAll('wordGlosses'),
      quranVerses: await db.getAll('quranVerses'),
      hadiths: await db.getAll('hadiths'),
      settings: (await this.getSettings()) ?? null,
    };
  }

  async importWork(bundle: WorkBundle): Promise<WorkRestoreReport> {
    const db = this.handle;

    const write = async <
      K extends 'cards' | 'explanationCards' | 'marks' | 'glossary' | 'profiles' |
        'positions' | 'wordGlosses' | 'quranVerses' | 'hadiths',
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
    await write('marks', bundle.marks);
    await write('glossary', bundle.glossary);
    await write('profiles', bundle.profiles);
    await write('positions', bundle.positions);
    await write('wordGlosses', bundle.wordGlosses);
    await write('quranVerses', bundle.quranVerses);
    await write('hadiths', bundle.hadiths);
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
