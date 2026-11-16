// Check D: the IndexedDB schema and the rows every storage path leaves behind.
//
//   npm run verify:storage                   (vite build, then this: compare to the record)
//   node scripts/verify-storage.mjs          (this alone, on the dist/ already built)
//   node scripts/verify-storage.mjs --write  (rewrite the record; Phase 4 step 4a only)
//
// Why it exists. Phase 4 of the restructure (docs/refactor/plans/
// phase4-storage.md, Design §1) splits platform/storage/IdbStorageAdapter.ts
// by store group and drives both of `init`'s upgrade branches from one table.
// That file holds the owner's library, cards, marks and settings, on a tablet,
// with no other copy; an upgrade branch that drifts from the fresh one runs
// once per tablet and is not seen until it has run. Nothing checked the
// adapter against IndexedDB before this: `npm run verify` covers the transfer
// logic over an in-memory fake, and U only notices the database version. So
// this records, on the old code, what the storage code does to a real
// IndexedDB — the schema after a fresh install and after each upgrade it can
// reproduce, the rows after every method family and every backup and transfer
// path — and every later step must leave the record byte for byte the same.
//
// How. Playwright drives the container's Chromium (the one S, R and U use; no
// fake-indexeddb, owner's Q1). Two halves on one `vite preview` origin, every
// scenario phase in a fresh browser context (an empty IndexedDB and
// localStorage), en-US, UTC, service workers blocked, Date pinned with
// page.clock, Math.random replaced by a seeded generator before any script
// runs, and every request off the origin aborted:
//
//   1. The shipped bundle (dist/, built by `npm run verify:storage` first). A
//      stub page served by page.route at /__dcheck/ builds the old database
//      with raw IndexedDB if the scenario has one, then the page goes to the
//      app, which opens it with the real minified `init`; the script polls
//      (from Node) until the database reports version 11 and the first boot
//      has seeded the bundled matching-ayah resource, then dumps the schema.
//      Rows are not recorded here: the app seeds profiles, settings and QUL
//      rows itself. Its uncaught page errors and console errors are, sorted
//      (two boot lookups race, so their order is not the app's to keep).
//   2. The harness, scripts/verify-storage-harness.ts, built here with Vite's
//      JS API in library mode (no app config, no PWA plugin) into
//      .verify/storage/ and served from /__dcheck/ on the same origin, so the
//      per-book import's verse detection fetches quran/uthmani.json from
//      dist/. It imports the real IdbStorageAdapter, library/transfer,
//      library/deviceTransfer and share/ShareStorageAdapter, and returns each
//      call's value or error; this script then dumps the schema and every
//      store's rows with raw IndexedDB helpers it injects into the page, so no
//      dump goes through the code being checked.
//
// Recorded, in docs/refactor/phase4/storage.json:
//   - schema: db.version; each store (sorted): name, keyPath, autoIncrement,
//     each index (sorted): name, keyPath, unique, multiEntry. In full for
//     bundle/fresh and harness/fresh; in every other scenario and phase in
//     full too, or as `"stores": "as today"` when it is exactly the schema
//     raw IndexedDB reports for TODAY below (built once per run in a page of
//     its own), so a change to one branch shows only in the scenarios that
//     run it. The comparison is of the whole schema either way;
//   - rows: every store (sorted), every row in key order; a store or a
//     returned list of more than 50 is its count, first and last row and the
//     SHA-256 of the JSON of all of them;
//   - results: each call in order, its JSON value, or `rejected` with the
//     error's name and message, or `threw` when it threw synchronously;
//   - files: the work backup's SHA-256 and length (its content is the
//     exportWork value beside it); the per-book and whole-tablet files
//     DECOMPRESSED — line by line, with SHA-256 and length — since the gzip
//     bytes are the browser's, not this code's.
//
// Asserted on every run, --write included (a failure is never recorded):
//   - the three fake API keys (harness FAKE_KEYS) are in no work backup, no
//     per-book file and no whole-tablet file written without keys, and all
//     three are in the one written with them;
//   - after a whole-tablet restore every row equals the sending tablet's;
//   - every refused whole-tablet file left rows and localStorage untouched;
//   - the share adapter's ignored writes left the visitor's database untouched.
//
// Masked: nothing. Date.now and Math.random are pinned in the page, so the
// ids `newId` makes on arrival (entities, the dictionary root index) are the
// same on every run. If that ever stops being enough, the only masks Design §1
// allows are newId ids and timestamps, each named here — never a count, a key
// or a schema field.
//
// Old databases, built with raw IndexedDB from OLD_DATABASES below:
//   - v7, v8, v10 are the fresh branch of IdbStorageAdapter.ts at 810b059,
//     1ed3b24 and 4413ad0 (`git show <hash>:src/platform/storage/
//     IdbStorageAdapter.ts`): each is today's schema minus the stores added
//     after it, and every store they share has today's keyPath and indexes;
//   - v9 is v8 plus sharhCards (the history comment; 9 and 10 landed in one
//     commit, so no v9 build ever existed);
//   - v1base is not a historical schema: the twelve stores the existing-DB
//     branch never creates, with today's indexes, at version 1 — the one
//     database that exercises every guard;
//   - two databases the app cannot produce (FOUND_ISSUES 21): v10 without
//     qulResources (today `init` rejects and the database stays at 10 with
//     every row) and v10 without qulEntries (today it opens, and never gets
//     qulEntries). The first rejects `init` with Chromium's AbortError
//     ("Version change transaction was aborted in upgradeneeded event
//     handler"); the ConstraintError itself ("An object store with the
//     specified name already exists") reaches the page as an uncaught
//     exception in the upgrade handler, which the record keeps as
//     `uncaughtInPage`.
//
// What D sees only as an outcome, and leaves to the reviewer: the ORDER of
// writes and where transactions begin and end. A moved body that split one
// transaction in two, or swapped two awaited writes, leaves the same rows
// when nothing fails in between — which nothing here makes happen. The
// plan's word-diff of each moved body (Design §3) is the check for that.
//
// What D does not see: the relay and the Worker (library/relayTransfer.ts
// moves the same file's bytes and is not storage); the share-target handoff
// (public/share-target.js); `roomFor`'s quota estimate; the tablet's own
// Chrome (M); databases from v1–v6, which predate the repository
// (FOUND_ISSUES 20); IndexedDB failures mid-write (quota, an aborted
// transaction, a closed tab).
//
// Like U it needs Chromium through Playwright. It takes about 20 s with the
// build (the check itself about 11 s), and is kept out of `npm run verify` and
// the deploy workflow (owner's Q9).

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = join(ROOT, 'docs/refactor/phase4/storage.json');
const OUT_DIR = join(ROOT, '.verify/storage');
const HARNESS_DIR = join(OUT_DIR, 'harness');
const CURRENT = join(OUT_DIR, 'current.json');
const WRITE = process.argv.includes('--write');

