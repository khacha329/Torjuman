import type { DBSchema } from 'idb';
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

// The database's name, version and shape: what both upgrade branches in
// IdbStorageAdapter.init build, and what every typed transaction there checks
// against. Moved verbatim from IdbStorageAdapter.ts in restructure Phase 4
// step 4b (docs/refactor/plans/phase4-storage.md); the schema history stays
// with the version it explains.

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
