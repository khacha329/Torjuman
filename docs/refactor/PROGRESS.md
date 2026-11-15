# Restructure progress

What has been done, what was measured, and what is open. Newest phase last.
Plan and rules: [`RESTRUCTURE.md`](RESTRUCTURE.md).

## Current state: Phase 0 in PR khacha329/Torjuman#8; Phase 1 in progress on `claude/restructure-phase-1`

## Phase 0: rules, agents, baselines

| Step | State | Commit |
| --- | --- | --- |
| 0a. `CLAUDE.md`, `.claude/agents/` (planner, reviewer, verifier, llm, reader, storage) | done | this branch |
| 0b. `scripts/check-layers.mjs` + `npm run layers`, `docs/refactor/layers.json` (no rules yet) | done | this branch |
| 0c. Baselines T B L S R on `56a412c` | done; **V waiting on the owner** | this branch |
| 0d. README "How it fits together" corrected (docs only) | done | this branch |
| 0e. Phase 1 plan written | done; **approved 2026-11-15** (answers in the plan) | this branch |

### Baselines, measured 2026-11-15 on `56a412c` (`main`, v0.6.14), cloud container

- **T** `npm run typecheck`: exit 0.
- **B** `npm run build`: exit 0. `dist/assets`:

  | Asset | Bytes |
  | --- | --- |
  | `index-*.js` (main chunk) | 791,844 |
  | `index-*.css` | 48,512 |
  | `transformers.web-*.js` (dynamic) | 549,139 |
  | `sql-wasm-browser-*.js` (dynamic) | 40,539 |
  | `ort-wasm-simd-threaded.asyncify-*.wasm` | 23,567,050 |
  | `sql-wasm-*.wasm` | 658,410 |
  | `workbox-window.prod.es5-*.js` | 5,748 |
  | `node.browser-*.js` | 1,883 |
  | `sql-wasm-*.js` | 63 |
  | `__vite-browser-external-*.js` | 33 |

  The build warns that the main chunk is over 500 kB and that
  `@anthropic-ai/sdk` imports `node:fs`/`node:path` (externalized). Both are
  pre-existing and harmless; noted, not changed.
- **L** `npm run layers` ([`phase0/layers.txt`](phase0/layers.txt)): 141 files,
  122 directory edges, **13 directories in one cycle** (+ `ui`↔`ui/reader` as a
  second component of 2), **7 mutual pairs**, **1 file-level cycle**
  (`types.ts` ↔ `translation/TranslationProvider.ts`).
- **S** `npm run verify:selection`: PASS 30/30.
- **R** `npm run verify:reader`: PASS 28/28. Performance report:
  - landscape 960×600: 240,000 px in 33.3 s, 1,905 DOM nodes, 404 blocks
    mounted, 0 long tasks.
  - portrait 600×960: 175,800 px in 24.4 s, 1,904 DOM nodes, 406 blocks
    mounted, 0 long tasks.
- **V** `npm run verify`: not runnable here — the first 18 checks pass, then it
  stops at `ENOENT fixtures/book-9260.html`, as expected without the
  gitignored data. **The owner's count on their PC is the baseline**; record
  it here.

## Phase 1: seams (in progress, branch `claude/restructure-phase-1`)

Plan: [`plans/phase1-seams.md`](plans/phase1-seams.md), approved 2026-11-15.

| Step | State | Commit |
| --- | --- | --- |
| 1a. Provider-id types → `types.ts`; `isCloudProvider` → `lib/providers.ts` | T B L pass; review PASS WITH NOTES | `19a4267` |
| harness: `scripts/compare-bundles.mjs` (check B, identical JS) | baselined on `19a4267` | `04604c9` |
| 1b. Narrator profile types → `types.ts` | T B L pass; review FAIL (import order) → fixed in the review-notes commit | `6a99c2e` |
| review notes: harness and 1b | applied | `7ca8087` |
| 1c. `app/retrievalLog.ts` → `services/retrievalLog.ts`; workflow list | T B L pass; review PASS WITH NOTES | `902758d` |
| review notes: 7ca8087 and 1c | applied | `fd6c5e4`, `ee119ca` |
| 1d. `app/activity.ts` → `services/activity.ts` | T B L pass; V owed; review PASS WITH NOTES | `2231573` |
| review notes: 1d | applied | `45bedbb` |
| 1e. `app/secrets.ts` → `services/secrets.ts`; services and domain rules | T B L pass; review PASS WITH NOTES | `16e16a3` |
| review notes: 1e | applied | `ce1aefa` |
| 1f. `catalog/useCatalogImport.ts` → `ui/useCatalogImport.ts` | T B L pass; review PASS | `394c3ea` |