/** Any fixed instant; the harness's own rows carry their own timestamps. */
const FIXED_NOW = Date.UTC(2026, 2, 1, 9, 30, 0);
const DB_NAME = 'shamela-reader';
const BOOT_LIMIT_MS = 30_000;
/** A list longer than this is recorded as count, ends and SHA-256. */
const FULL_LIMIT = 50;

// ------------------------------------------------------------------ schemas

/**
 * Today's stores, in the fresh branch's order (IdbStorageAdapter.ts:259-334):
 * [name, keyPath, [[index, keyPath, options?], …]].
 */
const TODAY = [
  ['books', 'id'],
  ['tocNodes', 'id', [['byBook', 'bookId']]],
  ['pages', 'id', [['byBook', 'bookId'], ['byBookPage', ['bookId', 'pageIndex']]]],
  ['blocks', 'id', [['byBook', 'bookId'], ['byPage', 'pageId'], ['byBookOrder', ['bookId', 'order']]]],
  ['entities', 'id', [['byBook', 'bookId'], ['byStartBlock', 'startBlockId']]],
  ['dictionaryEntries', 'id', [['byBook', 'bookId'], ['byRoot', 'root']]],
  ['marks', 'id', [['byBook', 'bookId'], ['byStartBlock', 'startBlockId']]],
  ['cards', 'id', [['byBook', 'bookId'], ['byCacheKey', 'cacheKey']]],
  ['explanationCards', 'id', [['byBook', 'bookId']]],
  ['sharhCards', 'id', [['byBook', 'bookId']]],
  ['narratorProfiles', 'id', [['byNaming', 'namings', { multiEntry: true }], ['byShard', 'shard']]],
  ['shareRecords', 'id'],
  ['wordGlosses', 'word'],
  ['qulResources', 'id'],
  ['qulEntries', 'id', [['byResource', 'resourceId'], ['byResourceKey', ['resourceId', 'key']]]],
  ['qulCompilations', 'cacheKey'],
  ['biographyEntries', 'id', [['byBook', 'bookId']]],
  ['profiles', 'id'],
  ['glossary', 'id'],
  ['quranVerses', 'reference'],
  ['hadiths', 'reference'],
  ['crawlStates', 'bookId'],
  ['positions', 'bookId'],
  ['settings', 'key'],
];

