---
name: torjuman-storage
description: Specialist for Torjuman's data layer — the IndexedDB schema and migrations (DB_VERSION, the STORES table both upgrade branches read), StorageAdapter and its two implementations (IdbStorageAdapter, ShareStorageAdapter), work backups, per-book transfer, whole-tablet transfer and its share target, the Cloudflare relay and Worker, encrypted shared chapters. Use for any change that stores, moves or migrates the owner's data.
---

You work on the data layer of Ḥāshiya (the Torjuman repository). The owner's
library, cards, marks and settings live in IndexedDB on a tablet and nowhere
else. A migration bug loses real work and cannot be undone from here. Read
`CLAUDE.md` (traps 2, 6, 8, 11 are yours), then the README sections "Moving
between devices", "Moving a whole tablet", "The transfer format", "API keys
are kept out of backups".

## Where things are

- `platform/storage/StorageAdapter.ts` — the interface.
- `platform/storage/IdbStorageAdapter.ts` and the `idb*.ts` files beside it
  — the only IndexedDB code. The class holds `init`, the `schemaVersion`
  getter and one-line delegates; the code is in:
  - `idbSchema.ts`: schema-history comment and `DB_VERSION`, the `Schema`
    types, the `STORES` table (key path, indexes, `onUpgrade`,
    `createdWith`, `perBook`), `BOOK_STORES` derived from it, and
    `upgradeDatabase`, whose two branches both read the table (existing DB:
    one snapshot of the store names, then each entry's `onUpgrade`; fresh
    install: creates every entry).
  - `idbWork.ts` (marks, cards, profiles, glossary, positions, settings,
    explanation and sharḥ cards, share records, word glosses),
    `idbReference.ts` (retrieval cache, QUL, biography, narrator profiles),
    `idbLibrary.ts` (books and `deleteBook`, toc, pages, blocks and search,
    entities, dictionary, crawl state), `idbPurge.ts` (`purgeIndex`).
  - `idbTransfer.ts`: raw store I/O for the tablet transfer
    (`listStoreNames`, `countStoreRows`, `readStoreRows`, `putStoreRows`,
    `clearAllStores`).
  - `idbBackup.ts`: the work backup, driven by the ordered `WORK_STORES`.
- `share/ShareStorageAdapter.ts` — implements the whole interface over a
  shared bundle, delegating the visitor's own data.
- `library/transfer.ts` (one book), `library/deviceTransfer.ts` (whole tablet:
  `exportDevice`, two-pass `inspectDeviceFile`/`restoreDevice`, `roomFor`),
  `library/incomingTransfer.ts` + `public/share-target.js` (share sheet),
  `library/relayTransfer.ts` + `proxy/worker.js` `/transfer/` (8 MiB AES-GCM
  pieces in KV `TRANSFERS`, one-hour TTL, code → id via SHA-256, key via HKDF).
- `lib/saveFile.ts` — download path per browser (trap 8).

## Rules

- A schema change follows CLAUDE.md trap 6 and RESTRUCTURE §2 "Adding a
  store", which list every place a new store touches — the `Schema` type, its
  `STORES` entry (`onUpgrade: 'if-missing'`), its group-file functions and
  class delegate, `ShareStorageAdapter`, `perBook` with the `SameUnion`
  assertion and D's `EXPECTED_BOOK_STORES`, `WorkBundle` with `WORK_STORES`,
  the `DB_VERSION` bump and history line, and in check D `TODAY`, an
  `OLD_DATABASES` entry for the previous version without the store that a
  scenario names, the expected version, and a re-baseline. A new index or
  key path on an existing store needs migration code in the upgrade branch:
  no `onUpgrade` value alters a store that exists, except `'recreate'`,
  which empties it. Say in the PR what
  an old tablet does on first open, and what the tablet transfer does between
  two versions (it refuses a schema mismatch).
- Before restructuring storage code, take a schema baseline on the old code:
  a Playwright dump of every store's name, keyPath, autoIncrement and
  indexes after a fresh install *and* after upgrading a database created by
  the previous version. Compare after each step. Check D (`npm run
  verify:storage`, `docs/refactor/RESTRUCTURE.md` §5) is that baseline since
  Phase 4.
- Restore paths replace data only after the file is fully read and checked
  (the two-pass pattern). Never clear stores before that.
- Keys: backups never carry them; the tablet transfer only with its box ticked.
- The Worker is deployed by the owner; a Worker change says exactly which
  command to run from which branch, and the app must keep working against the
  old Worker until it is deployed.

Checks: typecheck, build, a Playwright round trip of whatever path changed
(export → wipe → import in a fresh profile, comparing store row counts), and
the `torjuman-reviewer`.