**Step 1a, measured 2026-11-15**
- Moved verbatim from `translation/TranslationProvider.ts` to `types.ts`, in
  the place of its import block: `ProviderId` and `CloudProviderId` (with their
  comments), `TranslationUsage`, `TranslationErrorKind` (with its comment). The
  re-export `export type { ProviderId, TranslationUsage };` is deleted, as the
  plan names. `isCloudProvider` moved verbatim to the new `lib/providers.ts`.
- Importers switched (11 files): `models.ts`, `prompt.ts`, `explain.ts`,
  `registry.ts`, both providers, `qul/compile.ts`, `app/secrets.ts`,
  `EntitySheet.tsx`, `SettingsScreen.tsx`, `OnboardingScreen.tsx`. No script
  imports any of the five names.
- **T** exit 0. **B** exit 0; main chunk 791,844 B (baseline 791,844, hash
  changed); dynamic chunks unchanged. **L**: 142 files, 123 edges; file-level
  cycles 1 → **0**; `types` → nothing; new edges `lib → types` (type) and
  `app → lib` (secrets → `lib/providers`), both expected; mutual pairs 7 → 6.
  Rules added: `types` imports nothing; `lib` imports only `types`. All hold.

- **Review 1a: PASS WITH NOTES**, nothing to fix. Notes: `registry.ts:1` keeps
  `import { type TranslationProvider }` (the minimal edit; under
  `verbatimModuleSyntax` it keeps the old side-effect import), and the moved
  `ProviderId` comment says "see registry.ts" without a directory. Both left
  as they are: verbatim.

**Harness, 2026-11-15.** Check B's "byte-identical JS" rule could not be run
with `cmp`: two builds of the same source differ in the build time (a
millisecond ISO timestamp, twice) and in imported chunks' hashed names.
`scripts/compare-bundles.mjs` masks those two. Baseline on `19a4267`: two
builds identical, exit 0; a one-character edit reported, exit 1.

**Step 1b, measured 2026-11-15**
- Moved verbatim from `biography/narratorProfile.ts` to `types.ts`, before
  `AppSettings` (after `BiographyEntry`, so step 1m takes them into
  `types/biography.ts` together): `FieldSource`, `SourcedValue`,
  `ScholarStatement`, `NarratorProfile`, `StoredNarratorProfile`, with their
  comments. `narratorProfile.ts` keeps its header comment, `FIELD_LABELS`,
  `emptyProfile`, `mergeProfiles`, `hasContent`, and imports the three types
  it uses back from `types`.
- **Not verbatim:** a two-line comment above the moved group in `types.ts`
  pointing to `narratorProfile.ts`'s header, which explains why every field
  is nullable and carries its source — the moved types would otherwise lose
  that explanation. New text, claimed here.
- Importers switched (9): `biography/itqan.ts`, `taqrib.ts`,
  `narratorService.ts`, `platform/storage/StorageAdapter.ts`,
  `IdbStorageAdapter.ts`, `share/bundle.ts`, `buildBundle.ts`,
  `ShareStorageAdapter.ts`, `ui/reader/NarratorCard.tsx`.
  `scripts/verify-parsers.ts:3963` imports only `mergeProfiles` and
  `hasContent`, which stay — unchanged.