/** The stores the existing-DB branch never creates (assumed since v1). */
const BASE_TWELVE = [
  'books', 'tocNodes', 'pages', 'blocks', 'cards', 'profiles',
  'glossary', 'quranVerses', 'hadiths', 'crawlStates', 'positions', 'settings',
];

const without = (...names) => TODAY.filter(([name]) => !names.includes(name));

const OLD_DATABASES = {
  v1base: { version: 1, stores: TODAY.filter(([name]) => BASE_TWELVE.includes(name)) },
  v7: { version: 7, stores: without('biographyEntries', 'sharhCards', 'narratorProfiles', 'shareRecords') },
  v8: { version: 8, stores: without('sharhCards', 'narratorProfiles', 'shareRecords') },
  v9: { version: 9, stores: without('narratorProfiles', 'shareRecords') },
  v10: { version: 10, stores: without('shareRecords') },
  v11: { version: 11, stores: TODAY },
  'v10-without-qulResources': { version: 10, stores: without('shareRecords', 'qulResources') },
  'v10-without-qulEntries': { version: 10, stores: without('shareRecords', 'qulEntries') },
};

// ------------------------------------------------------------------ in-page helpers

/**
 * Raw IndexedDB, injected into every page before its own scripts: the old
 * databases are built with it and every dump is taken with it, so neither
 * goes through the storage code being checked.
 */
