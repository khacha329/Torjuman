import type { DBSchema, IDBPDatabase } from 'idb';
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

// The database's name, version and shape, and the upgrade callback that
// builds it: both branches of it (an existing database brought up to date, a
// fresh install created whole) are `upgradeDatabase` below, which
// IdbStorageAdapter.init hands to openDB; every typed transaction in the
// adapter checks against `Schema`. Moved verbatim from IdbStorageAdapter.ts in
// restructure Phase 4 steps 4b and 4c (docs/refactor/plans/phase4-storage.md);
// the schema history stays with the version it explains.

export const DB_NAME = 'shamela-reader';
// Schema history: v2 added entities, v3 reshaped them to a multi-block anchor,
// v4 added marks, v5 the dictionary root index, v6 explanation cards and the
// word-gloss cache, v7 imported QUL resources and their compiled views.
// Entities are derived, so an upgrade drops and rebuilds that store rather than
// migrating it; nothing else is touched.
// 8 adds biographyEntries. The store is derived from each book's own table of
// contents, so it is created empty and rebuilt on demand rather than migrated.
// 9 adds sharhCards: commentary retrieved verbatim from an imported sharḥ. Its
// own store rather than a kind inside `cards`, which is keyed for the
// translation cache — a card that was never generated has no cache key.
// 10 adds narratorProfiles, keyed by a unique id and indexed multiEntry on
// `namings`. Unlike biographyEntries — a few thousand short rows read whole —
// this store holds tens of thousands of full profiles, so a lookup must go
// through an index rather than load it.
// 11 adds shareRecords: what this device has published as a shared link. A few
// dozen tiny rows read whole, so no index. It holds each share's decryption
// key, which exists in no other place — see ShareRecord.
export const DB_VERSION = 11;

/**
 * Every store that files its rows under a book, and so must be cleared with it.
 *
 * Listed here rather than inline so that adding a per-book store is one line
 * away from being cleaned up too — `biographyEntries` was missed exactly
 * because the list was buried in the body of `deleteBook`.
 */
export const BOOK_STORES = [
  'tocNodes',
  'pages',
  'blocks',
  'entities',
  'dictionaryEntries',
  'marks',
  'cards',
  'explanationCards',
  'sharhCards',
  // Its absence here was not harmless. Re-importing a biographical work left
  // the old index in place, and `ensureBiographyIndexes` only builds for a book
  // with NO entries — so the stale rows survived and kept pointing at page
  // indices from the previous import. That is what produced "the entry is on a
  // page that has not been fetched yet" for a book that was fully imported.
  'biographyEntries',
] as const;

export type BookStore = (typeof BOOK_STORES)[number];

export interface Schema extends DBSchema {
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
  // Indexed by the book being READ, not the commentary quoted: a card is
  // anchored in the reader's own book, and that is what a delete has to follow.
  sharhCards: {
    key: string;
    value: SharhCard;
    indexes: { byBook: string };
  };
  narratorProfiles: {
    key: string;
    value: StoredNarratorProfile;
    indexes: { byNaming: string; byShard: string };
  };
  shareRecords: { key: string; value: ShareRecord };
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

/**
 * The `upgrade` callback `IdbStorageAdapter.init` passes to `openDB`: the
 * existing-database branch, then the fresh-install branch. Moved verbatim from
 * the callback's body in restructure Phase 4 step 4c.
 */
export function upgradeDatabase(db: IDBPDatabase<Schema>, oldVersion: number): void {
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
    if (!db.objectStoreNames.contains('sharhCards')) {
      const sharh = db.createObjectStore('sharhCards', { keyPath: 'id' });
      sharh.createIndex('byBook', 'bookId');
    }
    if (!db.objectStoreNames.contains('narratorProfiles')) {
      const narrators = db.createObjectStore('narratorProfiles', { keyPath: 'id' });
      narrators.createIndex('byNaming', 'namings', { multiEntry: true });
      narrators.createIndex('byShard', 'shard');
    }
    if (!db.objectStoreNames.contains('shareRecords')) {
      db.createObjectStore('shareRecords', { keyPath: 'id' });
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

  // Retrieved commentary. Its own store rather than a kind inside
  // `cards`, because that store is keyed for the translation cache —
  // byCacheKey — and a card that was never generated has no cache key.
  const sharh = db.createObjectStore('sharhCards', { keyPath: 'id' });
  sharh.createIndex('byBook', 'bookId');

  // Imported narrator profiles. `byNaming` is multiEntry over every form a
  // man is cited under, so a short mention in a commentary reaches a
  // profile filed under a twelve-word nasab in one indexed read.
  const narrators = db.createObjectStore('narratorProfiles', { keyPath: 'id' });
  narrators.createIndex('byNaming', 'namings', { multiEntry: true });
  narrators.createIndex('byShard', 'shard');

  // Shared chapters this device published. No index: there are a few
  // dozen at most and Settings reads all of them at once.
  db.createObjectStore('shareRecords', { keyPath: 'id' });

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
}
