import type { DBSchema, IDBPDatabase, IndexNames, StoreNames } from 'idb';
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
// the schema history stays with the version it explains. Since step 4j the
// fresh-install branch creates every store from the `STORES` table below, and
// since step 4k the existing-database branch reads the same table.

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

interface IndexSpec<S extends StoreNames<Schema>> {
  name: IndexNames<Schema, S>;
  keyPath: string | string[];
  multiEntry?: true;
}

interface StoreSpec<S extends StoreNames<Schema>> {
  keyPath: string;
  indexes?: readonly IndexSpec<S>[];
  /** How a database opened at oldVersion >= 1 gets this store. */
  onUpgrade: 'assumed' | 'if-missing' | 'recreate';
  /** Created when the named store is missing, not when this one is (the QUL trio). */
  createdWith?: StoreNames<Schema>;
  /**
   * Rows filed under a book, cleared with it by `deleteBook`. Only a store
   * with a `byBook` index can carry it: that index is what the clearing walks.
   */
  perBook?: 'byBook' extends IndexNames<Schema, S> ? true : never;
}

/**
 * Every store, its key path and its indexes, in the order a fresh install
 * creates them and an upgrade walks them. Typed against `Schema`, so a store
 * the table misses, a store `Schema` does not know, or an index name `Schema`
 * does not list fails `tsc`.
 * Added in restructure Phase 4 step 4j (docs/refactor/plans/phase4-storage.md,
 * Design §2); the comments are the fresh-install branch's, moved verbatim.
 */
const TABLE = {
  books: { keyPath: 'id', onUpgrade: 'assumed' },
  tocNodes: {
    keyPath: 'id',
    indexes: [{ name: 'byBook', keyPath: 'bookId' }],
    onUpgrade: 'assumed',
    perBook: true,
  },
  pages: {
    keyPath: 'id',
    indexes: [
      { name: 'byBook', keyPath: 'bookId' },
      { name: 'byBookPage', keyPath: ['bookId', 'pageIndex'] },
    ],
    onUpgrade: 'assumed',
    perBook: true,
  },
  blocks: {
    keyPath: 'id',
    indexes: [
      { name: 'byBook', keyPath: 'bookId' },
      { name: 'byPage', keyPath: 'pageId' },
      { name: 'byBookOrder', keyPath: ['bookId', 'order'] },
    ],
    onUpgrade: 'assumed',
    perBook: true,
  },
  entities: {
    keyPath: 'id',
    indexes: [
      { name: 'byBook', keyPath: 'bookId' },
      { name: 'byStartBlock', keyPath: 'startBlockId' },
    ],
    onUpgrade: 'recreate',
    perBook: true,
  },
  dictionaryEntries: {
    keyPath: 'id',
    indexes: [
      { name: 'byBook', keyPath: 'bookId' },
      { name: 'byRoot', keyPath: 'root' },
    ],
    onUpgrade: 'if-missing',
    perBook: true,
  },
  // Indexed by startBlockId so the virtualized reader can look up the
  // marks for the blocks on screen without scanning thousands.
  marks: {
    keyPath: 'id',
    indexes: [
      { name: 'byBook', keyPath: 'bookId' },
      { name: 'byStartBlock', keyPath: 'startBlockId' },
    ],
    onUpgrade: 'if-missing',
    perBook: true,
  },
  cards: {
    keyPath: 'id',
    indexes: [
      { name: 'byBook', keyPath: 'bookId' },
      { name: 'byCacheKey', keyPath: 'cacheKey' },
    ],
    onUpgrade: 'assumed',
    perBook: true,
  },
  explanationCards: {
    keyPath: 'id',
    indexes: [{ name: 'byBook', keyPath: 'bookId' }],
    onUpgrade: 'if-missing',
    perBook: true,
  },
  // Retrieved commentary. Its own store rather than a kind inside
  // `cards`, because that store is keyed for the translation cache —
  // byCacheKey — and a card that was never generated has no cache key.
  sharhCards: {
    keyPath: 'id',
    indexes: [{ name: 'byBook', keyPath: 'bookId' }],
    onUpgrade: 'if-missing',
    perBook: true,
  },
  // Imported narrator profiles. `byNaming` is multiEntry over every form a
  // man is cited under, so a short mention in a commentary reaches a
  // profile filed under a twelve-word nasab in one indexed read.
  narratorProfiles: {
    keyPath: 'id',
    indexes: [
      { name: 'byNaming', keyPath: 'namings', multiEntry: true },
      { name: 'byShard', keyPath: 'shard' },
    ],
    onUpgrade: 'if-missing',
  },
  // Shared chapters this device published. No index: there are a few
  // dozen at most and Settings reads all of them at once.
  shareRecords: { keyPath: 'id', onUpgrade: 'if-missing' },
  wordGlosses: { keyPath: 'word', onUpgrade: 'if-missing' },
  // One store for all four QUL resource kinds. They share a shape — key
  // in, record out — so a single compound index serves every lookup and
  // deleting a resource is one range delete rather than four.
  qulResources: { keyPath: 'id', onUpgrade: 'if-missing' },
  qulEntries: {
    keyPath: 'id',
    indexes: [
      { name: 'byResource', keyPath: 'resourceId' },
      { name: 'byResourceKey', keyPath: ['resourceId', 'key'] },
    ],
    onUpgrade: 'if-missing',
    createdWith: 'qulResources',
  },
  qulCompilations: { keyPath: 'cacheKey', onUpgrade: 'if-missing', createdWith: 'qulResources' },
  // Derived from each book's contents, so indexed only by book: a lookup
  // reads every imported biographical work anyway, and there are three of
  // them at most.
  biographyEntries: {
    keyPath: 'id',
    indexes: [{ name: 'byBook', keyPath: 'bookId' }],
    onUpgrade: 'if-missing',
    // Its absence here was not harmless. Re-importing a biographical work left
    // the old index in place, and `ensureBiographyIndexes` only builds for a book
    // with NO entries — so the stale rows survived and kept pointing at page
    // indices from the previous import. That is what produced "the entry is on a
    // page that has not been fetched yet" for a book that was fully imported.
    perBook: true,
  },
  profiles: { keyPath: 'id', onUpgrade: 'assumed' },
  glossary: { keyPath: 'id', onUpgrade: 'assumed' },
  quranVerses: { keyPath: 'reference', onUpgrade: 'assumed' },
  hadiths: { keyPath: 'reference', onUpgrade: 'assumed' },
  crawlStates: { keyPath: 'bookId', onUpgrade: 'assumed' },
  positions: { keyPath: 'bookId', onUpgrade: 'assumed' },
  settings: { keyPath: 'key', onUpgrade: 'assumed' },
} satisfies { readonly [S in StoreNames<Schema>]: StoreSpec<S> };