function installPageHelpers(dbName) {
  // A seeded generator in place of Math.random, so `newId`'s suffix is the
  // same on every run (mulberry32).
  let seed = 0x5eed_d0d0;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const request = (req) => new Promise((ok, fail) => {
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
  const exists = async () => (await indexedDB.databases()).some((db) => db.name === dbName);
  const open = (version, upgrade) => new Promise((ok, fail) => {
    const req = version === undefined ? indexedDB.open(dbName) : indexedDB.open(dbName, version);
    req.onupgradeneeded = () => upgrade?.(req.result);
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
    req.onblocked = () => fail(new Error('open blocked'));
  });
  const done = (tx) => new Promise((ok, fail) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => fail(tx.error);
    tx.onabort = () => fail(tx.error ?? new Error('aborted'));
  });

  window.__dcheckPage = {
    async build(version, stores) {
      const db = await open(version, (upgrading) => {
        for (const [name, keyPath, indexes = []] of stores) {
          const store = upgrading.createObjectStore(name, { keyPath });
          for (const [index, path, options] of indexes) store.createIndex(index, path, options);
        }
      });
      db.close();
    },
    async put(rows) {
      const db = await open();
      try {
        for (const [store, list] of Object.entries(rows)) {
          if (list.length === 0) continue;
          const tx = db.transaction(store, 'readwrite');
          for (const row of list) tx.objectStore(store).put(row);
          await done(tx);
        }
      } finally {
        db.close();
      }
    },
    async rows() {
      if (!(await exists())) return { '(no database)': [] };
      const db = await open();
      try {
        const out = {};
        for (const name of Array.from(db.objectStoreNames)) {
          out[name] = await request(db.transaction(name, 'readonly').objectStore(name).getAll());
        }
        return out;
      } finally {
        db.close();
      }
    },
    async schema() {
      if (!(await exists())) return { version: null, stores: [] };
      const db = await open();
      try {
        const names = Array.from(db.objectStoreNames);
        const tx = names.length > 0 ? db.transaction(names, 'readonly') : null;
        const stores = names.map((name) => {
          const store = tx.objectStore(name);
          return {
            name,
            keyPath: store.keyPath,
            autoIncrement: store.autoIncrement,
            indexes: Array.from(store.indexNames).map((indexName) => {
              const index = store.index(indexName);
              return { name: indexName, keyPath: index.keyPath, unique: index.unique, multiEntry: index.multiEntry };
            }),
          };
        });
        return { version: db.version, stores };
      } finally {
        db.close();
      }
    },
    async ready(seedId) {
      const known = await indexedDB.databases();
      if (!known.some((db) => db.name === dbName && db.version === 11)) return false;
      const db = await open();
      try {
        if (!db.objectStoreNames.contains('qulResources')) return false;
        return (await request(db.transaction('qulResources').objectStore('qulResources').get(seedId))) !== undefined;
      } finally {
        db.close();
      }
    },
    local() {
      return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i))
        .sort()
        .map((key) => [key, localStorage.getItem(key)]);
    },
    setLocal(entries) {
      for (const [key, value] of entries) localStorage.setItem(key, value);
    },
  };
}

// ------------------------------------------------------------------ scenarios

const BUNDLE_SCENARIOS = [
  ['fresh', null],
  ['upgrade-v1base', 'v1base'],
  ['upgrade-v7', 'v7'],
  ['upgrade-v8', 'v8'],
  ['upgrade-v9', 'v9'],
  ['upgrade-v10', 'v10'],
  ['reopen-v11', 'v11'],
];

const storesOf = (old) => OLD_DATABASES[old].stores.map(([name]) => name);

/**
 * Each scenario is one or more phases; each phase runs in its own fresh
 * context. `input` may be a function of the earlier phases' outputs (a file
 * passed from one tablet to the next). `old` builds a database first.
 */
