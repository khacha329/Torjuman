# Restructuring Ḥāshiya

Status: Phase 0 (this document, the agents, the baselines) — awaiting the
owner's review. Base commit `56a412c` (`main`, v0.6.14).

## 1. Why

The app works and is well documented, but adding a feature means touching
places nobody would guess, and an upgrade (a model, a provider, a schema
version) has to be threaded through files that should not know about it.
Measured on `56a412c` by `npm run layers` (full output in
[`phase0/layers.txt`](phase0/layers.txt)):

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
  `profiles.ts` and `qul/compile.ts`, besides the registry. The Anthropic
  client and its error mapping are built four times (`AnthropicProvider`,
  `explain.ts`, `gloss.ts`, `qul/compile.ts`), Gemini's twice.
- **Repeated pieces**: gzip in three places, the progress bar nine times, the
  settings-section shell in all 16 sections, `delay` and `formatBytes` twice
  each, the proxy base URL computed twice.
- **Eight files over 450 lines** carry several jobs each: `ReaderScreen.tsx`
  (1,348), `IdbStorageAdapter.ts` (1,059), `types.ts` (899), `EntitySheet.tsx`
  (756), `BlockList.tsx` (728), `SettingsScreen.tsx` (610),
  `ShareStorageAdapter.ts` (547), `useTranslator.ts` (466).
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
  plus one registry entry that carries its key field, model list and default.
- **Adding a store** is one entry in one schema table that both upgrade paths
  read.
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
  `scripts/verify-parsers.ts`, `verify-selection.mjs` and the build tools,
  `app/activity` among them. Moving one of them breaks `npm run verify`, which only runs on the
  owner's PC; `tsc -b` will not notice. Grep `scripts/` on every move.
- **T-b. The deploy workflow lists `src/` directories by name.** A new
  top-level directory (`services/`, `types/`) is added to that list in the step
  that creates it. (`biography` and `share` are already missing:
  FOUND_ISSUES 1.)
- **T-c. Singletons.** `retrievalLog`, `activity` and `secrets` are module
  singletons. A copy left behind at the old path would make two of them;
  moves are whole-file moves with every importer updated, never a duplicate.
- **T-d. `types.ts` is imported by nearly every file.** Splitting it goes
  through a barrel (`types.ts` re-exporting from `types/*.ts`) first, so no
  importer has to change in the same step.
- **T-e. `ShareStorageAdapter` implements the whole `StorageAdapter`.** Any
  interface reshuffle has to keep it compiling *and* keep its throw-on-write
  behaviour.
- **T-f. The IndexedDB upgrade path runs once per tablet.** A storage step
  that gets it wrong is not caught until the owner opens the app, and then
  it is their data. Check D (§5) exists for this and is built before Phase 4.
- **T-g. Reader estimates are tuned to CSS.** Moving reader styles or
  components can change margins; `TYPE_CHROME` must follow. Checks S and R.
- **T-h. Bundle chunking.** transformers.js and sql.js are dynamic imports and
  must stay so; a move that pulls either into the main chunk shows up as
  check B growing by hundreds of KB.

## 5. Checks

| Id | What | Pass | Where |
| --- | --- | --- | --- |
| **T** | `npm run typecheck` | exit 0 | here |
| **B** | `npm run build`; sizes of `dist/assets/*` | builds; main chunk within ±2 KB of the previous step unless the step explains it; no dynamic chunk merged in | here |
| **L** | `npm run layers` (and `--check`) | a move adds no directory edge the plan does not name; the step's target edge is gone; all rules hold | here |
| **S** | `npm run verify:selection` | 30/30 | here |
| **R** | `npm run verify:reader` | 28/28; performance report within noise of the baseline | here |
| **V** | `npm run verify` | all pass (owner reports the count) | **owner's PC** |
| **D** | IndexedDB schema dump, fresh install and upgrade from the previous version (built in Phase 4 step 0) | identical to baseline | here |
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
| **0** | `CLAUDE.md`, the six agents, this plan, `scripts/check-layers.mjs`, baselines, README map corrected | none (no source change) | T B L S R |
| **1** | **Seams**: break the cycle. Move `retrievalLog`, `activity`, `secrets` to `services/`; move the hook out of `catalog/`; move the cross-layer types into `types`; move `RAIL_WIDTH`; move the registry under `providers/`. Split `types.ts` behind a barrel. Add a `layers.json` rule as each boundary becomes true. Plan: [`plans/phase1-seams.md`](plans/phase1-seams.md) | low: whole-file moves and type moves | T B L S R X, V at the end |
| **2** | **Shared pieces**: `lib/gzip`, `lib/delay`, `lib/format`, one proxy base, `ui/kit` (`ProgressBar`, `SettingsSection`, `Button` and the rest of `ui/common`), and the 16 settings sections on the shared shell | low–medium: markup must stay identical | T B L S R X, screenshots before and after |
| **3** | **Provider seams**: one Anthropic client and error mapping used by all four call sites; one Gemini call; provider descriptors in the registry (key field, placeholder, models, default) so Settings, Onboarding, secrets and models stop naming providers | medium: cache keys and requests must be byte-identical | T B L X; V (cache keys, `maxTokensFor`); a recorded-request check built first |
| **4** | **Storage**: check D first; one schema table driving both upgrade branches; `IdbStorageAdapter` split by store group; `WorkBundle` and transfers on the same table | **high**: the owner's data | D on every step; T B L X; V; M with a copy of the real database |
| **5** | **Big UI files**: `ReaderScreen` into hooks (position, navigation, panel divider, gloss) and parts (header, sheets host); `EntitySheet` into `QuranSheet`, `CompileTab`, `HadithSheet`; `SettingsScreen` inline sections into files; `BlockList` estimates and `settleOn` into a module; `useTranslator` steps into named functions | medium: the reader is the app | S R on every step; T B L X; screenshots; M |
| **6** | **Docs**: `docs/EXTENDING.md` (how to add a provider, a source, a store, a route, a setting, a sheet tab), README map and links, CLAUDE.md map updated | none | X |

### Coming after the restructure: book kinds

The owner's next features add **kinds of book** unlike the ḥadīth collections
the app was built around — first books of creed (ʿaqīdah) — with features of
their own that must not switch on for other kinds, and ḥadīth features that
need not switch on for creed books. Today the only seam for this is
`StructureProfile` (`'generic' | 'hadith-commentary'`, in `types.ts`, used by
the parsers and a few UI files), and ḥadīth assumptions (takhrīj, narrators,
sharḥ, dorar) are wired into the reader directly.

So the phases keep this in view, without building the features early:

- **Phase 1** keeps `StructureProfile` where Phase 1's type split puts it
  (`types/reader.ts`) and changes nothing about it.
- **Phase 2** and **Phase 5** move ḥadīth-only UI (sheet tabs, margin actions,
  card kinds) behind named components, so a kind can leave them out without
  editing the reader.
- **A short Phase 5b** (proposed) turns the profile into a **book-kind
  descriptor**: one entry per kind saying which parsers' structure rules,
  entity detectors, sheet tabs, selection actions and card types apply. A new
  kind is then one descriptor plus its own feature modules. Its plan is
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
