// Check D's in-page harness: the real storage code, run against Chromium's
// IndexedDB by scripts/verify-storage.mjs.
//
// This file is built by that script with Vite's JS API in library mode (no
// app config, no PWA plugin, no service worker) into .verify/storage/ and
// loaded into a stub page on the `vite preview` origin, so the per-book
// import's verse detection can fetch quran/uthmani.json from dist/ exactly as
// the app does. It imports, by path and unchanged:
//
//   platform/storage/IdbStorageAdapter   the only IndexedDB code (Phase 4 splits it)
//   library/transfer                     the per-book file (exportBook, importBookFile)
//   library/deviceTransfer               the whole-tablet file (export, inspect, restore)
//   share/ShareStorageAdapter            the adapter over a shared bundle
//
// and exposes one function per scenario phase on `window.__dcheckHarness`.
// Every phase runs in a fresh browser context (an empty IndexedDB and
// localStorage); a scenario that needs two tablets runs one phase per tablet
// and passes the file between them through the Node side, as bytes.
//
// What a phase returns is the RESULTS half of the record: each call's return
// value or thrown message, in order, and row snapshots where a scenario needs
// one mid-way. The script takes the schema and the final rows itself, through
// raw IndexedDB helpers it injects into every page (`window.__dcheckPage`),
// so a dump never goes through the code it is checking.
//
// Synthetic data only: the repository is public. Book ids are shamela-99000x,
// the Arabic is a few invented words, and the one Qurʾānic verse is Sūrat
// al-Ikhlāṣ 112:1–2 copied from the committed public/quran/uthmani.json, so
// that verse detection has something to find.
//
// Not type-checked by `tsc -b` (scripts/ is outside both tsconfig projects),
// like verify-requests.ts; Vite strips the types. Rows are written loosely as
// `Row` and handed to the adapter `as never`: the adapter stores whatever it is
// given, and a row shaped exactly like the domain type would add nothing the
// check can see.

import { IdbStorageAdapter } from '../src/platform/storage/IdbStorageAdapter';
import { exportBook, importBookFile } from '../src/library/transfer';
import { exportDevice, inspectDeviceFile, restoreDevice } from '../src/library/deviceTransfer';
import { ShareStorageAdapter } from '../src/share/ShareStorageAdapter';
import { letterFold, normalize } from '../src/lib/arabic';

type Row = Record<string, unknown>;
type Rows = Record<string, Row[]>;

/** Injected by verify-storage.mjs into every page before any script runs. */
interface PageHelpers {
  put(rows: Rows): Promise<void>;
  rows(): Promise<Rows>;
  local(): [string, string][];
  setLocal(entries: [string, string][]): void;
}
const pageHelpers = (): PageHelpers =>
  (window as unknown as { __dcheckPage: PageHelpers }).__dcheckPage;

// ------------------------------------------------------------------ keys

/**
 * Fake API keys, under the localStorage names services/secrets.ts uses. The
 * script asserts these strings appear in no work backup, no per-book file and
 * no whole-tablet file written without keys — and do appear in the one
 * written with them. CLAUDE.md's Never, checked mechanically.
 */
export const FAKE_KEYS = {
  'shamela-reader.anthropic-api-key': 'sk-ant-d-check-not-a-real-key',
  'shamela-reader.gemini-api-key': 'AIza-d-check-not-a-real-key',
  'shamela-reader.sunnah-api-key': 'sunnah-d-check-not-a-real-key',
} as const;

/** The sending tablet's localStorage: the three keys, one app entry, one foreign. */
const SOURCE_LOCAL: [string, string][] = [
  ...Object.entries(FAKE_KEYS),
  ['shamela-reader.onboarded', '1'],
  ['other-app.note', 'not this app'],
];

/** The receiving tablet's own entries, before a restore. */
const TARGET_LOCAL: [string, string][] = [
  ['shamela-reader.anthropic-api-key', 'sk-ant-d-check-target-only-key'],
  ['shamela-reader.catalogOffered', '1'],
  ['other-app.note', 'the receiving tablet'],
];

// ------------------------------------------------------------------ data

const A = 'shamela-990001';
const B = 'shamela-990002';
const D = 'shamela-990003';
const T0 = 1_772_000_000_000;

const IKHLAS = 'قُلۡ هُوَ ٱللَّهُ أَحَدٌ ٱللَّهُ ٱلصَّمَدُ';

function book(id: string, shamelaId: number, title: string, extra: Row = {}): Row {
  return {
    id, shamelaId, title, author: 'مؤلف تجريبي', publisher: '', edition: '', volumeCount: 1,
    category: '', structureProfile: 'generic', importedAt: T0, importStatus: 'complete',
    totalPages: 2, fetchedPages: 2, volumeStarts: [1], hadithCollection: null, role: 'reading',
    ...extra,
  };
}

function block(bookId: string, page: number, order: number, text: string, extra: Row = {}): Row {
  return {
    id: `${bookId}:p${page}:${order}`, bookId, pageId: `${bookId}:p${page}`, order, type: 'body', text,
    normalized: normalize(text), contentHash: `hash-${order}`, hadithNumber: null, tocNodeId: null,
    spans: [], anchor: null, ...extra,
  };
}

function page(bookId: string, pageIndex: number, extra: Row = {}): Row {
  return {
    id: `${bookId}:p${pageIndex}`, bookId, pageIndex, volume: 1, printPage: pageIndex + 10,
    rawHtml: `<p>صفحة ${pageIndex}</p>`, fetchedAt: T0, ...extra,
  };
}

function toc(bookId: string, index: number, title: string, pageIndex: number): Row {
  return { id: `${bookId}:toc${index}`, bookId, parentId: null, title, pageIndex, order: index, depth: 0 };
}

function card(id: string, bookId: string, cacheKey: string, createdAt = T0): Row {
  return {
    id, bookId, kind: 'translation', startBlockId: `${bookId}:p1:0`, startOffset: 0,
    endBlockId: `${bookId}:p1:0`, endOffset: 5, createdAt, collapsed: false, sourceText: 'نص قصير',
    segments: [{ type: 'prose', arabic: '', english: 'A short synthetic text.', source: 'model' }],
    profileId: 'profile-d', promptVersion: 1, glossaryHash: 'g', providerId: 'gemini',
    model: 'synthetic-model', cacheKey, status: 'complete',
  };
}

function mark(id: string, bookId: string, startBlockId = `${bookId}:p1:0`): Row {
  return {
    id, bookId, startBlockId, startOffset: 0, endBlockId: startBlockId, endOffset: 4,
    kind: 'read', scope: 'span', note: null, createdAt: T0, collapsed: false,
  };
}

function entity(id: string, bookId: string, startBlockId = `${bookId}:p1:0`): Row {
  return {
    id, bookId, kind: 'quran', startBlockId, startOffset: 0, endBlockId: startBlockId, endOffset: 4,
    reference: '112:1', confidence: 1,
  };
}

function dictionaryEntry(id: string, bookId: string, root = 'كتب'): Row {
  return { id, bookId, root, rootDisplay: root, pageIndex: 1, volume: 1, printPage: 11 };
}

