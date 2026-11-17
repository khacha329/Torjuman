# Phase 4: storage — check D, one schema table, the adapter split by store group

Status: draft — awaiting the owner's approval
Base commit: `f9f70eb` (Phase 3 complete, stacked on `claude/restructure-phase-3`; PRs #8–#10 and Phase 3's open, not merged)
Branch: `claude/restructure-phase-4`

Line numbers below are at `f9f70eb`. Paths are under `src/` unless they say
otherwise. "The adapter" is `platform/storage/IdbStorageAdapter.ts`.

## Goal

RESTRUCTURE §6, Phase 4: "**Storage**: check D first; one schema table
driving both upgrade branches; `IdbStorageAdapter` split by store group;
`WorkBundle` and transfers on the same table — **high**: the owner's data — D
on every step; T B L X; V; M with a copy of the real database." And §2:
"**Adding a store** is one entry in one schema table that both upgrade paths
read." PROGRESS "Later": "Check D (IndexedDB schema dump) is built in Phase 4
step 0, on the old code."

Done when:

- a new check **D** (Design §1) exists, was baselined on the old code in its
  own commit, and passes **unchanged** after every later step: the schema
  (every store's name, keyPath, autoIncrement, and every index's name,
  keyPath, unique and multiEntry) after a fresh install and after upgrading
  each older database it builds; the rows after every `StorageAdapter` method
  family, a per-book delete, a work backup and restore, a per-book transfer
  out and in, and a whole-tablet transfer out, checked, refused and restored;
- both upgrade branches of `init` read one declarative table of stores and
  indexes (Design §2), and D shows both produce exactly today's schema;
- **`DB_VERSION` is still 11** and no store, index, keyPath or option has
  changed (D records `db.version` and the whole schema in every scenario;
  Design §2.5);
- the adapter's CRUD is in group modules (Design §3), one class still
  `implements StorageAdapter`, and `ShareStorageAdapter` is untouched;
- `BOOK_STORES`, and (if Q7 says so) the work backup's store list, read from
  the table or one list, with byte-identical results (Design §4);
- T, B, L, D, X pass at every step; S and R at the steps that move the
  blocks, search and position code and at the end; U at the table steps and
  the end; the SSR build of `verify-parsers.ts` resolves at every step that
  touches a file it imports;
- the owner's `npm run verify` passes, and the owner's tablet run (M, below)
  works on the staged build with a copy of the real library.

## Not doing

- **No schema change.** No `DB_VERSION` bump, no new, renamed or removed
  store or index, no keyPath or option change. So the upgrade branch does not
  run on the owner's tablets during this phase at all (they are at 11): it
  runs only for a database older than 11, which only D builds. The fresh
  branch runs on any new origin — including the staging origin in M.
- No change to any file format: the work backup JSON, the per-book file
  (`TRANSFER_VERSION` 1, `library/transfer.ts:19`), the whole-tablet file
  (`DEVICE_TRANSFER_VERSION` 1, `library/deviceTransfer.ts:26`), its
  schema-version refusal (`deviceTransfer.ts:418-423`).
- No change to `share/ShareStorageAdapter.ts`, `library/*.ts`, the relay, the
  Worker, `public/share-target.js`, or any screen. `ReceiveTransferScreen`'s
  `LABELS` (`ui/ReceiveTransferScreen.tsx:30-44`) is UI copy for 13 of the 24
  stores, chosen for display, and stays.
- No behaviour fix. What the survey found is in Design §6 for FOUND_ISSUES
  and left.
- No change to the order in which the work backup's fields are written or
  read, or the order of a per-book delete (Design §4 shows where a derived
  list would have changed them).
- No new dependency (Q1). No change to the `idb` version.
- No deletion of anything saved. Nothing is deleted from the repository
  either, except code that moves.
- D is not added to the deploy workflow (Q9).
- No book-kinds work; nothing here touches `StructureProfile`.

## Current state (at `f9f70eb`)

### 1. The adapter, by section

`platform/storage/IdbStorageAdapter.ts`, 1,059 lines:

| Lines | What |
| --- | --- |
| 1-35 | imports (`idb`; 24 types; `letterFold` from `lib/arabic`; the interface's types) |
| 37-39 | "This is the ONLY file that talks to IndexedDB." |
| 41 | `DB_NAME = 'shamela-reader'` |
| 42-59 | schema history comment, `DB_VERSION = 11` |
| 60 | `SETTINGS_KEY = 'app'` |
| 62-69 | `PURGE_BATCH = 4096` |
| 71-96 | `BOOK_STORES` (10 names, with the `biographyEntries` comment `:88-92`), `type BookStore` |
| 98-169 | `interface Schema extends DBSchema` (24 stores) |
| 171-185 | `SearchEntry` |
| 187-199 | class, `db`, `searchIndex` (per-book in-memory search cache) |
| 201-337 | `init`: `openDB(DB_NAME, DB_VERSION, { upgrade })`; existing-DB branch `:204-257`, fresh branch `:259-334` |
| 339-342 | `handle` (throws "StorageAdapter.init() has not been awaited") |
| 344-382 | `purgeIndex` (batched key delete through an index) |
| 384-416 | books, `deleteBook` |
| 418-596 | toc, pages, blocks, `loadSearchIndex`, `searchBlocksLoose`, `searchBlocks` |
| 598-634 | entities, dictionary |
| 636-705 | marks, cards, profiles, glossary |
| 707-723 | retrieval cache (Qurʾān verses, ḥadīth) |
| 725-789 | QUL — with the **biography** methods (`:731-746`) sitting inside it after `putQulResource` |
| 791-822 | crawl state, position, settings |
| 824-850 | explanation cards, sharḥ cards |
| 852-883 | narrator profiles |
| 885-917 | shared chapters — with the **word-gloss** methods (`:907-917`) under its header, though `:824`'s header names glosses |
| 919-980 | raw store I/O for the whole-tablet transfer: `schemaVersion`, `listStoreNames`, `untyped`, `countStoreRows`, `readStoreRows`, `putStoreRows`, `clearAllStores` |
| 982-1058 | work backup: `exportWork`, `importWork` |

The search cache (`searchIndex`, `:199`) is invalidated by `putBlocks`
(`:494`), `deleteBlocksForPage` (`:507`), `deleteBook` (`:415`),
`putStoreRows` (`:970`), `clearAllStores` (`:979`) and `importWork`
(`:1051`) — state shared by three of the groups below.

### 2. The stores

24 stores. None uses `autoIncrement`; no index is `unique`; one index is
`multiEntry`. "Since" is from the history comment (`:42-58`); "≤7" means
created by the fresh branch of the first commit in git, `810b059` (v7).

| Store | keyPath | Indexes (name: keyPath) | Fresh branch | Existing-DB branch | Since | `BOOK_STORES` | Work backup | Per-book file |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| books | id | — | :259 | never created | ≤7 | | `referencedBooks` only (:991-995) | header `book` |
| tocNodes | id | byBook: bookId | :261-262 | never | ≤7 | yes | | header `toc` |
| pages | id | byBook: bookId; byBookPage: [bookId, pageIndex] | :264-266 | never | ≤7 | yes | | page lines, no `rawHtml` |
| blocks | id | byBook: bookId; byPage: pageId; byBookOrder: [bookId, order] | :268-271 | never | ≤7 | yes | | block lines, no `normalized`/`contentHash` |
| entities | id | byBook: bookId; byStartBlock: startBlockId | :273-275 | **dropped and recreated on every upgrade** (:209-214) | 2 | yes | | rebuilt on arrival |
| dictionaryEntries | id | byBook: bookId; byRoot: root | :277-279 | if missing (:221-225) | 5 | yes | | rebuilt on arrival |
| marks | id | byBook: bookId; byStartBlock: startBlockId | :283-285 | if missing (:216-220) | 4 | yes | yes | |
| cards | id | byBook: bookId; byCacheKey: cacheKey | :287-289 | never | ≤7 | yes | yes | |
| explanationCards | id | byBook: bookId | :291-292 | if missing (:226-229) | 6 | yes | yes | |
| sharhCards | id | byBook: bookId | :297-298 | if missing (:244-247) | 9 | yes | yes | |
| narratorProfiles | id | byNaming: namings (multiEntry); byShard: shard | :303-305 | if missing (:248-252) | 10 | no — `deleteBook` purges shard `taqrib:<id>` (:407) | | |
| shareRecords | id | — | :309 | if missing (:253-255) | 11 | no | yes (optional field) | |
| wordGlosses | word | — | :311 | if missing (:230-232) | 6 | | yes | |
| qulResources | id | — | :316 | if missing (:233-234) | 7 | | | |
| qulEntries | id | byResource: resourceId; byResourceKey: [resourceId, key] | :317-319 | **if `qulResources` is missing** (:233, :235-237) | 7 | | | |
| qulCompilations | cacheKey | — | :320 | **if `qulResources` is missing** (:233, :238) | 7 | | | |
| biographyEntries | id | byBook: bookId | :325-326 | if missing (:240-243) | 8 | yes | | |
| profiles | id | — | :328 | never | ≤7 | | yes | |
| glossary | id | — | :329 | never | ≤7 | | yes | |
| quranVerses | reference | — | :330 | never | ≤7 | | yes | |
| hadiths | reference | — | :331 | never | ≤7 | | yes | |
| crawlStates | bookId | — | :332 | never | ≤7 | no — deleted by key (:413) | | written on arrival (`transfer.ts:328-334`) |
| positions | bookId | — | :333 | never | ≤7 | no — deleted by key (:414) | yes | |
| settings | key | — | :334 | never | ≤7 | | as `settings` (one row, key `'app'`, :1007) | |

Every store travels in the whole-tablet transfer: it reads
`storage.listStoreNames()` (`deviceTransfer.ts:144`, `:265`), which is the live
database's `objectStoreNames` (`IdbStorageAdapter.ts:929-931`) — a
`DOMStringList` the IndexedDB spec keeps **sorted**, so the file's store order
is alphabetical whatever order the stores were created in.

**What git can reproduce.** The adapter's history starts at `810b059`
(2026-08-27, `DB_VERSION = 7`); then `1ed3b24` (v8), `4413ad0` (v10; 9 and 10
in one commit, so no v9 build ever existed in git), `c383327` (v11). Versions
1–6 predate the repository. The fresh branch at `810b059` creates the twelve
"never created" stores with exactly today's keyPaths and indexes, so every
database from v7 on has them as today; for a database made by v1–v6 that
cannot be checked (FOUND_ISSUES draft E, Design §6).

### 3. Every hand-written store list

| # | Where | Lists | Agrees with |
| --- | --- | --- | --- |
| 1 | `Schema` (`:98-169`) | 24 stores, value types, index key types | 2 |
| 2 | fresh branch (`:259-334`) | 24 stores and 21 indexes | 1 |
| 3 | existing-DB branch (`:204-256`) | 12 stores (the rest assumed since v1) | 2 for those 12 — same keyPaths, indexes and options |
| 4 | `BOOK_STORES` (`:78-94`) | 10 stores | **exactly** the stores with a `byBook` index, in the fresh branch's order |
| 5 | `purgeIndex`'s parameter types (`:363-364`) | `BookStore` + `narratorProfiles`, `qulEntries`; `byBook`, `byShard`, `byResource` | 4 |
| 6 | `deleteBook` (`:399-416`) | 4, then shard `taqrib:<id>`, then `books`, `crawlStates`, `positions` by key | — |
| 7 | `exportWork` (`:996-1007`) | 11 stores + settings | 8, 9, same order |
| 8 | `importWork` (`:1015-1016` type, `:1029-1041` calls) | 11 stores + settings | 7, 9, same order |
| 9 | `WorkBundle` (`StorageAdapter.ts:46-77`) | 11 arrays + settings | 7, 8, same order |
| 10 | `ReceiveTransferScreen` `LABELS` (`:30-44`) | 13 stores with display names | UI copy; a subset by design |
| 11 | test seeding in `scripts/verify-selection.mjs:82-88`, `verify-reader-scroll.mjs:77-88`, `verify-markup.mjs:379-387` | raw IndexedDB writes; `verify-markup.mjs:379` polls `db.version === 11` | scripts; unaffected while the version is 11 |

Lists 4/7/8/9 agree with each other and with the schema today. The only
disagreements are between the two upgrade branches by design (3 assumes
twelve stores exist) and the QUL trio's shared guard (3). Not a store list:
`share/bundle.ts:140-149` names the share bundle's own fields.

The backup's order and `BOOK_STORES`' order **cannot both be one table's
order**: `BOOK_STORES` has `marks` before `cards`
(`:84-85`), the backup has `cards` before `marks` (`:996-999`). Design §4.

### 4. Who calls the parts that move

- `new IdbStorageAdapter()`: `app/AppContext.tsx:115` only. The class name and
  path do not change.
- `exportWork`/`importWork`: `ui/settings/SettingsScreen.tsx:533-546` (the file
  is `JSON.stringify(bundle)`, `:538`) and `:548-556`.
- `deleteBook`: `ui/LibraryScreen.tsx:43`, `ui/settings/ReferenceWorks.tsx:62`,
  `library/transfer.ts:248`, `:353`.
- Raw store I/O: `library/deviceTransfer.ts:144-146`, `:161`, `:185`, `:265`,
  `:271`, `:349-358`.
- `ShareStorageAdapter` (`share/ShareStorageAdapter.ts:80`) implements the whole
  interface: writes are **silently ignored** (`:77-78`, `:128`…`:462`), except
  `putQuranVerse`, `putQulCompilation` and `putSettings`, which write through
  to the visitor's own database (`:330`, `:356`, `:397`); only backup and
  transfer **throw** (`:474-507`). It reads nothing from the adapter's internals.
- Scripts: `verify-parsers.ts` imports `share/ShareStorageAdapter` (`:4649`),
  `library/deviceTransfer` (`:5150`, against an in-memory fake device,
  `:5154-5180`), `library/relayTransfer` (`:5344`) and the `StorageAdapter`
  type (`:4857`) — **not** `IdbStorageAdapter`. `verify-requests.ts:338` imports
  the type. So no check today runs the adapter against IndexedDB; `npm run
  verify` covers the transfer logic only over a fake.

### 5. Layers

`node scripts/check-layers.mjs` at `f9f70eb`: 162 files, 134 directory edges,
no cycles, no mutual pairs, 11 rules hold. `platform/storage` imports `lib` (1,
`letterFold`) and `types` (type-only). New files in `platform/storage/` (or a
subfolder of it — `unitOf` folds `platform/x/y` into `platform/x`,
`check-layers.mjs:47-52`) add no unit. The tool reads relative imports only,
so `idb` is invisible to it.

## Design

### 1. Check D — the storage record (built first, on the old code)

**What it is.** `scripts/verify-storage.mjs` plus a harness entry,
`scripts/verify-storage-harness.ts`, run as `npm run verify:storage` = `vite
build --logLevel warn && node scripts/verify-storage.mjs`. It compares a
normalized record with the committed `docs/refactor/phase4/storage.json`.

**Why Playwright in Chromium.** Node has no IndexedDB. `fake-indexeddb` would
give Node one, but it is a new dependency (Q1) and it is not the IndexedDB the
tablet runs; spec details this phase depends on (sorted `objectStoreNames`,
`indexNames`, versionchange-transaction aborts) would be checked against a
reimplementation. Chromium is already in the container for S, R and U.

**Two halves, one origin.**

1. **The shipped bundle.** The script starts `vite preview` on `dist/` (as S
   and R do). For each schema scenario it opens a fresh browser context, loads
   a non-app URL on that origin (served by `page.route`, so the app never runs
   first), builds the old database there with raw IndexedDB if the scenario
   has one, then loads `/` and waits until `indexedDB.databases()` reports
   `shamela-reader` at version 11 (the same poll as `verify-markup.mjs:379`),
   then dumps the schema. This is the real `init` in the real minified bundle.
   Rows are **not** compared here: on first boot the app seeds profiles,
   settings and QUL rows itself.
2. **The harness.** `verify-storage-harness.ts` imports by path the real
   `IdbStorageAdapter`, `library/transfer`, `library/deviceTransfer`,
   `share/ShareStorageAdapter`, and exposes them on `window`. The script builds
   it with Vite's JS API in library mode (`configFile: false` — no PWA plugin,
   no service worker — `build.lib`, ES module, `outDir: .verify/storage`) and
   serves it with `page.route` on the **same preview origin**, so
   `importBookFile`'s entity rebuild can fetch `quran/uthmani.json` from
   `dist/` (`quran/quranIndex.ts:465`, `:520`). Every scenario gets a fresh
   context (an empty IndexedDB and `localStorage`).

**Pinned, so nothing needs masking.** `page.addInitScript` fixes `Date.now`
(timestamps in `exportWork` `:990`, `fetchedAt`/`updatedAt` in
`transfer.ts:271`, `:333`, `exportedAt` in `deviceTransfer.ts:162`, and
`lib/id.ts`'s `newId`) and `Math.random` (`newId`'s suffix), so entity and
dictionary ids regenerated on arrival come out the same on every run. Context
locale `en-US` and `timezoneId` `UTC` (progress messages use
`toLocaleString`). If two runs still differ, the only masks allowed are
`newId` ids and timestamps, each named in the record's header — never a row
count, a key or a schema field.

**What is recorded.**

- **Schema**, per scenario: `db.version`; for each store (sorted): name,
  `keyPath`, `autoIncrement`, and each index (sorted): name, `keyPath`,
  `unique`, `multiEntry`.
- **Rows**, per scenario: for each store (sorted), every row in key order as
  JSON when the store holds ≤ 50 rows; above that, the count, the first and
  last row, and a SHA-256 of the JSON of all rows (keeps the record small when
  a scenario needs 4,097 rows to cross `PURGE_BATCH`).
- **Results**: each method's return value (JSON), each thrown error's
  message, each `WorkRestoreReport`, each `DeviceTransferSummary` except
  `uncompressedBytes`, which is recorded too (it is the decompressed text's
  length, deterministic).
- **Files**: the work backup as `JSON.stringify(bundle)` — the bytes
  `SettingsScreen.tsx:538` saves; the per-book and whole-tablet files
  **decompressed** (the format is the NDJSON text; gzip output is the browser's
  and not this code's), with their SHA-256.

**Scenarios.**

| Group | Scenarios |
| --- | --- |
| schema (bundle and harness) | `fresh`; `upgrade-v1base`; `upgrade-v7`; `upgrade-v8`; `upgrade-v9`; `upgrade-v10`; `reopen-v11` (no upgrade runs) |
| upgrade rows (harness) | for each upgrade scenario: a synthetic row in every store the old version had, then `init`; today every row survives except `entities`, which is emptied; for `reopen-v11`, `entities` survives |
| odd old databases (harness) | `qulEntries` without `qulResources` (today: `init` rejects, ConstraintError — recorded, message and the database left at its old version); `qulResources` without `qulEntries` (today: opens, no `qulEntries`) — FOUND_ISSUES draft F |
| method families (harness, fresh DB) | one scenario per section of the interface (`StorageAdapter.ts:102-237`): books, toc, pages (`getPage`, `listFetchedPageIndices`, `listPageMeta`, `countPages`), blocks (`deleteBlocksForPage`, `listBlocksForPage`, counts, both searches, the cache invalidated by a later `putBlocks`), entities and dictionary (501 rows, crossing the 500-row batches `:602`, `:621`), marks, cards (`getCardByCacheKey`), profiles, glossary (sort by `addedAt`), retrieval cache, QUL (`getQulEntries` with a missing key, `deleteQulResource`), biography (with and without `bookId`), crawl, position, settings (the `key` field stripped, `:820`), explanation and sharḥ cards, narrator profiles (`findNarratorProfiles` under 3 letters, multiEntry hits, `listNarratorShards`, `deleteNarratorShard`), share records (sort by `createdAt`), word glosses; and `before-init` (each method family's first call rejects with the `handle` message) |
| per-book delete | two books with rows in every `BOOK_STORES` store, 4,097 blocks in one (crossing `PURGE_BATCH`), a `taqrib:<id>` and an `itqan` narrator shard, crawl state and position for both, a share record naming the book → `deleteBook` → rows (the other book, the Itqan shard and the share record untouched) |
| work backup | `exportWork` with every backed-up store filled → the JSON; `importWork` into a fresh DB → rows and report; a bundle without `shareRecords` (an old backup, `:1039`); a bundle referencing a book that is not there (`missingBooks`) |
| per-book transfer | `exportBook` → the NDJSON; `importBookFile` into a fresh DB → rows (entities and dictionary rebuilt); into a DB with the book: `onConflict` true (replaced) and false (`CANCELLED`, rows untouched); a file one block short (refused, the half-written book removed, `transfer.ts:353`) |
| whole-tablet transfer | `exportDevice` without and with keys → the NDJSON; `inspectDeviceFile` → the summary; `restoreDevice` into a DB holding other rows → every row equals the source's, other `localStorage` entries kept; **refusals, each with rows and `localStorage` untouched**: header `schemaVersion` 10 (`deviceTransfer.ts:418-423`), an unknown store (`:272-277`), a file cut short (`:311-316`), a line after the end marker (`:268`) |
| share adapter | a `ShareStorageAdapter` over the harness's real adapter: every ignored write leaves the visitor's database unchanged; `putSettings`, `putQuranVerse`, `putQulCompilation` land in it; `exportWork`, `importWork` and the five raw store calls throw their messages |

**Old databases.** Built with raw IndexedDB in the page from descriptions in
`verify-storage.mjs`:

- **v7, v8, v10** transcribed from the fresh branch at `810b059`, `1ed3b24`,
  `4413ad0` (`git show <hash>:src/platform/storage/IdbStorageAdapter.ts`);
  each is today's schema minus the stores added after it, which the reviewer
  checks against `git show`;
- **v9**: v8 plus `sharhCards` (the history comment `:49-51`; never a commit
  of its own);
- **v1base**: the twelve stores the existing-DB branch never creates, with
  today's indexes, at version 1 — not a historical schema but the one that
  exercises every guard. Q2.

**Keys stay out.** The harness puts fake keys (`sk-ant-d-check-…`,
`AIza-d-check-…`) in `localStorage` under the names `services/secrets.ts`
uses, and D asserts the fake values appear nowhere in the work backup, the
per-book file, or the whole-tablet file written without keys — and do appear
in the one written with them. CLAUDE.md's Never, checked mechanically.

**Synthetic data only.** Rows are invented for the check, like S's and R's
books (a few words of Arabic, ids like `shamela-990001`). No fixture, no real
book, no share link. The record is safe to commit.

**Proving the check.** In 4a, in a scratch copy and not committed, five
breakages must each change the record: an index dropped from the fresh branch;
the `sharhCards` guard removed (`upgrade-v8` fails to gain it); `marks`
removed from `BOOK_STORES`; `hadiths` dropped from `exportWork`; the
`schemaVersion` comparison in `parseHeader` removed. Two clean runs give the
same record; a third with `TZ` changed too.

### 2. One schema table

**2.1 Where.** A new `platform/storage/idbSchema.ts` (name: Q4) holds, moved
verbatim in 4b–4c: `DB_NAME`, the history comment and `DB_VERSION`,
`BOOK_STORES`/`BookStore`, `Schema`, and the upgrade callback as an exported
function. In 4j it gains the table.

**2.2 Shape.**

```ts
interface IndexSpec<S extends StoreNames<Schema>> {
  name: IndexNames<Schema, S>;
  keyPath: string | readonly string[];
  multiEntry?: true;
}
interface StoreSpec<S extends StoreNames<Schema>> {
  keyPath: string;
  indexes?: readonly IndexSpec<S>[];
  /** How a database opened at oldVersion >= 1 gets this store. */
  onUpgrade: 'assumed' | 'if-missing' | 'recreate';
  /** Created when THIS store is missing, not itself (the QUL trio). */
  createdWith?: StoreNames<Schema>;
  /** Rows filed under a book, cleared with it (4l). */
  perBook?: true;
}
export const STORES: { readonly [S in StoreNames<Schema>]: StoreSpec<S> } = { … };
```

`StoreNames` and `IndexNames` are `idb`'s own exported types, so `tsc` fails
on a store the table misses, a store `Schema` does not know, or an index name
that is not in `Schema`. The entries are written in the **fresh branch's
order** (`:259-334`), and each carries the fresh branch's comment above it,
verbatim (`:281-282`, `:294-296`, `:300-302`, `:307-308`, `:313-315`,
`:322-324`).

**2.3 The fresh branch (4j)** becomes: for each entry in table order, create
the store with its keyPath, then its indexes in listed order, `multiEntry`
passed only where set (so the options object is the same as today's: absent,
or `{ multiEntry: true }`).

**2.4 The existing-DB branch (4k)** becomes, with `:205-208`'s comment kept
above it: take `existing = new Set(db.objectStoreNames)` **once, first**; then
for each entry in table order — `recreate`: delete if present, create;
`if-missing`: create if `existing` lacks `createdWith ?? name`; `assumed`:
nothing. The snapshot matters: walking the table and asking the live
`objectStoreNames` would find `qulResources` just created and skip
`qulEntries`. With the snapshot, every guard sees what today's guard sees —
today no creation in the branch creates a store another guard tests, except
the trio, whose shared guard is evaluated once before all three
(`:233-239`), exactly as `existing` is.

Creation order inside the versionchange transaction changes (today `marks`
before `dictionaryEntries`, `wordGlosses` before `sharhCards`; the table has
the reverse). It is not observable: `objectStoreNames` and `indexNames` are
sorted by the spec, and a failed creation aborts the whole transaction, so no
partial state depends on order. D shows it (Q5).

**2.5 `DB_VERSION` unchanged, and how it is shown.** 4b moves the line
`const DB_VERSION = 11;` and its comment verbatim (the reviewer checks the
moved block line for line); no later step touches it; D records `db.version`
11 in every scenario, `schemaVersion` 11 in the whole-tablet header, the
`schemaVersion` getter's value, and the refusal of a file saying 10. A changed
version would also make `verify-markup.mjs:379`'s poll fail (U).

### 3. The split

**Groups and files** (Q3, Q4), all in `platform/storage/`:

| File | Moves (lines at `f9f70eb`) | Step |
| --- | --- | --- |
| `idbSchema.ts` | `:41`, `:42-59`, `:71-96`, `:98-169`; the `upgrade` body `:203-335` as `upgradeDatabase` | 4b, 4c |
| `idbPurge.ts` | `PURGE_BATCH` `:62-69`, `purgeIndex` `:344-382` | 4d |
| `idbTransfer.ts` | the comment `:919-923`, `listStoreNames`, `untyped`, `countStoreRows`, `readStoreRows`, `putStoreRows`, `clearAllStores` (`:929-980`) | 4e |
| `idbWork.ts` | the user's work: marks, cards, profiles, glossary (`:636-705`), position, settings with `SETTINGS_KEY` (`:60`, `:801-822`), explanation and sharḥ cards (`:824-850`), share records (`:885-905`), word glosses (`:907-917`) | 4f |
| `idbReference.ts` | reference data: retrieval cache (`:707-723`), QUL (`:725-729`, `:748-789`), biography (`:731-746`), narrator profiles (`:852-883`) | 4g |
| `idbLibrary.ts` | book content: `SearchEntry` (`:171-185`), books and `deleteBook` (`:384-416`), toc, pages, blocks and search (`:418-596`), entities, dictionary (`:598-634`), crawl state (`:791-799`) | 4h |
| `idbBackup.ts` | `exportWork`, `importWork` (`:982-1058`) | 4i |

`biographyEntries` goes with the references although it is per book: it is
read as a reference index, and its per-book clearing is `BOOK_STORES`'
generic loop, not a method of its own. Moving methods into files puts the
misfiled biography and word-gloss methods (§1) with their groups; that is a
move, not a reorder of statements inside any body.

**What stays in the class** (`IdbStorageAdapter.ts`, ~330 lines after 4i):
the header, `db`, `searchIndex` with its comment, `init` (now
`openDB<Schema>(DB_NAME, DB_VERSION, { upgrade: upgradeDatabase })` —
`upgradeDatabase` takes `idb`'s `(database, oldVersion)` parameters), the
`handle` getter, the `schemaVersion` getter (`return DB_VERSION;`), and one
delegating method per interface method.

**The form: free functions, one class (recommended, Q3 (a)).** Each moved
method becomes `export async function name(handle: IDBPDatabase<Schema>, …)`
with its body unchanged except one substitution: `this.<member>` becomes a
parameter or a call with `handle` first — `this.handle` → `handle`,
`this.searchIndex` → `searchIndex` (a `Map` parameter), `this.purgeIndex(` →
`purgeIndex(handle, `, `this.getBlock(` → `getBlock(handle, `,
`this.loadSearchIndex(` → `loadSearchIndex(handle, searchIndex, `,
`this.deleteNarratorShard(` → `deleteNarratorShard(handle, `, `this.untyped(`
→ `untyped(handle, `, `this.getSettings()` → `getSettings(handle)`,
`this.putSettings(` → `putSettings(handle, `. Naming the parameter `handle`
keeps lines like `const db = this.handle;` as `const db = handle;` — no
statement is added, removed or reordered. The reviewer checks each moved body
with a word diff in which only those tokens differ. This is a fifth allowed
adaptation beyond RESTRUCTURE §3 rule 4 (a)–(d), so it needs the owner's yes.

The class delegates keep each method's **sync or async form**:
`async putBook(book: Book): Promise<void> { return putBook(this.handle, book); }`;
`listStoreNames(): string[] { return listStoreNames(this.handle); }` stays
synchronous. An `async` delegate keeps today's behaviour before `init`: a
rejected promise, not a synchronous throw (D's `before-init`). Each function
issues its first IndexedDB request in the same synchronous run as the
original, so the order of requests between concurrent callers is unchanged;
only promise settlement moves by a microtask. Transactions are the same
statements, so their scopes and modes do not change.

**Alternatives.** (b) `this`-typed functions (`function putBook(this:
IdbContext, book)`) assigned as class fields — bodies byte-verbatim, but the
methods become own properties (as `ShareStorageAdapter`'s `putBook = ignored`
already are), the context type must expose `handle` and the cross-group
methods, and the pattern is unusual for TypeScript. (c) A composition of group
classes (`IdbLibraryStore`, …) held by the adapter — the same delegation plus
objects that must share one `handle` and one `searchIndex`; mixins would make
`private` members illegal in the exported class expressions. (d) Split only
schema, transfer and backup, and leave the CRUD (~600 lines) in the class with
a reason at its top — the least risk, and short of the phase row.

**Amended at step 4e (recorded in PROGRESS; the owner's Q3 text, "a
`handle`-first parameter or call", covers it).** The form above would change
behaviour: ten methods return before touching the database (`putStoreRows`,
`putBlocks`, `putEntities`, `putDictionaryEntries`, `putMarks`, `deleteMarks`,
`putNarratorProfiles` with an empty list; `searchBlocks` and
`searchBlocksLoose` with an empty query; `findNarratorProfiles` under three
letters), so they resolve before `init`, and a delegate that read
`this.handle` to pass it would make them reject. So from 4e each moved
function's first parameter is a handle **fetcher**, `handle: () =>
IDBPDatabase<Schema>`; in moved bodies `this.handle` → `handle()`, and the
other substitutions are as above with `handle` meaning the fetcher —
`this.getBlock(` → `getBlock(handle, `, and `this.purgeIndex(` →
`purgeIndex(handle(), ` (4d's `purgeIndex` takes the handle itself). The
class delegates pass one fetcher, `this.lazyHandle`. The sentence "An `async`
delegate keeps today's behaviour before `init`: a rejected promise" holds for
the other methods; for the ten it is the fetcher that keeps it.

### 4. `BOOK_STORES`, the work backup and the transfers on the table

**`BOOK_STORES` (4l).** `perBook: true` on the ten entries; `BOOK_STORES` is
the table's names filtered by it, in table order, typed so `BookStore` is
still the literal union. The result is the same ten names **in the same
order** (§3, list 4), so `deleteBook`'s purge order — which decides what an
interrupted removal leaves (`:409-411`) — does not change. The comment
`:71-77` moves above the derivation and `:88-92` onto the `biographyEntries`
entry, verbatim. The flag is explicit rather than "has a `byBook` index": the
reason a store is cleared with its book is the meaning, not the index.

**The work backup (4m, optional — Q7).** It cannot be the table's order:
`BOOK_STORES` needs `marks` before `cards`, the backup `cards` before `marks`,
and the backup's order is the JSON key order of a file the owner keeps and the
order `importWork` writes in. So: one ordered list in `idbBackup.ts`,
`WORK_STORES = ['cards', 'explanationCards', 'sharhCards', 'marks',
'glossary', 'profiles', 'positions', 'wordGlosses', 'quranVerses', 'hadiths',
'shareRecords'] as const`, driving `exportWork` (fields added in that order
after `version`, `exportedAt`, `referencedBooks`, then `settings` — the same
key order) and `importWork` (the same `write` calls in the same order), and a
type check that its names are exactly `WorkBundle`'s array fields other than
`referencedBooks`. D compares the JSON bytes. A `backup` flag on the table is
rejected: it would be a second source alongside the list, or would force the
order from the table and change the file.

**The transfers.** The whole-tablet transfer is already on the table: it
moves whatever stores the live database has (§2), which the table creates; it
needs no change. The per-book transfer is not a store list: it carries a
book's content through interface methods and leaves out derived data on
purpose (`transfer.ts:22-37`, README "The transfer format"); putting it on
the table would change the file. Neither is edited.

### 5. Comments made untrue

"This is the ONLY file that talks to IndexedDB" (`IdbStorageAdapter.ts:37-39`),
"the single file in the codebase that mentions IndexedDB"
(`StorageAdapter.ts:28-33`), README "`IdbStorageAdapter.ts` is the only file
that uses the IndexedDB API" (`README.md:69`), CLAUDE.md's map, trap 6
("both upgrade branches"), and `.claude/agents/torjuman-storage.md` "Where
things are" become untrue from 4d on. The adapter's header is a moved file's
header (rule 4 (c)) and is corrected in the step that first makes it untrue
(4d); the others in 4n, as Phase 3 did in 3r (Q8). Each moved block keeps its
comments verbatim.

### 6. For FOUND_ISSUES (written in 4a, each with the D scenario that shows it)

- **A. README's work-backup list is short.** `README.md:380-382` lists "cards,
  explanations, marks, notes, glossary, profiles, positions, the gloss cache";
  the backup also carries sharḥ cards, the Qurʾān-verse and ḥadīth caches,
  share records with their keys, and settings (`IdbStorageAdapter.ts:996-1007`).
  Docs.
- **B. RESTRUCTURE §4 T-e says "throw-on-write".** `ShareStorageAdapter`
  ignores writes silently (`ShareStorageAdapter.ts:64-70`, `:77-78`), writes
  three through to the visitor's database (`:330`, `:356`, `:397`), and throws
  only for backup and transfer (`:474-507`). Docs.
- **C. Compiled QUL views are in no work backup.** `qulCompilations` — "the
  one generated thing in the QUL feature" (`StorageAdapter.ts:195`), made by a
  paid model call — is not in `exportWork` (`:984-1008`); it travels only in
  the whole-tablet transfer. For the owner to decide.
- **D. Share records outlive their book.** `ShareRecord` has a `bookId`
  (`types/share.ts:31`) but `deleteBook` leaves the record (`:399-416`).
  Probably right — a published link still works for others and the key exists
  only there — but nothing says so.
- **E. Pre-v7 databases cannot be checked.** The existing-DB branch never adds
  an index to a store that exists; versions 1–6 predate git, so whether their
  twelve base stores had today's indexes is unknown. Every database since v7
  has them.
- **F. The QUL trio shares one guard** (`:233-239`): a database with
  `qulResources` but no `qulEntries` would never get it, and one with
  `qulEntries` but no `qulResources` fails to open. Neither can arise from the
  app's own code; D pins both.
- **G. A work backup is not a snapshot.** `exportWork` reads each store in its
  own transaction (`:996-1006`); a card saved mid-export can be in one store's
  read and its sibling's not. Minor.
- **H. `importWork` ignores `version`** (`:1011-1058`; `WorkBundle.version` is
  `DB_VERSION`, `:989`): a backup from a newer app restores the fields it
  knows. By design (deterministic ids), but unstated.

## Steps

Ordered by risk: the check; declaration moves; the group moves, smallest and
most self-contained first; then the table, fresh branch before upgrade branch;
then the lists. One extraction or move per commit. Commit message:
`Restructure phase 4 step 4x: <what> to <where>`, a summary, a `Checks:`
paragraph.

| Step | What | Files | Checks | Risk |
| --- | --- | --- | --- | --- |
| 4a | **Check D**, baselined on the old code; five breakages proven in a scratch copy; FOUND_ISSUES A–H | new `scripts/verify-storage.mjs`, `scripts/verify-storage-harness.ts`, `package.json` (`verify:storage`), new `docs/refactor/phase4/storage.json`, RESTRUCTURE §5 D row, CLAUDE.md commands row, FOUND_ISSUES, PROGRESS | D (two runs + `TZ`, five negatives); T B unchanged (no `src/` change) | none for the app |
| 4b | `DB_NAME`, history + `DB_VERSION`, `BOOK_STORES`/`BookStore`, `Schema` → `idbSchema.ts` | new file; adapter | T B L D | low |
| 4c | the `upgrade` callback body → `upgradeDatabase` in `idbSchema.ts` | `idbSchema.ts`; adapter `init` | T B L D (every schema scenario) U | low |
| 4d | `PURGE_BATCH`, `purgeIndex` → `idbPurge.ts`; the adapter's header made true | new file; adapter (six callers) | T B L D | low |
| 4e | raw store I/O → `idbTransfer.ts` | new file; adapter | T B L D (whole-tablet scenarios) | low |
| 4f | the user's-work group → `idbWork.ts` | new file; adapter | T B L D **S R** | low |
| 4g | the reference group → `idbReference.ts` | new file; adapter | T B L D | low |
| 4h | the book-content group → `idbLibrary.ts` | new file; adapter | T B L D **S R** | low–medium (search cache, `deleteBook`) |
| 4i | the work backup → `idbBackup.ts` | new file; adapter | T B L D | low |
| 4j | `STORES` table; the fresh branch reads it | `idbSchema.ts` | T B L D **U** | medium |
| 4k | the existing-DB branch reads the same table | `idbSchema.ts` | T B L D **U** | **high** (the upgrade path) |
| 4l | `BOOK_STORES` from the table's `perBook` | `idbSchema.ts` | T B L D | medium |
| 4m | *(Q7)* `WORK_STORES` drives `exportWork`/`importWork` | `idbBackup.ts` | T B L D; SSR build | medium |
| 4n | docs and comments made true; end-of-phase checks | `StorageAdapter.ts:28-33` comment, README `:69` and the storage map line `:44`, CLAUDE.md map, trap 6 and Commands, `.claude/agents/torjuman-storage.md`, RESTRUCTURE status, §2 "Adding a store", §4 T-f, §6 row, PROGRESS result | T B L D U S R Q; SSR build; X | none |

## Per step

**4a — check D.** As Design §1. No `src/` file changes. The record is
written from the second determinism run. PROGRESS records the run time, the
scenario count, the record's size, and that nothing is masked (or exactly what
is). The script's header says what D does not see: the relay and Worker
(`library/relayTransfer.ts` moves the same file's bytes and is not storage),
the share-target handoff (`public/share-target.js`), `roomFor`'s quota
estimate, the tablet's own Chrome. Before the first run, the
`torjuman-storage` agent reads this plan and the harness (Q12). Gap: v1–v6
databases (FOUND_ISSUES E).

**4b — declarations.** Cut `:41-59` and `:71-169` into `idbSchema.ts`, with
`export` added to `DB_NAME`, `DB_VERSION`, `BOOK_STORES`, `BookStore`,
`Schema`; the file imports the 24 types and `idb`'s `DBSchema`. The adapter
imports them. `SETTINGS_KEY` (`:60`), `PURGE_BATCH` and `SearchEntry` stay
until their groups move. The diff shows `DB_VERSION = 11` moved as is. D: all
scenarios (nothing runs differently).

**4c — the upgrade function.** The callback body `:204-334` moves into
`export function upgradeDatabase(db: IDBPDatabase<Schema>, oldVersion:
number): void { … }` verbatim, `return;` included; `init` passes `{ upgrade:
upgradeDatabase }`. U here, because U is a fresh install through the bundle.

**4d — purge.** `PURGE_BATCH` with its comment, `purgeIndex` with its
comment, as `purgeIndex(handle, store, index, key)`. Six call sites in the
class change `this.purgeIndex(` to `purgeIndex(this.handle, `. The adapter's
header (`:37-39`) is rewritten to say the IndexedDB code is this file and the
`idb*.ts` files beside it (rule 4 (c)). D: per-book delete (4,097 rows),
`deleteQulResource`, `deleteNarratorShard`, the `clear*` methods.

**4e — raw store I/O.** The comment `:920-923` and the six members; the
`schemaVersion` getter stays in the class. `putStoreRows` and `clearAllStores`
take the `searchIndex` map. Callers: none outside the class
(`deviceTransfer.ts` goes through the interface). D: every whole-tablet
scenario.

**4f — user's work.** Each method as Design §3; `SETTINGS_KEY` moves with
settings. S and R, because the reader writes positions and cards. D: the
method families for these stores; the backup scenarios still pass through the
class's `this.getSettings()`, now a delegate.

**4g — reference data.** Including `deleteNarratorShard`, which
`deleteBook` (still in the class until 4h) calls as a delegate. D: the method
families, the share-adapter scenario.

**4h — book content.** The biggest move (~270 lines). `loadSearchIndex`,
both searches, `putBlocks`, `deleteBlocksForPage` and `deleteBook` take the
`searchIndex` map; `deleteBook` imports `deleteNarratorShard` from
`idbReference.ts` and `purgeIndex` from `idbPurge.ts`. The order inside
`deleteBook` is the reviewer's first check. S and R (search, jump, position
restore). D: books, pages, blocks, search, the cache invalidation, per-book
delete, per-book transfer.

**4i — backup.** `exportWork`/`importWork` as functions over `handle` and
`searchIndex`, calling `getSettings`/`putSettings` from `idbWork.ts`. D: the
backup scenarios byte for byte.

**4j — the table, fresh branch.** As Design §2.2–2.3. The fresh branch's
comments move onto the entries verbatim; `upgradeDatabase`'s existing-DB
branch is untouched in this step. D: `fresh` in both halves; U.

**4k — the table, existing-DB branch.** As Design §2.4. The commit message
states the snapshot and the creation-order note. D: every upgrade scenario in
both halves, upgrade rows, both odd databases (the trio's ConstraintError
must still occur), `reopen-v11`; U.

**4l — `BOOK_STORES`.** As Design §4. `tsc` proves `BookStore` is still the
ten-name union (a type assertion in the file); the reviewer compares the
derived order with `:78-94`. D: per-book delete.

**4m — `WORK_STORES`** (only if Q7 says so). As Design §4. Type casts in the
loop get a comment saying why. D: the backup JSON byte for byte, every
restore scenario. The SSR build, since `StorageAdapter.ts`'s types are read by
`verify-parsers.ts`.

**4n — docs.** As Design §5, plus RESTRUCTURE §2's "Adding a store" sentence
made true (one table entry; `Schema` type; `StorageAdapter` and
`ShareStorageAdapter` methods; `perBook` if per book; `WorkBundle` field and
`WORK_STORES` entry if backed up; a `DB_VERSION` bump), and trap 6 pointed at
`idbSchema.ts`. End-of-phase checks: all of T B L D U S R Q, the SSR build,
then X on the whole phase.

## Checks

| Check | When |
| --- | --- |
| T | every step |
| B | every step from 4b; main chunk within ±2 KB per step — the delegates add roughly 1 KB of minified code per group step, which the commit says; no dynamic chunk merged |
| L | every step: 134 edges unchanged; the new files import only `idb`, `lib` and `types`; `--check` holds |
| **D** | built in 4a; **every step from 4b**, identical to `docs/refactor/phase4/storage.json` |
| U | 4c, 4j, 4k (a fresh install through the bundle), 4n |
| S, R | 4f, 4h, 4n |
| Q | 4n (no provider code moves; `verify-requests.ts` uses a stub storage) |
| SSR build of `verify-parsers.ts` | 4m, 4n (it imports `ShareStorageAdapter`, `deviceTransfer` and the `StorageAdapter` type, none of which change before 4m) |
| X (reviewer) | after every commit, before the next step |

**Only the owner can run:**

- **V** `npm run verify` on the PC, once before merging. No module it imports
  changes before 4m; it is owed by RESTRUCTURE §3 rule 9, and covers the
  share adapter and the whole-tablet transfer logic over its fake device.
- **M** on the staged build (`npm run stage`) on the tablet, in Chrome. The
  staging site is a different origin from the deployed app, so it has its own
  empty IndexedDB: opening it runs the new code's **fresh branch** on the
  tablet, and nothing on the deployed app's database is touched unless the
  owner restores into it — **which M never does**.
  1. On the deployed app (old code): Settings → Move to another tablet →
     Save to Downloads (keys unticked). This file is also the owner's safety
     copy.
  2. On the staged build: Receive that file. It must be **accepted** (both
     are schema 11), the summary's counts must match the deployed app's, and
     after restore the library, cards, marks, glossary and Settings must be
     the same.
  3. Open a long book: scroll, search a word, jump to a page, reload — the
     position is restored; open a verse sheet and a narrator card.
  4. Translate one passage, add and delete a mark.
  5. Settings → Work backup: export, then restore it; the counts in the
     message are as before.
  6. Library transfer: export one book, remove it (on staging), import the
     file, open it — verses are marked again.
  7. Remove a different book: it is gone, the others are intact, Settings'
     narrator shard counts are unchanged except that book's Taqrīb shard.
  8. Close and reopen the staged app; everything is still there.
  9. Optional: from staging, Move to another tablet into a second Chrome
     profile or the second tablet (never the deployed app) — accepted.
  The **refusal** of a different schema version cannot be shown on the
  tablet (both builds are 11): D shows it. The upgrade branch cannot run on
  the tablet in this phase either: D shows it. If M fails with D green, the
  difference is between the harness and the bundle on the tablet, and is
  reported, not patched.

## Risks

- **R1. Data loss from a moved body** (a transaction scope, a missing `await
  tx.done`, a search-cache invalidation lost). Bodies move verbatim with one
  token substitution (Design §3), checked by word diff; D records rows after
  every method family; S and R exercise the reader's reads and writes.
- **R2. The two upgrade branches drift apart, or the table drifts from
  today.** D dumps the schema after a fresh install and after five upgrades,
  in the harness and the shipped bundle; `tsc` ties the table to `Schema`.
- **R3. The table's walk skips the QUL trio** (the live-name pitfall, Design
  §2.4). The snapshot; D's `upgrade-v1base` and `upgrade-v7`… scenarios fail
  if `qulEntries` or `qulCompilations` is missing.
- **R4. Creation order in the upgrade changes** (4k). Unobservable by spec;
  D's sorted dump and the odd-database scenarios show the same outcomes.
- **R5. Request or settlement order changes.** Each function issues its first
  request in the same synchronous run (Design §3); delegates keep async/sync
  form; D's `before-init` shows rejection, not throw.
- **R6. `deleteBook` order changes** (4h, 4l), which would change what an
  interrupted removal leaves. Moved verbatim; `BOOK_STORES`' derived order
  equals today's; the reviewer compares.
- **R7. The backup's bytes change** (4i, 4m). D compares `JSON.stringify`
  output byte for byte.
- **R8. `ShareStorageAdapter` falls out of step.** The interface does not
  change; `tsc` (it `implements StorageAdapter`); D's share scenario; V.
- **R9. The whole-tablet refusal changes, or a version slips.** No step edits
  `deviceTransfer.ts` or `DB_VERSION`; D records `schemaVersion`, the refusal
  message and that nothing was written; U's version poll.
- **R10. D is not deterministic** (clocks, `newId`, locale). Pinned in the
  page; two runs and a changed `TZ` in 4a; masks only as Design §1 allows.
- **R11. D checks the harness, the tablet runs the bundle.** The schema half
  runs the bundle; the rest is the same source built by the same Vite; M.
- **R12. A key leaks into a file.** D's containment assertions (Design §1).
- **R13. The phase-3 branch changes under this one.** Merged in, never
  rebased; D, Q and U re-run after such a merge.
- **R14. Load order.** The new modules hold constants and functions only; the
  table is a constant read inside `upgrade`; nothing reads `localStorage` or
  opens the database at a new time.

## Questions

1. **Q1. Check D as designed** — Playwright in Chromium, the bundle for the
   schema and a Vite-built harness of the real modules for the rest, same
   origin, record committed? Recommended: yes. Alternative: `fake-indexeddb`
   6.2.8 (348,645 B unpacked, Apache-2.0, no dependencies) as a dev
   dependency, running D in Node through the SSR build like Q — faster and
   simpler to write, but a new dependency, and it checks a reimplementation of
   IndexedDB rather than Chrome's, which is the one on the tablet.
2. **Q2. Which old databases D upgrades.** Recommended: v7, v8, v10 from git,
   v9 synthesized (v8 + `sharhCards`), a synthetic v1 base that exercises
   every guard, and v11 reopened. Does any device the owner still uses hold
   a database from before v7 (before 2026-08-27)? If so, D cannot reproduce
   it (FOUND_ISSUES E). Alternative: only v10, the previous version — cheaper,
   but exercises only the `shareRecords` guard of the nine.
3. **Q3. The split's form.** Recommended: (a) one class with free functions
   per group and one-line delegates, allowing a fifth adaptation in moved
   code — `this.<member>` becomes a `handle`-first parameter or call (Design
   §3), nothing else. Alternatives: (b) `this`-typed functions as class
   fields (bodies byte-verbatim, unusual pattern, methods become own
   properties); (c) group classes composed by the adapter; (d) no CRUD split —
   only schema, transfer I/O and backup move, the class keeps ~600 lines with
   a reason at its top.
4. **Q4. Names and place.** Recommended: flat files `idbSchema.ts`,
   `idbPurge.ts`, `idbTransfer.ts`, `idbWork.ts`, `idbReference.ts`,
   `idbLibrary.ts`, `idbBackup.ts` in `platform/storage/`, the adapter keeping
   its name and path (no importer changes). Alternative: a subfolder
   `platform/storage/idb/` with the adapter moved into it (one importer,
   `AppContext.tsx:11`, plus comments naming the path).
5. **Q5. The upgrade branch from the table** with a snapshot of the existing
   names and the trio's shared guard kept (`createdWith`), creation order
   inside the upgrade becoming the table's? Recommended: yes — unobservable,
   shown by D. Alternatives: a separate upgrade-order list (a second hand list,
   which is what the phase removes); per-store guards for the trio (changes
   what happens to the two impossible databases of FOUND_ISSUES F — a
   behaviour change, not for this phase).
6. **Q6. `BOOK_STORES` from a `perBook` flag** (same names, same order),
   comments moved verbatim? Recommended: yes. Alternative: keep the hand list
   with a type check that it equals the flagged stores.
7. **Q7. The work backup on one list (4m).** Recommended: yes, an ordered
   `WORK_STORES` in `idbBackup.ts` driving export and import, type-checked
   against `WorkBundle` — not a table flag, since no single order serves both
   it and `BOOK_STORES` (Current state §3). Alternative: leave `exportWork` and
   `importWork` as written after the move (4i); "adding a backed-up store"
   then stays three edits in one file plus the interface.
8. **Q8. Comments that become untrue.** Recommended: the adapter's header in
   4d, where it first becomes untrue (it is the moved file's header); the
   others (`StorageAdapter.ts:28-33`, README `:44`, `:69`, CLAUDE.md, the
   storage agent) in 4n, with PROGRESS noting the interval. Alternative: all
   in the step that makes each untrue.
9. **Q9. D in the deploy workflow?** Recommended: no, like U and Q — it needs
   Chromium and a build, and the owner tags only after a reviewed PR.
   Alternative: add it, making every deploy slower by D's run time.
10. **Q10. FOUND_ISSUES A–H** (Design §6), written in 4a. Recommended: yes,
    all eight, left as they are. Of them, C (compiled QUL views not in the
    work backup) is the one that could lose paid work, and may be worth its
    own change after the phase.
11. **Q11. M as written** — deployed app → staged build through a
    whole-tablet file, never the reverse into the deployed app. Recommended:
    yes. Does the owner have a second Chrome profile or the second tablet for
    the optional step 9?
12. **Q12. Review cadence.** Recommended: the `torjuman-reviewer` after every
    commit, as in Phases 1–3, and the `torjuman-storage` agent reading this
    plan and D's harness before 4a's baseline is committed, as `torjuman-llm`
    did for Q.
13. **Q13. D's record.** Recommended: the whole normalized record,
    `docs/refactor/phase4/storage.json`, full rows for small stores and count,
    ends and SHA-256 for large ones (synthetic, reviewable as a diff).
    Alternative: a SHA-256 per scenario with the dumps in `.verify/`, as U
    does — smaller, but a failure then needs a base dump to explain itself.

## Owner's answers


**All thirteen as recommended** ("all as recommended, go ahead",
2026-11-16): check D in Chromium with no new dependency (Q1); upgrades from
v7, v8, v10 from git, v9 synthesized, a synthetic v1 base and a v11 reopen
(Q2) — the owner named no device with a pre-v7 database, so none is assumed
and FOUND_ISSUES E records the gap; one class with free functions per group
and the fifth adaptation (Q3); flat `idb*.ts` files in `platform/storage/`
(Q4); the upgrade branch from the table with a snapshot and the trio's
shared guard kept (Q5); `BOOK_STORES` from a `perBook` flag (Q6); an ordered
`WORK_STORES` list for the backup in 4m (Q7); the adapter's header in 4d,
the other comments in 4n (Q8); D out of the deploy workflow (Q9);
FOUND_ISSUES A–H written in 4a and left (Q10); M as written, deployed app →
staged build only — the owner named no second profile or tablet, so M's
optional step 9 is left out unless the owner offers one (Q11); the reviewer
after every commit and `torjuman-storage` reading this plan and D's harness
before 4a's baseline is committed (Q12); D's whole normalized record
committed as `docs/refactor/phase4/storage.json` (Q13).

## Corrections found in review

Where the plan above turned out wrong or short, as the step reviews found it.
The text above is left as approved; each step's PROGRESS entry has the detail.

1. **The handle fetcher (4e).** Design §3 has each moved function take the
   handle. Ten methods return before touching the database, so they resolve
   before `init`, and a delegate that read `this.handle` to pass it would make
   them reject. From 4e each function takes a fetcher, `() => IDBPDatabase`.
   Recorded in the amendment under Design §3.
2. **When the comments became untrue (4c, not 4d).** Design §5 and Q8 date
   the adapter's "ONLY file that talks to IndexedDB" to 4d. It was untrue from
   4c, when `upgradeDatabase` (which creates and deletes stores) moved to
   `idbSchema.ts`; so were the D harness's header and CLAUDE.md's Never line
   and trap 6. Nothing was misled meanwhile, since `init` names
   `upgradeDatabase`.
3. **The class's size after 4i.** Design §3 estimated ~330 lines. It was 557
   at 4i (562 at the end of the phase, after 4n added the reason below): 83
   one-line delegates of about four lines each (signature, `return`,
   brace, blank) and about 125 lines of imports naming every type and
   function. RESTRUCTURE §2 asks for a reason at the top of a file over ~500
   lines; the adapter's header gives it (4n).
4. **The table's shape (4j, 4l).** Three departures from Design §2.2's
   sketch. `IndexSpec.keyPath` is `string | string[]`, not `readonly`, since
   `idb`'s `createIndex` takes a mutable array. Stores are created by a
   generic `createStore(db, name)` that reads `STORES[name]` itself, because
   passing `STORES[name]` for a union of names does not type-check. And the
   literal is `TABLE … satisfies …`, exported as `STORES` with the mapped
   type: `BookStore` needs the literal `perBook: true` entries, the walks need
   each entry as its own store's spec. `perBook` is typed so that it is an
   error on a store without a `byBook` index, a tightening of the sketch.
5. **`onUpgrade` and `createdWith` were born at 4j**, a step before 4k read
   them, so 4j's D could not check them. The 4j review named the two values D
   still cannot see (an `assumed` store marked `if-missing`; `createdWith`
   dropped from `qulCompilations` alone). The second was closed by a third odd
   database, v10 without `qulCompilations`; the first is harmless on every
   reachable database and stays a reading check. A review expected v1base to
   expose the second as well; with the snapshot it does not.
6. **Adding a per-book store is three edits**, not one: the `perBook` flag,
   the `SameUnion` assertion under `BOOK_STORES`, and D's
   `EXPECTED_BOOK_STORES` (4l). The assertion keeps `BookStore` the ten
   literal names; D's list catches a reordered table, which neither `tsc`
   nor the record sees (R6). RESTRUCTURE §2 now names all three.
7. **Check L's wording.** "The new files import only `idb`, `lib` and
   `types`": they also import each other inside `platform/storage`
   (`idbLibrary` → `idbReference`, `idbBackup` → `idbWork` and others), which
   adds no directory edge. The directory graph kept its 134 edges.
8. **D's assertions keyed on scenario ids.** A renamed scenario would have
   dropped the assertions read from its outputs without failing. Fixed in 4m
   for `BOOK_STORES` and in 4n for the rest (`KEYED_ASSERTIONS`).
