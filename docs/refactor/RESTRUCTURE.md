# Restructuring Ḥāshiya

Status: Phase 0 in PR khacha329/Torjuman#8, Phase 1 in PR #9, Phase 2 in PR
#10, Phase 3 on `claude/restructure-phase-3` and Phase 4 on
`claude/restructure-phase-4`, all complete and awaiting the owner's `npm run
verify`, the tablet checks after Phases 2, 3 and 4, and merge. Base commit
`56a412c` (`main`, v0.6.14).

## 1. Why

The app works and is well documented, but adding a feature means touching
places nobody would guess, and an upgrade (a model, a provider, a schema
version) has to be threaded through files that should not know about it.
Measured on `56a412c` by `npm run layers` (full output in
[`phase0/layers.txt`](phase0/layers.txt)). This section records that starting
point; the paths in it are as they were then. Phase 1 resolved the cycle and
every misplaced file listed below — see [`PROGRESS.md`](PROGRESS.md):

- **13 of the 24 directory units are one dependency cycle**: `app`,
  `biography`, `catalog`, `dictionary`, `ingest`, `platform/storage`, `qul`,
  `quran`, `retrieval`, `shamela`, `translation`, `translation/providers`,
  `types`. Anything in it can, through some path, depend on anything else in
  it, so nothing can be understood, tested or replaced on its own.
- **It hangs on a handful of misplaced files**, not on the design:
  - `app/retrievalLog.ts` and `app/activity.ts` have no imports at all, yet
    live in the composition root. Seven domain files import the retrieval
    log and `catalog/importBatch.ts` imports activity, while the composition
    root imports those modules — which closes the loop.
  - `app/secrets.ts` is imported by `library/deviceTransfer.ts`.
  - `catalog/useCatalogImport.ts` is a React hook over `useApp`, sitting in
    a domain directory.
  - `platform/storage` imports a type from `biography/narratorProfile.ts`.
  - `types.ts` imports three types from `translation/TranslationProvider.ts`,
    which imports `types.ts`: the one file-level cycle.
  - `ui/useLayoutMode.ts` imports `RAIL_WIDTH` from
    `ui/reader/SelectionRail.tsx`, while ten reader files import `ui/`.
- **Provider knowledge is spread out.** "Anthropic or Gemini" is decided in
  `models.ts`, `app/secrets.ts`, Settings, Onboarding, `AppContext`,
  `profiles.ts`, `qul/compile.ts`, `ReaderScreen.tsx`, `useExplanations.ts`
  and `OfflineTranslation.tsx`, besides the registry. The Anthropic
  client and its error mapping are built four times (`AnthropicProvider`,
  `explain.ts`, `gloss.ts`, `qul/compile.ts`), Gemini's twice.
- **Repeated pieces**: gzip in three places, the progress bar nine times, the
  settings-section shell in fifteen places serving all 21 sections, `delay`
  twice, byte sizes formatted five ways (only two of them alike), the proxy
  base URL computed twice. (Counts corrected in Phase 2 planning.)
- **Thirteen files over 450 lines**, the biggest carrying several jobs each:
  `ReaderScreen.tsx` (1,348), `IdbStorageAdapter.ts` (1,059), `types.ts`
  (899), `EntitySheet.tsx` (756), `BlockList.tsx` (728), `SettingsScreen.tsx`
  (610), `ShareStorageAdapter.ts` (547), `quranIndex.ts` (544),
  `TranslationCardView.tsx` (539), `qul/read.ts` (515), `deviceTransfer.ts`
  (494), `detectEntities.ts` (479), `useTranslator.ts` (466).
- **The IndexedDB schema is written twice**, once per upgrade branch, and the
  two must agree by hand.

## 2. What "done" looks like

Layers, bottom to top. Each may import only from layers below it.

| Layer | Directories | Knows about |
| --- | --- | --- |
| 0 | `lib/`, `types/` | nothing (types only from `types/`) |
| 1 | `platform/http`, `platform/storage`, `services/` (new: retrieval log, activity, secrets) | layer 0 |
| 2 | domain: `shamela`, `ingest`, `dictionary`, `quran`, `biography`, `retrieval`, `qul`, `translation` (+ `providers`, `offline`), `library`, `share`, `catalog` | layers 0–1, and each other without cycles |
| 3 | `app/` (composition root, router, React context) | layers 0–2 |
| 4 | `ui/` (`ui/kit` for shared primitives, then screens) | layers 0–3 |

And concretely:

- `npm run layers` reports **no directory cycle** and **no mutual pair**, and
  `docs/refactor/layers.json` holds a rule for each layer boundary, checked
  with `--check`.
- **Adding a translation provider** is one file in `translation/providers/`
  (the provider object describes itself: name, key link and placeholder,
  models offered and known, default), one registry entry, its id in
  `ProviderId`, and whatever `tsc` then reports — each `Record<CloudProviderId,
  …>` missing a key (`PROVIDER_KEYS` in `services/secrets.ts`, compile's
  `COMPILERS`), and the reader's `Record<ProviderId, number>` request counts
  in `useTranslator.ts`. Onboarding's copy and toggle, and the reader's
  per-provider session totals and banner, are copy written per provider.
  (Reworded at the end of Phase 3, the owner's Q16: `ProviderId` is a type,
  so "one file plus one entry" cannot hold literally.)
- **Adding a store** is one entry in one schema table that both upgrade paths
  read: `STORES` in `platform/storage/idbSchema.ts`, giving the store's key
  path, its indexes, how an existing database gets it (`onUpgrade`, and
  `createdWith` for a store created together with another) and `perBook`
  when its rows belong to a book. The entry is not the whole change, because
  a store has methods and the database has a version. A new store also
  needs its `Schema` type; its `StorageAdapter` methods, written as functions
  in its group's `idb*.ts` file with a one-line delegate in
  `IdbStorageAdapter`, and in `ShareStorageAdapter`, which implements the
  whole interface; if it is per book, the `SameUnion` assertion under
  `BOOK_STORES` and check D's `EXPECTED_BOOK_STORES`; if it is backed up, its
  `WorkBundle` field and a `WORK_STORES` entry in `idbBackup.ts` (`tsc` fails
  until the two agree); a `DB_VERSION` bump with a line in the schema
  history (CLAUDE.md's Never and trap 6); and in check D
  (`scripts/verify-storage.mjs`), the new store in `TODAY` and named in the
  `without(...)` lists of the older entries, an `OLD_DATABASES` entry for
  the previous version *without* it — named in `BUNDLE_SCENARIOS` and
  `HARNESS_SCENARIOS`, since D builds only the databases a scenario names —
  a reopen scenario at the new version, and the version D expects moved,
  then a re-baseline after checking that the diff is the new store and
  nothing else. The entry must be `onUpgrade: 'if-missing'`, the one value
  that adds a store to an existing tablet and keeps its data (`'recreate'`
  also creates a missing store, but empties it on every upgrade). Without
  the old-version database D cannot see a store wrongly marked `'assumed'`:
  every database it builds would already contain it.
  **Changing an existing store** (a new index, a different key path) is not
  a table edit at all: `upgradeDatabase` never alters a store that exists,
  except `'recreate'`, which empties it. A table edit alone gives fresh
  installs the change and every existing tablet nothing; it needs its own
  migration code in the upgrade branch (FOUND_ISSUES 20). (Spelled out at
  the end of Phase 4: "one entry" holds for a new store's schema, not for
  its methods, its version, or a change to a store that already exists.)
- **Adding a settings section** is one component using the shared shell, plus
  one line in the list.
- No source file over ~500 lines without a reason written at its top.
- `docs/EXTENDING.md` says, for each kind of change, which files it touches.

Nothing the owner sees changes. Not one card, mark, setting, cache key, store
or pixel.

## 3. Rules for every step

1. **A phase starts only after the owner has approved its written plan** in
   `plans/`, with the answers to its questions recorded in the plan.
2. **Structure only.** A refactor commit moves, splits, renames or
   deduplicates. It does not fix bugs, change behaviour, change output, or
   reformat code it does not move. Bugs found on the way go in
   [`FOUND_ISSUES.md`](FOUND_ISSUES.md) and are left.
3. **One move per commit**, small enough that the reviewer can verify it from
   the diff. Commit message: `Restructure phase N step Nx: <what> to <where>`,
   then a summary and a `Checks:` paragraph.
4. **Allowed adaptations in moved code**, and nothing else:
   (a) import paths; (b) `export` added to a symbol another file now needs;
   (c) a moved file's header comment, which must be true;
   (d) a re-export left at the old path only where the plan names it, with a
   comment saying which step removes it. Statements are not reordered;
   strings, comments and names do not change.
5. **Every importer is updated**, including `scripts/*.ts` and `*.mjs`, which
   import from `src/` directly and are not covered by `tsc -b`.
6. **Module load order is behaviour.** A move that changes when a module with
   side effects is first evaluated (singletons, `localStorage` reads,
   registrations) must say so and be checked.
7. **A new check takes its baseline on the old code**, in its own commit,
   before the step it guards.
8. After each commit: the checks the plan names (§5), a row and a "measured"
   section in [`PROGRESS.md`](PROGRESS.md), then the `torjuman-reviewer`.
   **The next step does not start until the review is in.** Review notes are
   applied in a separate commit; pre-existing bugs go to FOUND_ISSUES.
9. One branch and one PR per phase (`claude/restructure-phase-N`). The owner
   merges, runs `npm run verify` on their PC before merging, and tries a staged
   build on the tablet (`npm run stage`) at the end of any phase that touches
   UI or storage.
10. Nothing is deleted without the owner's OK. Nothing is pushed to `main`
    directly. No tags.

## 4. Traps

The project-wide traps are in `CLAUDE.md`. These are the ones a restructure
walks into:

- **T-a. The scripts import `src/` by path** — about sixty modules across
  `scripts/verify-parsers.ts`, `build-catalog.ts` and `build-glossary.ts`,
  `services/activity` and `ui/useLayoutMode` among them (both moved there in
  Phase 1), some by dynamic `await import(…)`. Moving one of them breaks
  `npm run verify`, which only runs on the owner's PC; `tsc -b` will not
  notice. Grep `scripts/` on every move; the SSR build half of
  `npm run verify` (`vite build --ssr scripts/verify-parsers.ts`) runs here
  and fails on an unresolved path.
- **T-b. The deploy workflow lists `src/` directories by name.** A new
  top-level directory (`services/`, `types/`) is added to that list in the step
  that creates it. (`biography` and `share` were missing until Phase 1
  step 1c: FOUND_ISSUES 1.)
- **T-c. Singletons.** `retrievalLog`, `activity` and `secrets` are module
  singletons. A copy left behind at the old path would make two of them;
  moves are whole-file moves with every importer updated, never a duplicate.
- **T-d. The types are imported by nearly every file.** Splitting them went
  through a barrel (`types/index.ts` re-exporting `types/*.ts`, Phase 1 steps
  1i–1m), so no importer changed; group files import each other, never the
  barrel.
- **T-e. `ShareStorageAdapter` implements the whole `StorageAdapter`.** Any
  interface reshuffle has to keep it compiling *and* keep its throw-on-write
  behaviour.
- **T-f. The IndexedDB upgrade path runs once per tablet.** A storage step
  that gets it wrong is not caught until the owner opens the app, and then
  it is their data. Check D (§5) exists for this and is built before Phase 4.
  Since Phase 4 both branches of `upgradeDatabase` (`idbSchema.ts`) read the
  one `STORES` table, so they cannot disagree about which stores exist or
  how a *new* store is built. They can still differ in two ways: a store's
  `onUpgrade` or `createdWith` can be wrong (D's upgrade and odd-database
  scenarios show it, given an old-version database without the store), and
  a change to an existing store's indexes or key path reaches fresh installs
  only, since the upgrade branch never alters a store that exists (§2).
- **T-g. Reader estimates are tuned to CSS.** Moving reader styles or
  components can change margins; `TYPE_CHROME` must follow. Checks S and R.
- **T-h. Bundle chunking.** transformers.js and sql.js are dynamic imports and
  must stay so; a move that pulls either into the main chunk shows up as
  check B growing by hundreds of KB.

## 5. Checks

| Id | What | Pass | Where |
| --- | --- | --- | --- |
| **T** | `npm run typecheck` | exit 0 | here |
| **B** | `npm run build`; sizes of `dist/assets/*`; for a types-only step, `node scripts/compare-bundles.mjs <before> <after>` on copies of `dist/assets` | builds; main chunk within ±2 KB of the previous step unless the step explains it; no dynamic chunk merged in; a types-only step's JS identical once the build time and chunk hashes are masked | here |
| **L** | `npm run layers` (and `--check`) | a move adds no directory edge the plan does not name; the step's target edge is gone; all rules hold | here |
| **S** | `npm run verify:selection` | 30/30 | here |
| **R** | `npm run verify:reader`: the two profiles' 28 scroll checks and performance report, then (from Phase 5 step 5b) the reader's controls, each scenario in a fresh context — Ctrl+`\`, Hide cards and the edge tab, a marker opening the panel or a popover, a card tap, the read-mark ↑ ↓, double-tap, the restore applied once, the divider by mouse; the sheet's handle; and two report lines (the divider by finger, ↓ from a centred mark) | 55/55 (28 + 27); performance report within noise of the baseline; the report lines unchanged | here |
| **V** | `npm run verify` | all pass (owner reports the count) | **owner's PC** |
| **D** | `npm run verify:storage` (`scripts/verify-storage.mjs` and `verify-storage-harness.ts`, from Phase 4 step 4a): in Chromium, the IndexedDB schema after a fresh install and after upgrading each older database it builds (v1 base, v7–v10; v11 reopened; three impossible ones), through the shipped bundle and through a harness of the real storage modules; and, through the harness, every store's rows and every result after each `StorageAdapter` method family, a per-book delete, the work backup, the per-book transfer, the whole-tablet transfer and its refusals, and the share adapter | identical to `docs/refactor/phase4/storage.json`; fake keys only in the whole-tablet file written with them; a restore equals its source; refusals and ignored writes leave the database untouched; `BOOK_STORES` is D's own list, in order; every scenario an assertion reads by id ran | here |
| **U** | `npm run verify:markup` (`scripts/verify-markup.mjs`, from Phase 2): normalized DOM and screenshots of every screen and state that shows a shared UI piece, at 960×600 and 600×960 touch, in a build without and a build with a proxy | every file matches `docs/refactor/phase2/markup.sha256` | here |
| **Q** | `npm run verify:requests` (`scripts/verify-requests.ts`, from Phase 3): every request each provider call site hands to `fetch` (method, URL, headers, body), retries, waits and mapped errors, for fixed inputs and canned responses, plus cache keys and model values | identical to `docs/refactor/phase3/requests.json`; fake keys only in their own header; no `Authorization` | here |
| **M** | the staged build on the tablet: open a book, select across screens, translate, open a verse sheet, Settings, a transfer | the owner says it works | **tablet** |
| **X** | `torjuman-reviewer` on the commit | PASS or PASS WITH NOTES | here |

Baselines for T, B, L, S, R are in `PROGRESS.md`; V's baseline count is
waiting on the owner.

## 6. Phases

Each phase gets its own plan in `plans/`, written by the `torjuman-planner`
and approved by the owner before it starts. Order is by risk: the cheap,
mechanical, high-payoff work first; the owner's data last but one.

| Phase | What | Risk | Checks |
| --- | --- | --- | --- |
| **0** | **Complete (PR #8).** `CLAUDE.md`, the six agents, this plan, `scripts/check-layers.mjs`, baselines, README map corrected | none (no source change) | T B L S R |
| **1** | **Complete.** **Seams**: break the cycle. Move `retrievalLog`, `activity`, `secrets` to `services/`; move the hook out of `catalog/`; move the cross-layer types into `types`; move `RAIL_WIDTH`; move the registry under `providers/`. Split `types.ts` behind a barrel. Add a `layers.json` rule as each boundary becomes true. Plan: [`plans/phase1-seams.md`](plans/phase1-seams.md) | low: whole-file moves and type moves | T B L S R X, V at the end |
| **2** | **Complete.** **Shared pieces**: `lib/gzip`, `lib/delay`, `lib/format`, one proxy base, `ui/kit` (`ProgressBar`, `SettingsSection`, `Button` and the rest of `ui/common`), and the settings sections on the shared shell (21 sections, 15 shells) | low–medium: markup must stay identical | T B L S R X, screenshots before and after |
| **3** | **Complete.** **Provider seams**: one Anthropic client used by all four call sites, with two error mappings (short and full, not merged: Q4); one Gemini model POST; provider descriptors in the registry (placeholder, models offered and known, default) that Settings' key and model fields, Onboarding's key field and the card's model label now read; compile picks a compiler from a `Record<CloudProviderId, …>` table (Q5); Explain and gloss export the provider they run on, so the reader does not name it (Q10). What still names a provider on purpose — compile's table, Explain and gloss (Claude-only), Onboarding's copy and toggle, the session totals, the seeded profile, Offline's "back to Gemini" (Q6), `secrets` (Q8) — is §2 above, the plan's Design §5 and FOUND_ISSUES 4 | medium: cache keys and requests must be byte-identical | T B L Q U S R X; V (cache keys, `maxTokensFor`, prices); M with real keys |
| **4** | **Complete.** **Storage**: check D first (4a); `IdbStorageAdapter`'s code moved into `idb*.ts` files by store group, the class keeping one-line delegates (4b–4i); one `STORES` table that both upgrade branches read (4j, 4k); `BOOK_STORES` from its `perBook` flag (4l); the work backup on one ordered `WORK_STORES` list (4m). Plan: [`plans/phase4-storage.md`](plans/phase4-storage.md) | **high**: the owner's data | D on every step; T B L X; V; M with a copy of the real database |
| **5** | **Big UI files**: `ReaderScreen` into hooks (position, navigation, panel divider, gloss) and parts (header, sheets host); `EntitySheet` into `QuranSheet`, `CompileTab`, `HadithSheet`; `SettingsScreen` inline sections into files; `BlockList` estimates and `settleOn` into a module; `useTranslator` steps into named functions | medium: the reader is the app | S R on every step; T B L X; screenshots; M |
| **6** | **Docs**: `docs/EXTENDING.md` (how to add a provider, a source, a store, a route, a setting, a sheet tab), README map and links, CLAUDE.md map updated | none | X |

### Coming after the restructure: book kinds

The owner's next features add **kinds of book** unlike the ḥadīth collections
the app was built around — first books of creed (ʿaqīdah) — with features of
their own that must not switch on for other kinds, and ḥadīth features that
need not switch on for creed books. Today the only seam for this is
`StructureProfile` (`'generic' | 'hadith-commentary'`, in `types/reader.ts`, used by
the parsers and a few UI files), and ḥadīth assumptions (takhrīj, narrators,
sharḥ, dorar) are wired into the reader directly.

So the phases keep this in view, without building the features early:

- **Phase 1** keeps `StructureProfile` where Phase 1's type split puts it
  (`types/reader.ts`) and changes nothing about it.
- **Phase 2** and **Phase 5** move ḥadīth-only UI (sheet tabs, margin actions,
  card kinds) behind named components, so a kind can leave them out without
  editing the reader.
- **A short Phase 5b** (proposed) turns the profile into **one folder per
  genre**, as the owner suggested: `src/genres/<genre>/` (e.g. `hadith/`,
  `aqidah/`, `generic/`), each holding a descriptor — which structure rules,
  entity detectors, sheet tabs, selection actions and card types the genre
  uses — and the feature modules only that genre needs. Features shared by
  several genres stay in their domain directories and a genre switches them
  on by name. A new genre is then one new folder, with no edits inside the
  reader. The layer rules get one more: no genre folder imports another. Its plan is
  written with the owner's list of creed-book features in hand, so the
  descriptor fits the real features rather than guessed ones.

Phases 2–5 are proposals at this level of detail; each one's plan can change
them, and the owner can drop or reorder any.

## 7. What this does not do

- No new dependency, framework, state library or test runner. The checks stay
  the project's own scripts.
- No rewrite. Code is moved and joined, not reimagined.
- No change to the deploy, the PWA, the proxy or the Worker except the
  workflow's directory list.
- No behaviour fix inside a refactor step — FOUND_ISSUES collects them for
  separate changes.