function narrator(id: string, shard: string, namings: string[]): Row {
  return { id, shard, fullName: namings[0], namings, grade: 'ثقة', source: 'synthetic' };
}

function explanation(id: string, bookId: string): Row {
  return {
    id, bookId, kind: 'explanation', startBlockId: `${bookId}:p1:0`, startOffset: 0,
    endBlockId: `${bookId}:p1:0`, endOffset: 4, createdAt: T0, collapsed: false, parentCardId: null,
    query: 'Why?', explanation: 'A synthetic explanation.', localSources: [], webSources: [],
    status: 'complete', providerId: 'anthropic', model: 'synthetic-model',
  };
}

function sharh(id: string, bookId: string): Row {
  return {
    id, bookId, kind: 'sharh', startBlockId: `${bookId}:p1:0`, startOffset: 0,
    endBlockId: `${bookId}:p1:0`, endOffset: 4, createdAt: T0, collapsed: false,
    sharhBookId: D, text: 'شرح تجريبي',
  };
}

function shareRecord(id: string, bookId: string, createdAt: number): Row {
  return {
    id, key: `share-key-${id}`, title: `مشاركة ${id}`, bookId, bookTitle: 'كتاب تجريبي',
    rangeLabel: 'الباب الأول', createdAt, bytes: 512, blocks: 2, cards: 1, marks: 1,
  };
}

const SETTINGS: Row = {
  providerId: 'gemini', activeProfileId: 'profile-d', fontFamily: 'Amiri', fontSize: 22,
  lineHeight: 1.9, panelWidth: 380, panelCollapsed: false, panelPosition: 'right',
  panelScope: 'visible', quranTranslationId: 20, quranTranslationName: 'Synthetic',
  hadithSourceId: 'sunnah', compileEnabled: false,
};

/**
 * One or two rows in each of the 24 stores — every store the whole-tablet
 * transfer moves, the backup reads, or an upgrade must keep. Keys are chosen
 * so key order differs from insertion order in the stores whose order a
 * method sorts.
 */
export function syntheticRows(): Rows {
  return {
    books: [book(A, 990001, 'كتاب المثال'), book(B, 990002, 'كتاب التراجم', { importedAt: T0 + 1 })],
    tocNodes: [toc(A, 0, 'الباب الأول', 1), toc(A, 1, 'الباب الثاني', 2), toc(B, 0, 'باب', 1)],
    pages: [page(A, 1), page(A, 2), page(B, 1)],
    blocks: [
      block(A, 1, 0, `قال تعالى: ﴿${IKHLAS}﴾ وهذا نص تجريبي.`),
      block(A, 1, 1, 'الطهارة شرط الصلاة في هذا المثال.'),
      block(A, 2, 2, 'باب آخر من النص التجريبي.'),
      block(B, 1, 0, 'ترجمة رجل من الرواة، نص تجريبي.'),
    ],
    entities: [entity('ent-a1', A)],
    dictionaryEntries: [dictionaryEntry('dict-b1', B)],
    marks: [mark('mark-a1', A)],
    cards: [card('card-a1', A, 'cache-a1'), card('card-b1', B, 'cache-b1')],
    explanationCards: [explanation('explain-a1', A)],
    sharhCards: [sharh('sharh-a1', A)],
    narratorProfiles: [
      narrator('itqan:1', 'itqan:shard-1', ['أحمد بن محمد', 'أحمد']),
      narrator(`taqrib:${A}:1`, `taqrib:${A}`, ['علي بن عبد الله', 'علي']),
    ],
    shareRecords: [shareRecord('share-a1', A, T0)],
    wordGlosses: [{
      word: 'الطهارة', display: 'الطَّهَارَة', root: 'طهر', meaning: 'purity', note: null,
      isTechnicalTerm: true, model: 'synthetic-model', createdAt: T0,
    }],
    qulResources: [{
      id: 'qul-d1', kind: 'tafsir', name: 'Synthetic tafsir', fileName: 'synthetic.json',
      byteSize: 100, entryCount: 2, format: 'json', importedAt: T0,
    }],
    qulEntries: [
      { id: 'qul-d1|112:1', resourceId: 'qul-d1', key: '112:1', value: { text: 'تفسير تجريبي' } },
      { id: 'qul-d1|112:2', resourceId: 'qul-d1', key: '112:2', value: { text: 'تفسير آخر' } },
    ],
    qulCompilations: [{
      cacheKey: 'compile-d1', ayahKey: '112:1', resourceIds: ['qul-d1'], providerId: 'gemini',
      model: 'synthetic-model', text: 'A synthetic compiled view.', createdAt: T0,
    }],
    biographyEntries: [{
      id: `${B}:bio1`, bookId: B, name: 'أحمد بن محمد', nameNormalized: 'احمد بن محمد', aliases: [],
      pageIndex: 1,
    }],
    profiles: [{
      id: 'profile-d', name: 'Synthetic profile', systemPrompt: 'Translate.', providerId: 'gemini',
      model: 'synthetic-model',
    }],
    glossary: [
      { id: 'gloss-2', arabic: 'النية', english: 'intention', note: null, addedAt: T0 + 2 },
      { id: 'gloss-1', arabic: 'الإخلاص', english: 'sincerity', note: 'synthetic', addedAt: T0 + 1 },
    ],
    quranVerses: [{
      reference: '112:1', arabic: 'قُلۡ هُوَ ٱللَّهُ أَحَدٌ', english: 'Say: He is God, One.',
      translationName: 'Synthetic', fetchedAt: T0,
    }],
    hadiths: [{
      reference: 'synthetic:1', collection: 'synthetic', number: '1', arabic: 'حديث تجريبي',
      english: 'A synthetic report.', grade: null, sourceUrl: null, fetchedAt: T0,
    }],
    crawlStates: [{ bookId: A, status: 'complete', nextPage: 3, failedPages: [], updatedAt: T0 }],
    positions: [
      { bookId: A, blockOrder: 1, updatedAt: T0 },
      { bookId: B, blockOrder: 0, updatedAt: T0 },
    ],
    settings: [{ ...SETTINGS, key: 'app' }],
  };
}

/** The synthetic rows of the named stores only, for an older database. */
function rowsFor(stores: string[]): Rows {
  const all = syntheticRows();
  return Object.fromEntries(stores.map((store) => [store, all[store] ?? []]));
}

// ------------------------------------------------------------------ recording

type Outcome =
  | { value: unknown }
  | { rejected: string }
  | { threw: string };

/**
 * The results of one phase, in call order.
 *
 * A call that throws synchronously is recorded as `threw`, one that returns a
 * rejected promise as `rejected`: Design §3 keeps each delegate's sync or
 * async form, and this is where that shows.
 */
class Recorder {
  readonly steps: [string, Outcome][] = [];
  readonly snapshots: Record<string, Rows> = {};
  readonly extra: Record<string, unknown> = {};