- **T** exit 0. **B** exit 0; `compare-bundles` 19a4267 → 1b: every file
  identical. **L**: 142 files, 121 edges (−2: `platform/storage → biography`,
  `share → biography`); directories in a cycle 13 → 11; mutual pairs 6 → 5
  (`biography ↔ platform/storage` gone). Rule added: `platform/.*` imports
  only `lib` and `types`. All hold.

- **Review harness: PASS WITH NOTES.** Applied: two files sharing an
  unhashed name now count as a difference instead of one being dropped; the
  chunk-hash mask no longer matches inside `.json` names
  (`ar-tafsir-muyassar.json`); the header says the masking holds for local
  builds (on CI the version also carries the commit). The PROGRESS row came
  one commit late; noted.
- **Review 1b: FAIL** on rules, not code (JS identical). The import merge
  re-sorted the specifier lists in `StorageAdapter.ts` and
  `IdbStorageAdapter.ts` — unmoved code reformatted, which §3 rule 2 forbids.
  Fixed in the review-notes commit: the original order restored, with
  `StoredNarratorProfile` added at the end. From now on merged specifiers are
  appended, never re-sorted. Also applied: the new comment no longer says
  `narratorProfile.ts` "builds them" (`taqrib.ts`/`itqan.ts` parse them); the
  plan's wording follows RESTRUCTURE ("identical JS" via compare-bundles), and
  Q1's text is restored to what was asked.

**Step 1c, measured 2026-11-15**
- `git mv src/app/retrievalLog.ts src/services/retrievalLog.ts`; the file is
  byte-identical (it imports nothing). Nine importers: the specifier changes
  from `…/app/retrievalLog` to `…/services/retrievalLog` and nothing else —
  `biography/service.ts`, `narratorService.ts`, `retrieval/sharh.ts`,
  `dorar.ts`, `quran.ts`, `qul/seed.ts`, `quran/quranIndex.ts`,
  `ui/settings/RetrievalSection.tsx`, `BuildSection.tsx`. No script imports it.
- `deploy.yml`, "Check the source tree arrived intact": the list gains
  `services` (trap T-b) and `biography`, `share` (Q4, FOUND_ISSUES 1). Checked
  with `bash -n` on the step's script and against `ls src`: every listed
  directory exists, and every directory under `src/` is listed.
- Left for 1o: `.claude/agents/torjuman-planner.md` and the maps in CLAUDE.md
  and README still say `app/` holds the retrieval log.
- **T** exit 0. **B** exit 0; `compare-bundles` 7ca8087 → 1c: every JS file
  identical. **L**: 122 edges; directories in a cycle 11 → **6**; mutual pairs
  5 → **3** (`app ↔ qul`, `app ↔ retrieval` gone). Rules hold. (The
  `services` rule is added in 1e, when `secrets` has arrived, as the plan
  says.)

- **Reviews of 7ca8087 and 1c: PASS WITH NOTES**, nothing to fix before 1d.
  Applied in `fd6c5e4` and `ee119ca`: compare-bundles' header quotes RESTRUCTURE's
  rule correctly; FOUND_ISSUES 1 reflowed; CLAUDE.md trap 1 and RESTRUCTURE
  T-b no longer say `biography`/`share` are missing; plan step 1o names the
  planner agent and RESTRUCTURE §1's pointers.

**Step 1d, measured 2026-11-15**
- `git mv src/app/activity.ts src/services/activity.ts`, byte-identical (it
  imports nothing). Importers, specifier only: `catalog/importBatch.ts`,
  `ui/reader/useBatchTranslate.ts`, `ui/reader/useTranslator.ts`,
  `app/pwaUpdate.ts` (`./activity` → `../services/activity`), and
  **`scripts/verify-parsers.ts:2820, 2846`** (two dynamic imports).
- The script is not typechecked and cannot run here, but its SSR build
  (`vite build --ssr scripts/verify-parsers.ts`, the first half of
  `npm run verify`) resolves and inlines both dynamic imports: exit 0. **V is
  owed** to run the checks themselves.
- **T** exit 0. **B** exit 0; `compare-bundles` 1c → 1d: every JS file
  identical. **L**: 125 edges (+3: `app`, `catalog`, `ui/reader` → `services`;
  `catalog → app` stays until 1f); directories in a cycle 6; mutual pairs 3.
  Rules hold.