/**
 * The same table, typed one spec per store for the code that walks it. Two
 * names because `BookStore` needs `TABLE`'s literal `perBook: true` entries,
 * and the walks need each entry seen as `StoreSpec<S>` of its own store.
 */
export const STORES: { readonly [S in StoreNames<Schema>]: StoreSpec<S> } = TABLE;

/**
 * Every store that files its rows under a book, and so must be cleared with it.
 *
 * Listed here rather than inline so that adding a per-book store is one line
 * away from being cleaned up too — `biographyEntries` was missed exactly
 * because the list was buried in the body of `deleteBook`.
 */
export const BOOK_STORES: readonly BookStore[] = (
  Object.keys(STORES) as StoreNames<Schema>[]
).filter(
  // The predicate is what `BookStore` says, read from the same entries.
  (name): name is BookStore => STORES[name].perBook === true,
);

export type BookStore = {
  [S in StoreNames<Schema>]: (typeof TABLE)[S] extends { perBook: true } ? S : never;
}[StoreNames<Schema>];

// `BookStore` was written out by hand until step 4l; this keeps it the same
// ten names, so `purgeIndex` still refuses any other store. It fails `tsc` if
// a flag is added or dropped without this line changing with it.
true satisfies SameUnion<
  BookStore,
  | 'tocNodes'
  | 'pages'
  | 'blocks'
  | 'entities'
  | 'dictionaryEntries'
  | 'marks'
  | 'cards'
  | 'explanationCards'
  | 'sharhCards'
  | 'biographyEntries'
>;

type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * Creates one store from its table entry: the key path, then each index in
 * listed order, with an options object only where `multiEntry` is set — the
 * same calls the hand-written fresh branch made. Generic over the store, and
 * reading the entry itself, so `tsc` ties each index name to that store.
 */
function createStore<S extends StoreNames<Schema>>(db: IDBPDatabase<Schema>, name: S): void {
  const spec: StoreSpec<S> = STORES[name];
  const store = db.createObjectStore(name, { keyPath: spec.keyPath });
  for (const index of spec.indexes ?? []) {
    if (index.multiEntry) {
      store.createIndex(index.name, index.keyPath, { multiEntry: true });
    } else {
      store.createIndex(index.name, index.keyPath);
    }
  }
}

/**
 * The `upgrade` callback `IdbStorageAdapter.init` passes to `openDB`: the
 * existing-database branch, then the fresh-install branch. Moved verbatim from
 * the callback's body in restructure Phase 4 step 4c; since step 4j the
 * fresh-install branch is a loop over `STORES`, and since step 4k the
 * existing-database branch is one too.
 */
export function upgradeDatabase(db: IDBPDatabase<Schema>, oldVersion: number): void {
  if (oldVersion >= 1) {
    // Upgrading an existing database: only touch what changed. Blocks,
    // cards, marks and the glossary are left exactly as they are.
    // Entities are derived, so that store is dropped and rebuilt by
    // detection rather than migrated.
    //
    // The names are read once, before anything is created, and every guard
    // asks that snapshot. Asking the live list would find `qulResources` just
    // created and skip `qulEntries` and `qulCompilations`, which are created
    // with it (their `createdWith`), exactly as the one hand-written guard over
    // all three did. Creation follows the table's order; it cannot be
    // observed, since store and index names are listed sorted and a failed
    // creation aborts the whole upgrade.
    const existing = new Set(db.objectStoreNames);
    for (const name of Object.keys(STORES) as StoreNames<Schema>[]) {
      const spec = STORES[name];
      if (spec.onUpgrade === 'recreate') {
        if (existing.has(name)) db.deleteObjectStore(name);
        createStore(db, name);
      } else if (spec.onUpgrade === 'if-missing' && !existing.has(spec.createdWith ?? name)) {
        createStore(db, name);
      }
    }
    return;
  }

  for (const name of Object.keys(STORES) as StoreNames<Schema>[]) {
    createStore(db, name);
  }
}