  async step(label: string, call: () => unknown): Promise<unknown> {
    let pending: unknown;
    try {
      pending = call();
    } catch (error) {
      this.steps.push([label, { threw: describe(error) }]);
      return undefined;
    }
    try {
      const value = await pending;
      this.steps.push([label, { value: toJson(value) }]);
      return value;
    } catch (error) {
      this.steps.push([label, { rejected: describe(error) }]);
      return undefined;
    }
  }

  async snapshot(label: string): Promise<void> {
    this.snapshots[label] = await pageHelpers().rows();
  }

  result(): unknown {
    return { steps: this.steps, snapshots: this.snapshots, ...this.extra };
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return `non-Error: ${String(error)}`;
}

/** What JSON keeps of a value, with `undefined` made visible. */
function toJson(value: unknown): unknown {
  if (value === undefined) return '(undefined)';
  return JSON.parse(JSON.stringify(value, (_key, inner) => (inner === undefined ? '(undefined)' : inner)));
}

async function opened(record: Recorder): Promise<IdbStorageAdapter> {
  const adapter = new IdbStorageAdapter();
  await record.step('init', () => adapter.init());
  return adapter;
}

// ------------------------------------------------------------------ files

/** The file's text, gunzipped when it starts with the gzip magic bytes. */
async function textOf(blob: Blob): Promise<string> {
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }
  return blob.text();
}

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fileFrom(base64: string, name: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name);
}

/** A file's type and text, which the record keeps, and its bytes, for the next tablet. */
async function fileRecord(blob: Blob): Promise<{ type: string; text: string; base64: string }> {
  return { type: blob.type, text: await textOf(blob), base64: await base64Of(blob) };
}

/**
 * A per-book file with one block line removed: the header still counts it.
 * Uncompressed, so the name does not end in .gz and the reader takes it as
 * plain text.
 */
function shortFile(text: string): File {
  const lines = text.split('\n');
  const lastBlock = lines.map((line) => line.startsWith('{"kind":"block"')).lastIndexOf(true);
  lines.splice(lastBlock, 1);
  return new File([lines.join('\n')], 'a.hashiya');
}

// ------------------------------------------------------------------ phases

type Phase = (input: Record<string, unknown>) => Promise<unknown>;

/** Writes the synthetic rows of the given stores straight into the database. */
async function seedRaw(stores: string[]): Promise<void> {
  await pageHelpers().put(rowsFor(stores));
}

const ALL_STORES = Object.keys(syntheticRows());