const HARNESS_SCENARIOS = [
  { id: 'harness/fresh', phases: [{ run: 'open' }] },
  ...['v1base', 'v7', 'v8', 'v9', 'v10'].map((old) => ({
    id: `harness/upgrade-${old}`,
    phases: [{ run: 'seed-then-open', old, input: { stores: storesOf(old) } }],
  })),
  { id: 'harness/reopen-v11', phases: [{ run: 'seed-then-open', old: 'v11', input: { stores: storesOf('v11') } }] },
  ...['v10-without-qulResources', 'v10-without-qulEntries'].map((old) => ({
    id: `harness/odd-${old}`,
    phases: [{ run: 'seed-then-open', old, input: { stores: storesOf(old) } }],
  })),
  { id: 'family/before-init', phases: [{ run: 'before-init' }] },
  ...['books', 'toc', 'pages', 'blocks', 'entities-dictionary', 'marks', 'cards', 'profiles', 'glossary',
    'retrieval-cache', 'qul', 'biography', 'crawl-position-settings', 'explanation-sharh', 'narrators',
    'share-records', 'word-glosses', 'raw-store-io'].map((family) => ({
    id: `family/${family}`,
    phases: [{ run: `family-${family}` }],
  })),
  { id: 'delete-book', phases: [{ run: 'delete-book' }] },
  {
    id: 'work-backup',
    phases: [
      { name: 'export', run: 'work-export' },
      { name: 'import-fresh', run: 'work-import', input: (out) => ({ file: out.export.result.file }) },
      { name: 'import-without-shareRecords', run: 'work-import', input: (out) => ({ file: out.export.result.file, dropShareRecords: true }) },
      { name: 'import-missing-books', run: 'work-import', input: (out) => ({ file: out.export.result.file, withBook: true, extraReferencedBook: true }) },
      { name: 'import-over-existing', run: 'work-import', input: (out) => ({ file: out.export.result.file, overwrite: true }) },
    ],
  },
  {
    id: 'book-transfer',
    phases: [
      { name: 'export', run: 'book-export' },
      { name: 'import-fresh', run: 'book-import', input: (out) => ({ files: out.export.result.files, mode: 'fresh' }) },
      { name: 'import-conflict', run: 'book-import', input: (out) => ({ files: out.export.result.files, mode: 'conflict' }) },
      { name: 'import-one-block-short', run: 'book-import', input: (out) => ({ files: out.export.result.files, mode: 'short' }) },
    ],
  },
  {
    id: 'device-transfer',
    phases: [
      { name: 'export', run: 'device-export' },
      { name: 'restore-without-keys', run: 'device-restore', input: (out) => ({ base64: out.export.result.files['without-keys'].base64 }) },
      { name: 'restore-with-keys', run: 'device-restore', input: (out) => ({ base64: out.export.result.files['with-keys'].base64 }) },
      { name: 'refusals', run: 'device-refusals', input: (out) => ({ text: out.export.result.files['without-keys'].text }) },
    ],
  },
  { id: 'share-adapter', phases: [{ run: 'share' }] },
];

// ------------------------------------------------------------------ normalizing

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/** A list over FULL_LIMIT becomes its count, ends and hash; everything else as is. */
function shorten(value) {
  if (Array.isArray(value)) {
    if (value.length > FULL_LIMIT) {
      return { count: value.length, first: value[0], last: value[value.length - 1], sha256: sha256(JSON.stringify(value)) };
    }
    return value.map(shorten);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shorten(inner)]));
  }
  return value;
}

/**
 * A store-by-store dump: every row, in key order, for a store of up to
 * FULL_LIMIT rows; above that, the count, first and last row and SHA-256.
 */
function rowsRecord(rows) {
  return Object.fromEntries(Object.entries(rows).map(([store, list]) => [store, list.length <= FULL_LIMIT ? list : shorten(list)]));
}

/** A file's text as the record keeps it: length, SHA-256 and its lines. */
function fileText(text) {
  return { bytes: Buffer.byteLength(text), sha256: sha256(text), lines: text.split('\n') };
}

function schemaRecord(schema) {
  return {
    version: schema.version,
    stores: schema.stores.map((store) => ({
      name: store.name,
      keyPath: store.keyPath,
      autoIncrement: store.autoIncrement,
      indexes: store.indexes,
    })),
  };
}

/**
 * Pretty-printed, one row to a line: an array of plain objects puts each on
 * its own line however long, so a changed row is one changed line.
 */
function format(value, indent = '') {
  const flat = JSON.stringify(value);
  if (value === null || typeof value !== 'object' || indent.length + flat.length <= 110) return flat;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const rowsOnly = value.every((item) => item && typeof item === 'object' && !Array.isArray(item));
    const items = value.map((item) => (rowsOnly ? JSON.stringify(item) : format(item, inner)));
    return `[\n${items.map((item) => inner + item).join(',\n')}\n${indent}]`;
  }
  const entries = Object.entries(value).map(([key, inner2]) => `${inner}${JSON.stringify(key)}: ${format(inner2, inner)}`);
  return `{\n${entries.join(',\n')}\n${indent}}`;
}

// ------------------------------------------------------------------ browser