- **Reviews of the notes commits and 1d: PASS WITH NOTES.** The SSR build is
  a real resolution check: Rollup raises "unresolved import" for a relative
  specifier, dynamic ones included. Notes: the PROGRESS hash fixed; 1o also
  covers RESTRUCTURE T-a. Left verbatim: `activity.ts`'s header calls the batch
  "an app-level service", though it lives in `catalog/` — true before the move
  too.

**Step 1e, measured 2026-11-15**
- `git mv src/app/secrets.ts src/services/secrets.ts`, byte-identical: its two
  imports (`../lib/providers`, `../types`) are the same relative paths from
  `services/`. Importers, specifier only (9): `App.tsx`, `ui/OnboardingScreen.tsx`,
  `library/deviceTransfer.ts`, `ui/reader/EntitySheet.tsx`,
  `useExplanations.ts`, `useTranslator.ts`, `ReaderScreen.tsx`,
  `ui/settings/SettingsScreen.tsx`, `HadithSourceSection.tsx`. No script imports it.
- `lib/providers.ts`'s header (1a's new text) now names `services/secrets.ts`,
  reflowed. A verbatim comment in `types.ts` (~826) still says
  `app/secrets.ts`; the plan's step 1o now covers stale path pointers in
  comments, so it is left here.
- Rules added: `services` imports only `lib`, `types`; the domain directories
  (all but `catalog`, which joins in 1f) import neither `app` nor `ui.*`.
- **T** exit 0. **B** exit 0; `compare-bundles` 1d → 1e: every JS file
  identical. **L**: 128 edges; directories in a cycle 6; mutual pairs 3; 5 rules
  hold.

- **Reviews of 45bedbb (PASS) and 1e (PASS WITH NOTES).** Edges vs 1d: +5
  (`(root)`, `ui`, `library` → `services`; `services` → `lib`, `types`), −2
  (`library → app`, the target; `app → lib`, which existed only through
  `secrets`): 125 → 128. Applied: the plan's simulation sentence about
  `services` corrected; 1o also covers README's prose mention and the llm
  agent. Two pre-existing comment errors → FOUND_ISSUES 5. Open question for
  the owner at the end of the phase, not a defect: with `secrets` in layer 1,
  "only `secrets.ts` reads keys" is held by convention, not by a rule — a
  `layers.json` rule could limit who imports it (see FOUND_ISSUES 5).

**Step 1f, measured 2026-11-15**
- `git mv src/catalog/useCatalogImport.ts src/ui/useCatalogImport.ts` (a React
  hook over `useApp`, which does not belong in a domain directory). Inside it,
  the two specifiers of `./importBatch` (one `import type`, one
  `export type … from`) become `../catalog/importBatch`; `../app/AppContext` is
  unchanged. Importers, specifier only: `ui/LibraryScreen.tsx`,
  `ui/CatalogScreen.tsx` (`../catalog/useCatalogImport` → `./useCatalogImport`).
  No script imports it. Rename detected (2 lines changed).
- The domain rule now includes `catalog`.
- **T** exit 0. **B** exit 0; `compare-bundles` 1e → 1f: every JS file
  identical. **L**: 127 edges (−`catalog → app`); directories in a cycle 6 →
  **4**; mutual pairs 3 → **2** (`app ↔ catalog` gone; left:
  `translation ↔ translation/providers` for 1h, `ui ↔ ui/reader` for 1g).
  Rules hold.

- **Reviews of ce1aefa (PASS WITH NOTES: FOUND_ISSUES 5 said five files, it is
  six — fixed) and 1f (PASS).**

## Open

- V baseline count from the owner's PC.
- The owner's list of creed-book features (for the Phase 5b plan).

## Later

- Check D (IndexedDB schema dump) is built in Phase 4 step 0, on the old code.
- A recorded-request check for Phase 3 (the exact request bodies each
  provider sends for a fixed selection), built on the old code first.