const phases: Record<string, Phase> = {
  // -------------------------------------------------- schema and upgrades

  /** `init` alone, on whatever database the script built first. */
  async open() {
    const record = new Recorder();
    const adapter = await opened(record);
    await record.step('schemaVersion', () => adapter.schemaVersion);
    return record.result();
  },

  /** The old database's stores filled with one row each, then `init`. */
  async 'seed-then-open'(input) {
    await seedRaw(input.stores as string[]);
    return phases.open(input);
  },

  // -------------------------------------------------- method families

  async 'before-init'() {
    const record = new Recorder();
    const s = new IdbStorageAdapter();
    const rows = syntheticRows();
    await record.step('schemaVersion', () => s.schemaVersion);
    await record.step('putBook', () => s.putBook(rows.books[0] as never));
    await record.step('putTocNodes', () => s.putTocNodes(rows.tocNodes as never));
    await record.step('putPage', () => s.putPage(rows.pages[0] as never));
    await record.step('putBlocks([])', () => s.putBlocks([]));
    await record.step('putBlocks', () => s.putBlocks(rows.blocks as never));
    await record.step('putEntities([])', () => s.putEntities([]));
    await record.step('putEntities', () => s.putEntities(rows.entities as never));
    await record.step('putDictionaryEntries([])', () => s.putDictionaryEntries([]));
    await record.step('putDictionaryEntries', () => s.putDictionaryEntries(rows.dictionaryEntries as never));
    await record.step('putMarks([])', () => s.putMarks([]));
    await record.step('putMarks', () => s.putMarks(rows.marks as never));
    await record.step('deleteMarks([])', () => s.deleteMarks([]));
    await record.step('putCard', () => s.putCard(rows.cards[0] as never));
    await record.step('putProfile', () => s.putProfile(rows.profiles[0] as never));
    await record.step('putGlossaryEntry', () => s.putGlossaryEntry(rows.glossary[0] as never));
    await record.step('putQuranVerse', () => s.putQuranVerse(rows.quranVerses[0] as never));
    await record.step('putQulResource', () => s.putQulResource(rows.qulResources[0] as never));
    await record.step('putBiographyEntries', () => s.putBiographyEntries(rows.biographyEntries as never));
    await record.step('putQulCompilation', () => s.putQulCompilation(rows.qulCompilations[0] as never));
    await record.step('putCrawlState', () => s.putCrawlState(rows.crawlStates[0] as never));
    await record.step('putReadingPosition', () => s.putReadingPosition(rows.positions[0] as never));
    await record.step('putSettings', () => s.putSettings(SETTINGS as never));
    await record.step('putExplanationCard', () => s.putExplanationCard(rows.explanationCards[0] as never));
    await record.step('putSharhCard', () => s.putSharhCard(rows.sharhCards[0] as never));
    await record.step('putNarratorProfiles([])', () => s.putNarratorProfiles([]));
    await record.step('putNarratorProfiles', () => s.putNarratorProfiles(rows.narratorProfiles as never));
    await record.step('putShareRecord', () => s.putShareRecord(rows.shareRecords[0] as never));
    await record.step('putWordGloss', () => s.putWordGloss(rows.wordGlosses[0] as never));
    await record.step('exportWork', () => s.exportWork());
    await record.step('importWork', () => s.importWork({ cards: [] } as never));
    await record.step('listStoreNames', () => s.listStoreNames());
    await record.step('countStoreRows', () => s.countStoreRows('books'));
    await record.step('readStoreRows', () => s.readStoreRows('books', undefined, 10));
    await record.step('putStoreRows([])', () => s.putStoreRows('books', []));
    await record.step('putStoreRows', () => s.putStoreRows('books', rows.books));
    await record.step('clearAllStores', () => s.clearAllStores());
    return record.result();
  },

  async 'family-books'() {
    const record = new Recorder();
    const s = await opened(record);
    const rows = syntheticRows();
    await record.step('putBook A', () => s.putBook(rows.books[0] as never));
    await record.step('putBook B', () => s.putBook(rows.books[1] as never));
    await record.step('getBook A', () => s.getBook(A));
    await record.step('getBook missing', () => s.getBook('shamela-999999'));
    await record.step('listBooks (newest import first)', () => s.listBooks());
    await record.step('putBook A again (replaces)', () => s.putBook({ ...rows.books[0], title: 'عنوان جديد' } as never));
    await record.step('listBooks', () => s.listBooks());
    return record.result();
  },

  async 'family-toc'() {
    const record = new Recorder();
    const s = await opened(record);
    await record.step('putTocNodes', () => s.putTocNodes([
      toc(A, 1, 'الثاني', 2), toc(A, 0, 'الأول', 1), toc(B, 0, 'باب', 1),
    ] as never));
    await record.step('listTocNodes A (by order)', () => s.listTocNodes(A));
    await record.step('listTocNodes missing', () => s.listTocNodes('shamela-999999'));
    return record.result();
  },

  async 'family-pages'() {
    const record = new Recorder();
    const s = await opened(record);
    for (const [bookId, index, volume, printPage] of [[A, 3, 2, 5], [A, 1, 1, 9], [A, 2, null, null], [B, 1, 1, 1]] as const) {
      await record.step(`putPage ${bookId} p${index}`, () => s.putPage(page(bookId, index, { volume, printPage }) as never));
    }
    await record.step('getPage A 2', () => s.getPage(A, 2));
    await record.step('getPage A 9 (missing)', () => s.getPage(A, 9));
    await record.step('listFetchedPageIndices A', () => s.listFetchedPageIndices(A));
    await record.step('listFetchedPageIndices missing', () => s.listFetchedPageIndices('shamela-999999'));
    await record.step('listPageMeta A', () => s.listPageMeta(A));
    await record.step('countPages A', () => s.countPages(A));
    await record.step('countPages B', () => s.countPages(B));
    return record.result();
  },

  async 'family-blocks'() {
    const record = new Recorder();
    const s = await opened(record);
    const query = normalize('الطهارة');
    await record.step('putBlocks([])', () => s.putBlocks([]));
    await record.step('putBlocks A', () => s.putBlocks([
      block(A, 2, 2, 'باب الطهارة الثاني.'),
      block(A, 1, 0, 'الطهارة شرط الصلاة.'),
      block(A, 1, 1, 'وقال: الطَّهارةُ، نصف الإيمان.'),
    ] as never));
    await record.step('putBlocks B', () => s.putBlocks([block(B, 1, 0, 'الطهارة في كتاب آخر.')] as never));
    await record.step('listBlocksForPage A p1', () => s.listBlocksForPage(`${A}:p1`));
    await record.step('listBlocks A', () => s.listBlocks(A));
    await record.step('getBlock', () => s.getBlock(`${A}:p1:1`));
    await record.step('getBlock missing', () => s.getBlock('nope'));
    await record.step('countBlocks A', () => s.countBlocks(A));
    await record.step('searchBlocks A ""', () => s.searchBlocks(A, '', 10));
    await record.step('searchBlocks A', () => s.searchBlocks(A, query, 10));
    await record.step('searchBlocks A limit 1', () => s.searchBlocks(A, query, 1));
    await record.step('searchBlocksLoose A ""', () => s.searchBlocksLoose(A, '', 10));
    await record.step('searchBlocksLoose A', () => s.searchBlocksLoose(A, letterFold(query), 10));
    // The in-memory index is now built for A; a later write must invalidate it.
    await record.step('putBlocks A (adds a hit)', () => s.putBlocks([block(A, 2, 3, 'تمام الطهارة.')] as never));
    await record.step('searchBlocks A after putBlocks', () => s.searchBlocks(A, query, 10));
    await record.step('deleteBlocksForPage A p2', () => s.deleteBlocksForPage(`${A}:p2`));
    await record.step('searchBlocks A after deleteBlocksForPage', () => s.searchBlocks(A, query, 10));
    await record.step('deleteBlocksForPage missing', () => s.deleteBlocksForPage('nope'));
    await record.step('countBlocks A', () => s.countBlocks(A));
    return record.result();
  },

  async 'family-entities-dictionary'() {
    const record = new Recorder();
    const s = await opened(record);
    // 501 rows: one past the 500-row batch both writers use.
    const many = (make: (i: number) => Row) => Array.from({ length: 501 }, (_, i) => make(i));
    await record.step('putEntities([])', () => s.putEntities([]));
    await record.step('putEntities A x501', () => s.putEntities(many((i) => entity(`ent-a${String(i).padStart(4, '0')}`, A)) as never));
    await record.step('putEntities B x2', () => s.putEntities([entity('ent-b1', B), entity('ent-b2', B)] as never));
    await record.step('listEntities A', () => s.listEntities(A));
    await record.step('clearEntities A', () => s.clearEntities(A));
    await record.step('listEntities A after clear', () => s.listEntities(A));
    await record.step('listEntities B', () => s.listEntities(B));
    await record.step('putDictionaryEntries([])', () => s.putDictionaryEntries([]));
    await record.step('putDictionaryEntries D x501', () => s.putDictionaryEntries(many((i) => dictionaryEntry(`dict-d${String(i).padStart(4, '0')}`, D)) as never));
    await record.step('putDictionaryEntries B', () => s.putDictionaryEntries([dictionaryEntry('dict-b1', B, 'علم')] as never));
    await record.step('listDictionaryEntries D', () => s.listDictionaryEntries(D));
    await record.step('clearDictionaryEntries D', () => s.clearDictionaryEntries(D));
    await record.step('listDictionaryEntries D after clear', () => s.listDictionaryEntries(D));
    await record.step('listDictionaryEntries B', () => s.listDictionaryEntries(B));
    return record.result();
  },

  async 'family-marks'() {
    const record = new Recorder();
    const s = await opened(record);
    await record.step('putMarks([])', () => s.putMarks([]));
    await record.step('putMarks', () => s.putMarks([mark('mark-2', A), mark('mark-1', A, `${A}:p1:1`), mark('mark-3', B)] as never));
    await record.step('listMarks A', () => s.listMarks(A));
    await record.step('deleteMarks([])', () => s.deleteMarks([]));
    await record.step('deleteMarks mark-1, missing', () => s.deleteMarks(['mark-1', 'nope']));
    await record.step('listMarks A', () => s.listMarks(A));
    return record.result();
  },

  async 'family-cards'() {
    const record = new Recorder();
    const s = await opened(record);
    await record.step('putCard a1', () => s.putCard(card('card-a1', A, 'cache-a1') as never));
    await record.step('putCard a2', () => s.putCard(card('card-a2', A, 'cache-a2') as never));
    await record.step('putCard b1', () => s.putCard(card('card-b1', B, 'cache-b1') as never));
    await record.step('listCards A', () => s.listCards(A));
    await record.step('getCardByCacheKey cache-a2', () => s.getCardByCacheKey('cache-a2'));
    await record.step('getCardByCacheKey missing', () => s.getCardByCacheKey('nope'));
    await record.step('deleteCard a1', () => s.deleteCard('card-a1'));
    await record.step('deleteCard missing', () => s.deleteCard('nope'));
    await record.step('listCards A', () => s.listCards(A));
    return record.result();
  },

  async 'family-profiles'() {
    const record = new Recorder();
    const s = await opened(record);
    const rows = syntheticRows();
    await record.step('putProfile', () => s.putProfile(rows.profiles[0] as never));
    await record.step('putProfile 2', () => s.putProfile({ ...rows.profiles[0], id: 'profile-c', name: 'Another' } as never));
    await record.step('listProfiles', () => s.listProfiles());
    await record.step('getProfile', () => s.getProfile('profile-c'));
    await record.step('getProfile missing', () => s.getProfile('nope'));
    await record.step('deleteProfile', () => s.deleteProfile('profile-d'));
    await record.step('listProfiles', () => s.listProfiles());
    return record.result();
  },

  async 'family-glossary'() {
    const record = new Recorder();
    const s = await opened(record);
    for (const [id, addedAt] of [['gloss-b', 300], ['gloss-a', 100], ['gloss-c', 200]] as const) {
      await record.step(`putGlossaryEntry ${id}`, () => s.putGlossaryEntry({ id, arabic: 'كلمة', english: id, note: null, addedAt } as never));
    }
    await record.step('listGlossary (by addedAt)', () => s.listGlossary());
    await record.step('deleteGlossaryEntry gloss-a', () => s.deleteGlossaryEntry('gloss-a'));
    await record.step('listGlossary', () => s.listGlossary());
    return record.result();
  },

  async 'family-retrieval-cache'() {
    const record = new Recorder();
    const s = await opened(record);
    const rows = syntheticRows();
    await record.step('putQuranVerse', () => s.putQuranVerse(rows.quranVerses[0] as never));
    await record.step('getQuranVerse', () => s.getQuranVerse('112:1'));
    await record.step('getQuranVerse missing', () => s.getQuranVerse('1:1'));
    await record.step('putHadith', () => s.putHadith(rows.hadiths[0] as never));
    await record.step('getHadith', () => s.getHadith('synthetic:1'));
    await record.step('getHadith missing', () => s.getHadith('nope'));
    return record.result();
  },

  async 'family-qul'() {
    const record = new Recorder();
    const s = await opened(record);
    const resource = syntheticRows().qulResources[0];
    await record.step('putQulResource zeta', () => s.putQulResource({ ...resource, id: 'qul-z', name: 'Zeta words' } as never));
    await record.step('putQulResource alpha', () => s.putQulResource({ ...resource, id: 'qul-a', name: 'alpha tafsir' } as never));
    await record.step('listQulResources (by name)', () => s.listQulResources());
    await record.step('putQulEntries', () => s.putQulEntries([
      { id: 'qul-a|1:2', resourceId: 'qul-a', key: '1:2', value: 'b' },
      { id: 'qul-a|1:1', resourceId: 'qul-a', key: '1:1', value: 'a' },
      { id: 'qul-z|1:1', resourceId: 'qul-z', key: '1:1', value: 'z' },
    ] as never));
    await record.step('getQulEntry', () => s.getQulEntry('qul-a', '1:1'));
    await record.step('getQulEntry missing', () => s.getQulEntry('qul-a', '9:9'));
    await record.step('getQulEntries (a missing key)', () => s.getQulEntries('qul-a', ['1:2', '9:9', '1:1']));
    await record.step('deleteQulResource alpha', () => s.deleteQulResource('qul-a'));
    await record.step('listQulResources', () => s.listQulResources());
    await record.step('getQulEntries after delete', () => s.getQulEntries('qul-a', ['1:1', '1:2']));
    await record.step('putQulCompilation', () => s.putQulCompilation(syntheticRows().qulCompilations[0] as never));
    await record.step('getQulCompilation', () => s.getQulCompilation('compile-d1'));
    await record.step('getQulCompilation missing', () => s.getQulCompilation('nope'));
    return record.result();
  },

  async 'family-biography'() {
    const record = new Recorder();
    const s = await opened(record);
    const entry = (id: string, bookId: string) => ({ id, bookId, name: 'اسم', nameNormalized: 'اسم', aliases: [], pageIndex: 1 });
    await record.step('putBiographyEntries', () => s.putBiographyEntries([entry('bio-a2', A), entry('bio-a1', A), entry('bio-b1', B)] as never));
    await record.step('listBiographyEntries (every book)', () => s.listBiographyEntries());
    await record.step('listBiographyEntries A', () => s.listBiographyEntries(A));
    await record.step('clearBiographyEntries A', () => s.clearBiographyEntries(A));
    await record.step('listBiographyEntries (every book)', () => s.listBiographyEntries());
    return record.result();
  },

  async 'family-crawl-position-settings'() {
    const record = new Recorder();
    const s = await opened(record);
    await record.step('putCrawlState', () => s.putCrawlState({ bookId: A, status: 'paused', nextPage: 7, failedPages: [3], updatedAt: T0 } as never));
    await record.step('getCrawlState', () => s.getCrawlState(A));
    await record.step('getCrawlState missing', () => s.getCrawlState(B));
    await record.step('putReadingPosition', () => s.putReadingPosition({ bookId: A, blockOrder: 12, updatedAt: T0 } as never));
    await record.step('getReadingPosition', () => s.getReadingPosition(A));
    await record.step('getReadingPosition missing', () => s.getReadingPosition(B));
    await record.step('getSettings (none yet)', () => s.getSettings());
    await record.step('putSettings', () => s.putSettings(SETTINGS as never));
    await record.step('getSettings (the key field stripped)', () => s.getSettings());
    return record.result();
  },

  async 'family-explanation-sharh'() {
    const record = new Recorder();
    const s = await opened(record);
    await record.step('putExplanationCard a1', () => s.putExplanationCard(explanation('explain-a1', A) as never));
    await record.step('putExplanationCard b1', () => s.putExplanationCard(explanation('explain-b1', B) as never));
    await record.step('listExplanationCards A', () => s.listExplanationCards(A));
    await record.step('deleteExplanationCard a1', () => s.deleteExplanationCard('explain-a1'));
    await record.step('listExplanationCards A', () => s.listExplanationCards(A));
    await record.step('putSharhCard a1', () => s.putSharhCard(sharh('sharh-a1', A) as never));
    await record.step('putSharhCard b1', () => s.putSharhCard(sharh('sharh-b1', B) as never));
    await record.step('listSharhCards A', () => s.listSharhCards(A));
    await record.step('deleteSharhCard a1', () => s.deleteSharhCard('sharh-a1'));
    await record.step('listSharhCards A', () => s.listSharhCards(A));
    return record.result();
  },

  async 'family-narrators'() {
    const record = new Recorder();
    const s = await opened(record);
    // 501 in one shard (one past the 500-row batch), two Taqrīb rows sharing a
    // naming with each other and one with the Itqan shard.
    const itqan = Array.from({ length: 501 }, (_, i) =>
      narrator(`itqan:${String(i).padStart(4, '0')}`, 'itqan:shard-1', [`راو ${i}`, i === 0 ? 'أبو بكر' : `كنية ${i}`]));
    await record.step('putNarratorProfiles([])', () => s.putNarratorProfiles([]));
    await record.step('putNarratorProfiles itqan x501', () => s.putNarratorProfiles(itqan as never));
    await record.step('putNarratorProfiles taqrib x2', () => s.putNarratorProfiles([
      narrator(`taqrib:${A}:2`, `taqrib:${A}`, ['عبد الله بن عمر', 'أبو بكر']),
      narrator(`taqrib:${A}:1`, `taqrib:${A}`, ['عبد الله بن مسعود', 'أبو بكر']),
    ] as never));
    await record.step('findNarratorProfiles (two letters)', () => s.findNarratorProfiles('أب'));
    await record.step('findNarratorProfiles (multiEntry, three hits)', () => s.findNarratorProfiles('أبو بكر'));
    await record.step('findNarratorProfiles (one hit)', () => s.findNarratorProfiles('راو 7'));
    await record.step('findNarratorProfiles (none)', () => s.findNarratorProfiles('لا أحد'));
    await record.step('listNarratorShards', () => s.listNarratorShards());
    await record.step('deleteNarratorShard taqrib', () => s.deleteNarratorShard(`taqrib:${A}`));
    await record.step('listNarratorShards', () => s.listNarratorShards());
    await record.step('findNarratorProfiles after delete', () => s.findNarratorProfiles('أبو بكر'));
    return record.result();
  },

  async 'family-share-records'() {
    const record = new Recorder();
    const s = await opened(record);
    for (const [id, at] of [['share-1', 1], ['share-3', 3], ['share-2', 2]] as const) {
      await record.step(`putShareRecord ${id}`, () => s.putShareRecord(shareRecord(id, A, T0 + at) as never));
    }
    await record.step('listShareRecords (newest first)', () => s.listShareRecords());
    await record.step('deleteShareRecord share-3', () => s.deleteShareRecord('share-3'));
    await record.step('listShareRecords', () => s.listShareRecords());
    return record.result();
  },

  async 'family-word-glosses'() {
    const record = new Recorder();
    const s = await opened(record);
    const gloss = syntheticRows().wordGlosses[0];
    await record.step('putWordGloss', () => s.putWordGloss(gloss as never));
    await record.step('putWordGloss 2', () => s.putWordGloss({ ...gloss, word: 'الصلاة', meaning: 'prayer' } as never));
    await record.step('getWordGloss', () => s.getWordGloss('الطهارة'));
    await record.step('getWordGloss missing', () => s.getWordGloss('نوم'));
    await record.step('listWordGlosses', () => s.listWordGlosses());
    return record.result();
  },

  /** The six raw calls the whole-tablet transfer makes, on their own. */
  async 'family-raw-store-io'() {
    const record = new Recorder();
    const s = await opened(record);
    await seedRaw(ALL_STORES);
    await record.step('listStoreNames', () => s.listStoreNames());
    await record.step('countStoreRows glossary', () => s.countStoreRows('glossary'));
    await record.step('countStoreRows (no such store)', () => s.countStoreRows('nope'));
    const first = (await record.step('readStoreRows blocks, first 3', () => s.readStoreRows('blocks', undefined, 3))) as { lastKey: unknown };
    await record.step('readStoreRows blocks, after', () => s.readStoreRows('blocks', first.lastKey, 3));
    await record.step('readStoreRows blocks, past the end', () => s.readStoreRows('blocks', `${B}:p1:0`, 3));
    await record.step('readStoreRows (no such store)', () => s.readStoreRows('nope', undefined, 3));
    // The search cache is built for A, and putStoreRows must clear it.
    await record.step('searchBlocks A', () => s.searchBlocks(A, normalize('الطهارة'), 10));
    await record.step('putStoreRows blocks', () => s.putStoreRows('blocks', [block(A, 2, 9, 'الطهارة مرة أخرى.')]));
    await record.step('searchBlocks A after putStoreRows', () => s.searchBlocks(A, normalize('الطهارة'), 10));
    await record.step('putStoreRows([])', () => s.putStoreRows('nope', []));
    await record.step('putStoreRows (no such store)', () => s.putStoreRows('nope', [{ id: 'x' }]));
    await record.snapshot('before clearAllStores');
    await record.step('clearAllStores', () => s.clearAllStores());
    await record.step('searchBlocks A after clearAllStores', () => s.searchBlocks(A, normalize('الطهارة'), 10));
    return record.result();
  },

  // -------------------------------------------------- per-book delete

  async 'delete-book'() {
    const record = new Recorder();
    const s = await opened(record);
    // With the seed's three blocks of A, 4,097: one more than PURGE_BATCH.
    const big = Array.from({ length: 4094 }, (_, i) =>
      block(A, 3 + Math.floor(i / 100), i + 3, i === 4093 ? 'الطهارة في آخر كتلة.' : `كتلة ${i}`));
    await seedRaw(ALL_STORES);
    // A row filed under A in every BOOK_STORES store, and the same for B.
    await pageHelpers().put({
      blocks: big,
      tocNodes: [toc(B, 1, 'باب آخر', 1)],
      entities: [entity('ent-b1', B)],
      dictionaryEntries: [dictionaryEntry('dict-a1', A)],
      marks: [mark('mark-b1', B)],
      explanationCards: [explanation('explain-b1', B)],
      sharhCards: [sharh('sharh-b1', B)],
      biographyEntries: [{ id: `${A}:bio1`, bookId: A, name: 'اسم', nameNormalized: 'اسم', aliases: [], pageIndex: 1 }],
      crawlStates: [{ bookId: B, status: 'paused', nextPage: 2, failedPages: [], updatedAt: T0 }],
    });
    await record.step('countBlocks A', () => s.countBlocks(A));
    await record.step('searchBlocks A (builds the search cache)', () => s.searchBlocks(A, normalize('الطهارة'), 3));
    await record.snapshot('before deleteBook');
    await record.step('deleteBook A', () => s.deleteBook(A));
    await record.step('getBook A', () => s.getBook(A));
    await record.step('countBlocks A', () => s.countBlocks(A));
    await record.step('searchBlocks A (cache dropped)', () => s.searchBlocks(A, normalize('الطهارة'), 3));
    await record.step('listNarratorShards', () => s.listNarratorShards());
    await record.step('listShareRecords (outlives its book)', () => s.listShareRecords());
    await record.step('deleteBook missing', () => s.deleteBook('shamela-999999'));
    return record.result();
  },

  // -------------------------------------------------- work backup

  async 'work-export'() {
    const record = new Recorder();
    pageHelpers().setLocal(SOURCE_LOCAL);
    const s = await opened(record);
    await seedRaw(ALL_STORES);
    const bundle = await record.step('exportWork', () => s.exportWork());
    // The bytes SettingsScreen saves: JSON.stringify(bundle), nothing else.
    record.extra.file = JSON.stringify(bundle);
    return record.result();
  },

  async 'work-import'(input) {
    const record = new Recorder();
    pageHelpers().setLocal(TARGET_LOCAL);
    const s = await opened(record);
    if (input.withBook) await pageHelpers().put({ books: [syntheticRows().books[1]] });
    const bundle = JSON.parse(input.file as string) as Record<string, unknown>;
    if (input.dropShareRecords) delete bundle.shareRecords;
    if (input.extraReferencedBook) {
      (bundle.referencedBooks as unknown[]).push({ shamelaId: 990999, bookId: 'shamela-990999', title: 'كتاب غائب' });
    }
    await record.step('importWork', () => s.importWork(bundle as never));
    await record.step('getSettings', () => s.getSettings());
    return record.result();
  },

  // -------------------------------------------------- per-book transfer

  async 'book-export'() {
    const record = new Recorder();
    pageHelpers().setLocal(SOURCE_LOCAL);
    const s = await opened(record);
    await seedRaw(ALL_STORES);
    // A dictionary book, so the import's other rebuild (the root index) runs.
    await pageHelpers().put({
      books: [book(D, 990003, 'معجم تجريبي', { role: 'dictionary', totalPages: 2 })],
      tocNodes: [toc(D, 0, '(كتب)', 1), toc(D, 1, '(علم)', 2), toc(D, 2, 'مقدمة', 1)],
      pages: [page(D, 1), page(D, 2)],
      blocks: [block(D, 1, 0, 'الكتاب معروف.'), block(D, 2, 1, 'العلم نقيض الجهل.')],
    });
    const files: Record<string, unknown> = {};
    for (const id of [A, D]) {
      const stored = (await s.getBook(id))!;
      // The step records the Blob's type only: its gzip bytes are the
      // browser's, not this code's, so the record keeps the text instead.
      let out: Blob | undefined;
      await record.step(`exportBook ${id}`, async () => {
        out = await exportBook(s, stored);
        return { type: out.type };
      });
      if (out) files[id] = await fileRecord(out);
    }
    record.extra.files = files;
    return record.result();
  },

  async 'book-import'(input) {
    const record = new Recorder();
    const s = await opened(record);
    const files = input.files as Record<string, { base64: string; text: string }>;
    const asked: string[] = [];
    const run = (label: string, file: File, answer?: boolean) =>
      record.step(label, () => importBookFile(s, file, {
        onConflict: answer === undefined ? undefined : async (existing) => {
          asked.push(`${label}: asked about ${existing.id}`);
          return answer;
        },
      }));
    if (input.mode === 'fresh') {
      await run('importBookFile A', fileFrom(files[A].base64, `990001 - x.hashiya.gz`));
      await run('importBookFile D (dictionary)', fileFrom(files[D].base64, `990003 - x.hashiya.gz`));
      await record.step('listEntities A (rebuilt)', () => s.listEntities(A));
      await record.step('listDictionaryEntries D (rebuilt)', () => s.listDictionaryEntries(D));
    }
    if (input.mode === 'conflict') {
      await run('importBookFile A', fileFrom(files[A].base64, `a.hashiya.gz`));
      // The user's work on A. LibraryTransfer.tsx's confirm says "Its
      // translation cards and marks are kept"; the record shows what a
      // replace does to each (FOUND_ISSUES 24).
      await pageHelpers().put({
        marks: [mark('mark-kept', A)],
        cards: [card('card-kept', A, 'cache-kept')],
        explanationCards: [explanation('explain-kept', A)],
        sharhCards: [sharh('sharh-kept', A)],
        positions: [{ bookId: A, blockOrder: 2, updatedAt: T0 }],
      });
      await record.snapshot('with the book');
      await run('importBookFile A, onConflict false', fileFrom(files[A].base64, `a.hashiya.gz`), false);
      await record.snapshot('after onConflict false');
      await run('importBookFile A, no onConflict', fileFrom(files[A].base64, `a.hashiya.gz`));
      await run('importBookFile A, onConflict true', fileFrom(files[A].base64, `a.hashiya.gz`), true);
      await record.snapshot('after onConflict true');
      // A replacement that fails part way: the old copy was deleted before
      // the new one was read, and the rollback deletes the new one too.
      await run('importBookFile A one block short, onConflict true', shortFile(files[A].text), true);
      await record.step('getBook A', () => s.getBook(A));
    }
    if (input.mode === 'short') {
      await run('importBookFile A, one block short', shortFile(files[A].text));
      await record.step('getBook A', () => s.getBook(A));
    }
    record.extra.asked = asked;
    return record.result();
  },

  // -------------------------------------------------- whole-tablet transfer

  async 'device-export'() {
    const record = new Recorder();
    pageHelpers().setLocal(SOURCE_LOCAL);
    const s = await opened(record);
    await seedRaw(ALL_STORES);
    const progress: string[] = [];
    const files: Record<string, unknown> = {};
    for (const includeApiKeys of [false, true]) {
      const label = includeApiKeys ? 'with-keys' : 'without-keys';
      let out: File | undefined;
      await record.step(`exportDevice ${label}`, async () => {
        out = (await exportDevice(s, {
          includeApiKeys,
          onProgress: (p) => progress.push(`${label} ${p.phase} ${p.done}/${p.total} ${p.message}`),
        })) as File;
        return { name: out.name, type: out.type };
      });
      if (out) files[label] = await fileRecord(out);
    }
    record.extra.files = files;
    record.extra.progress = progress;
    return record.result();
  },

  async 'device-restore'(input) {
    const record = new Recorder();
    pageHelpers().setLocal(TARGET_LOCAL);
    const s = await opened(record);
    // The receiving tablet already holds other rows, which a restore replaces.
    await pageHelpers().put({
      books: [book('shamela-990009', 990009, 'كتاب على الجهاز الآخر')],
      cards: [card('card-target', 'shamela-990009', 'cache-target')],
      glossary: [{ id: 'gloss-target', arabic: 'كلمة', english: 'word', note: null, addedAt: T0 }],
    });
    const file = fileFrom(input.base64 as string, 'hashiya-tablet.hashiya-device.gz');
    const progress: string[] = [];
    await record.step('inspectDeviceFile', () => inspectDeviceFile(file, s, (p) => progress.push(`${p.phase} ${p.done}/${p.total} ${p.message}`)));
    await record.step('restoreDevice', () => restoreDevice(file, s, { onProgress: (p) => progress.push(`${p.phase} ${p.done}/${p.total} ${p.message}`) }));
    await record.step('searchBlocks A after restore', () => s.searchBlocks(A, normalize('الطهارة'), 10));
    record.extra.progress = progress;
    return record.result();
  },

  async 'device-refusals'(input) {
    const record = new Recorder();
    pageHelpers().setLocal(TARGET_LOCAL);
    const s = await opened(record);
    await pageHelpers().put({
      books: [book('shamela-990009', 990009, 'كتاب على الجهاز الآخر')],
      glossary: [{ id: 'gloss-target', arabic: 'كلمة', english: 'word', note: null, addedAt: T0 }],
    });
    const before = { rows: await pageHelpers().rows(), local: pageHelpers().local() };
    const lines = (input.text as string).split('\n');
    const header = JSON.parse(lines[0]) as Record<string, unknown>;
    const withHeader = (changed: Record<string, unknown>) => [JSON.stringify({ ...header, ...changed }), ...lines.slice(1)].join('\n');
    const variants: [string, string][] = [
      ['schemaVersion 10', withHeader({ schemaVersion: 10 })],
      ['an unknown store', withHeader({ counts: { ...(header.counts as object), bogusStore: 0 } })],
      // The last rows line, the local line and the end marker gone (the text
      // ends in a newline, so the last element is empty).
      ['cut short', lines.slice(0, -4).join('\n') + '\n'],
      ['a line after the end marker', `${input.text as string}${JSON.stringify({ kind: 'local', items: {} })}\n`],
      ['a work backup instead', '{"version":11}\n'],
    ];
    const untouched: Record<string, boolean> = {};
    for (const [label, text] of variants) {
      const file = new File([text], 'x.hashiya-device');
      await record.step(`inspectDeviceFile, ${label}`, () => inspectDeviceFile(file, s));
      untouched[`after inspect, ${label}`] = await same(before);
    }
    // Pass 2 has its own header check, before it clears anything.
    const old = new File([variants[0][1]], 'x.hashiya-device');
    await record.step('restoreDevice, schemaVersion 10', () => restoreDevice(old, s));
    untouched['after restoreDevice, schemaVersion 10'] = await same(before);
    record.extra.untouched = untouched;
    return record.result();
  },

  // -------------------------------------------------- share adapter

  async share() {
    const record = new Recorder();
    const own = await opened(record);
    await seedRaw(ALL_STORES);
    const rows = syntheticRows();
    const bundle = {
      version: 1, id: 'bundle-d', title: 'مشاركة تجريبية', createdAt: T0,
      sourceBook: { bookId: 'shamela-990005', shamelaId: 990005, title: 'كتاب مشارك', author: 'مؤلف', publisher: '' },
      blocks: [block('shamela-990005', 1, 0, 'نص مشارك تجريبي.')],
      pageMeta: [{ pageIndex: 1, volume: 1, printPage: 1 }],
      tocNodes: [], cards: [], explanations: [], sharh: [], marks: [], entities: [],
      resolved: { narrators: [], hadiths: [] },
    };
    const s = new ShareStorageAdapter(bundle as never, own);
    await record.snapshot('before');
    const r = (name: keyof typeof rows, i = 0) => rows[name][i] as never;
    const ignored: [string, () => unknown][] = [
      ['putBook', () => s.putBook(r('books'))], ['deleteBook', () => s.deleteBook(A)],
      ['putTocNodes', () => s.putTocNodes(rows.tocNodes as never)], ['putPage', () => s.putPage(r('pages'))],
      ['putBlocks', () => s.putBlocks(rows.blocks as never)], ['deleteBlocksForPage', () => s.deleteBlocksForPage(`${A}:p1`)],
      ['putEntities', () => s.putEntities(rows.entities as never)], ['clearEntities', () => s.clearEntities(A)],
      ['putMarks', () => s.putMarks([mark('mark-share', A)] as never)], ['deleteMarks', () => s.deleteMarks(['mark-a1'])],
      ['putCard', () => s.putCard(card('card-share', A, 'cache-share') as never)], ['deleteCard', () => s.deleteCard('card-a1')],
      ['putExplanationCard', () => s.putExplanationCard(explanation('explain-share', A) as never)],
      ['deleteExplanationCard', () => s.deleteExplanationCard('explain-a1')],
      ['putSharhCard', () => s.putSharhCard(sharh('sharh-share', A) as never)], ['deleteSharhCard', () => s.deleteSharhCard('sharh-a1')],
      ['putNarratorProfiles', () => s.putNarratorProfiles([narrator('share:1', 'share', ['اسم'])] as never)],
      ['deleteNarratorShard', () => s.deleteNarratorShard('itqan:shard-1')],
      ['putHadith', () => s.putHadith({ ...r('hadiths') as object, reference: 'share:1' } as never)],
      ['putQulResource', () => s.putQulResource({ ...r('qulResources') as object, id: 'qul-share' } as never)],
      ['deleteQulResource', () => s.deleteQulResource('qul-d1')],
      ['putQulEntries', () => s.putQulEntries([{ id: 'qul-d1|1:1', resourceId: 'qul-d1', key: '1:1', value: 'x' }] as never)],
      ['putBiographyEntries', () => s.putBiographyEntries([{ id: 'bio-share', bookId: A }] as never)],
      ['clearBiographyEntries', () => s.clearBiographyEntries(B)],
      ['putDictionaryEntries', () => s.putDictionaryEntries([dictionaryEntry('dict-share', A)] as never)],
      ['clearDictionaryEntries', () => s.clearDictionaryEntries(B)],
      ['putProfile', () => s.putProfile({ ...r('profiles') as object, id: 'profile-share' } as never)],
      ['deleteProfile', () => s.deleteProfile('profile-d')],
      ['putGlossaryEntry', () => s.putGlossaryEntry({ id: 'gloss-share', arabic: 'ك', english: 'x', note: null, addedAt: 1 } as never)],
      ['deleteGlossaryEntry', () => s.deleteGlossaryEntry('gloss-1')],
      ['putShareRecord', () => s.putShareRecord(shareRecord('share-share', A, 1) as never)],
      ['deleteShareRecord', () => s.deleteShareRecord('share-a1')],
      ['putWordGloss', () => s.putWordGloss({ ...r('wordGlosses') as object, word: 'مشاركة' } as never)],
      ['putReadingPosition', () => s.putReadingPosition({ bookId: 'shamela-990005', blockOrder: 0, updatedAt: 1 } as never)],
      ['putCrawlState', () => s.putCrawlState({ bookId: 'shamela-990005', status: 'idle', nextPage: 1, failedPages: [], updatedAt: 1 } as never)],
    ];
    for (const [label, call] of ignored) await record.step(`ignored: ${label}`, call);
    record.extra.ignoredLeftDatabaseUnchanged = await same({ rows: record.snapshots.before, local: pageHelpers().local() });
    await record.step('through: putSettings', () => s.putSettings({ ...SETTINGS, fontSize: 30 } as never));
    await record.step('through: putQuranVerse', () => s.putQuranVerse({ ...r('quranVerses') as object, reference: '112:2' } as never));
    await record.step('through: putQulCompilation', () => s.putQulCompilation({ ...r('qulCompilations') as object, cacheKey: 'compile-share' } as never));
    await record.step('schemaVersion (delegated)', () => s.schemaVersion);
    await record.step('exportWork', () => s.exportWork());
    await record.step('importWork', () => s.importWork());
    await record.step('listStoreNames', () => s.listStoreNames());
    await record.step('countStoreRows', () => s.countStoreRows());
    await record.step('readStoreRows', () => s.readStoreRows());
    await record.step('putStoreRows', () => s.putStoreRows());
    await record.step('clearAllStores', () => s.clearAllStores());
    return record.result();
  },
};

/** Whether the database and localStorage are exactly as they were. */
async function same(before: { rows: Rows; local: [string, string][] }): Promise<boolean> {
  const now = { rows: await pageHelpers().rows(), local: pageHelpers().local() };
  return JSON.stringify(now) === JSON.stringify(before);
}

(window as unknown as { __dcheckHarness: unknown }).__dcheckHarness = {
  fakeKeys: FAKE_KEYS,
  run: (name: string, input: Record<string, unknown> = {}) => {
    const phase = phases[name];
    if (!phase) throw new Error(`no harness phase "${name}"`);
    return phase(input);
  },
};