async function newPage(browser, origin) {
  const context = await browser.newContext({
    locale: 'en-US',
    timezoneId: 'UTC',
    serviceWorkers: 'block',
  });
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === '/__dcheck/') {
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>check D</title>' });
    }
    if (url.pathname.startsWith('/__dcheck/')) {
      const file = join(HARNESS_DIR, url.pathname.slice('/__dcheck/'.length));
      if (!file.startsWith(HARNESS_DIR) || !existsSync(file)) return route.fulfill({ status: 404, body: 'Not found' });
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(file) });
    }
    // The dev-server proxy paths (vite.config.ts); `preview` would forward
    // them to the real hosts.
    if (/^\/(shamela|sunnah|quran-api|dorar)(\/|$)/.test(url.pathname)) return route.abort();
    return route.continue();
  });
  const page = await context.newPage();
  const errors = [];
  const consoleErrors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  await page.clock.setFixedTime(FIXED_NOW);
  await page.addInitScript(installPageHelpers, DB_NAME);
  await page.goto(`${origin}/__dcheck/`);
  return { context, page, errors, consoleErrors };
}

async function buildOld(page, old) {
  if (!old) return;
  const { version, stores } = OLD_DATABASES[old];
  await page.evaluate(([v, s]) => window.__dcheckPage.build(v, s), [version, stores]);
}

/** The schema Chromium reports for TODAY, built with raw IndexedDB. */
async function todaySchema(browser, origin) {
  const { context, page } = await newPage(browser, origin);
  try {
    await buildOld(page, 'v11');
    return schemaRecord(await page.evaluate(() => window.__dcheckPage.schema()));
  } finally {
    await context.close();
  }
}

/** Full for the fresh installs; "as today" elsewhere when it is exactly that. */
function abbreviated(id, schema, today) {
  if (id.endsWith('/fresh') || JSON.stringify(schema) !== JSON.stringify(today)) return schema;
  return { version: schema.version, stores: 'as today' };
}

async function bundleScenario(browser, origin, base, name, old) {
  const { context, page, errors, consoleErrors } = await newPage(browser, origin);
  try {
    await buildOld(page, old);
    await page.goto(base);
    const deadline = Date.now() + BOOT_LIMIT_MS;
    while (!(await page.evaluate(() => window.__dcheckPage.ready('qul-seed-matching-ayah')))) {
      if (Date.now() > deadline) throw new Error(`bundle/${name}: the app did not open version 11 and seed within ${BOOT_LIMIT_MS / 1000} s (${errors.join('; ')})`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    const schema = schemaRecord(await page.evaluate(() => window.__dcheckPage.schema()));
    return { schema, pageErrors: [...errors].sort(), consoleErrors: [...consoleErrors].sort() };
  } finally {
    await context.close();
  }
}

async function harnessPhase(browser, origin, phase, input) {
  const { context, page, errors } = await newPage(browser, origin);
  try {
    await buildOld(page, phase.old);
    await page.addScriptTag({ url: '/__dcheck/harness.js', type: 'module' });
    await page.waitForFunction(() => window.__dcheckHarness !== undefined);
    const result = await page.evaluate(([run, given]) => window.__dcheckHarness.run(run, given), [phase.run, input]);
    const schema = await page.evaluate(() => window.__dcheckPage.schema());
    const rows = await page.evaluate(() => window.__dcheckPage.rows());
    const local = await page.evaluate(() => window.__dcheckPage.local());
    const fakeKeys = await page.evaluate(() => window.__dcheckHarness.fakeKeys);
    // Recorded, not fatal: an exception thrown inside the upgrade callback
    // reaches the page as an uncaught error event as well as a rejected
    // `init` (the odd database without qulResources), and that is the
    // behaviour being pinned.
    return { result, schema: schemaRecord(schema), rows, local, fakeKeys, errors };
  } finally {
    await context.close();
  }
}

// ------------------------------------------------------------------ assertions

const failures = [];
function assert(label, ok) {
  if (!ok) failures.push(label);
}

function checkKeys(label, text, keys, expectPresent) {
  for (const key of Object.values(keys)) {
    const present = text.includes(key);
    assert(`${label}: fake key ${key} ${expectPresent ? 'missing' : 'present'}`, present === expectPresent);
  }
}

// ------------------------------------------------------------------ main

const started = Date.now();
if (!existsSync(join(ROOT, 'dist/index.html'))) {
  console.error('dist/ is missing: run `npm run verify:storage`, which builds it first.');
  process.exit(2);
}

const { build, preview } = await import('vite');
const server = await preview({ preview: { port: 4190, strictPort: false }, logLevel: 'warn' });
const appUrl = server.resolvedUrls.local[0];
const origin = new URL(appUrl).origin;
const base = server.config.base;

console.log('Building the harness (vite library mode):');
const buildStarted = Date.now();
await build({
  configFile: false,
  root: ROOT,
  base,
  publicDir: false,
  logLevel: 'warn',
  mode: 'production',
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: HARNESS_DIR,
    emptyOutDir: true,
    minify: false,
    target: 'es2022',
    lib: { entry: join(ROOT, 'scripts/verify-storage-harness.ts'), formats: ['es'], fileName: () => 'harness.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
console.log(`  built ${readdirSync(HARNESS_DIR).join(', ')} in ${((Date.now() - buildStarted) / 1000).toFixed(1)} s`);

const browser = await chromium.launch();
console.log(`Chromium ${browser.version()}, ${appUrl}`);
const scenarios = {};
let phaseCount = 0;
try {
  const today = await todaySchema(browser, origin);
  for (const [name, old] of BUNDLE_SCENARIOS) {
    const id = `bundle/${name}`;
    const { schema, pageErrors, consoleErrors } = await bundleScenario(browser, origin, appUrl, name, old);
    scenarios[id] = { schema: abbreviated(id, schema, today), pageErrors, consoleErrors };
    phaseCount++;
  }
  console.log(`  bundle: ${BUNDLE_SCENARIOS.length} scenarios`);

  for (const scenario of HARNESS_SCENARIOS) {
    const outputs = {};
    const recorded = {};
    for (const phase of scenario.phases) {
      const key = phase.name ?? phase.run;
      const input = typeof phase.input === 'function' ? phase.input(outputs) : phase.input ?? {};
      const output = await harnessPhase(browser, origin, phase, input);
      outputs[key] = output;
      phaseCount++;

      const entry = {
        schema: abbreviated(scenario.id, output.schema, today),
        // Every step listed; only a value inside one is shortened.
        steps: output.result.steps.map(([label, outcome]) => [label, shorten(outcome)]),
      };
      if (Object.keys(output.result.snapshots).length > 0) {
        entry.snapshots = Object.fromEntries(Object.entries(output.result.snapshots).map(([label, rows]) => [label, rowsRecord(rows)]));
      }
      for (const [field, value] of Object.entries(output.result)) {
        if (field === 'steps' || field === 'snapshots') continue;
        if (field === 'file') entry.file = { bytes: Buffer.byteLength(value), sha256: sha256(value) };
        else if (field === 'files') {
          entry.files = Object.fromEntries(Object.entries(value).map(([name, file]) => [name, { type: file.type, ...fileText(file.text) }]));
        } else entry[field] = shorten(value);
      }
      if (output.errors.length > 0) entry.uncaughtInPage = output.errors;
      entry.rows = rowsRecord(output.rows);
      entry.localStorage = output.local;
      recorded[key] = entry;
    }
    scenarios[scenario.id] = scenario.phases.length === 1 ? recorded[Object.keys(recorded)[0]] : recorded;

    // The assertions that hold whatever the record says.
    const keys = Object.values(outputs)[0].fakeKeys;
    if (scenario.id === 'work-backup') {
      checkKeys('work backup', outputs.export.result.file, keys, false);
    }
    if (scenario.id === 'book-transfer') {
      for (const [id, file] of Object.entries(outputs.export.result.files)) checkKeys(`per-book file ${id}`, file.text, keys, false);
    }
    if (scenario.id === 'device-transfer') {
      checkKeys('whole-tablet file without keys', outputs.export.result.files['without-keys'].text, keys, false);
      checkKeys('whole-tablet file with keys', outputs.export.result.files['with-keys'].text, keys, true);
      for (const restore of ['restore-without-keys', 'restore-with-keys']) {
        assert(`${restore}: every row equals the sending tablet's`, JSON.stringify(outputs[restore].rows) === JSON.stringify(outputs.export.rows));
      }
      for (const [label, untouched] of Object.entries(outputs.refusals.result.untouched)) {
        assert(`refusals: rows and localStorage untouched ${label}`, untouched === true);
      }
    }
    if (scenario.id === 'share-adapter') {
      assert('share adapter: ignored writes left the database untouched', outputs.share.result.ignoredLeftDatabaseUnchanged === true);
    }
  }
  console.log(`  harness: ${HARNESS_SCENARIOS.length} scenarios`);
} catch (error) {
  console.error(`\nFAIL — a scenario could not run: ${error.message}`);
  await browser.close();
  await server.close();
  process.exit(2);
}
await browser.close();
await server.close();

const record = {
  check: 'D — docs/refactor/plans/phase4-storage.md, Design §1; scripts/verify-storage.mjs says what is recorded',
  masked: 'nothing',
  scenarios,
};
const text = `${format(record)}\n`;
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(CURRENT, text);
const seconds = ((Date.now() - started) / 1000).toFixed(0);
console.log(`\n${Object.keys(scenarios).length} scenarios, ${phaseCount} phases, ${Buffer.byteLength(text).toLocaleString('en-US')} B in ${relative(ROOT, CURRENT)} — ${seconds} s`);

if (failures.length > 0) {
  console.log(`\nFAIL — ${failures.length} assertion(s):`);
  for (const failure of failures) console.log(`  ${failure}`);
  // Never written; but still compared below, so the failure says what changed.
  if (WRITE) process.exit(1);
}

if (WRITE) {
  mkdirSync(dirname(RECORD), { recursive: true });
  writeFileSync(RECORD, text);
  console.log(`wrote ${relative(ROOT, RECORD)}`);
  process.exit(0);
}

if (!existsSync(RECORD)) {
  console.log(`\nFAIL — no record at ${relative(ROOT, RECORD)}`);
  process.exit(1);
}
const expected = readFileSync(RECORD, 'utf8');
if (expected === text) {
  if (failures.length > 0) {
    console.log(`\nFAIL — the record is identical to ${relative(ROOT, RECORD)}, but the assertions above fail`);
    process.exit(1);
  }
  console.log(`\nPASS — identical to ${relative(ROOT, RECORD)}`);
  process.exit(0);
}

// Say which scenarios differ, and the first differing lines of each.
const before = JSON.parse(expected).scenarios ?? {};
const names = [...new Set([...Object.keys(before), ...Object.keys(scenarios)])];
const differing = names.filter((name) => format(before[name] ?? null) !== format(scenarios[name] ?? null));
console.log(`\nFAIL — ${differing.length} of ${names.length} scenarios differ from ${relative(ROOT, RECORD)}:`);
for (const name of differing) {
  console.log(`  ${name}`);
  const a = format(before[name] ?? null).split('\n');
  const b = format(scenarios[name] ?? null).split('\n');
  let shown = 0;
  for (let i = 0; i < Math.max(a.length, b.length) && shown < 6; i++) {
    if (a[i] === b[i]) continue;
    console.log(`    line ${i + 1}\n      - ${(a[i] ?? '(none)').trim().slice(0, 220)}\n      + ${(b[i] ?? '(none)').trim().slice(0, 220)}`);
    shown++;
  }
}
if (differing.length === 0) console.log('  (no scenario differs: the header or the formatting does)');
process.exit(1);
