# Restructure progress

What has been done, what was measured, and what is open. Newest phase last.
Plan and rules: [`RESTRUCTURE.md`](RESTRUCTURE.md).

## Current state: Phases 0–5 complete (PRs khacha329/Torjuman#8, #9, #10, #11, Phase 4's on `claude/restructure-phase-4` and Phase 5's on `claude/restructure-phase-5`), awaiting the owner's `npm run verify`, the tablet checks and merge

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
| review notes: ce1aefa and 1f | applied | `cf5f8c0` |
| 1g. `RAIL_WIDTH` → `ui/useLayoutMode.ts` | T B L S R pass; V owed; review PASS WITH NOTES | `89f6784` |
| 1h. `translation/registry.ts` → `translation/providers/registry.ts` | T B L pass; review PASS WITH NOTES | `ef2e930` |
| 1i. `types.ts` → `types/index.ts` | T B L pass; V owed; review PASS WITH NOTES | `b6794da` |
| 1j. split out `types/reader.ts`, `translation.ts`, `retrieval.ts`, `entities.ts` | T B L pass; V owed; review PASS WITH NOTES | `8d71a48` |
| review notes: 1j | applied | `ac7129e` |
| 1k. split out `types/book.ts`, `types/catalog.ts` | T B L pass; V owed; review PASS | `415066c` |
| 1l. split out `types/cards.ts`, `types/qul.ts` | T B L pass; V owed; review PASS | `d2ce992` |
| 1m. split out `types/persistence.ts`, `share.ts`, `biography.ts`, `settings.ts` | T B L pass; V owed; review PASS WITH NOTES | `8065948` |
| review notes: 1m | applied | `495d497` |
| 1n. `layers.json` complete; `npm run layers -- --check` in the deploy workflow | L pass; review PASS WITH NOTES | `e11cf04` |
| review notes: 1n | applied | `566b84a` |
| 1o. docs, maps, agents, stale path pointers; end-of-phase S R | T B L S R pass; review PASS WITH NOTES | `2e0b417` |
| review notes: 566b84a and 1o | applied | this commit |

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

**Step 1g, measured 2026-11-15**
- `RAIL_WIDTH` and its one-line doc comment move verbatim from
  `ui/reader/SelectionRail.tsx` to `ui/useLayoutMode.ts`, placed first among
  the layout constants it is summed with. The rail's long header comment
  (why the rail's width is reserved) stays in `SelectionRail.tsx`, which is
  about the rail.
- Importers: `useLayoutMode.ts` drops its import of `./reader/SelectionRail`;
  `SelectionRail.tsx` gains `import { RAIL_WIDTH } from '../useLayoutMode'`
  (after its existing imports); `ReaderScreen.tsx` takes `RAIL_WIDTH` from its
  existing `../useLayoutMode` import (appended, not re-sorted) and keeps
  `SelectionRail` from `./SelectionRail`; **`scripts/verify-parsers.ts:5472`**
  imports it from `../src/ui/useLayoutMode`. The SSR build of the script
  resolves (exit 0); **V owed**.
- **B is not identical, as expected**: `SelectionRail` now imports
  `useLayoutMode`, so `useLayoutMode`'s constants are emitted (and evaluated)
  before the rail's component instead of after. Main chunk 791,844 → 791,838 B
  (−6). `useLayoutMode` has no side effects at load (constants, a query
  string, hooks). Dynamic chunks identical.
- **T** exit 0. **S** PASS 30/30. **R** PASS 28/28; performance unchanged from
  the baseline (240,000 px in 33.3 s / 175,800 px in 24.4 s; 1,905 / 1,904
  DOM nodes; 404 / 406 blocks mounted; 0 long tasks). **L**: 126 edges;
  directories in a cycle 4 → **2**; mutual pairs 2 → **1**
  (`translation ↔ translation/providers`, for 1h). Rule added: `ui` imports no
  `ui/.+`. All hold.

- **Review of 1g: PASS WITH NOTES**, nothing to fix. The reviewer rebuilt
  the old bundle in the new order and found the same 392,180 tokens up to a
  consistent minifier rename: a pure reorder (the rail module moves later, to
  where `ReaderScreen` imports it). Notes left for later: `verify-parsers.ts`
  now imports `useLayoutMode` twice (5471–5472), tidy only with the owner's OK;
  RESTRUCTURE T-a's `ui/reader/SelectionRail` example is stale (1o).

**Step 1h, measured 2026-11-15**
- `git mv src/translation/registry.ts src/translation/providers/registry.ts`.
  Its five imports change only in path (`./TranslationProvider` →
  `../TranslationProvider`, `../lib/providers` → `../../lib/providers`,
  `../types` → `../../types`, `./providers/X` → `./X`); the rest is
  byte-identical. Importers, specifier only (6): `app/AppContext.tsx`,
  `ui/OnboardingScreen.tsx`, `ui/reader/useTranslator.ts`,
  `ui/reader/TranslationCardView.tsx`, `ui/settings/SettingsScreen.tsx`,
  `ui/settings/ProfileEditor.tsx`. No script imports it. Comments that say
  "registry.ts" carry no directory and stay true.
- Rule added: `translation` does not import `translation/providers`.
- **T** exit 0. **B** exit 0; `compare-bundles` 1g → 1h: every JS file
  identical. **L** (edges diffed against a worktree of `89f6784`): +4
  (`app`, `ui`, `ui/settings` → `translation/providers`;
  `translation/providers → lib`), −2 (`translation → translation/providers`,
  `ui → translation`): 126 → 128. **Directories in a cycle 0, mutual pairs 0,
  file-level cycles 0** — the phase's goal. 7 rules hold.

- **Review of 1h: PASS WITH NOTES**, nothing to fix. The registry builds both
  providers at load; neither has a constructor or module-level side effect,
  and the identical bundle shows evaluation order unchanged. Note applied: 1o
  also updates FOUND_ISSUES 4's path to the registry.

**Step 1i, measured 2026-11-15**
- `git mv src/types.ts src/types/index.ts` and nothing else in source: the
  88 files that import `…/types` resolve it to the directory's `index.ts`
  (`moduleResolution: "bundler"`, and Vite's resolver). No script or config
  names `types.ts`. `scripts/check-layers.mjs` still maps the file to the unit
  `types` (first path segment); its special case for a root `types.ts` is now
  unused but harmless.
- `deploy.yml`'s source-tree list gains `types` (trap T-b); it matches
  `ls src` exactly.
- **T** exit 0. The SSR build of `scripts/verify-parsers.ts` resolves (exit 0);
  **V owed** (the script's modules import `types`). **B** exit 0;
  `compare-bundles` 1h → 1i: every JS file identical. **L**: unchanged (142
  files, 128 edges, no cycles); rules hold.

- **Review of 1i: PASS WITH NOTES**, nothing to fix. All 88 importers are
  `import type`/`export type`, so no runtime import of a directory remains.
  Notes for 1n/1o: `check-layers.mjs`'s comment and special case still name
  `src/types.ts`; `ui/reader/cardLayout.ts:110` says "in types.ts".

**Step 1j, measured 2026-11-15**
- **Plan order changed** (recorded in the plan, under the group table): the
  groups use each other with no cycle, so they are split leaves first; 1j takes
  the four that use no other group.
- Cut by script (`split_types.py` in the session scratchpad, reading the
  committed `index.ts`): each declaration with everything between the previous
  declaration's end and its own end — its doc comment and any comment above
  it — verbatim and in order. `types/reader.ts` (StructureProfile, PanelScope,
  PanelPosition), `types/translation.ts` (ProviderId, CloudProviderId,
  TranslationUsage, TranslationErrorKind, WordGloss, TranslationProfile,
  GlossaryEntry), `types/retrieval.ts` (QuranVerse, HadithRecord,
  HadithSourceId, HadithAttribution), `types/entities.ts` (Entity, EntityRange,
  SegmentType, TranslatedSegment).
- Checked by line multiset: every non-blank line of the old `index.ts` is in
  the new five files; the only new lines are each file's two-line header
  (new text, adaptation (c)), `index.ts`'s four `import type` lines for what
  its remaining declarations use, and its four `export * from` lines.
- **T** exit 0. SSR build of `verify-parsers.ts` resolves; **V owed**. **B**
  exit 0; `compare-bundles` 1i → 1j: every JS file identical. **L**: 146 files,
  128 edges, no cycles (file-level included); rules hold.

- **Review of 1j: PASS WITH NOTES.** Verbatim and in order (the reviewer
  matched each file to exact old line ranges); 62 names exported before and
  after, none twice. The plan change is "an acceptable sequencing detail,
  recorded openly", to be named in the phase PR. Fixed: the order paragraph
  (`qul` uses only `translation`; seven groups are leaves, not four; a missing
  paragraph break), the `entities.ts` header (names too), `translation.ts`
  (word glosses); every group header now says "outside types/, import them
  from `types`", since group files import each other from 1k on.
  **For the owner before 1m:** the splitter would carry the detached
  `AppSettings` comment (FOUND_ISSUES 5) into `biography.ts`, because it sits
  above `BiographyEntry`.

**Step 1k, measured 2026-11-15**
- Same script, `book` before `catalog`. `types/book.ts` (ImportStatus, Book,
  DictionaryEntry, TocNode, Page, BlockType, InlineSpan, InlineSpanKind, Block)
  imports `StructureProfile` from `./reader`; `types/catalog.ts` (CatalogEntry,
  Catalog) imports `Book` from `./book`. `index.ts` no longer uses
  `StructureProfile`, so that specifier leaves its `./reader` import; its
  `export *` lines keep their order and gain `./book`, `./catalog` at the end
  (the script was changed to keep existing lines in place after a first run
  re-ordered them — that run was discarded).
- Line multiset: every old non-blank line present; new lines are only the two
  headers, the two group files' imports, the shortened `./reader` import and
  the two `export *` lines.
- **T** exit 0. SSR build of `verify-parsers.ts` resolves; **V owed**. **B**
  exit 0; `compare-bundles` 1j → 1k: every JS file identical. **L**: 148 files,
  no cycles; rules hold.

- **Reviews of ac7129e and 1k: both PASS.** The reviewer matched `book.ts`
  and `catalog.ts` to exact old line ranges and found 62 names exported before
  and after. (Cosmetic notes: one over-long line in the plan's Order
  paragraph; 1k's L line left out the edge count — 128.) The container was
  restarted after this review; the scratchpad survived.
- **Owner's decision for 1m (2026-11-15):** the detached comment above
  `BiographyEntry` that belongs to `AppSettings` (FOUND_ISSUES 5) moves, word
  for word, to just above `AppSettings` in `types/settings.ts`. Its "two API
  keys" wording stays for a later fix.

**Step 1l, measured 2026-11-15**
- Same script. `types/cards.ts` (CardBase, CardStatus, TranslationCard, Mark,
  MarkRange, NoteCard, LocalSourceRef, WebSourceRef, ExplanationCard,
  SharhCard, Card) imports `TranslatedSegment` from `./entities` and
  `ProviderId`, `TranslationErrorKind`, `TranslationUsage` from
  `./translation`; `types/qul.ts` (the "QUL" section banner, QulResourceKind …
  QulCompilation) imports `ProviderId`, `TranslationUsage`. `index.ts` drops
  its `./entities` import and keeps only `ProviderId` from `./translation`
  (what `AppSettings` uses); two `export *` lines appended.
- Line multiset: every old non-blank line present; new lines are the two
  headers, the group files' imports, the shortened `./translation` import and
  the two `export *` lines.
- **T** exit 0. SSR build of `verify-parsers.ts` resolves; **V owed**. **B**
  exit 0; `compare-bundles` 1k → 1l: every JS file identical. **L**: 150 files,
  128 edges, no cycles; rules hold.

- **Review of 1l: PASS** (exact contiguous old line ranges; the QUL banner
  belongs to the QUL group; nothing carried across a boundary).

**Step 1m, measured 2026-11-15**
- Same script: `types/persistence.ts` (CrawlState, ReadingPosition),
  `types/share.ts` (ShareRecord), `types/biography.ts` (BiographyEntry and,
  from 1b, the "Narrator profiles" pointer, FieldSource, SourcedValue,
  ScholarStatement, NarratorProfile, StoredNarratorProfile),
  `types/settings.ts` (AppSettings, importing PanelPosition, PanelScope,
  HadithSourceId, ProviderId).
- **Not verbatim in position, by the owner's decision:** the five-line comment
  "Everything except the two API keys …" (FOUND_ISSUES 5), which sat in
  `types/index.ts` between `ShareRecord` and `BiographyEntry`'s own doc
  comment, moves word for word to directly above `AppSettings` in
  `settings.ts`, which had no doc comment of its own. (The splitter would have
  carried it into `biography.ts` with `BiographyEntry`; it was placed by hand
  instead.) Its text (including "two
  API keys" and "app/secrets.ts") is unchanged.
- `index.ts` is now its header comment and twelve `export *` lines: 18 lines,
  from 899 in `types.ts` at Phase 0. The largest group file is `cards.ts`
  (197 lines).
- Line multiset: every old non-blank line present; new lines are the four
  headers and the four `export *` lines.
- **T** exit 0. SSR build of `verify-parsers.ts` resolves; **V owed**. **B**
  exit 0; `compare-bundles` 1l → 1m: every JS file identical. **L**: 154 files,
  128 edges, no cycles; rules hold.

- **Review of 1m: PASS WITH NOTES.** Exact old line ranges; the one
  relocation is the owner's. Fixed here: the 1m entry misplaced where the
  comment sat. For 1n: `check-layers.mjs`'s `types.ts` comment and dead
  branch. For 1o: `cardLayout.ts:110` ("in types.ts"), `settings.ts:10`
  ("app/secrets.ts"), the maps, the planner agent; and the `index.ts` header,
  which now heads a file that declares nothing — one added line saying it
  re-exports the group files.

**Step 1n, measured 2026-11-15**
- Two last rules, both already true: `app` imports no `ui`, `components`
  imports only `lib` and `types`. With the seven from 1a–1h, `layers.json`
  holds 9 rules (10 after the review notes below).
- `deploy.yml`: a step "Check the layer rules" (`npm run layers -- --check`)
  after `npm ci`, before the build (owner's answer to Q3), with a comment
  saying what it guards. YAML parses (PyYAML and js-yaml).
- **Negative test:** a temporary rule forbidding `ui → app` made
  `--check` exit 1 with "13 forbidden imports"; the rule was then removed and
  the file restored byte for byte.
- `scripts/check-layers.mjs`: the unit comment no longer says `src/types.ts`
  exists; the `types.ts` branch is kept on purpose, so the script still reads
  commits from before step 1i (as it did for the 1h edge comparison).
- No source change; T, B, S, R not affected.

- **Review of 495d497 (PASS) and 1n (PASS WITH NOTES).** The reviewer found
  three boundaries that hold but had no rule, and that `--check` ignored a new
  cycle among domain directories (e.g. `retrieval → quran`, while
  `quran → retrieval` exists) — so "no cycles" was kept only where a rule
  happened to cover it. Applied:
  - the domain and `app` rules also forbid `components`; a new rule says
    nothing imports `(root)` (`main.tsx`, `App.tsx`): 10 rules, all hold;
  - `--check` now also fails on any directory or file-level cycle, and when
    `layers.json` is missing (it passed silently before), and lists each
    problem on stderr;
  - the workflow comment says exactly that.
  Negative tests, each undone afterwards: a temporary
  `src/retrieval/zzNegativeTest.ts` importing `quran/quranIndex` → exit 1,
  "directory cycle: {biography, quran, retrieval}"; `layers.json` moved away
  → exit 1, "missing"; a temporary `ui → app` rule → exit 1, 13 problems
  listed; a temporary `src/ui/zzNegativeTest.ts` importing `App` → exit 1,
  a cycle and the new `(root)` rule. (Restoring after the third test with
  `git checkout` also dropped the uncommitted rule edits; they were re-applied
  and checked against the diff.)

**Step 1o, measured 2026-11-15**
- Maps: CLAUDE.md and README now show `types/` (one file per area),
  `services/` (secrets, retrieval log, activity), `app/` without them, and the
  registry under `translation/providers/`. CLAUDE.md states the layer rules
  `--check` enforces, and lists `compare-bundles.mjs` among the commands.
- Pointers: CLAUDE.md's Never list and trap 2 (`services/secrets.ts`); README's
  Capacitor note; the planner and llm agents (`types/translation.ts`,
  `types/retrieval.ts`, `services/*`, `translation/providers/registry.ts`,
  `lib/providers.ts`); RESTRUCTURE's status line, a note that §1 records the
  starting point, T-a's examples (and the SSR build as the here-runnable half
  of V), T-d, the book-kinds paragraph, the phase table; FOUND_ISSUES 4's
  registry path.
- Source comments, path pointers only: `types/settings.ts` ("see
  services/secrets.ts", reflowed), `ui/reader/cardLayout.ts` ("in
  types/reader.ts", reflowed), and one added sentence in `types/index.ts`'s
  header saying the file declares nothing and re-exports the group files.
- **T** exit 0. **B** exit 0; `compare-bundles` 1m → 1o: every JS file
  identical (comments only). **S** PASS 30/30. **R** PASS 28/28, performance as
  the baseline (240,000 px in 33.3 s / 175,800 px in 24.4 s; 1,905 / 1,904 DOM
  nodes; 404 / 406 blocks; 0 long tasks). **L** `--check` exit 0, 10 rules.
  The end-of-phase report is [`phase1/layers.txt`](phase1/layers.txt).

- **Reviews of 566b84a and 1o: PASS WITH NOTES; "Phase 1 ready for PR", with
  the owner's `npm run verify` the one gate missing.** Applied: CLAUDE.md's
  rules paragraph lists all ten rules exactly; the `lib/` map lines name
  `providers`; README's `app/` line names the read-only context (missing since
  before Phase 1); the `(root)` rule says "nothing outside the root"; the plan's
  1n row names the script change; RESTRUCTURE no longer calls Phase 0 done
  while PR #8 is open. Left: under `--check` a cycle is printed in three places
  (cosmetic). The reviewer notes the plan's Goal said S and R "at every step"
  while its Checks section scheduled them after 1g and at the end, which is
  what was done.

## Phase 1 result

| | Phase 0 (`56a412c`) | Phase 1 end |
| --- | --- | --- |
| directories in a cycle | 13 + 2 | **0** |
| directory pairs importing each other | 7 | **0** |
| file-level cycles | 1 | **0** |
| layer rules, enforced in the deploy workflow | 0 | **10** |
| largest types file | 899 lines (`types.ts`) | 197 (`types/cards.ts`) |
| main JS chunk | 791,844 B | 791,838 B (−6, the 1g reorder) |
| verify:selection / verify:reader | 30/30, 28/28 | 30/30, 28/28, same performance |

Every step's JavaScript was identical to the step before except 1a (a
function moved to a new module, same size) and 1g (one module emitted earlier,
−6 B, shown by the reviewer to be a pure reorder). Every step was reviewed
before the next began. **Owed before merge: `npm run verify` on the owner's
PC** (steps 1d, 1g and 1i–1m touch modules its script builds; here only its
SSR build could run, and it resolved at every step).

## Phase 2: shared pieces (complete, branch `claude/restructure-phase-2`)

Plan: [`plans/phase2-shared-pieces.md`](plans/phase2-shared-pieces.md), written
by the `torjuman-planner` agent on `146dc62`; **approved 2026-11-15, all
fifteen answers as recommended**.

| Step | State | Commit |
| --- | --- | --- |
| 2a. Check U (`scripts/verify-markup.mjs`, `npm run verify:markup`), baselined on the old code | U proven; review FAIL (harness wait) → fixed | `3b15ef3` |
| review notes: 2a — a real seed wait, text mask dropped, manifest re-proven | U proven; re-review PASS WITH NOTES | `c6d2998`, `c30e388`, `059266f` |
| review notes: 2a re-review (header wrap, FOUND_ISSUES 7 wording) | applied | `fe6065e` |
| 2b. `delay` → `lib/delay.ts` | T B L U pass; V owed; review PASS WITH NOTES | `c121141` |
| review notes: fe6065e and 2b | applied | `18f2a5d` |
| 2c. `formatBytes` → `lib/format.ts` | T B L U pass; review PASS WITH NOTES | `6e3bea2` |
| review notes: 18f2a5d and 2c | applied | `ede0a6e` |
| 2d. one proxy URL → `platform/http/proxyUrl.ts` | T B L U pass; V owed; review PASS | `93d0b9a` |
| 2e. gzip platform call → `lib/gzip.ts` | T B L U pass; V owed; review PASS WITH NOTES | `2680fdd` |
| review notes: 2e | applied | `0feb5ae` |
| 2f. `subtle()` exported from `share/crypto.ts`; the relay drops its copy | T B L U pass; V owed; review PASS | `5e92294` |
| 2g. `ui/common.tsx` → `ui/kit/index.tsx`; layer rules | T B L U S R pass; review PASS WITH NOTES | `c5f4f6e`, `60f7ebe` |
| 2h. `ProgressBar` in `ui/kit`, copies 1–7 | T B L U pass; review PASS WITH NOTES | `c748f5d` |
| review notes: 2h | applied | `3db8af1` |
| 2i. `percentOf` in `lib/format.ts`, six sites | T B L U pass; review PASS WITH NOTES | `4f9ff79` |
| review notes: 3db8af1 and 2i | applied | `06b20c7` |
| 2j. `SettingsSection` in `ui/kit`, 15 copies | T B L U pass; review PASS WITH NOTES | `6d840a8` |
| 2k. docs, maps, FOUND_ISSUES 10; end-of-phase checks | T B L U S R pass; review PASS WITH NOTES | `41fd1f2`, `f4b0a44` |
| review notes: 2k and the phase | applied | this commit |

**Step 2a, measured 2026-11-15** (no `src/` change; `git diff --quiet -- src`
holds)
- Built by a delegated agent from plan §9, checked and re-baselined here. Two
  builds (no proxy; `VITE_PROXY_URL=https://proxy.invalid`), both tablet
  profiles, fixed clock, en-US, UTC, service worker blocked; synthetic seed
  only. **80 captures** (plain 32 per profile, proxy 8 per profile), each an
  `.html` and a `.png`: 160 hashes in `docs/refactor/phase2/markup.sha256`.
  **Screenshots are in the manifest** (byte-stable here; on the owner's PC
  font rasterization may differ — then `--html-only` or `--compare`).
- **All seven in-progress states captured**: library-transfer-exporting,
  device-transfer-exporting, offline-downloading, catalog-importing,
  receive-fetching, device-transfer-relay, import-crawling.
- Masks: the "Built" time; the storage-usage line; React `useId` ids; the
  **order** of Settings → Retrieval's log rows (two boot lookups race). A text
  mask on those rows, added for a "2 pending"/"3 pending" flake, was removed
  after the review found the real cause (below).
- Deviations from §9, each in the script's header: more environment pinned
  (`GITHUB_REF_NAME`, `GITHUB_SHA`, `npm_package_version`); untracked
  `qul/` files answer 404 so the owner's licensed files cannot change the
  result; offline-downloading answers the size probes, `config.json` and
  `generation_config.json`; import-crawling opens `#/import` after the Library
  shows "Importing…" (FOUND_ISSUES 6); share-error shows the "link is
  incomplete" error, not a 404.
- **Proof.** Agent: two runs identical (160/160); a class swap in the first
  progress bar's track in `LibraryScreen.tsx` → exit 1, 158/160, naming
  `library.html` at both sizes (PNGs unchanged, as class order does not
  render); an added space in Published chapters' description → exit 1,
  154/160, naming that section, `settings.html`, `settings-proxy.html`; both
  files restored byte for byte. Here, after the text mask: manifest rewritten
  from a fresh run, then **three runs, each PASS 160/160**. Run time ≈ 2 min
  15 s (builds ~6.5 s each).
- **T** exit 0 (agent); the production CSS is byte-identical with the new
  script present (Tailwind finds no new class in it).

- **Review of 2a: FAIL**, on the harness, not the app. The wait before the
  reload passed an async predicate to `page.waitForFunction`, which does not
  await it, so it waited for nothing; the reload could interrupt the first
  boot's seed of `matching-ayah`, and the next boot (correctly, by design)
  reported 3 pending instead of 2 — the flake. Fixed in `c6d2998`: a Node-side
  poll with a 30 s timeout that throws; the Retrieval text mask removed; the
  header's two false claims corrected; `VERIFY_OUT` refused outside
  `.verify/` (checked before the builds; tested: exit 2); the dev-server
  proxy paths aborted. FOUND_ISSUES 7 withdrawn and replaced by the cosmetic
  wording issue it really is. Notes kept for later steps: `lib/gzip` (2e) must
  look `CompressionStream` up at call time, as the export captures stub it
  after load; the gap list below.
- **Re-proof after the fix** (manifest in `c30e388`), `src/` unchanged:
  manifest rewritten from a fresh run; **three runs, each PASS 160/160**; the
  class swap in `LibraryScreen.tsx:163` → exit 1, 158/160, `library.html` at
  both sizes; the added space in Published chapters' description → exit 1,
  154/160, `settings--published-chapters`, `settings`, `settings-proxy` at
  both sizes; both files restored (`cmp` equal, `git diff --quiet -- src`).
- **Not captured, so read by the reviewer** (beyond the plan's three
  exceptions): the reader's sheets and cards that use `ui/common`
  (`BiographySheet`, `DictionarySheet`, `EntitySheet`, `ExplanationCardView`,
  `SearchPanel`, `TranslationCardView`, `NarratorCard`, `SelectionRail`,
  `ReaderScreen` beyond its header), `ShareScreen`'s loading and success
  states, `LibraryScreen`'s "Deleting…" spinner. All of them change only an
  import path in 2g, where S and R also run.

- **Re-review of the 2a fix: PASS WITH NOTES.** The manifest changed in
  exactly the six `.html` dumps holding the Retrieval section; no `[masked]`
  text remains; the poll cannot pass on a timeout. Applied: a header line
  re-wrapped; FOUND_ISSUES 7 says "in the deployed build". Kept for later: the
  poll hard-codes `db.version === 11`, so Phase 4's schema work must update it
  (it fails loudly otherwise).

**Step 2b, measured 2026-11-15**
- `delay` moved verbatim from `ingest/importer.ts` (its last function) to the
  new `lib/delay.ts`, with a three-line header (new text). `importer.ts`
  imports it from there; `crawler.ts` takes it from `../lib/delay` instead of
  `./importer` (its other two names stay); `GeminiProvider.ts` deletes its
  identical private copy and imports it. No re-export left in `importer.ts`.
  No script imports `delay`.
- **T** exit 0. SSR build of `verify-parsers.ts` resolves; **V owed**
  (`ingest/importer` is in it). **B** exit 0; main chunk 791,838 → 791,787 B
  (−51, the second copy gone); `compare-bundles`: only `index.js` differs;
  `index-*.css` byte-identical. **L**: 155 files, 128 edges, no cycles; rules
  hold. **U** PASS 160/160.

- **Reviews of fe6065e and 2b: PASS WITH NOTES.** The two `delay` copies were
  character-identical; all four call sites get the same function; no rebinding.
  Applied: `verify-markup.mjs`'s header line is now really re-wrapped (the
  first attempt only moved the overflow); `lib/delay.ts`'s header names the
  crawler's retry backoff too. Comments only.

**Step 2c, measured 2026-11-15**
- `formatBytes` moved verbatim from `ui/reader/ShareChapter.tsx` to the new
  `lib/format.ts` (now `export`ed, adaptation (b)), with a header (new text).
  `PublishedShares.tsx` deletes its identical copy; both import it from
  `lib/format`. The three formatters that differ stay (owner's Q6): recorded as
  FOUND_ISSUES 8 with their exact outputs. No script imports either file.
- **T** exit 0. **B** exit 0; main chunk 791,787 → 791,674 B (−113);
  `compare-bundles`: only `index.js` differs; CSS byte-identical (the new
  FOUND_ISSUES text names no new class). **L**: 128 edges (`ui/settings → lib`
  and `ui/reader → lib` already existed); rules hold. **U** PASS 160/160 — the
  Published chapters capture shows all three branches ("512 B", "300 KB",
  "2.5 MB"). V not owed (no module the verify script builds).

- **Reviews of 18f2a5d and 2c: PASS WITH NOTES.** Applied: `lib/delay.ts` and
  `lib/format.ts` headers re-wrapped (comments only); FOUND_ISSUES 8's
  impossible "1,234 KB" example replaced by a real one ("1,000 KB" vs "1000
  KB"), and a fifth format added (Offline translation's storage line).

**Step 2d, measured 2026-11-15**
- New `platform/http/proxyUrl.ts`: `PROXY_URL`, the expression both files
  computed (`(import.meta.env.VITE_PROXY_URL ?? '').replace(/\/+$/, '')`), with
  a header (new text). `WebHttpClient.ts`: `PROXY_BASE = DEV ? '' :
  PROXY_URL`, its comment kept; `relayTransfer.ts`: `RELAY_BASE = PROXY_URL`,
  its comment kept. Both names and both values unchanged (empty in dev for the
  client, the Worker's URL for the relay). `vite.config.ts`'s `define` comment
  now says "Read by src/platform/http/proxyUrl.ts" (a pointer the plan names).
- `scripts/verify-parsers.ts` imports `WebHttpClient` (`PROXIED_ORIGINS`,
  ~4547) and `relayTransfer` (~5343): its SSR build resolves; **V owed**.
- **T** exit 0. **B** exit 0; main chunk 791,674 → 791,661 B (−13);
  `compare-bundles`: only `index.js` differs; CSS byte-identical. **L**: 129
  edges (+1, `library → platform/http`, as the plan says); no cycles; rules
  hold. **U** PASS 160/160, both builds.

- **Reviews of ede0a6e (PASS) and 2d (PASS WITH NOTES, nothing to fix).** The
  bundle now holds one copy of the proxy expression, aliased by both names.

**Step 2e, measured 2026-11-15**
- New `lib/gzip.ts`: `canGzip`, `canGunzip`, `gzipStream`, `gunzipStream`,
  with a header (new text) saying why the globals are looked up per call (the
  2a review's note: check U stubs `CompressionStream` after load). In
  `library/transfer.ts`, `library/deviceTransfer.ts` and `share/crypto.ts`,
  each `typeof CompressionStream === 'undefined'` became `!canGzip()`, each
  `typeof DecompressionStream === 'undefined'` `!canGunzip()`, each
  `x.pipeThrough(new …Stream('gzip'))` `gzipStream(x)` / `gunzipStream(x)`.
  Fallbacks, error messages, detection and comments stay at the call sites;
  statement and evaluation order unchanged (the stream is created before the
  compressor in both versions).
- Types: the DOM typings want `ReadableStream<BufferSource>` in and give
  `ReadableStream<Uint8Array<ArrayBuffer>>` out; the helpers say so.
- Round trip in Node 22 (same stream classes): 25,500 B of Arabic → 154 B,
  magic `1f 8b`, decoded equal; deleting `CompressionStream` after import makes
  `canGzip()` false (the per-call lookup).
- **T** exit 0. SSR build of `verify-parsers.ts` resolves; **V owed** (seal and
  open, device export and restore, book transfer are in it). **B** exit 0;
  main chunk 791,661 → 791,514 B (−147); `compare-bundles`: only `index.js`;
  CSS byte-identical. **L**: 129 edges (library and share → lib already
  existed); rules hold. **U** PASS 160/160, including both "Compressing…"
  export states.

- **Review of 2e: PASS WITH NOTES**, nothing to fix in code. Evaluation order
  checked site by site. **Gap found:** book export and import
  (`library/transfer.ts`) are covered by no automated check — V does not
  import that file, U holds the export mid-compression — so the plan's tablet
  check M now includes exporting one book and importing it back. Plan text
  corrected: six call sites, not five; the helpers' types (recorded above)
  differ from §4's sketch.

**Step 2f, measured 2026-11-15** (optional step, included by the owner's Q10)
- `share/crypto.ts`'s `subtle()` gains `export` (adaptation (b));
  `library/relayTransfer.ts` deletes its character-identical copy (under its
  "crypto" banner, which stays) and imports `subtle` from `../share/crypto`.
  `InsecureContextError` leaves the relay's import: only the deleted copy used
  it there. The error the relay throws without WebCrypto is the same class
  from the same module as before.
- **T** exit 0. SSR build of `verify-parsers.ts` resolves (it imports the
  relay, ~5343); **V owed**. **B** exit 0; main chunk 791,514 → 791,438 B (−76);
  `compare-bundles`: only `index.js`; CSS byte-identical. **L**: 129 edges
  (`library → share` already existed); rules hold. **U** PASS 160/160.

- **Reviews of 0feb5ae and 2f: both PASS.**

**Step 2g, measured 2026-11-15**
- `git mv src/ui/common.tsx src/ui/kit/index.tsx`; its router import becomes
  `../../app/router` (adaptation (a)); a header comment added (the plan names
  it). The 30 importers change only `…/common` → `…/kit`. No script imports
  it.
- Layer rules: rule "top-level ui does not reach into a screen's folder" now
  reads `ui/(?!kit$).+`; new rule: `ui/kit` imports only `app`, `lib`,
  `types`. Before the rule change the old rule fired on the six top-level
  screens, as the plan foresaw. **Negative tests**, each undone: a temporary
  `ui/kit/zzNegativeTest.ts` importing `ui/reader/selection` → exit 1 (the new
  rule and a `{ui, ui/kit, ui/reader}` cycle); a temporary rule forbidding
  `ui → ui/kit` → exit 1, 6 problems (the six screens); `layers.json`
  restored byte for byte.
- **T** exit 0. **B** exit 0; main chunk 791,438 B, **unchanged**, and
  `compare-bundles`: every file identical (a pure rename emits the same JS);
  CSS byte-identical. SSR build resolves. **L**: 133 edges (129 + 5 − 1; the
  plan's "132" was counted before 2d's edge), no cycles; 11 rules hold.
  **U** PASS 160/160. **S** PASS 30/30. **R** PASS 28/28, performance as the
  baseline (240,000 px in 33.3 s / 175,800 px in 24.4 s; 1,905 / 1,904 DOM
  nodes; 0 long tasks).

- **Review of 2g: PASS WITH NOTES**, nothing to fix. Notes: the kit header
  read as a description of today's imports and promised an `export … from`
  line that did not exist yet — both fixed in 2h, which adds the first one.
  For 2k: CLAUDE.md's "ten rules" (now 11), its rules paragraph (the kit
  exception), the map (`ui/kit/`).

**Step 2h, measured 2026-11-15**
- New `ui/kit/ProgressBar.tsx` (plan §6, with a header), re-exported from
  `ui/kit/index.tsx` by its first `export { … } from` line; the kit header now
  says what the kit *may* import and how new pieces are added (2g review).
- The seven identical track-and-fill pairs replaced, each by one
  `<ProgressBar percent={…} />` with the width expression moved unchanged from
  the `style` template into `percent`: `LibraryScreen`, `CatalogScreen`
  (`className="mt-2"`), `ReceiveTransferScreen`, `DeviceTransfer` ×2,
  `LibraryTransfer`, `OfflineTranslation`. Three long ones wrapped. Each file
  appends `ProgressBar` to its existing kit import. `ImportScreen` and
  `BatchTranslateBar` untouched; their differences are FOUND_ISSUES 9.
- **T** exit 0. **B** exit 0; main chunk 791,438 → 790,661 B (−777);
  `compare-bundles`: only `index.js`; CSS byte-identical (every class token is
  still in `src/`). **L**: 133 edges, no cycles, 11 rules hold. **U** PASS
  160/160 — the seven bars' captures (library, catalog-importing,
  receive-fetching, device-transfer-exporting, device-transfer-relay,
  library-transfer-exporting, offline-downloading) render the same DOM and
  pixels. V not owed (no module the verify script builds).

- **Review of 2h: PASS WITH NOTES**, nothing to fix in code. All seven width
  expressions are numbers; a null `progress` gives 0 in both versions.
  Applied: `ProgressBar.tsx`'s header says "seven bars on six screens" and
  names the model download; FOUND_ISSUES 9 adds BatchTranslateBar's missing
  zero-total guard.

**Step 2i, measured 2026-11-15** (optional step, included by the owner's Q10)
- `percentOf(done, total)` added to `lib/format.ts`:
  `total > 0 ? Math.round((done / total) * 100) : 0`, with a doc comment.
  Six sites now call it: `LibraryScreen` (book pages), `ImportScreen` (crawl
  pages), `ReceiveTransferScreen` (`progress && …` became
  `progress ? percentOf(…) : 0`, the same value for every input),
  `DeviceTransfer` ×2, `LibraryTransfer`. `CatalogScreen` (capped at 99) and
  `BatchTranslateBar` (no guard) compute theirs differently and stay. Each file
  gains one import line after its imports.
- **T** exit 0. **B** exit 0; main chunk 790,661 → 790,558 B (−103);
  `compare-bundles`: only `index.js`; CSS byte-identical. **L**: 134 edges (+1,
  `ui → lib`: the top-level screens had not imported `lib` before; allowed);
  no cycles; rules hold. **U** PASS 160/160 (the library's "Import incomplete —
  40%", the crawl panel's 40%, every bar width).

- **Reviews of 3db8af1 and 2i: PASS WITH NOTES**, nothing to fix in code. The
  Receive rewrite gives the same value for every input (`progress` is an
  object or null). Applied: `ProgressBar.tsx` header re-wrapped;
  `percentOf`'s comment says "six progress lines" and "a progress line";
  FOUND_ISSUES 9 says "at least one block". Comments and docs only.

**Step 2j, measured 2026-11-15**
- New `ui/kit/SettingsSection.tsx` (plan §7, the bare shell, with a header),
  re-exported from `ui/kit/index.tsx`. All 15 copies were first checked to be
  the exact tag `<section dir="ltr" className="ltr-isolate rounded-lg border
  border-rule bg-white p-5">`, one per file. In each, only that opening tag and
  its `</section>` became `<SettingsSection>` / `</SettingsSection>`; nothing
  inside changed, nothing was re-indented. `SettingsScreen.tsx`'s local
  `Section` keeps its name, props, `h2`, paragraph and wrapper `div`; only its
  outer tag changed. Fourteen files appended `SettingsSection` to their kit
  import; `OfflineCapabilities.tsx`, which had none, gained one import line.
- **T** exit 0. **B** exit 0; main chunk 790,558 → 789,438 B (−1,120);
  `compare-bundles`: only `index.js`; CSS byte-identical. **L**: 134 edges, no
  cycles, rules hold. **U** PASS 160/160 — all 21 `settings--*` captures, the
  whole Settings screen, `settings-proxy`, and the three in-progress Settings
  states.

- **Reviews of 06b20c7 and 2j: PASS WITH NOTES**, nothing to fix in code.
  The swapped tag is the one each section component returns; no `<section>`
  is left in `ui/settings`; RESTRUCTURE §2's promise for settings sections now
  holds. Notes applied in 2k (comments only).

**Step 2k, measured 2026-11-15**
- Docs as the plan lists them (`41fd1f2`): CLAUDE.md map and its rules
  paragraph (eleven rules, the `ui/kit` exception), README map, RESTRUCTURE
  status, §1 counts, Phase 2 marked complete; FOUND_ISSUES 10 (duplicates
  deferred by Q10, and 2j′). Two comment notes from the 2i and 2j reviews.
  End-of-phase report: [`phase2/layers.txt`](phase2/layers.txt).
- **End of phase:** **T** exit 0. **B** exit 0, main chunk 789,438 B; CSS
  byte-identical to 2j's base (the doc text names no new class). SSR build of
  `verify-parsers.ts` resolves. **L** `--check`: 160 files, 134 edges, no
  cycles, 11 rules hold. **U** PASS 160/160. **S** PASS 30/30. **R** PASS
  28/28, performance as the Phase 0 baseline (240,000 px in 33.3 s / 175,800
  px in 24.4 s; 1,905 / 1,904 DOM nodes; 404 / 406 blocks; 0 long tasks).

- **Review of 2k and of Phase 2 as a whole: PASS WITH NOTES; "ready for PR",
  merged only after V and M.** Layer report at HEAD byte-identical to
  `phase2/layers.txt`; −2,400 B checked step by step; no stale `ui/common` or
  old-helper pointer in live docs. Applied: RESTRUCTURE status re-wrapped;
  CLAUDE.md says top-level `ui` imports `./kit`; README's map names
  `proxyUrl`; FOUND_ISSUES 10 adds Onboarding's card shell and the build
  script's `delay`; FOUND_ISSUES 8's line refs updated.

## Phase 2 result

| | Phase 1 end | Phase 2 end |
| --- | --- | --- |
| shared helpers | — | `lib/delay`, `lib/format` (`formatBytes`, `percentOf`), `lib/gzip`, `platform/http/proxyUrl` |
| shared UI | `ui/common.tsx` | `ui/kit/` with `ProgressBar` (7 bars) and `SettingsSection` (15 shells, 21 sections) |
| main JS chunk | 791,838 B | 789,438 B (−2,400) |
| layer rules | 10 | 11 |
| screens (check U, 80 captures × HTML + PNG) | — | identical to the Phase 1 code at every step |
| verify:selection / verify:reader | 30/30, 28/28 | 30/30, 28/28, same performance |

Every step was reviewed before the next began; the one FAIL (2a's harness
wait) was fixed and re-reviewed. **Owed before merge:** `npm run verify` on the
owner's PC (steps 2b, 2d, 2e, 2f touch modules it builds), and **M** on the
tablet with `npm run stage` — including one book exported and imported back,
which no automated check covers.

## Phase 3: provider seams (complete, branch `claude/restructure-phase-3`)

Plan: [`plans/phase3-provider-seams.md`](plans/phase3-provider-seams.md),
written by the `torjuman-planner` agent on `ef2c626`; **approved 2026-11-16,
all sixteen answers as recommended**. Checked here: the SDK takes `fetch` when a client is
built (`client.mjs`: `options.fetch ?? Shims.getDefaultFetch()`), and all
four call sites build a client per call — the basis of check Q.

| Step | State | Commit |
| --- | --- | --- |
| 3a. Check Q (`scripts/verify-requests.ts`, `npm run verify:requests`), baselined on the old code | Q proven; review PASS WITH NOTES | `707095f` |
| review notes: 3a — plan and FOUND_ISSUES 11 corrected | applied | `aacf81b` |
| harness: check Q's coverage gaps closed, on the old code | Q proven; review PASS WITH NOTES | `9306ea6` |
| harness: check Q's second-round gaps | Q proven; review PASS WITH NOTES | `33078d4` |
| harness: SyntaxError messages masked in Q | review PASS WITH NOTES | `f444b44` |
| review notes: f444b44 — comment, plan text | applied | `2012536` |
| 3b. U captures for the Claude side and the reader's cards | U proven; review PASS WITH NOTES | `da5d0f0` |
| 3c. the short Anthropic error mapping → `translation/anthropic.ts` | T B L Q pass; V owed; review PASS WITH NOTES | `dc90a29` |
| 3d. one Anthropic client, `anthropicClient` | T B L Q pass; V owed; review PASS WITH NOTES | `5f87f7d` |
| 3e. the full Anthropic mapping → `translation/anthropic.ts` | T B L Q pass; V owed; review PASS WITH NOTES | `bb1d962` |
| 3f. `textOf` → `translation/anthropic.ts`, five sites | T B L Q pass; V owed; review PASS WITH NOTES | `6de2d88` |
| 3g. `addUsage` → `translation/anthropic.ts` (Explain's `accumulate`) | T B L Q pass; V owed; review PASS WITH NOTES | `8c79cb3` |
| 3h. `WEB_SEARCH_TOOL` → `translation/anthropic.ts` | T B L Q pass; V owed; review PASS WITH NOTES | `1e019c2` |
| 3i. one Gemini POST, `translation/gemini.ts` | T B L Q pass; V owed; review PASS WITH NOTES | `034d11f` |
| 3j. gloss's `max_tokens` and effort → `models.ts` | T B L Q pass; V owed; review PASS WITH NOTES | `d0ff6e1` |
| 3k. `costOf` → `models.ts` | T B L Q S R U pass; V owed; review PASS WITH NOTES | `fff14db` |
| 3l. compile's provider choice → a `COMPILERS` table | T B L Q pass; V owed; review PASS | `2655b79` |
| 3m. legacy inference → `registry.ts` `providerIdForModel` | T B L Q (additions only) U pass; V owed; review PASS | `b114143` |
| 3n. `knownModels`; `modelsFor`, `findModelOption`, `defaultModelFor` → `registry.ts` | T B L Q U S R pass; V owed; review PASS WITH NOTES | `309b5e2` |
| 3o. `keyPlaceholder` on the contract; Settings and Onboarding read it | T B L Q U pass; V owed; review PASS WITH NOTES | `d424770` |
| 3p. Offline's "use a cloud provider" uses `GEMINI_DEFAULT_MODEL` | T B L Q U pass; V owed; review PASS WITH NOTES | `469aa90` |
| 3q. `EXPLAIN_PROVIDER_ID`, `explainModelFor`, `GLOSS_PROVIDER_ID`; the reader uses them | T B L Q (additions only) U S R pass; V owed; review PASS WITH NOTES | `4027b03` |
| 3r. docs; comments that became true; the SDK allowlist narrowed; end of phase | part 1 docs `7743f69`; part 2 `afd3605` T B L Q U S R pass; review of 3r and the phase PASS WITH NOTES; its fixes `0648b5a` (review FAIL: two wordings) and this commit | this commit |

**Plan read before 3a (owner's Q14), by `torjuman-llm`.** Four corrections,
applied to the plan: the SDK reads `ANTHROPIC_*` environment variables at
client construction (the cloud container sets `ANTHROPIC_BASE_URL`; a set
`ANTHROPIC_AUTH_TOKEN` would have put a credential in the committed record) —
the check deletes them and fails on any `Authorization` header; the key
check's network failure returns `true` (FOUND_ISSUES 12); `validateKey`
builds its client inside its `try` (3d keeps it there); the glossary hash
sorts with `localeCompare` (FOUND_ISSUES 13). The survey's quirks are
FOUND_ISSUES 11.

**Step 3a, measured 2026-11-16** (no `src/` change; `git diff --quiet -- src`)
- Built by the `torjuman-llm` agent from plan §1, checked here.
  `scripts/verify-requests.ts` runs through `vite build --ssr` in Node, with a
  stubbed `globalThis.fetch` and canned responses: **74 call-site scenarios,
  111 requests, 7 value sections** (glossary hash, `cacheKeyFor`,
  `compileCacheKey`, token budgets, `costOf`, registry and models, secrets).
  Record: `docs/refactor/phase3/requests.json`, 349,096 B.
- Masked: `x-stainless-os`, `-arch`, `-runtime`, `-runtime-version` (they
  describe the machine). Pinned: sleeps under 60 s recorded and run at once,
  `Math.random`, `Date.now`, the `en-US` locale, `navigator.onLine`,
  `localStorage`; `ANTHROPIC_*` deleted.
- Assertions that fail even with `--write`: each fake key only in its own
  header (`x-api-key` / `x-goog-api-key`); no `Authorization`; only the two
  model hosts; no unanswered or unused response; 20 s per scenario. The
  SDK-import allowlist (Q12) is in place as a superset that step 3r narrows.
- **Proof.** Two runs identical; a run under `TZ=Pacific/Kiritimati` and a
  German locale identical; dummy `ANTHROPIC_*` variables set → still PASS.
  Deliberate edits, each restored with `cmp`: gloss "Rate limited." → "!" →
  exit 1, `gloss.429`; Gemini's `responseMimeType`/`responseSchema` swapped →
  exactly the 13 `gemini.translate.*`; `dangerouslyAllowBrowser` dropped in
  compile → the 5 `compile.anthropic.*`; `cacheKeyFor`'s join changed →
  `values.cacheKeyFor`; the key put in a Gemini URL → 6 assertion failures;
  an SDK import added to `coverage.ts` → the allowlist. Re-run here: PASS;
  the record holds only `sk-ant-q-check-not-a-real-key` and
  `AIza-q-check-not-a-real-key`.
- T exit 0; build unchanged (789,438 B); layers 11 rules hold.

- **Review of 3a: PASS WITH NOTES.** Confirmed: only the two fake keys in
  the record (one per request), no network, `ANTHROPIC_*` deleted before any
  client is built, the assertions run before `--write`. Fixed: FOUND_ISSUES 11
  cited a wrong scenario id; the plan now says the allowlist exists since 3a
  and 3r narrows it. **Coverage gaps found** that later steps would move
  unseen: cache-read usage per turn (3g), the provider mapping's non-SDK branch
  (3e), running out of research turns (3h), Gemini's later backoff waits, 403
  and `PROHIBITED_CONTENT` (3i), offline model ids (3n), compile's Gemini 400.
  These are added to Q on the old code in a harness commit before 3b.

**Harness, 2026-11-16: check Q's coverage gaps** (no `src/` change)
- By the `torjuman-llm` agent, checked here: **21 scenarios and 1 value
  section added** (now 95 scenarios, 152 requests, 8 value sections, 475,575
  B). The 81 earlier entries are byte-identical (the new record minus the
  added entries re-serialises to the old file exactly).
- Added: per-turn cache-read/write usage (3g); research turns used up at both
  sites (3h); a connection dropped mid-body at every site, an empty stream,
  an in-stream error event — the realistic inputs that reach the mappings'
  last branches (3e); Gemini backoff without retry-after (waits 2000, 4000,
  8000), an HTTP-date retry-after, 403, `PROHIBITED_CONTENT`, a blocked prompt
  (3i); offline model ids (3n); compile's Gemini 400. A new
  `…-http-date-only` scenario reaches the SDK's own `Date.parse` branch (the
  3a review found the old one never did); the header says so. The stub gained
  `dropAfterBytes`.
- Not reachable and not faked: in the streamed Anthropic path a genuinely
  non-SDK error never reaches the last branch, because the SDK's stream wraps
  it first.
- **Proof**: two runs identical; 18 deliberate edits (usage arithmetic, turn
  limits, last-branch kinds, Gemini backoff base and exponent, 403, refusal
  reasons, offline labels, compile's 400, the SDK's date branch), each exit 1
  naming the new scenarios — several caught *only* by them — and each restored
  byte for byte. The one edit inside `node_modules/@anthropic-ai/sdk/client.mjs`
  was checked here against the published 0.120.0 tarball: identical.
- Behaviours the new scenarios expose: FOUND_ISSUES 14.

- **Reviews of aacf81b (PASS) and 9306ea6 (PASS WITH NOTES).** The 81 earlier
  entries re-verified identical; every new scenario realistic; security
  assertions hold. Applied: the plan's §8 names these harness commits;
  FOUND_ISSUES 14.2 adds `anthropic.validateKey.body-drop`. **Second-round
  gaps**, being closed in a second harness commit: a 429 with no `retry-after`
  header (3e), multi-text-block replies at every joining site (3f), absent
  cache-token counts (3g), an in-stream error after partial text (3e),
  compile's Gemini 200 with an empty or non-JSON body (3i).

**Harness, 2026-11-16: check Q's second-round gaps** (no `src/` change)
- By the `torjuman-llm` agent, checked here: **16 scenarios added** (now 111
  scenarios, 179 requests, 8 value sections). The 103 earlier entries are
  byte-identical (same proof as before). Covered: a 429 with only
  `retry-after-ms` and with no retry header (3e); an in-stream error after text
  and after tool-input deltas (3e); several text blocks at every joining site
  — translate research and fallback, both Explain passes, gloss (3f); null and
  absent cache counts at translate and Explain (3g); compile's Gemini 200 with
  an empty and a non-JSON body (3i).
- **Proof**: three runs byte-identical; 13 deliberate edits, one or more per
  gap, each exit 1 naming the new scenarios — only two of them were caught by
  any earlier scenario — and each restored (sha256). No `node_modules` edit.
- **Limits, recorded:** a null cache count cannot pin `?? 0` (`0 + null` is
  0); only the absent field shows it. The two compile `SyntaxError` messages
  are Node's JSON parser's wording (recorded on Node 22.22, the deploy
  workflow's major version); a much different Node could word them otherwise
  and make Q report a false difference there. Gloss and compile's Anthropic
  usage with absent counts are not driven (no step moves their arithmetic).
- Behaviours exposed: FOUND_ISSUES 15.

- **Reviews of c64f411 (PASS) and 33078d4 (PASS WITH NOTES): "ready for
  3b".** Applied: FOUND_ISSUES 15's wording (what the record shows and what
  is by reading; a billing claim softened; `retry-after-ms` vs none).
- **Harness, on the reviewer's recommendation:** a `SyntaxError`'s message is
  now masked in Q's record (class, name and kind kept), because it is the
  JavaScript engine's wording and differs between Node versions (Node 18
  words it otherwise), so Q would fail falsely on the owner's PC. The only
  record changes: the two `compile.gemini.200-*` messages and one `masked`
  header line — the one deliberate exception to "earlier entries
  byte-identical", made before 3b, after which §8 forbids any. Two runs PASS.

- **Review of f444b44: PASS WITH NOTES; "ready for 3b".** Only the two
  intended entries hold a `SyntaxError`; neither has `raw`. Applied: the
  comment's Node-version example corrected; the plan's "Nothing else is
  masked" and §8's harness paragraph now name this one exception (owner told).

**Step 3b, measured 2026-11-16** (no `src/` change)
- Built by a delegated agent from plan §6, checked here. **Ten captures**
  (five names × both sizes, `.html` + `.png`: 20 manifest lines), plain build,
  each in a fresh context: `onboarding--claude` (the Claude panel and its
  `sk-ant-…` placeholder), `settings--translation--claude` (Claude's four
  models, Sonnet 5.5 selected), `settings--translation-profiles--claude`
  ("This profile runs on Claude — …"), **`reader-cards`** (five seeded cards:
  Gemini, Claude Sonnet 5.5 with cost and cache, a superseded Claude model,
  on-device, a collapsed Claude card) and **`reader-retranslate`** (the
  provider groups and models in registry order). Both reader captures made it
  (owner's Q13). Cards are seeded only for these two (`seedCards()` behind an
  option), so no earlier capture's data changed. No key is stored anywhere;
  no mask added.
- Manifest: rewritten sorted by `--write-manifest`; `git diff` is 20 added
  lines and no removed line; every earlier line present.
- Known limit, recorded in the script's header: at 960×600 the two
  "translation-profiles" screenshots (the Phase 2 one too) are cut by the
  viewport and the sticky bar, so for that line the `.html` and the 600×960
  `.png` are the proof.
- **Proof**: three runs PASS 180/180 (≈150 s each); deliberate edits, each
  restored — Onboarding's Claude placeholder → exit 1, both
  `onboarding--claude` files at both sizes; a Claude model label in
  `models.ts` → `settings--translation--claude`, `…-profiles--claude`,
  `reader-retranslate`; the card badge separator → `reader-cards`,
  `reader-retranslate`. Re-run here: PASS 180/180.

- **Review of 3b: PASS WITH NOTES; "ready for 3c".** No key in any dump;
  seeded model ids match `models.ts`; earlier captures unaffected. Noted, not
  changed: the `<select>`'s chosen option is a DOM property, so only the PNG
  shows it; what 3m–3q change that no capture shows — a legacy profile without
  `providerId` (3m, Q and reading), a card on an unknown model or a Gemini
  non-default model, the switch back from Claude to Gemini (3n), Explain's
  "needs an Anthropic key" notice and explanation cards (3q, S R Q). The
  manifest's line 2 ("Written once, in 2a") is left for 3r, so this step's
  diff stays additions only.

**Step 3c, measured 2026-11-16**
- New `translation/anthropic.ts` with `anthropicCallError`, the short mapping
  moved from `explain.ts` (its multi-line `'api'` throw kept), returning instead
  of throwing (the plan names this), with a header. `explain.ts`, `gloss.ts`
  and `qul/compile.ts`: each `catch` body became `throw
  anthropicCallError(error);`. Gloss's copy was the same lines; compile's
  lacked the pass-through line, which its `try` cannot need (plan §1). Each
  file imports the function; their SDK imports stay until 3d.
- **T** exit 0. **Q** PASS, identical (every Explain, gloss and compile error
  scenario). **B** exit 0; main chunk 789,438 → 788,800 B (−638); only
  `index.js` differs; CSS byte-identical. SSR build of `verify-parsers.ts`
  resolves; **V owed** (compile). **L**: 134 edges (`qul → translation`
  existed), no cycles; rules hold.

- **Review of 3c: PASS WITH NOTES; "ready for 3d".** Compile's `try` body
  read statement by statement: no `TranslationError` can reach its `catch`, so
  the added pass-through cannot run. Note: the new module's header described
  the provider using it a step early — true from 3d.

**Step 3d, measured 2026-11-16**
- `anthropicClient(apiKey)` added to `translation/anthropic.ts`, returning
  `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })`, with the
  `dangerouslyAllowBrowser` paragraph moved verbatim from
  `AnthropicProvider.ts`'s header over it (the provider's header keeps its
  first line, now pointing here, and its output-shape paragraph). Four sites
  call it: the provider's private `client()` (`return anthropicClient(key);`,
  so `validateKey` still builds inside its `try`), `explain.ts`, `gloss.ts`,
  `qul/compile.ts` — each at the same place as before.
- Explain, gloss and compile now use `Anthropic` only in type positions, so
  their import is `import type` (the plan's "after these steps" condition,
  met now): value imports of the SDK are only `translation/anthropic.ts` and
  the provider, which Q's allowlist reports.
- **T** exit 0. **Q** PASS, identical — every Anthropic scenario, headers
  included (`anthropic-dangerous-direct-browser-access`). **B** exit 0; main
  chunk 788,800 → 788,708 B (−92); only `index.js`; CSS byte-identical. SSR
  build resolves; **V owed**. **L**: no new edge; rules hold.

- **Review of 3d: PASS WITH NOTES; "ready for 3e".** The `import type`
  change belongs to row 3d itself ("imports become `import type` where only
  types remain"). Note applied in 3e: `anthropic.ts`'s header line re-wrapped.

**Step 3e, measured 2026-11-16**
- `toTranslationError` moved verbatim from the end of
  `providers/AnthropicProvider.ts` to `translation/anthropic.ts`, exported,
  with a short doc comment (new text); the provider imports it beside
  `anthropicClient`. Its three call sites (translate's two passes,
  `validateKey`'s last line) are unchanged, and `validateKey`'s boolean
  `instanceof` checks stay in the provider. The module header now names both
  mappings and is re-wrapped (3d review).
- **T** exit 0. **Q** PASS, identical — every provider error scenario
  (401, 403, 429 with and without a readable retry-after, 400, 500, connection
  failure, body drop, stream errors). **B** exit 0; main chunk 788,708 B
  (unchanged size, the mapping emitted beside the short one); only `index.js`;
  CSS byte-identical. SSR build resolves; **V owed**. **L**: no new edge; rules
  hold.

- **Review of 3e: PASS WITH NOTES; "ready for 3f".** The moved body is
  byte-identical (`cmp`). Note for 3r: FOUND_ISSUES 11 still places the
  `retry-after` read in `AnthropicProvider.ts`; it is now in `anthropic.ts`.

**Step 3f, measured 2026-11-16** (optional step, included by the owner's Q3)
- `textOf` moved verbatim, with its doc comment ("Text from EVERY text
  block…"), from `providers/AnthropicProvider.ts` to `translation/anthropic.ts`;
  the provider imports it (its two calls unchanged). The four inline copies —
  Explain's research notes and structuring text, gloss's text, compile's text
  (which keeps its `.trim()`) — became `textOf(…)`. Each copy was the same
  filter–map–join. Nothing outside the provider imported its `textOf`.
- `qul/compile.ts` no longer uses the SDK at all, not even its types, so its
  `import type Anthropic` line went; the SDK census now lists four files.
- **T** exit 0. **Q** PASS, identical — including the multi-text-block
  scenarios added for this step. **B** exit 0; main chunk 788,708 → 788,484 B
  (−224); only `index.js`; CSS byte-identical. SSR build resolves; **V owed**.
  **L**: no new edge; rules hold.

- **Review of 3f: PASS WITH NOTES; "ready for 3g".** `finalMessage()`'s
  `ParsedMessage` is an `Anthropic.Message`; every site was the same
  expression on the same type. Note applied in 3g: the header re-wrapped.

**Step 3g, measured 2026-11-16** (optional step, included by the owner's Q3)
- `addUsage` moved verbatim from `providers/AnthropicProvider.ts` to
  `translation/anthropic.ts`, exported, with a doc comment (new text);
  `anthropic.ts` gains a `type` import of `TranslationUsage`. The provider's
  two calls are unchanged. Explain's `accumulate`, character-identical apart
  from its name, is deleted, and its two calls now say `addUsage`. The module
  header names the running token total; its re-wrap was only partial (the 3g
  review found one 123-character line left), finished in 3h.
- **T** exit 0. **Q** PASS, identical — including per-turn cache-read and
  cache-write counts and the null and absent counts added for this step. **B**
  exit 0; main chunk 788,484 → 788,298 B (−186); only `index.js`; CSS
  byte-identical. SSR build resolves; **V owed**. **L**: no new edge; rules
  hold.

- **Review of 3g: PASS WITH NOTES; "ready for 3h".** Bodies identical, calls
  unchanged. The header re-wrap claimed in 3g was partial; corrected above and
  finished in 3h.

**Step 3h, measured 2026-11-16** (optional step, included by the owner's Q3)
- `WEB_SEARCH_TOOL` moved verbatim from `providers/AnthropicProvider.ts` to
  `translation/anthropic.ts`, exported, with a doc comment (new text); the
  provider imports it. Explain's inline `{ type: 'web_search_20260209', name:
  'web_search', max_uses: 5 }` — the same keys in the same order — became
  `WEB_SEARCH_TOOL`, so the request body serialises the same. The module
  header names the tool and is now re-wrapped as a whole paragraph (closing
  the 3f and 3g notes); its other long lines are code and message strings.
- **T** exit 0. **Q** PASS, identical — the dig-deeper and Explain research
  request bodies included. **B** exit 0; main chunk 788,298 → 788,249 B (−49);
  only `index.js`; CSS byte-identical. SSR build resolves; **V owed**. **L**:
  no new edge; rules hold.

- **Review of 3h: PASS WITH NOTES; "ready for 3i".** The shared object is never
  mutated (the SDK spreads params); Q's Explain and dig-deeper bodies carry the
  same tool JSON. Note: one header line is 81 characters (cosmetic).

**Step 3i, measured 2026-11-16**
- New `translation/gemini.ts` (plan §3): `geminiModelUrl(model, method)` —
  the URL both sites built — and `postGemini(url, apiKey, body)` — the `POST`
  with the `x-goog-api-key` and `content-type` headers, in the same order, and
  `JSON.stringify(body)` — with a header (new text). The provider's note 1 on
  why the key goes in a header moved over `postGemini`; the provider's
  numbered list keeps the note's first sentence with a pointer, so its "two
  deliberate differences" still reads as two.
- `GeminiProvider.translate`: the URL is still built once before the loop
  (`geminiModelUrl(request.model, 'streamGenerateContent?alt=sse')`); the
  fetch inside its `try` is `postGemini(url, key, body)`. `qul/compile.ts`:
  `postGemini(geminiModelUrl(model, 'generateContent'), apiKey, { … })`, the
  body object unchanged, inside its `try`; its pointer comment now names
  `postGemini`. Evaluation order — URL, body object, `JSON.stringify`,
  `fetch` — unchanged at both. Error handling, status checks and parsing stay
  at each site (owner's Q4). `validateKey`'s `GET` untouched.
- Compile no longer imports `GEMINI_BASE`; Q's census lists `gemini.ts`,
  `models.ts` and the provider (`validateKey`).
- **T** exit 0. **Q** PASS, identical — every Gemini scenario, URLs, headers
  and bodies. **B** exit 0; main chunk 788,249 → 788,188 B (−61); only
  `index.js`; CSS byte-identical. SSR build resolves; **V owed** (compile).
  **L**: 134 edges (`qul → translation` existed); rules hold.

- **Review of 3i: PASS WITH NOTES; "ready for 3j".** URLs, header order and
  bodies identical in both bundles; `JSON.stringify` still runs inside each
  caller's `try` (`postGemini` is not async). Applied in 3j: `gemini.ts`'s
  header says "both Gemini model calls" (the key check is a GET of its own) and
  points at compile's Gemini branch in FOUND_ISSUES 11.

**Step 3j, measured 2026-11-16** (owner's Q6 (a))
- `GLOSS_MAX_TOKENS = 2000` and `GLOSS_OUTPUT_CONFIG: { effort: Effort } = {
  effort: 'low' }` in `models.ts`, right after `ANTHROPIC_GLOSS_MODEL`, each
  under its comment moved verbatim from `gloss.ts`. `gloss.ts`'s request reads
  `max_tokens: GLOSS_MAX_TOKENS, output_config: GLOSS_OUTPUT_CONFIG,` in the
  same place, so the body's key order is unchanged. FOUND_ISSUES 4 notes the
  move. No model fact changed: the values are the ones gloss sent.
- **T** exit 0. **Q** PASS, identical — every gloss request body. **B** exit 0;
  main chunk 788,188 → 788,200 B (+12, two named constants); only `index.js`;
  CSS byte-identical. SSR build resolves; **V owed** (`models.ts`). **L**: no
  new edge; rules hold.

- **Review of 3j: PASS WITH NOTES; "ready for 3k".** Gloss's `create()` keys,
  order and values identical in both bundles; sharing one
  `GLOSS_OUTPUT_CONFIG` object is safe (SDK 0.120.0 copies the params
  shallowly and never writes `output_config`). Note: the constant is not
  frozen; not a defect today. `Effort` is assignable to the SDK's
  `OutputConfig.effort`.

**Step 3k, measured 2026-11-16** (owner's Q7)
- `costOf` and its doc comment moved verbatim from
  `providers/AnthropicProvider.ts` to `models.ts`, right after
  `CACHE_WRITE_MULTIPLIER`. `models.ts`'s `types` import gains
  `TranslationUsage` (type-only, R11). The provider imports `costOf` from
  `../models` and no longer imports `PRICES` or the two multipliers.
  `ui/reader/useExplanations.ts`, `verify-parsers.ts:4159` and
  `verify-requests.ts:330` import it from `translation/models`.
- **T** exit 0. **Q** PASS, identical (`values.costOf` included). **B** exit 0;
  main chunk 788,200 → 788,200 B (0); only `index.js` differs (the function's
  position); CSS byte-identical. SSR build resolves; **V owed** (`models.ts`,
  the cost checks at `verify-parsers.ts:4224-4243`). **L**: 134 edges, no new
  one; rules hold. **S R U** were still running when 3k was committed (the
  commit added only this text to the tree they ran on): **S** 30/30; **R**
  28/28, perf identical to the baseline (240,000 px in 33.3 s, 1,905 DOM
  nodes, 0 long tasks; portrait 175,800 px in 24.4 s, 1,904 nodes); **U**
  180/180.

- **Review of 3k: PASS WITH NOTES; "ready for 3l".** The moved block diffs
  identical; no importer of `costOf` from the provider path is left anywhere;
  every import left in the provider is used; no new edge. Notes applied here:
  the 3j row's hash in backticks, the over-long line above re-wrapped. Noted,
  not changed: the plan's 3k paragraph cites the old line numbers (316-341,
  now 282-307) and leaves `verify-requests.ts` out of its sentence (the Steps
  row names it).

**Step 3l, measured 2026-11-16** (owner's Q5)
- `compile.ts`'s `compileAyah` dispatches through
  `const COMPILERS: Record<CloudProviderId, (model, apiKey, prompt) =>
  Promise<CompileResult>>` instead of the `=== 'anthropic' ? … : …` ternary,
  so a new cloud provider is a `tsc` error there rather than a fall into
  Gemini. Same function for both ids. A value outside `CloudProviderId`
  (which the type forbids and `EntitySheet.tsx` guards) would now reject with
  a `TypeError` instead of going to Gemini — unreachable.
- **T** exit 0. **Q** PASS, identical — every compile scenario. **B** exit 0;
  main chunk 788,200 → 788,198 B (−2); only `index.js` differs; CSS
  byte-identical. SSR build resolves; **V owed**. **L**: rules hold.

- **Review of 3l: PASS; "ready for 3m".** Both ids reach the same function
  with the same arguments; the lookup and the old ternary both return the
  inner promise from the async body, so errors still arrive as rejections;
  the table names hoisted `async function` declarations, so there is no TDZ
  (the bundle keeps that order).

**Step 3m, measured 2026-11-16** (plan Design §4)
- `providerIdForModel(model): CloudProviderId` in `providers/registry.ts`,
  right after `providerFor`: the expression moved verbatim from
  `AppContext.tsx:143`, whose comment stays where it is. The line now reads
  `profile.providerId ?? providerIdForModel(profile.model)`. `AppContext` no
  longer imports `isClaudeModel` (that line was its only use); the registry
  imports it from `../models`, an edge `translation/providers → translation`
  already had.
- **Q**: section `values.providerIdForModel` added (every model id Q knows,
  both offline ids, `'some-model'`, `''`); the record's diff is 21 lines
  added, none removed. Checked by reading against `isClaudeModel`
  (`startsWith('claude-')`): the seven Claude ids are `anthropic`, everything
  else `gemini`. Then PASS, identical. **T** exit 0. **B** exit 0; main chunk
  788,198 → 788,224 B (+26, an exported function); only `index.js` differs;
  CSS byte-identical. SSR build resolves; **V owed**. **L**: 134 edges, rules
  hold. **U** 180/180 (boot path changed).

- **Review of 3m: PASS; "ready for 3n".** Types reduce to `ProviderId` before
  and after; a legacy profile with no model still yields `gemini`; the
  record's diff is strictly additive. Note for the plan, applied in 3r: Design
  §4's "nothing new from `models.ts`" should read "nothing beyond
  `isClaudeModel` (3m)".

**Step 3n, measured 2026-11-16** (plan Design §4)
- `TranslationProvider` gains `knownModels` (comment from Design §4):
  Anthropic `[...ANTHROPIC_MODELS, ...SUPERSEDED_ANTHROPIC_MODELS]` (the
  superseded list gains `export`), Gemini `GEMINI_MODELS`. `modelsFor`,
  `findModelOption` (with its doc comment) and `defaultModelFor` are deleted
  from `models.ts` and written in `registry.ts` as lookups on `providerFor`
  — the one rewrite of the phase. `models.ts` drops its now-unused
  `ProviderId` import; the registry imports `ModelOption`. Importers:
  `SettingsScreen.tsx` and `ProfileEditor.tsx` merge the names into their
  registry import, `TranslationCardView.tsx` likewise (its `models` import
  line goes), `verify-parsers.ts:4196` uses the registry's `findModelOption`
  (imported in that block), `verify-requests.ts` calls `registry.*`.
- Equivalence: `anthropic` → the same arrays and default; `gemini` → Gemini's;
  `offline` → the old else branch (Gemini) and now `providerFor`'s fallback
  to `DEFAULT_PROVIDER_ID` (`gemini`). The one difference: `findModelOption`
  used to build a fresh array per call; `knownModels` is one array per
  provider, never mutated, and `find` returns the same option objects.
- **T** exit 0. **Q** PASS, identical — every id × model, and
  `modelsForIsProviderArray` still true. **B** exit 0; main chunk 788,224 →
  788,246 B (+22); only `index.js` differs; CSS byte-identical. SSR build
  resolves; **V owed** (`verify-parsers.ts:4196`). **L**: 134 edges, rules
  hold. **U S R** were running when 3n was committed, on the same
  `src`/`scripts` content (the commit added only this text): **U** 180/180;
  **S** 30/30; **R** 28/28, perf identical to the baseline in both
  orientations.

- **Review of 3n: PASS WITH NOTES; "ready for 3o".** All three ids give the
  same results; nothing mutates `availableModels` or `knownModels` (grepped
  for sort/push/splice/reverse and the rest); no stale `models.`-qualified
  use anywhere. Notes, for 3r: `verify-requests.ts:333`'s "a value 3n's
  knownModels may read" is untrue (`knownModels` does not read
  `OFFLINE_MODELS`); the commit message says offline "still falls to Gemini"
  without saying that holds while `DEFAULT_PROVIDER_ID` is `gemini` (this
  entry and the plan's R6 do).

**Step 3o, measured 2026-11-16** (plan Design §4)
- `TranslationProvider` gains `keyPlaceholder` (comment from Design §4),
  after `keyHelpUrl`; Anthropic `'sk-ant-…'`, Gemini `'AIza…'`. The strings
  were taken by script from the two ternaries they replace, not retyped: both
  end in U+2026. `SettingsScreen.tsx:273` and `OnboardingScreen.tsx:106` read
  `placeholder={provider.keyPlaceholder}` (`provider` was already
  `providerFor(providerId)` in both).
- **U** 180/180; the captured DOM holds `placeholder="AIza…"` and
  `placeholder="sk-ant-…"` eight times each (settings, settings--api-keys,
  settings-proxy, onboarding, onboarding--claude, both sizes). **T** exit 0.
  **Q** PASS, identical (the descriptor section lists fields by name and
  does not record the new one, by design: the record does not change at 3o).
  **B** exit 0; main chunk 788,246 → 788,258 B (+12); only `index.js`; CSS
  byte-identical. **L**: rules hold.

- **Review of 3o: PASS WITH NOTES; "ready for 3p".** Both strings
  byte-identical in source and bundle (`E2 80 A6`); `provider` is recomputed
  each render from the same `providerId` in both screens; no `sk-ant`/`AIza`
  left in `src` outside the two providers. Note, for 3r: the plan's Design §3
  row says `SettingsScreen.tsx:274`; the line was 273.

**Step 3p, measured 2026-11-16** (owner's Q6 (b), the first option)
- `OfflineTranslation.tsx:206`: "No — use a cloud provider" saves
  `{ providerId: 'gemini', model: GEMINI_DEFAULT_MODEL }` instead of the
  inline `'gemini-3.7-flash'` (the same value, `models.ts:153`); the
  provider literal stays — "back to Gemini", not a new "back to the default".
  The file imports `GEMINI_DEFAULT_MODEL` from `translation/models` (an edge
  `ui/settings → translation` already had). FOUND_ISSUES 4 notes it.
- **T** exit 0. **Q** PASS, identical. **B** exit 0; main chunk 788,258 →
  788,242 B (−16; the bundle's handler now reads the shared constant
  `providerId:"gemini",model:bp`); only `index.js`; CSS byte-identical.
  **L**: rules hold. **U** 180/180 (the section is unchanged; the handler
  itself is read, not run: it needs an installed on-device model).

- **Review of 3p: PASS WITH NOTES; "ready for 3q".** Value byte-identical;
  no model id left in `src` outside `models.ts` (the one `gemini-` hit is the
  localStorage key name in `services/secrets.ts`); the handler is exercised
  by no check (the select renders only with an installed on-device model) —
  verified by reading. Note, for 3r: FOUND_ISSUES 4 still cites
  `OfflineTranslation.tsx:210` (the Phase 0 line); it is `:206`.

**Step 3q, measured 2026-11-16** (owner's Q10)
- `explain.ts` exports `EXPLAIN_PROVIDER_ID = 'anthropic' as const` and
  `explainModelFor(profileModel)`, the expression moved from
  `useExplanations.ts:95-97` (`isClaudeModel(…) ? … :
  ANTHROPIC_EXPLAIN_FALLBACK_MODEL`, the parameter renamed); `explain.ts`'s
  `models` import gains the two names. `gloss.ts` exports
  `GLOSS_PROVIDER_ID = 'anthropic' as const`. Each has a short comment saying
  why the feature is Claude-only. `useExplanations.ts` uses them at the key
  read and the card (its `models` import of the two names goes);
  `ReaderScreen.tsx` uses `GLOSS_PROVIDER_ID` at the gloss's key read and the
  `meaningAvailable` test. The notice "needs an Anthropic key" is copy and
  stays. Two imports that grew past the line were wrapped.
- **Q**: section `values.explainModelFor` added (the ids of
  `values.providerIdForModel`); the record's diff is 21 lines added, none
  removed. Checked by reading: the seven Claude ids map to themselves,
  everything else to `claude-sonnet-5-5` (`ANTHROPIC_EXPLAIN_FALLBACK_MODEL =
  CLAUDE_SONNET_5_5`). Then PASS, identical. **T** exit 0. **B** exit 0; main
  chunk 788,242 → 788,264 B (+22); only `index.js`; CSS byte-identical. SSR
  build resolves; **V owed**. **L**: 134 edges, rules hold. **U S R** were
  running when 3q was committed, on the same content: **U** 180/180; **S**
  30/30; **R** 28/28 — 240,000 px in 33.6 s landscape (33.3 s baseline; the
  same distance, nodes and blocks, 0 long tasks: timing noise), 175,800 px in
  24.4 s portrait, 1,905 / 1,904 DOM nodes.

- **Review of 3q: PASS WITH NOTES; "ready for 3r"** (conditional on U S R,
  which then passed). Behaviour value-identical; the moved ternary token for
  token; the record's diff strictly additive; the only `'anthropic'` left in
  `src/ui` is Onboarding's Q9 toggle. Applied in 3r: `explainModelFor`'s
  comment said "verbatim", but the parameter was renamed.

**Step 3r, measured 2026-11-16**
- Part 1 (`7743f69`, docs only): RESTRUCTURE status, Phase 3 marked complete,
  §2's provider sentence reworded (Q16, from Design §5); the CLAUDE.md map
  names `anthropic` and `gemini`, and its model-facts pointers (Never, trap 4)
  say no model id is inline any more and where the remaining call parameters
  are listed; `torjuman-llm.md`'s map and its "still hard-coded" paragraph;
  README's list of direct callers names the two shared modules; FOUND_ISSUES
  4 (Phase 3 status, `:206`), 11 (the retry-after read is now
  `toTranslationError` in `anthropic.ts`) and 12 (`validateKey`'s lines); the
  plan gains "Corrections found in review", its approved text left as is.
- Part 2: the comments that became true — `TranslationProvider.ts`'s header
  (screens ask the registry; what still names a provider is Design §5) and
  `registry.ts`'s (what adding a provider takes; the old "only place" claim
  named as corrected, FOUND_ISSUES 4); `explainModelFor`'s "verbatim but for
  the parameter's name"; `verify-requests.ts`'s note on `OFFLINE_MODELS`
  (3n review). Check Q's allowlist narrowed to the end state (Design §10):
  the SDK as a value only in `anthropic.ts` and `AnthropicProvider.ts`,
  `GEMINI_BASE` only in `models.ts`, `gemini.ts` and `GeminiProvider.ts`.
  Negative test: `gloss.ts`'s SDK import made a value import → Q FAIL
  "allowlist: src/translation/gloss.ts imports @anthropic-ai/sdk as a value";
  restored from a copy → PASS. The markup manifest's line 2 (and the line in
  `verify-markup.mjs` that writes it) now says captures were added in 3b; `#`
  lines are not compared.
- **End of phase:** **T** exit 0. **B** exit 0, main chunk 788,264 B, every
  chunk identical to 3q's (comments only); CSS byte-identical. SSR build of
  `verify-parsers.ts` resolves. **L** `--check`: 162 files (`anthropic.ts`,
  `gemini.ts`), 134 edges, no cycles, 11 rules hold; report saved as
  [`phase3/layers.txt`](phase3/layers.txt) — against Phase 2's, the same
  edges, `ui/reader → translation/providers` 3 → 2 (useExplanations no longer
  reaches a provider file). **Q** PASS identical: 111 scenarios, 179
  requests, 10 value sections. **U S R** were running when part 2 was
  committed, on the same content: **U** 180/180 (the manifest's sha256
  `83434fbe…` unchanged by the run); **S** 30/30; **R** 28/28, perf
  identical to the baseline (240,000 px in 33.3 s / 175,800 px in 24.4 s;
  1,905 / 1,904 DOM nodes; 404 / 406 blocks; 0 long tasks).

- **Review of 3r and of Phase 3 as a whole: PASS WITH NOTES; "ready for the
  PR stacked on #10", merged only after V and M (Q15).** Over the range:
  `prompt.ts`, `profiles.ts`, `services/`, `platform/`, `package-lock.json`,
  `layers.json`, `.gitignore`, `.github/` unchanged (no cache-key input, no
  IndexedDB change, no dependency; `package.json` gains only the
  `verify:requests` script); `requests.json` changed after the harness
  commits only by the two added sections; every chunk of 3r identical to
  3q's; the layer report at HEAD byte-identical to `phase3/layers.txt`; no
  refactor commit fixed a bug. Fixed here (four required, docs and one
  comment): the agent's and CLAUDE.md's "no other file imports the SDK as a
  value" now name `AnthropicProvider.ts` too (its key check tests the SDK's
  error classes); RESTRUCTURE §6's Phase 3 row matched to §2 and Design §5
  (two mappings, by Q4; what still names a provider); `anthropicCallError`'s
  comment, stale since 3e, points at `toTranslationError` in the same file;
  CLAUDE.md says no *cloud* model id is inline (the on-device ids live in
  `OfflineProvider.ts`) and is re-wrapped. Notes applied: README says the
  Gemini key check's `GET` does not go through `gemini.ts`; the registry,
  RESTRUCTURE §2 and the agent add `useTranslator.ts`'s
  `Record<ProviderId, number>` to what `tsc` reports; `TranslationProvider.ts`
  names compile's table.

- **Review of `0648b5a` (the phase fixes): FAIL, two wordings, fixed here.**
  RESTRUCTURE's Phase 3 row said compile, Explain and gloss "now read" the
  registry's descriptors — they do not (compile has its own table, Explain
  and gloss export a fixed provider); the row now says what each does and
  lists them, and Offline's "back to Gemini" (Q6), among what still names a
  provider. And `useTranslator.ts`'s request counts are a
  `Record<ProviderId, number>`, not a `Record<CloudProviderId, …>`: the
  registry comment, RESTRUCTURE §2 and the agent now say so. Three lines left
  unwrapped (RESTRUCTURE §2, `registry.ts`, README) are re-wrapped.
- **Review of `6fa343b`: PASS WITH NOTES; "ready for the Phase 3 PR".** Both
  wordings true against the code. Applied in the next commit: one line the
  re-wrap left at 88 characters (RESTRUCTURE §2), and the agent's list of
  what still names a provider gains compile's table and Offline's "back to
  Gemini". Noted: the entry for `0648b5a` above says the `Record<ProviderId,
  number>` wording was added there; it arrived in `6fa343b`.

## Phase 3 result

| | Phase 2 end | Phase 3 end |
| --- | --- | --- |
| Anthropic SDK clients | built in 4 files | `anthropicClient` in `translation/anthropic.ts`; the SDK a value import in 2 files (Q enforces) |
| error mappings | 4 copies (2 kinds) | `anthropicCallError` and `toTranslationError`, one each (FOUND_ISSUES 11: not merged) |
| Gemini model POSTs | 2 hand-built | `geminiModelUrl` + `postGemini` in `translation/gemini.ts` |
| provider named by | models' three functions, Settings, Onboarding, AppContext, compile, the reader, Offline | the provider objects (`knownModels`, `keyPlaceholder`), the registry's lookups, `COMPILERS`, `EXPLAIN_`/`GLOSS_PROVIDER_ID`; what stays is plan Design §5 |
| model ids outside `models.ts` | 1 (`OfflineTranslation`) | 0 |
| main JS chunk | 789,438 B | 788,264 B (−1,174) |
| check Q (recorded requests) | — | 111 scenarios, 179 requests, 10 value sections; identical at every step but the two additive sections (3m, 3q) |
| screens (check U) | 160 files | 180 files (3b's captures), identical at every step |
| verify:selection / verify:reader | 30/30, 28/28 | 30/30, 28/28, same performance |

Every step was reviewed before the next began. **Owed before merge:** `npm
run verify` on the owner's PC (3c–3l and 3n touch modules it builds, and its
own imports at `verify-parsers.ts:4159` and `:4196`), and **M** on the
staged build with real keys: test both keys; translate one passage on each
provider; Dig deeper once; Explain once; a word's Meaning (gloss); Compile one
āyah on each provider; switch a profile between providers and see the model
list and default follow.

## Phase 4: storage (complete, branch `claude/restructure-phase-4`)

Plan: [`plans/phase4-storage.md`](plans/phase4-storage.md); **approved
2026-11-16, all thirteen answers as recommended** (`109d400`).

| Step | State | Commit |
| --- | --- | --- |
| 4a. Check D (`scripts/verify-storage.mjs`, `verify-storage-harness.ts`, `npm run verify:storage`), baselined on the old code; FOUND_ISSUES 16–25 | D proven; review PASS WITH NOTES | `8579140` |
| review notes: 4a — D's coverage gaps closed on the old code (every method before `init`, puts over existing keys, the bundle's page errors, the share adapter's reads) | D re-baselined and re-proven; review FAIL (a lost cache-key hit) | `8a9cb4b` |
| 4a fix — the card cache-key hit restored | D re-baselined (run1 == run2) and breakage 9 proven; review PASS, "ready for 4b" | `c1d2cfb` |
| 4b. `DB_NAME`, `DB_VERSION` with its history, `BOOK_STORES`/`BookStore`, `Schema` → `idbSchema.ts` | T B L D Q pass; V owed; review PASS WITH NOTES | `056290a` |
| 4c. the `upgrade` callback body → `upgradeDatabase` in `idbSchema.ts` | T B L D Q U pass; V owed; review PASS WITH NOTES | `a4ba6af` |
| 4d. `PURGE_BATCH`, `purgeIndex` → `idbPurge.ts`; the adapter's header made true | T B L D Q pass; V owed; review FAIL (the header's parenthesis, an export) | `d716952` |
| 4d fix — the adapter's header true at this point; `PURGE_BATCH` not exported | T B L D pass; review PASS, "ready for 4e" | `db6b10e` |
| 4e. raw store I/O → `idbTransfer.ts` (with a departure: the moved functions take a handle *fetcher*) | T B L D Q pass, and a negative test of the departure; V owed; review PASS WITH NOTES | `6b7ce2a` |
| 4f. the user's-work group → `idbWork.ts` | T B L D Q S R pass; V owed; review PASS WITH NOTES | `284b7ef` |
| 4g. the reference group → `idbReference.ts` | T B L D Q pass; V owed; review PASS | `ab1c19b` |
| 4h. the book-content group → `idbLibrary.ts` | T B L D Q S R pass; V owed; review PASS | `b04c7f8` |
| 4i. the work backup → `idbBackup.ts` | T B L D Q pass; V owed; review PASS WITH NOTES | `1b5089a` |
| 4j. the `STORES` table in `idbSchema.ts`; the fresh-install branch creates from it | T B L D Q U pass, and two negative tests; V owed; review PASS WITH NOTES | `11ee82e` |
| 4j follow-up — D covers a v10 without qulCompilations (`harness/odd-v10-without-qulCompilations`); the 4j review's comment notes | T D Q pass, run1 == run2, the new scenario proven; build identical to 4j after masking; review PASS WITH NOTES | `afffa50` |
| 4k. the existing-DB branch reads `STORES` (one snapshot of the names; the trio's shared guard as `createdWith`) | T B L D Q U pass, and five negative tests; V owed; review PASS WITH NOTES | `87b3b26` |
| 4l. `BOOK_STORES` from the table's `perBook` flag (same ten names, same order); the 4k review's comment fixes | T B L D Q pass, and three negative tests; V owed; review PASS WITH NOTES | `b60633e` |
| 4l follow-up — D asserts `BOOK_STORES`' order against its own hand list (negative test 3 now caught) | T D pass; the record unchanged; review PASS WITH NOTES | `7bffce0` |
| 4m. `WORK_STORES` drives `exportWork`/`importWork` (Q7); the 4l review's must-fix; D's order check no longer keyed on a scenario name | T B L D Q pass, the SSR build, and five negative tests; V owed; review PASS | `b69abd4` |
| 4n. docs and comments made true; D's keyed assertions guarded; the plan's corrections; end of phase | T B L D Q U S R pass, the SSR build; V and M owed; review pending | this commit |

**Step 4a, measured 2026-11-16** (no `src/` change; `git diff --quiet -- src`
holds)
- Built by the `torjuman-storage` agent from plan Design §1. Playwright in the
  container's Chromium (153.0.8010.12, from `playwright` 1.63.0), no new
  dependency (Q1). Two halves on one `vite preview` origin: the shipped
  bundle for the schema, and a Vite library-mode build of the real
  `IdbStorageAdapter`, `library/transfer`, `library/deviceTransfer` and
  `share/ShareStorageAdapter` for everything else. Every phase in a fresh
  context; en-US, UTC, service workers blocked, `page.clock` fixed,
  `Math.random` seeded; requests off the origin aborted.
- **40 scenarios, 49 phases** (50 after the review notes below): bundle 7 (fresh, upgrade from v1base, v7, v8,
  v9, v10, reopen v11); harness 33 — the same seven with a row in every store
  the old version had (schema and rows in one scenario), the two impossible
  QUL databases, `before-init`, 18 method families (the interface's sections
  plus the six raw whole-tablet calls), per-book delete (4,097 blocks in one
  book), work backup (4 phases), per-book transfer (4), whole-tablet transfer
  (4: export with and without keys, two restores, six refusals), share
  adapter. Record `docs/refactor/phase4/storage.json`, **340,129 B** (360,229 B
  after the review notes, 361,971 B after the cache-key fix).
  **Run time**: about 11 s for the check, 17.6 s for `npm run
  verify:storage` with its build.
- **Masked: nothing.** Pinned: `Date.now` (page.clock), `Math.random`, locale,
  time zone. Ids `newId` makes on arrival (entities, the dictionary root
  index) come out the same every run.
- Asserted on every run, `--write` included: the three fake keys
  (`sk-ant-d-check-…`, `AIza-d-check-…`, `sunnah-d-check-…`) in no work backup,
  no per-book file, no whole-tablet file without keys, and all three in the
  one with them; both restores equal the source row for row; every refusal
  and the share adapter's ignored writes left the database (and
  localStorage) untouched.
- **Proof.** Run 1, then run 2 with `--write`: byte-identical (`cmp`); runs
  with `TZ=Pacific/Kiritimati` and a German locale, and with
  `TZ=America/St_Johns`: PASS. Those runs change only the **Node** process
  (the script's own formatting and hashing); every browser context pins
  `timezoneId` UTC and locale en-US whatever the machine says, so they show
  that the Node side is deterministic, not that the page code is independent
  of time zone or locale — the page side is pinned, not varied. The five breakages, each a temporary edit
  restored from a backup copy (`cmp` equal, `git diff --quiet -- src` after
  each), each exit 1:
  1. `cards`' `byCacheKey` index dropped from the fresh branch → 25 of 40
     differ: `bundle/fresh`, `harness/fresh` and every harness scenario that
     installs fresh (18 families, `delete-book`, `work-backup`,
     `book-transfer`, `device-transfer`, `share-adapter`); no upgrade
     scenario;
  2. the `sharhCards` guard removed → 6: `bundle/` and `harness/`
     `upgrade-v1base`, `-v7`, `-v8` (v9 and v10 already have it);
  3. `marks` removed from `BOOK_STORES` → 2: `delete-book`, `book-transfer`;
  4. `hadiths` dropped from `exportWork` → 1: `work-backup`;
  5. the `schemaVersion` comparison in `parseHeader` removed → the assertion
     "rows and localStorage untouched after restoreDevice, schemaVersion 10"
     and 1 scenario, `device-transfer`.
  Final run after restoring: PASS.
- **Where the plan's design was not followed as written**: the upgrade-rows
  group is merged into the harness schema scenarios (one phase records both);
  the impossible database without `qulResources` makes `init` reject with an
  AbortError, the ConstraintError reaching the page as an uncaught exception
  (recorded as `uncaughtInPage`); a schema other than a fresh install's is
  written `"stores": "as today"` when it equals TODAY built with raw
  IndexedDB (compared in full either way — the first version abbreviated
  against `harness/fresh`, which made a fresh-branch breakage show in every
  upgrade scenario); the work backup file is its length and SHA-256, its
  content being the `exportWork` value beside it; a third fake key
  (Sunnah's) is planted. Added beyond the plan: the raw-store-I/O family,
  two refusals (a work backup given as a tablet file; `restoreDevice`'s own
  header check), a failed replacement in the per-book conflict phase.
- **Found**: FOUND_ISSUES 16–23 are the plan's A–H; **24 is new and is a data
  loss**: replacing a book from a Library transfer file deletes its marks,
  cards, explanations, sharḥ cards and position, though the confirm dialog
  says they are kept; a failed replacement leaves no copy of the book. 25 is
  new and cosmetic (a restore's card count omits sharḥ cards).
- T exit 0; B main chunk 788,264 B (unchanged); L 162 files, 134 edges, 11
  rules hold; Q PASS.

- **Review of 4a: PASS WITH NOTES.** Coverage gaps to close on the old code
  before any move, and readability notes. Closed here, still with no `src/`
  change (`git diff --quiet -- src`):
  - **`before-init` calls every one of the 84 interface methods** (95 calls:
    11 methods are called twice — 10 with an early return, empty and
    non-empty, and `listBiographyEntries` with and without a filter), in the
    interface's order, and fails the harness if the list and the class's
    own prototype disagree (less `init` and the private helpers `handle`,
    `purgeIndex`, `loadSearchIndex`, `untyped`). Today 83 reject, 1 throws
    synchronously (`listStoreNames`), and 11 resolve without reading the
    handle (the empty-list early returns, the empty searches, a naming under
    three letters, the `schemaVersion` getter). This is what R5 relies on to
    catch a delegate that reads `this.handle` synchronously after the fifth
    adaptation (4f–4h).
  - **Puts over existing keys**, where a `put`→`add` change would show:
    `putCard` and `putMarks` over existing ids (`family/cards`,
    `family/marks`), `putStoreRows` over existing rows before any clear
    (`family/raw-store-io`), and a new `work-backup` phase
    `import-over-existing` — an older copy of every backed-up row under the
    same keys, plus a row only the receiving tablet has, which survives.
  - The bundle half records each scenario's uncaught page errors and console
    errors, sorted (none today in any of the seven).
  - The share scenario reads through `ShareStorageAdapter`: 18 reads that
    reach the visitor's own database (the verse and compilation just written
    through among them) and 6 the bundle answers (a book, blocks, the
    always-missing card lookup, position, page).
  - Gap (c), write order and transaction boundaries, stays a reviewer check
    (the word diff of moved bodies); the script's header now says so.
  - Readability: the header's paragraph on the two odd databases re-wrapped;
    `rowsRecord`'s comment made true. A step list was also being shortened
    like a row list once it passed 50 entries (`before-init` and
    `share-adapter` would have been recorded as count and hash); steps are
    now always listed in full and only values inside them are shortened.
  - **A comment that becomes untrue at 4d**: the harness's header calls
    `IdbStorageAdapter` "the only IndexedDB code". Left as is; it is
    corrected with the adapter's own header in 4d (Q8).
- **Re-measured**: 40 scenarios, **50 phases** (the new backup phase),
  record **360,229 B**; about 12 s for the check. Run 1, then run 2 with
  `--write`: byte-identical (`cmp`); `TZ=Pacific/Kiritimati` with a German
  locale: PASS (Node side only, as above). Breakages re-proven, each restored
  from a backup (`cmp` equal, `git diff --quiet -- src`), each exit 1:
  1. `byCacheKey` dropped from the fresh branch → the same 25 scenarios;
  3. `marks` out of `BOOK_STORES` → `delete-book`, `book-transfer`;
  5. the `schemaVersion` check removed → the refusal assertion and
     `device-transfer`;
  and three that only the new coverage catches, each changing one scenario:
  6. `getBook` no longer `async` (it then throws synchronously before
     `init`) → `family/before-init`: `rejected` becomes `threw`;
  7. `put` → `add` in `putStoreRows` → `family/raw-store-io` (the write over
     existing keys rejects; a restore after a clear never showed it);
  8. `put` → `add` in `importWork` → `work-backup` (`import-over-existing`:
     `ConstraintError: Key already exists in the object store.`).
  Final run PASS. T exit 0; B 788,264 B; L 162 files, 134 edges, rules hold;
  Q PASS.

- **Review of `8a9cb4b`: FAIL, one coverage regression, fixed here.** The new
  overwrite step in `family/cards` ran before the only `getCardByCacheKey`
  that hit, so both lookups of `cache-a2` missed and no hit through the
  `byCacheKey` index was left anywhere in the record: a moved lookup that
  always returned `undefined` would have passed. Now a hit on `cache-a2`
  before the overwrite, then a miss on it and a hit on `cache-a2-new` after.
  Also the "95 calls" wording above corrected (10 early returns and
  `listBiographyEntries` are the 11 called twice). Everything else in the
  review checked out: the prototype assertion bites both ways; the step-list
  fix hid nothing (all 37 old `before-init` outcomes identical); the
  overwrites really overwrite.
- **Re-measured**: record **361,971 B**; only `family/cards` differed before
  the rewrite; run 1, then run 2 with `--write`: byte-identical (`cmp`).
  Breakage 9, `getCardByCacheKey` returning `undefined` → FAIL, 2 of 40
  scenarios differ (`family/cards`, and `family/before-init`, where the
  rejection becomes a resolve); restored from a copy (`cmp` equal, `git diff
  --quiet -- src`), then PASS.
- **Review of `c1d2cfb`: PASS; "ready for 4b".** The record's diff is the two
  `family/cards` hunks only; the new hit returns the replaced row's values.

**Step 4b, measured 2026-11-16**
- `IdbStorageAdapter.ts:41-59` (`DB_NAME`, the schema history, `DB_VERSION =
  11`) and `:71-169` (`BOOK_STORES` with both comments, `BookStore`, `Schema`)
  moved verbatim into the new `platform/storage/idbSchema.ts`, `export` added
  to the five names; it imports `idb`'s `DBSchema` and the 24 types (the
  adapter's type import copied). A five-line header says what the file is.
  The adapter imports the five names and drops `DBSchema` from its `idb`
  import; `SETTINGS_KEY`, `PURGE_BATCH` and `SearchEntry` stay until their
  groups move. `DB_VERSION = 11` moved as is.
- **T** exit 0. **B** exit 0; main chunk 788,264 → 788,264 B (0; the
  declarations' order in the bundle changes only); only `index.js` differs;
  CSS byte-identical. **L**: 163 files, 134 edges, rules hold. **D** PASS,
  identical. **Q** PASS. **V owed** (nothing it builds changed).

- **Review of 4b: PASS WITH NOTES; "ready for 4c".** Verbatim apart from the
  five `export`s, the imports and the header; the bundle differs only in
  the order of pure constant initialisers. Applied: the header was five
  lines, not four (above); `idbSchema.ts`'s header said the upgrade branches
  were in `IdbStorageAdapter.init`, which 4c makes untrue — reworded there.

**Step 4c, measured 2026-11-16**
- The `upgrade(db, oldVersion) { … }` body (`IdbStorageAdapter.ts:86-216`
  at `056290a`) moved into `export function upgradeDatabase(db:
  IDBPDatabase<Schema>, oldVersion: number): void` at the end of
  `idbSchema.ts`, re-indented from eight spaces to two and otherwise
  verbatim (a whitespace-stripped diff is empty), `return;` included. `init`
  passes `{ upgrade: upgradeDatabase }`. The body used nothing from the
  adapter's scope (no `this`, no adapter constant). `idbSchema.ts` imports
  `IDBPDatabase` beside `DBSchema`; its header now says the upgrade callback
  is there, and the function has a three-line doc comment.
- **T** exit 0. **B** exit 0; main chunk 788,264 → 788,284 B (+20, a named
  function); only `index.js`; CSS byte-identical. **L**: rules hold. **D**
  PASS, identical — every schema scenario, fresh and upgraded. **U** 180/180
  (a fresh install through the bundle). **Q** PASS. **V owed**.

- **Review of 4c: PASS WITH NOTES; "ready for 4d".** idb calls `upgrade` as
  a plain function (`this` was already undefined), so naming it changes
  nothing; the body is verbatim. Note: the adapter's "ONLY file that talks to
  IndexedDB" was already untrue at 4c, not first at 4d as the plan's §5 and
  Q8 said — `upgradeDatabase` creates and deletes stores. So were the D
  harness's header (fixed in 4d with the adapter's) and CLAUDE.md's Never
  line and trap 6 ("both upgrade branches in `IdbStorageAdapter.init`"),
  which 4n fixes; they misled no one in the meantime, since `init` names
  `upgradeDatabase`.

**Step 4d, measured 2026-11-16**
- `PURGE_BATCH` with its comment and `purgeIndex` with its comment moved
  verbatim into the new `platform/storage/idbPurge.ts`: the method became
  `export async function purgeIndex(handle: IDBPDatabase<Schema>, store,
  index, key)`, de-indented one level, and its one `this.handle` became
  `handle` (the fifth adaptation, Q3). The six
  calls in the class became `purgeIndex(this.handle, …)`. Its comment
  "every call below" is kept verbatim though the calls are now in the
  adapter. The adapter drops its now-unused `BookStore` import. The
  adapter's header now says this file and the `idb*.ts` files beside it are
  the only IndexedDB code (Q8), and so does the D harness's header line.
- **T** exit 0. **B** exit 0; main chunk 788,284 → 788,277 B (−7); only
  `index.js`; CSS byte-identical. **L**: rules hold. **D** PASS, identical —
  the per-book delete over 4,097 rows, `deleteQulResource`,
  `deleteNarratorShard` and the clears among it. **Q** PASS. **V owed**.

- **Review of 4d: FAIL, two comment-level points, fixed in the next commit.**
  The code is clean: all six callers are `async`, so reading `this.handle`
  at the call site still turns a throw before `init` into a rejection (one
  microtask sooner), and D's `before-init` shows the same `rejected` for
  every purge caller. But the adapter's new header said the class "hands
  each [method] to its group", which only 4i makes true — now "is moving
  this class's code into them, store group by store group". And
  `PURGE_BATCH` had gained an `export` no file uses — outside rule 4 (b);
  removed (the line above says so). For 4n's list of comments to make true:
  `purgeIndex`'s "every call below passes a valid pair" (its callers are in
  the adapter, and later the group files); and the harness's `PRIVATE` set
  still names `purgeIndex`, now inert.
- **Review of `db6b10e`: PASS; "ready for 4e".**

**Step 4e, measured 2026-11-16**
- **A departure from Design §3, found here, applied from 4e on.** The plan
  has each moved method take the handle (`this.handle` → `handle`) and its
  class delegate pass `this.handle`. But some methods return before they
  touch the database: `putStoreRows` with no rows (and, in later groups,
  the empty `putMarks`, `putBlocks`, `deleteMarks`, the empty searches …)
  resolve even before `init`, and check D's `before-init` records exactly
  that. A delegate that reads `this.handle` to pass it would make them
  reject. So each moved function takes `handle: () => IDBPDatabase<Schema>`
  and calls it where the body read `this.handle` — still one token per
  site, `this.handle` → `handle()` — and the class passes one fetcher, a
  `private readonly lazyHandle = () => this.handle` field (an instance
  field, not on the prototype, so the harness's method list is unaffected).
  `purgeIndex` (4d) keeps its handle parameter: its callers have already
  read the handle. **Proven:** a delegate made eager (`const db =
  this.handle; return putStoreRows(() => db, …)`) → D FAIL, 1 of 40
  (`family/before-init`); restored from a copy, PASS.
- The device-transfer section's comment and its six members (`listStoreNames`,
  the private `untyped`, `countStoreRows`, `readStoreRows`, `putStoreRows`,
  `clearAllStores`) moved verbatim into the new
  `platform/storage/idbTransfer.ts`, de-indented, each a function whose first
  parameter is the fetcher; `this.handle` → `handle()`, `this.untyped(` →
  `untyped(handle, `, `this.searchIndex` → a `searchIndex` parameter typed
  `Map<string, unknown>` (these only clear it; `SearchEntry` moves with its
  group in 4h). `untyped` is not exported (only this file uses it). The
  `schemaVersion` getter and the section divider stay in the class; the class
  gains five one-line delegates, `listStoreNames` still synchronous (so it
  still throws, not rejects, before `init`).
- **T** exit 0. **B** exit 0; main chunk 788,277 → 788,528 B (+251: five
  delegates, the field); only `index.js`; CSS byte-identical. **L**: rules
  hold. **D** PASS, identical — every whole-tablet scenario and
  `family/raw-store-io`, `family/before-init`. **Q** PASS. **V owed**.

- **Review of 4e: PASS WITH NOTES; "ready for 4f".** The departure is
  necessary (ten methods resolve before `init`, listed in D's record),
  minimal (one form for every group; a context object would need `handle`
  public), still one token per site, and within the owner's Q3 wording; to
  be stated in the PR. Applied: the plan gains an amendment note under
  Design §3 so later reviews check the true form; "five members" above was
  six; `countStoreRows`'s signature in `idbTransfer.ts` wrapped like its
  neighbours. For 4n: the harness's `PRIVATE` set now also names the inert
  `untyped`.

**Step 4f, measured 2026-11-16**
- Thirty methods moved verbatim into the new `platform/storage/idbWork.ts`,
  in the class's order, de-indented, each a function whose first parameter
  is the fetcher (the 4e form): marks (`putMarks`, `listMarks`,
  `deleteMarks`), cards (`putCard`, `listCards`, `getCardByCacheKey`,
  `deleteCard`), profiles (`putProfile`, `listProfiles`, `getProfile`,
  `deleteProfile`), glossary (`putGlossaryEntry`, `listGlossary`,
  `deleteGlossaryEntry`), position (`putReadingPosition`,
  `getReadingPosition`), settings (`putSettings`, `getSettings`), explanation
  cards (`putExplanationCard`, `listExplanationCards`,
  `deleteExplanationCard`), sharḥ cards (`putSharhCard`, `listSharhCards`,
  `deleteSharhCard`), share records (`putShareRecord`, `listShareRecords`,
  `deleteShareRecord`, with its doc comment) and word glosses
  (`putWordGloss`, `getWordGloss`, `listWordGlosses`). `SETTINGS_KEY` moved
  with settings, not exported. Every body has exactly one substitution site,
  `this.handle` → `handle()` (30 sites); none reads `this.searchIndex`, calls
  `purgeIndex` or another method. A whitespace-insensitive token diff of each
  function against `c1efead` shows only `export function`, the fetcher
  parameter (and the trailing comma of a wrapped signature) and that one
  token. The section dividers stay in the class over the thirty one-line
  delegates; no adapter import became unused (the delegates' signatures
  still name every type). `exportWork`/`importWork` still call
  `this.getSettings()`/`this.putSettings(`, now delegates.
- **T** exit 0. **B** exit 0; main chunk 788,528 → 789,828 B (+1,300: thirty
  delegates); only `index.js` differs; CSS byte-identical. **L**: rules hold.
  **D** PASS, identical (40 scenarios). **Q** PASS. **S** 30/30. **R** 28/28;
  landscape 240,000 px 33.3 s 1,905 nodes 0 long tasks, portrait 175,800 px
  24.6 s 1,904 nodes 0 long tasks. **V owed**.
- **Review of `284b7ef`: PASS WITH NOTES; "ready for 4g".** Nothing to fix.
  For 4n: with `deleteShareRecord`'s doc comment moved to `idbWork.ts`, the
  interface (`StorageAdapter.ts:232`) no longer shows that it "does not, and
  cannot, unpublish anything"; consider a one-line pointer there.

**Step 4g, measured 2026-11-16**
- Nineteen methods moved verbatim into the new
  `platform/storage/idbReference.ts`, in the class's order (so the biography
  methods stay between `putQulResource` and `listQulResources`, where they
  were), de-indented, in the 4e fetcher form: retrieval cache
  (`putQuranVerse`, `getQuranVerse`, `putHadith`, `getHadith`), QUL
  (`putQulResource`, `listQulResources`, `deleteQulResource` with its
  comment, `putQulEntries`, `getQulEntry`, `getQulEntries`,
  `putQulCompilation`, `getQulCompilation`), biography
  (`putBiographyEntries`, `listBiographyEntries`, `clearBiographyEntries`)
  and narrator profiles (`putNarratorProfiles`, `findNarratorProfiles`,
  `listNarratorShards` with its comment, `deleteNarratorShard`).
- 21 substitution sites, all `this.handle` → `handle()`: one per method,
  two in `listBiographyEntries` and two in `deleteQulResource`. Three of them
  are the `purgeIndex(this.handle, ` calls of 4d (`clearBiographyEntries`,
  `deleteQulResource`, `deleteNarratorShard`), now `purgeIndex(handle(), `;
  `idbReference.ts` imports `purgeIndex` from `./idbPurge`. No method calls
  another or reads `this.searchIndex`. A token diff of each function against
  `284b7ef` shows only `export function`, the fetcher parameter (and the
  trailing comma of a wrapped signature) and those sites.
- `deleteBook` (book content, 4h) still calls `this.deleteNarratorShard(`,
  now a delegate. The adapter keeps its `purgeIndex` import (`deleteBook`,
  `clearEntities`, `clearDictionaryEntries`); no adapter import became
  unused. The class gains nineteen one-line delegates; dividers stay.
- **T** exit 0. **B** exit 0; main chunk 789,828 → 790,648 B (+820: nineteen
  delegates); only `index.js` differs; CSS byte-identical. **L**: rules hold.
  **D** PASS, identical (40 scenarios; `family/before-init` still records
  `putNarratorProfiles([])` and `findNarratorProfiles (two letters)`
  resolving). **Q** PASS. S and R not run (not required for 4g). **V owed**.
- **Review of `ab1c19b`: PASS; "ready for 4h".** Nothing to fix.

**Step 4h, measured 2026-11-16**
- `SearchEntry` with its comments and 28 methods moved verbatim into the new
  `platform/storage/idbLibrary.ts`, in the class's order, de-indented, in the
  4e fetcher form: books (`putBook`, `getBook`, `listBooks`, `deleteBook`),
  toc (`putTocNodes`, `listTocNodes`), pages (`putPage`, `getPage`,
  `listFetchedPageIndices`, `listPageMeta`, `countPages`), blocks and search
  (`putBlocks`, `deleteBlocksForPage`, `listBlocksForPage`, `listBlocks`,
  `getBlock`, `countBlocks`, the private `loadSearchIndex`,
  `searchBlocksLoose`, `searchBlocks`), entities (`putEntities`,
  `listEntities`, `clearEntities`), dictionary (`putDictionaryEntries`,
  `listDictionaryEntries`, `clearDictionaryEntries`) and crawl state
  (`putCrawlState`, `getCrawlState`). Three doc comments moved with their
  methods (`listFetchedPageIndices`, `listPageMeta`, `searchBlocksLoose`).
  `SearchEntry` is exported (the class's `searchIndex` field is typed with
  it); `loadSearchIndex` is a non-exported function (only this file calls
  it) and leaves no delegate, like 4e's `untyped`. The `searchIndex` field
  and its comment stay in the class.
- 37 substitution sites: `this.handle` → `handle()` 27 (two in `deleteBook`,
  three of them the 4d `purgeIndex(this.handle, ` calls in `deleteBook`,
  `clearEntities`, `clearDictionaryEntries`); `this.searchIndex` →
  `searchIndex` 5 (`deleteBook`, `putBlocks`, `deleteBlocksForPage`, two in
  `loadSearchIndex`), a `searchIndex: Map<string, SearchEntry[]>` parameter
  second after the fetcher in those four and both searches;
  `this.loadSearchIndex(` → `loadSearchIndex(handle, searchIndex, ` 2;
  `this.getBlock(` → `getBlock(handle, ` 2; `this.deleteNarratorShard(` →
  `deleteNarratorShard(handle, ` 1, imported from `./idbReference`. A token
  diff of each function against `ab1c19b` shows only those, `export
  function` (`function` alone and `private` dropped for `loadSearchIndex`),
  the parameters and wrapped signatures' trailing commas; `deleteBook`'s
  statements are in the same order.
- New file edges inside `platform/storage`: `idbLibrary` → `StorageAdapter`
  (types), `idbSchema`, `idbPurge`, `idbReference`; `idbReference` does not
  import `idbLibrary`, so no cycle. The adapter drops `letterFold`,
  `purgeIndex` and `BOOK_STORES` from its imports and gains the
  `./idbLibrary` block (27 functions and `type SearchEntry`). The class now
  holds `db`, `searchIndex`, `init`, the `handle` getter, `lazyHandle`, 81
  one-line delegates, the `schemaVersion` getter, and `exportWork`/
  `importWork` (4i): 624 lines.
- For 4n: `idbTransfer.ts` still types the map `Map<string, unknown>`; it
  could now take `Map<string, SearchEntry[]>` and its header's sentence about
  4h would go. The harness's `PRIVATE` set now also names the inert
  `loadSearchIndex`. The class delegates for `listFetchedPageIndices`,
  `listPageMeta` and `searchBlocksLoose` lost their doc comments with the move
  (like `deleteShareRecord` at 4f).
- **T** exit 0. **B** exit 0; main chunk 790,648 → 791,806 B (+1,158); only
  `index.js` differs; CSS byte-identical. **L**: rules hold, no cycle. **D**
  PASS, identical (40 scenarios; `family/before-init` still records the empty
  `putBlocks`, `putEntities`, `putDictionaryEntries` and both searches with
  `""` resolving). **Q** PASS. **S** 30/30. **R** 28/28; landscape 240,000 px
  33.3 s 1,905 nodes 0 long tasks, portrait 175,800 px 24.4 s 1,904 nodes 0
  long tasks. **V owed**.
- **Review of `b04c7f8`: PASS; "ready for 4i".** Nothing to fix; the
  reviewer showed that no instance could reach a different
  `deleteNarratorShard`, `getBlock` or `loadSearchIndex` body through the
  direct calls.

**Step 4i, measured 2026-11-16**
- `exportWork` and `importWork` moved verbatim into the new
  `platform/storage/idbBackup.ts`, de-indented, in the 4e fetcher form;
  `importWork` takes `searchIndex: Map<string, SearchEntry[]>` second. The
  `importWork` comments moved with it. `WORK_STORES` (Q7, 4m) is not part of
  this step.
- 5 substitution sites: `this.handle` → `handle()` 2 (one `const db = …` in
  each); `this.getSettings()` → `getSettings(handle)` 1;
  `this.putSettings(` → `putSettings(handle, ` 1 (both imported from
  `./idbWork`, so they now call the functions directly rather than through
  the class delegates); `this.searchIndex` → `searchIndex` 1. No other
  `this.` call. A token diff of both functions against `b04c7f8` shows only
  those, `export function`, the parameters and a wrapped signature's
  trailing comma.
- New file edges: `idbBackup` → `StorageAdapter` (types), `idbSchema`
  (`DB_VERSION`, `Schema`), `idbLibrary` (type `SearchEntry`), `idbWork`;
  none of those imports `idbBackup`, so no cycle. The adapter gains `import {
  exportWork, importWork } from './idbBackup'` after the `./idbWork` block
  and drops no import. The class now holds `db`, `searchIndex`, `init`, the
  `handle` getter, `lazyHandle`, the `schemaVersion` getter and 83 one-line
  delegates: 557 lines, the class at `:134-557`. The plan's "~330 lines
  after 4i" (Design §3, "What stays in the class") did not count the
  delegates' form or the imports: 83 delegates of about four lines each
  (signature, `return`, brace, blank) and about 125 lines of import blocks
  naming every type and function. 4n adds this to a "Corrections found in
  review" list in the plan.
- **T** exit 0. **B** exit 0; main chunk 791,806 → 791,869 B (+63); only
  `index.js` differs; CSS byte-identical. **L**: rules hold, no cycle. **D**
  PASS, identical (40 scenarios, `work-backup/export`, `import-fresh`,
  `import-without-shareRecords`, `import-missing-books`,
  `import-over-existing` among them). **Q** PASS. S and R not run (not
  required for 4i). **V owed**.
- The adapter's header, which said Phase 4 "is moving" the class's code
  into the `idb*.ts` files, now says it moved it and that the class hands
  each data method to its group — true from 4i, when the last body left
  (Q8). (`init` and the `schemaVersion` getter stay in the class by design;
  "data method" was the 4i review's wording.)
- **Review of `1b5089a`: PASS WITH NOTES; "ready for 4j".** Applied with
  4j: the header's "hands each to its group" → "hands each data method to
  its group"; the sentence above on the plan's line estimate.

**Step 4j, measured 2026-11-16**
- New code, not a move. `idbSchema.ts` gains `IndexSpec`, `StoreSpec`, an
  exported `STORES` table typed `{ readonly [S in StoreNames<Schema>]:
  StoreSpec<S> }` (`idb`'s own `StoreNames`/`IndexNames`), and a private
  generic `createStore(db, name)`. The fresh-install branch of
  `upgradeDatabase` is now `for (const name of Object.keys(STORES)) …
  createStore(db, name)`; the existing-DB branch is untouched (4k).
- The table has 24 entries, in the fresh branch's order (books … settings;
  `Object.keys` keeps string-key insertion order, so the creation order is
  today's exactly). Each entry: `keyPath`, `indexes` (name, keyPath,
  `multiEntry: true` only on `narratorProfiles.byNaming`), and Design
  §2.2's `onUpgrade` (`recreate` for `entities`; `if-missing` for the nine
  guarded stores plus `qulEntries` and `qulCompilations` (11), with
  `createdWith: 'qulResources'` on those two; `assumed` for the other
  twelve) — read off the existing branch, not yet read by any code (4k).
  `perBook` is not added (4l). No store uses `autoIncrement` or `unique`,
  and the shape has neither. `createStore` passes an options object only
  where `multiEntry` is set, so every `createIndex` call has the same
  arguments as before.
- Six comments moved verbatim from the fresh branch onto their entries:
  `marks`, `sharhCards`, `narratorProfiles`, `shareRecords`, `qulResources`
  (the trio's comment) and `biographyEntries`.
- Two departures from Design §2.2's sketch: `IndexSpec.keyPath` is `string |
  string[]`, not `string | readonly string[]`, because `idb`'s `createIndex`
  takes `string | string[]` and a readonly array would need a cast; and
  creation goes through a generic helper that reads `STORES[name]` itself,
  because passing `STORES[name]` for a union `name` does not type-check
  (the correlated-union limit).
- **Typing proven:** removing `settings` from the table, adding an `extra`
  store, misspelling `byRoot`, and giving `dictionaryEntries` the `cards`
  index `byCacheKey` each fail `tsc` (TS2741, TS2353, TS2820, TS2322);
  restored from a copy. A *missing* index is not a type error; D catches it.
- **Negative tests** (in place, restored from a `cp` copy, `cmp` checked):
  dropping `narratorProfiles.byShard` → D FAIL, 25 of 40; flipping
  `byNaming`'s `multiEntry` off → D FAIL, 25 of 40. The 25 are both `fresh`
  scenarios (the store's index list differs) and every scenario that starts
  from a fresh install; no upgrade scenario fails, as it should not while
  the existing branch is hand-written.
- **T** exit 0. **B** exit 0; main chunk 791,869 → 792,189 B (+320); only
  `index.js` differs; CSS byte-identical. **L**: rules hold. **D** PASS,
  identical (40 scenarios). **Q** PASS. **U** PASS, 180/180 (a fresh
  install through the bundle). **V owed**.
- **Review of `11ee82e`: PASS WITH NOTES.** Two `onUpgrade` values D cannot
  see if 4k trusts them wrongly: (i) an `assumed` store marked `if-missing`
  (every fixture has all twelve, so it is harmless on any reachable
  database; a reading check), and (ii) `createdWith: 'qulResources'` dropped
  from `qulCompilations` alone (no fixture lacked only `qulCompilations`;
  closed by the follow-up below). **The 4k reviewer must read both values off
  the table against today's branch, and check that the `objectStoreNames`
  snapshot is taken once, before any creation.** Comment notes applied in
  the follow-up: `idbSchema.ts`'s header and `upgradeDatabase`'s JSDoc gain
  that since 4j the fresh branch is a loop over `STORES`; `createdWith`'s
  JSDoc reworded; "the nine guarded stores and the QUL trio" above made
  "the nine guarded stores plus `qulEntries` and `qulCompilations` (11)".

**4j follow-up, measured 2026-11-16** (check D; `src/` comments only)
- `scripts/verify-storage.mjs` gains a third odd database,
  `v10-without-qulCompilations` (v10 minus `qulCompilations`, built like the
  other two from `TODAY`), and the scenario
  `harness/odd-v10-without-qulCompilations`; its header now names three odd
  databases and why the third exists, and `--write`'s usage line says "step
  4a and its reviewed follow-ups". Recorded on the current code, whose
  existing-DB branch is still the hand-written one: the 53 lines from `if
  (oldVersion >= 1)` to its `return;` are byte-identical at `1b5089a` and
  `11ee82e`. Today's behaviour, now pinned: the database opens at 11 with 23
  stores, `shareRecords` created, `qulCompilations` never (the trio's guard
  sees `qulResources`).
- **Re-baselined:** run 1 (no write) FAIL, 1 of 41 differ — only the new
  scenario, absent from the record; run 2 `--write`; run1 == run2 (`cmp`);
  the record's only change is the added scenario (no other scenario or
  top-level field changed). 41 scenarios, 51 phases, 374,093 B.
- **Proven:** a temporary guard in the existing branch that creates
  `qulCompilations` when it is missing (what a table entry without
  `createdWith` would do at 4k) → D FAIL, 1 of 41, exactly
  `harness/odd-v10-without-qulCompilations` (its schema becomes today's 24
  stores); restored from a `cp` copy, `cmp` checked. FOUND_ISSUES 21 now
  names the third scenario.
- **T** exit 0. **D** PASS, identical (41 scenarios). **Q** PASS. **B**: every
  chunk identical to 4j's after masking (`compare-bundles`); the raw bytes
  differ only in the build timestamp and the `node.browser` chunk-hash
  reference. CSS unchanged.
- **Review of `afffa50`: PASS WITH NOTES; "ready for 4k".** Applied with
  4k (script comments only, D identical without a re-baseline): the header's
  reason for the third odd database now reads "the only database that lacks
  qulCompilations but has qulResources"; `TODAY`'s JSDoc no longer cites
  `IdbStorageAdapter.ts:259-334` as live (written from it at 4a; since 4j
  the `STORES` table, same order). The review expected v1base to expose a
  `qulCompilations` without `createdWith` too; with the snapshot it does not
  (negative test 3 below), so the header does not say so.

**Step 4k, measured 2026-11-16**
- The existing-DB branch of `upgradeDatabase` is now: the branch's opening
  comment kept verbatim at its top ("Upgrading an existing database: only
  touch what changed …"; the branch's only comment — the per-version reasons
  live in the history comment above `DB_VERSION`, untouched); a new comment
  on the snapshot and the creation order; `const existing = new
  Set(db.objectStoreNames)`, taken once before any deletion or creation;
  then for each `STORES` entry in table order: `recreate` → delete if in the
  snapshot, then `createStore`; `if-missing` → `createStore` if the snapshot
  lacks `createdWith ?? name`; `assumed` → nothing. `return;` kept. The ten
  hand-written guards and creations (53 lines) are gone; the fresh branch is
  unchanged. **`DB_VERSION` stays 11** (trap 6: no store, index or key path
  changes, so no bump; D records version 11 everywhere).
- **Creation order** inside the upgrade becomes the table's (today entities,
  marks, dictionaryEntries, explanationCards, wordGlosses, the trio,
  biographyEntries, sharhCards, narratorProfiles, shareRecords; now
  entities, dictionaryEntries, marks, explanationCards, sharhCards,
  narratorProfiles, shareRecords, wordGlosses, the trio, biographyEntries),
  accepted by Q5. Where it could show: on the v10 database without
  `qulResources`, `shareRecords` is now created before the trio's
  ConstraintError rather than never reached; the abort rolls it back, and D
  records the same version 10, 22 stores, AbortError and `uncaughtInPage`.
  No entry reads another store but through `createdWith`, which asks the
  snapshot; each index is created on its own store inside `createStore`.
- **D PASS, identical** (41 scenarios): `upgrade-v1base`, `-v7`, `-v8`,
  `-v9`, `-v10`, `reopen-v11` in both halves, and the three odd databases
  (without `qulResources`: version 10, 22 stores, AbortError,
  `uncaughtInPage` ConstraintError; without `qulEntries` and without
  `qulCompilations`: version 11, 23 stores, the missing one never created).
- **Negative tests** (each in place, restored from a `cp` copy, `cmp`
  checked):
  1. `entities` `recreate` → `if-missing`: D FAIL, 6 of 41 —
     `harness/upgrade-v7`, `-v8`, `-v9`, `-v10`, `odd-…-qulEntries`,
     `odd-…-qulCompilations` (their seeded entity rows survive; today the
     store is dropped and recreated empty). Not v1base (no `entities` to keep) nor the bundle half (it
     records schemas, which are the same).
  2. `qulEntries` without `createdWith`: D FAIL, 1 of 41 —
     `harness/odd-v10-without-qulEntries` (it now gets `qulEntries`).
  3. `qulCompilations` without `createdWith`: D FAIL, 1 of 41 —
     `harness/odd-v10-without-qulCompilations` only. v1base lacks all three,
     so both forms create it there; only the 4j follow-up's scenario sees
     this.
  4. The names read live per entry (`{ has: (store) =>
     db.objectStoreNames.contains(store) }`, type-clean): D cannot run —
     "bundle/upgrade-v1base: the app did not open version 11 and seed within
     30 s" (exit 2): with `qulResources` just created, `qulEntries` and
     `qulCompilations` are skipped and the app's QUL seed fails. Caught.
  5. `books` `assumed` → `if-missing`: D PASS, identical — not caught, as
     expected: every fixture has all twelve assumed stores, so the guard
     never fires. Harmless on every reachable database; the reviewer reads
     the twelve `assumed` values against the old branch.
- **T** exit 0. **B** exit 0; main chunk 792,189 → 790,745 B (−1,444: the
  hand-written creations gone); only `index.js` differs; CSS byte-identical.
  **L**: rules hold. **Q** PASS. **U** PASS, 180/180. **V owed**.
- **Review of `87b3b26`: PASS WITH NOTES; "ready for 4l".** The reviewer
  compared the old branch and the new one store by store, for every
  combination of present and absent stores, and found no database,
  reachable or not, whose stored result differs. D has no v2–v6 fixtures
  (FOUND_ISSUES 20); those versions were checked by reading only. Must-fix,
  applied with 4l (comments only): `idbSchema.ts`'s header and
  `upgradeDatabase`'s JSDoc now say that since 4k the existing-database
  branch reads `STORES` too, and `STORES`' JSDoc gives the order as "the
  order a fresh install creates them and an upgrade walks them".

**Step 4l, measured 2026-11-16**
- `StoreSpec` gains `perBook?: 'byBook' extends IndexNames<Schema, S> ? true
  : never`, with a doc comment. That is Design §2.2's `perBook?: true`, made
  a type error on a store without a `byBook` index (the index is what
  `deleteBook` walks). The flag is still explicit, as Design §4 asks, not
  inferred from the index. Ten entries carry `perBook: true`.
- **Two names for one table.** The literal is now `const TABLE = { … }
  satisfies { readonly [S in StoreNames<Schema>]: StoreSpec<S> }`, which
  keeps the literal `perBook: true` types `BookStore` is computed from. It
  is exported as `STORES: { readonly [S …]: StoreSpec<S> } = TABLE`, the 4j
  type, which the two walks need to see each entry as its own store's spec.
  A single `satisfies` declaration did not type-check: `createStore` and the
  upgrade loop no longer saw a `StoreSpec<S>` (TS2322, TS2339). The same
  object, no casts; the excess-property and index-name checks are kept.
- `BookStore` is the mapped type of the `TABLE` entries whose `perBook` is
  `true`. `BOOK_STORES: readonly BookStore[]` is `Object.keys(STORES)`
  filtered on `STORES[name].perBook === true`, in table order, with a type
  predicate. A type assertion in the file (`true satisfies SameUnion<BookStore,
  'tocNodes' | … | 'biographyEntries'>`) proves `BookStore` is still the ten
  literal names (the plan's "a type assertion in the file"). It is a second
  place to edit when a per-book store is added; 4n can drop it if the owner
  prefers.
- **Same names, same order, proven:** `idbSchema.ts` bundled with esbuild
  and imported in Node gives `BOOK_STORES` = `tocNodes, pages, blocks,
  entities, dictionaryEntries, marks, cards, explanationCards, sharhCards,
  biographyEntries`. That equals the hand list at `87b3b26`, read from
  `git show`. Table order puts the fourteen other stores between them, so
  filtering keeps the order.
- **Comments moved verbatim:** the hand list's doc ("Every store that files
  its rows under a book … buried in the body of `deleteBook`") now sits
  above the derived `BOOK_STORES`, as Design §4 says. The `biographyEntries`
  story ("Its absence here was not harmless …") sits on that entry, above
  its `perBook: true`. Both were found line for line by script.
- **Readers:** `idbLibrary.ts` (`deleteBook`'s loop) and `idbPurge.ts`
  (`purgeIndex`'s `store: BookStore | …`), both unchanged. D's harness
  seeds its own rows; since the 4l follow-up it also imports `BOOK_STORES`
  (`verify-storage-harness.ts:42`) and exposes it (`:1192`), only for the
  order assertion against its own hand-written list.
- **Negative tests** (in place, restored from a `cp` copy):
  1. `perBook` dropped from `marks`: `tsc` fails at the assertion (TS1360),
     and D on the unchecked bundle FAILs 2 of 41, `delete-book` and
     `book-transfer` (as 4a's breakage 3).
  2. `perBook: true` on `glossary`, which has no `byBook` index: `tsc` fails
     at the entry (TS2322). D on the bundle FAILs 2 of 41, `delete-book` and
     `book-transfer`.
  3. `cards` moved above `marks` in the table: `tsc` passes, and at first D
     PASSed too, identical. The order of `BOOK_STORES` is `deleteBook`'s
     purge order and so decides what an interrupted removal leaves (R6),
     but every purge completes in D, so the rows end the same. **Closed in
     the 4l follow-up:** D now asserts on every run, `--write` included, that the
     real `BOOK_STORES` equals `EXPECTED_BOOK_STORES`, name for name and in
     order. The harness page imports `BOOK_STORES` from `idbSchema.ts` and
     exposes a copy; `verify-storage.mjs` compares it after `delete-book`
     with its own hand-written list, never derived from the code. The
     header's "Asserted on every run" list names it. The record is
     unchanged, so there is no re-baseline. Re-run: `tsc` exit 0; D exit 1,
     "FAIL — 1 assertion(s): BOOK_STORES is [… "cards","marks" …],
     expected [… "marks","cards" …] in that order", and "the record is
     identical … but the assertions above fail". Restored from a `cp` copy,
     then D PASS, identical.
- **T** exit 0. **B** exit 0; main chunk 790,745 → 790,779 B (+34); only
  `index.js` differs; CSS byte-identical. **L**: rules hold. **D** PASS,
  identical (41 scenarios, `delete-book` over 4,097 blocks and
  `book-transfer` among them), with the new order assertion holding.
  **Q** PASS. S, R and U not run (not required for 4l). **V owed**.
- **Review of `b60633e` and `7bffce0`: PASS WITH NOTES; "ready for 4m".**
  Must-fix, applied with 4m: the "Readers:" bullet above said D's harness
  "imports no `BOOK_STORES`", which has been untrue since `7bffce0`. It now
  names the import (`verify-storage-harness.ts:42`) and the exposure
  (`:1192`). Two notes:
  - **For 4n:** adding a per-book store is now three edits: the `perBook`
    flag, the `SameUnion` assertion in `idbSchema.ts`, and D's
    `EXPECTED_BOOK_STORES`. 4n's "Adding a store" text must name all three,
    or the owner drops the assertion. (Since 4m, a backed-up store is one
    `WORK_STORES` entry plus its `WorkBundle` field; see below.)
  - D's order assertion was keyed on `scenario.id === 'delete-book'`, so a
    rename would have dropped it silently. **Fixed with 4m (scripts):** every
    harness phase already reports `bookStores`, so the list is now checked
    on the first harness phase to run, and after the loop
    `assert('BOOK_STORES was checked …', bookStoresChecked)` fails D if it
    never was. Re-proven: `cards` above `marks` in the table → "FAIL — 1
    assertion(s)" on `BOOK_STORES`, the record identical. **For 4n:** the
    other assertions (work backup, per-book and whole-tablet files, share
    adapter) are still keyed on scenario ids.

**Step 4m, measured 2026-11-16**
- `idbBackup.ts` gains `WORK_STORES` (`as const`, eleven names in the
  plan's Design §4 order: cards, explanationCards, sharhCards, marks,
  glossary, profiles, positions, wordGlosses, quranVerses, hadiths,
  shareRecords), with a doc comment on why it is a list and not a table
  flag. The comment "Absent on a backup written before shares existed,
  which `write` handles." moved verbatim from the `write('shareRecords', …)`
  call onto that entry.
- **Typed against `WorkBundle`:** `BundleStore` is `WorkBundle`'s keys whose
  (non-null) value is an array, minus `referencedBooks`, and `true satisfies
  SameUnion<WorkStore, BundleStore>` fails `tsc` on a missing or an extra
  name. `SameUnion` is now exported from `idbSchema.ts`, its one
  definition, with a doc comment. `importWork`'s `write` is typed `<K
  extends WorkStore>` in place of the hand-written eleven-name union.
- **`exportWork`:** builds the object with `version`, `exportedAt`
  (`Date.now()` at the same point as before, after the `books` read) and
  `referencedBooks`, assigns each store's `getAll` in list order, then
  `settings`. Insertion order is JSON key order, so the reads, their order
  and the file's keys are the old literal's. Two casts, with a comment:
  the object is incomplete until the loop has run.
- **`importWork`:** the eleven `write` calls are `for (const store of
  WORK_STORES) await write(store, bundle[store])`, in the same order with
  the same 500-row batching (`write` itself is unchanged). Kept written out
  in both functions, because they are not stores: `referencedBooks` (from
  `books`), `settings` (`getSettings`/`putSettings`, the key added and
  stripped there), the missing-books report and `searchIndex.clear()`.
  Nothing else was handled per store.
- **D PASS, identical** (41 scenarios). The `work-backup` phases (`export`
  with the file's SHA-256 and length and the exported value,
  `import-fresh`, `import-without-shareRecords`, `import-missing-books`,
  `import-over-existing`) are byte-for-byte the record's.
- **Negative tests** (each in place, restored from a `cp` copy):
  1. `cards` and `explanationCards` swapped: `tsc` 0; D FAIL, 1 of 41,
     `work-backup` (the file's key order and hash).
  2. `hadiths` dropped: `tsc` fails at the assertion (TS1360); D FAIL, 1 of
     41, `work-backup`.
  3. `books` added: `tsc` fails (TS1360 and TS7053, `bundle['books']`);
     D FAIL, 1 of 41, `work-backup`.
  4. `cards` listed twice: `tsc` 0, D PASS. Not caught, and harmless: the
     export reassigns the key in place, so the file is unchanged, and the
     import writes the same rows twice.
  5. The `BOOK_STORES` order check, re-run after its rework: see the review
     bullet above.
- **T** exit 0. **B** exit 0; main chunk 790,779 → 790,214 B (−565); only
  `index.js` differs; CSS byte-identical. **L**: rules hold. **Q** PASS. The
  **SSR build** of `verify-parsers.ts` (`npx vite build --ssr … --outDir
  .verify/ssr`) exit 0; its output was deleted after. **V owed**.
- **Review of `b69abd4`: PASS; "ready for 4n".** Nothing to fix.

**Step 4n, measured 2026-11-16**
- **Code comments made true** (no behaviour change; the bundle is identical
  to 4m's after masking):
  - `StorageAdapter.ts`'s header now says the IndexedDB implementation is
    `IdbStorageAdapter.ts` and the `idb*.ts` files beside it, with
    `idbSchema.ts` holding the schema, the one `STORES` table and the upgrade
    that reads it. `deleteShareRecord` gains a one-line pointer ("it cannot
    unpublish anything (see idbWork.ts)"). `listFetchedPageIndices`,
    `listPageMeta` and `searchBlocksLoose` already had their own interface
    doc comments, so they needed no pointer.
  - `idbPurge.ts`: "every call below passes a valid pair" now says "every
    caller (idbLibrary.ts, idbReference.ts)".
  - `idbTransfer.ts`: the search index is typed `Map<string, SearchEntry[]>`
    (a type-only import from `idbLibrary.ts`), and the header's sentence
    about 4h is replaced by why the map is passed in.
  - `IdbStorageAdapter.ts`'s header gains the reason RESTRUCTURE §2 asks of
    a file over ~500 lines: it imports each group's functions and lists every
    method as a delegate, with no logic left to split.
- **Check D's scripts** (record unchanged):
  - The harness's `PRIVATE` set no longer names the helpers that left the
    class (`purgeIndex`, `loadSearchIndex`, `untyped`). It still fails both
    ways: a `private untyped()` added back to the class → "missing untyped";
    a call to `loadSearchIndex` → "not in the class loadSearchIndex" (each
    exit 2, restored from a copy).
  - The assertions keyed on scenario ids (work backup, per-book transfer,
    whole-tablet transfer, share adapter) now record that they ran, and
    `KEYED_ASSERTIONS` fails D after the loop if one did not. Renaming
    `share-adapter` → "FAIL — 1 assertion(s): the assertions keyed on
    share-adapter ran (no such scenario)"; restored. Fixed rather than
    written up, so no FOUND_ISSUES entry.
- **Docs:** README's storage map line and "the only file that uses the
  IndexedDB API" (now the adapter and the `idb*.ts` files). RESTRUCTURE:
  status (Phase 4 complete), §2 "Adding a store" (everything a store now
  takes, named), §4 T-f (both branches read one table; what can still go
  wrong), §5's D row (three odd databases, the two order and keyed
  assertions), §6's Phase 4 row (complete). The plan gains "Corrections
  found in review" (eight items).
- **CLAUDE.md and `.claude/agents/torjuman-storage.md`.** The plan lists
  both for 4n (the map, the Never line, trap 6, the agent's map and rules).
  The subagent doing 4n would not edit them on another agent's word and
  wrote the text as a patch; the main session read it line by line and
  applied it under the owner-approved 4n row: the map names the `idb*.ts`
  files; the Never line and trap 6 say a schema change edits the `STORES`
  table that both branches of `upgradeDatabase` read, and list what else a
  new store needs; the agent's map, schema rule and check-D rule likewise.
  The Commands row for D was already right. The patch file is deleted.
- **L** saved as `docs/refactor/phase4/layers.txt`. Against
  `phase3/layers.txt`, the only differences are 162 → 169 files (the seven
  `idb*.ts` files) and `platform/storage`'s type-only imports of `types`,
  0+2t → 0+6t. Still 134 directory edges, no cycle, all eleven rules hold.
- **T** exit 0. **B** exit 0; main chunk 790,214 B, identical to 4m after
  masking (every chunk); CSS byte-identical. **D** PASS, identical (41
  scenarios, 51 phases, 374,093 B). **Q** PASS. **U** 180/180. **S** 30/30.
  **R** 28/28; landscape 240,000 px 33.3 s 1,905 nodes 0 long tasks,
  portrait 175,800 px 24.4 s 1,904 nodes 0 long tasks. A first R run, right
  after U and S, hung for about 25 minutes at its last step (the portrait
  position restore after reload, CPU idle) and was killed; run again on its
  own, it passed as above. The bundle was identical to 4m's, so this is
  taken as a flake of the run, not of the change. **SSR build** of
  `verify-parsers.ts` exit 0, its output deleted. **V owed**.

- **Review of 4n and of Phase 4: FAIL on two doc claims, fixed in the next
  commit; the code passed.** Over the phase: `DB_VERSION` 11 at every
  commit; the existing-database branch at `afffa50` the same text as Phase
  3's; `storage.json` changed only in 4a (before 4b) and additively at
  `afffa50`; `layers.json`, `package-lock.json`, `translation/` untouched;
  the JS identical from 4m to 4n; the R hang judged a flake. Fixed:
  RESTRUCTURE §4 T-f said both branches "cannot disagree about a store's
  shape" — untrue for an existing store, since the upgrade branch never
  alters one (FOUND_ISSUES 20): a new index on `cards` reaches fresh
  installs only. Trap 6, the Never line, §2 and the storage agent now say a
  change to an existing store needs its own migration code. And the
  new-store lists left out what lets D see the upgrade path — the entry
  must be `'if-missing'`, and D needs an `OLD_DATABASES` entry for the
  previous version without the store and its expected version moved —
  without which a new store wrongly marked `'assumed'` passes D and every
  real tablet lacks it; all three lists now say so, and the agent's rule
  points at trap 6 and §2 rather than keeping a thinner copy. Also this
  file's "Current state" heading, and the "Later" items that Phases 3 and 4
  did.

## Phase 4 result

| | Phase 3 end | Phase 4 end |
| --- | --- | --- |
| `IdbStorageAdapter.ts` | 1,059 lines: schema, both upgrade branches, every method body, backup | 562 lines: `init`, the `handle` getter and fetcher, `schemaVersion`, 83 one-line delegates |
| new files in `platform/storage/` | — | `idbSchema.ts` 392, `idbLibrary.ts` 360, `idbWork.ts` 232, `idbReference.ts` 185, `idbBackup.ts` 112, `idbTransfer.ts` 86, `idbPurge.ts` 59 lines |
| hand-written store lists | six: the fresh branch (24 stores), the existing branch's guards (10 guards, 12 stores), `BOOK_STORES` (10), `exportWork`'s fields and `importWork`'s calls and its type (11 each) | two lists the code runs on: `STORES` (24, both branches; `BOOK_STORES` derived) and the ordered `WORK_STORES` (11, typed against `WorkBundle`); plus two that check them: the `SameUnion` assertion and D's `EXPECTED_BOOK_STORES` |
| `DB_VERSION` | 11 | 11 (no schema change; D's schema dumps identical at every step) |
| check D | — | 41 scenarios, 51 phases (40 at 4a; the v10 without `qulCompilations` added after 4j), identical at every step from 4b |
| main JS chunk | 788,264 B | 790,214 B (+1,950: the delegates and the table walks) |
| check Q | identical | identical at every step |
| screens (check U) | 180 files | 180 files, identical at 4c, 4j, 4k, 4n |
| verify:selection / verify:reader | 30/30, 28/28 | 30/30, 28/28, same performance |

Every step was reviewed before the next began. **Owed before merge:**
- **V**, `npm run verify` on the owner's PC.
- **M** on the staged build (`npm run stage`) on the tablet in Chrome,
  exactly as the plan's "Only the owner can run" lists it: deployed app →
  staged build only, never restoring into the deployed app, steps 1–8; the
  optional step 9 is left out, since the owner named no second profile or
  tablet (Q11).

**Open, and not this phase's to fix:** FOUND_ISSUES 24. Replacing a book from
a Library transfer file deletes its cards, marks, explanations, sharḥ cards
and position, though the dialog says they are kept; and a replacement that
fails part way leaves no copy of the book. Check D's `book-transfer` pins
today's behaviour. It needs its own change, if the owner wants one.

## Phase 5: big UI files (complete, branch `claude/restructure-phase-5`)

Plan: [`plans/phase5-big-ui-files.md`](plans/phase5-big-ui-files.md);
**approved 2026-11-16, all seventeen answers as recommended** (`79171e4`).

| Step | State | Commit |
| --- | --- | --- |
| 5a. U's reader captures, baselined on the old code; FOUND_ISSUES 26–36 (the plan's A–K) | U: three runs (one FAIL on a PNG), five breakages; T B L R S pass; review FAIL (U as baselined cannot gate the moves) | `23bc734` |
| 5a fix — the margin's place and the proposal bar made deterministic, dialogs screenshotted alone, `reader-page-cards` added; FOUND_ISSUES 37, 26 and 33 corrected | U five runs PASS in a row, two breakages; T B L R S pass; review PASS WITH NOTES | `5a141b6` |
| 5a re-review's notes — FOUND_ISSUES 38 and a 37 wording fix | docs only | `7726a45` |
| R's hang — limits on R's setup and teardown waits, `onabort`/`onblocked` in its seed, a watchdog (the owner's amendment to Q2) | R PASS 28/28, a never-ending seed fails in 61 s; review PASS WITH NOTES; wording fixed | `2b2f9da`, `33a7c1c`, `5fd796b` |
| 5b. R's new scenarios, baselined on the old code; FOUND_ISSUES 39, 40 | R five runs PASS 55/55 in a row, ten breakages; T B L S U pass; review PASS WITH NOTES | `ad16fdc` |
| 5c. check P, baselined on the old code; FOUND_ISSUES 41–43 | `torjuman-llm` read NOT READY (M1 a Claude group, M2 unseen steps named), both fixed; P identical runs (one under another host TZ), fifteen breakages; T B L Q R S pass; review PASS WITH NOTES | `ea6c34e` |
| 5d1. `Section` → `ui/settings/Section.tsx` | T B L R S U pass; review PASS WITH NOTES | `541ab15` |
| 5d2. `CatalogSection` → its file | T B L R S U pass; review PASS WITH NOTES | `d7c2838` |
| 5d3. `TranslationSection` → its file | T B L R S U pass; review PASS | `ec12f28` |
| 5d4. `KeysSection` with `TestState`, `ProviderKeyField`, `SunnahKeyField` | T B L R S U pass; review PASS | `857ad17` |
| 5d5. `ReadingSection` → its file | T B L R S U pass; review PASS | `35463d9` |
| 5d6. `DisplaySection` → its file | T B L R S U pass; review PASS | `8589497` |
| 5d7. `QuranSection` → its file | T B L R S U pass; review PASS | `21331d4` |
| 5d8. `BackupSection` → its file | T B L R S U D pass; review PASS WITH NOTES | `219754f` |
| 5e1. `HadithSheet` with `Diagnostic` → `ui/reader/HadithSheet.tsx` | T B L R S U pass; review PASS WITH NOTES | `ad81ec7` |
| 5e2. `QuranSheetData` → `ui/reader/quranSheetData.ts`, type only | T B (identical JS) L R S U pass; review PASS | `bdd5a5c` |
| 5e3. `CompileTab` → `ui/reader/CompileTab.tsx` | T B L R S U pass; review PASS | `aa423d9` |
| 5e4. `QuranSheet`, `TabId` and the verse-sheet comment → `ui/reader/QuranSheet.tsx` | T B L R S U pass; review PASS WITH NOTES | `539de97` |
| 5f1. `TYPE_CLASS`, `TYPE_CHROME`, `textHeightFor` → `ui/reader/blockLayout.ts`; QuranSheet's header reworded (5e4's review note) | T B L R S U pass; review PASS WITH NOTES | `2d72185` |
| 5f2. `settleOn`'s body → `blockLayout.ts`; 5f1's review notes (header wording, a line reference) | T B L R S U pass; review PASS | `24629fb` |
| 5f3. `BlockRow`, `MarginTarget`, `CardMarkerDot` → `ui/reader/BlockRow.tsx` | T B L R S U pass; review PASS | `5561473` |
| 5g1. `useWordLookup` → `ui/reader/useWordLookup.ts` | T B L R S U P pass; review PASS WITH NOTES | `c0ea5e3` |
| 5g2. `useReadingPosition` → `ui/reader/useReadingPosition.ts` | T B L R S U P pass; review PASS WITH NOTES | `63f03d7` |
| 5g3. `useReaderNavigation` → `ui/reader/useReaderNavigation.ts`; 5g2's header word | T B L R S U P pass; review PASS WITH NOTES | `24d1188` |
| 5g4. `usePanelControls` → `ui/reader/usePanelControls.ts`; 5g3's shift sentence | T B L R S U P pass; review PASS WITH NOTES | `8810abb` |
| 5g5. `useHeaderHeight` → `ui/reader/useHeaderHeight.ts`; 5g4's 5j wording | T B L R S U P pass; review PASS WITH NOTES | `98f44f8` |
| 5h1. `ReaderHeader` with `ReadMarkNav`, `JumpToPage` → `ui/reader/ReaderHeader.tsx` | T B L R S U P pass; review PASS WITH NOTES | `0c52e6b` |
| 5h2. `CommentaryBars` → `ui/reader/CommentaryBars.tsx` | T B L R S U P pass; review PASS WITH NOTES | `1a3e6a6` |
| 5h3. `ReaderSheets` with `blockElementFor` → `ui/reader/ReaderSheets.tsx` | T B L R S U P pass; review PASS WITH NOTES | `dbfa2c4` |
| 5h4. `ReaderCardPanel` → `ui/reader/ReaderCardPanel.tsx`; the screen's header; 5h3's header wording | T B L R S U P pass; review PASS WITH NOTES | `eec59a5` |
| 5i1. `passageFor`, `translationRequestFor` → `ui/reader/translationSteps.ts`; 5h4's review notes (a PROGRESS word, the screen header's Q10) | T B L R S U P Q pass; review PASS WITH NOTES | `8be21cd` |
| 5i2. `loadingCard`, `failedCard` → `translationSteps.ts`; its header; 5i1's review notes | T B L R S U P Q pass; review PASS WITH NOTES | `a44f5bd` |
| 5i3. `withOfflineRequest`, `withCloudRequest` → module functions in `useTranslator.ts`, `withoutStream` → `translationSteps.ts` (the plan's amendment to Q12); the header; 5i2's review note n2 | T B L R S U P Q pass; review PASS WITH NOTES | `6ed8c0d` |
| 5j. Docs and comments made true (Design §10 and the 5j list below); FOUND_ISSUES 26–43's references recomputed; RESTRUCTURE status, §5, §6; the plan's corrections | T L pass (the end checks are below); review pending | this commit |

**Step 5a, measured 2026-11-16** (no `src/` change; `git diff --quiet -- src`
holds)
- **35 captures** (17 at 960×600, 18 at 600×960), plain build, each an
  `.html` and a `.png`: **70 manifest lines added, none removed or changed**
  (`git diff --numstat`: `70 0`); the manifest is 250 files. Each in a fresh
  context from a new seed option, `seedReader` (blocks 1–5 of the seeded book
  rewritten in place as a verse, a numbered matn, two sharḥ blocks and the
  next numbered matn; a Qurʾān, a ḥadīth and a narrator entity; three `read`
  marks; one cached gloss; `compileEnabled` for the compile capture only), or
  from 3b's `seedCards`; no earlier context's data changed. Synthetic only;
  the verse is read from the committed muṣḥaf. Names: `reader-page`,
  `reader-collapsed` (960), `reader-sheet-open` (600), `reader-quran`,
  `reader-quran-similar`, `reader-quran-compiled`, `reader-hadith`,
  `reader-hadith-diagnostics`, `reader-biography`, `reader-rail`,
  `reader-meaning`, `reader-meaning-cached`, `reader-margin-menu`,
  `reader-batch-proposal`, `reader-notice`, `reader-popover` (600),
  `reader-toc`, `reader-search`, `reader-share`. Only `reader-page` is the
  whole body; every other capture is the element its state adds.
- **Run time** 223 s and 226 s for the whole of U (was ≈150 s at 3b); builds
  ≈6 s each.
- **Masked in the DOM: nothing.** Three causes of flakes were found and
  handled in how the states are reached, each in the script:
  (1) a bare `click` on text below the fold let Playwright scroll it in, and
  the page landed at scrollY 386 or 163 on different runs, so the ḥadīth
  popover had the same DOM and different pixels — taps now scroll the target
  to the middle and wait for the scroll to stop (`centre`); (2) the ḥadīth
  popover was placed at top 12 px on most runs and **275.8 px on one**, running
  off the bottom of the screen with "Show dorar diagnostics" out of reach:
  AnchoredPanel places a popover from its height at mount and again only on a
  scroll, a resize or a new `onClose` (a reader render; FOUND_ISSUES 37), so
  content that arrives later keeps the first place unless the reader happens
  to render — every sheet and popover is now captured after a `resize` event
  (`captureDialog`); (3) in **screenshots only**, the sticky header's backdrop
  blur is switched off for those captures (Playwright's `style` option): a
  popover over the header showed it through its corner, a few levels (≤ 7/255)
  apart between runs. **Residual:** after (3), of the three full runs compared
  with the final manifest outside a breakage, one differed in
  `960x600/reader-quran.png` alone (DOM identical; the dump was overwritten
  before it could be inspected); four reader-only reruns in separate processes,
  and the captures outside each edit in the five breakage runs, were
  identical. (Corrected after the review, which found the first wording's
  "one of seven" counted breakage runs as clean runs.) Item (2) is now
  FOUND_ISSUES 37.
- **Departures from the plan, each in the script's header:** the verse is
  Ibrāhīm **2**, not 14:7 — the bundled matching-ayah resource has no entry
  for 14:7, so its sheet would have had no Similar tab; 14:2 has two matches.
  `reader-collapsed` and `reader-sheet-open` use `seedCards` so the edge tab
  has a count ("Cards (5)") and the sheet has cards. The Tafsīr, Topics and
  Surah tabs are not reachable (no such QUL file is committed); the rest of
  the plan's "not captured" list is in the script's.
- **Proof.** Run 1 `--write-manifest` (`git diff --numstat`: 70 added, 0
  removed); then `npm run verify:markup` three times: FAIL 249/250 (the
  residual PNG above), PASS 250/250, and, as the last gate after R and S,
  PASS 250/250. Breakages, each a temporary edit restored from a `cp`
  backup, `git diff --quiet -- src` after each, every run exit 1:
  1. `backdrop-blur` removed from the header (`ReaderScreen.tsx:766`): DOM of
     `reader-page` and `reader-header` at both sizes, as planned; and the
     **PNGs** of `reader-rail`, `reader-toc` (both sizes) and
     `reader-batch-proposal` (600) — their element boxes overlap the sticky
     header, which shows through the rail's and the drawer's translucency
     (237/250).
  2. "Translate all…" removed from the ḥadīth footer: `reader-hadith` at both
     sizes only (246/250).
  3. The compile blocked message changed: `reader-quran-compiled` at both
     sizes only (246/250).
  4. `preferSheet` dropped from QuranSheet: `reader-quran-similar` **and
     `reader-quran-compiled`** at 960 (at 600 every panel is a sheet anyway);
     the plan named only the first, but the prop governs every
     non-Translation tab, Compiled included (246/250).
  5. The batch bar's text changed ("cost nothing" → "cost nothing at all"):
     `reader-batch-proposal` at both sizes only (246/250). Its heading was not
     the edit, because the capture finds the bar by it.
- **R** first and alone (`timeout 1200 npm run verify:reader`, 1 min 30 s):
  PASS 28/28; landscape 240,000 px in 33.4 s, 1,905 nodes, **1 long task
  (55 ms, 5 ms blocking)**; portrait 175,800 px in 24.4 s, 1,904 nodes, 0 long
  tasks. With no `src/` change the one long task is noise against 4n's 0.
  **S** PASS 30/30. **T** exit 0. **B** main chunk 790,214 B (unchanged).
  **L** `--check`: no file-level cycle, 11 rules hold.

- **Review of 5a: FAIL** — the commit was clean, but U as baselined could not
  gate the moves. In the reviewer's first of two runs U failed 248/250:
  `600x960/reader-margin-menu.html` (MarginMenu at top 331.375 px against the
  baseline's 386.375 px — it places itself at the margin target's top, and
  after `centre` the target's place varied by 55 px with scrollY settled,
  which was all `centre` waited on) and `600x960/reader-batch-proposal.png`.
  The baselined `600x960/reader-batch-proposal.png` showed the reader's header,
  not the bar, which sat under the sticky header. `960x600/reader-quran.png`'s
  flake was left unexplained. No capture held a CardMarkerDot, which 5f3 moves.
  The placement race belonged in FOUND_ISSUES; 33 cited the wrong lines for
  the key check; 26 left out what the request sends. PROGRESS's run counts
  ("two runs", "one of seven") did not match the log.

**5a fix, measured 2026-11-16** (no `src/` change; `git diff --quiet -- src`
holds)
- `centre` waits on the target's rectangle and scrollY together, before and
  after scrolling, and repeats the scroll until the target's middle is within
  1 px of the screen's (or the page is at the top, for a target that cannot be
  centred), failing after four tries.
- The proposal is captured after scrolling back to the top and waiting for the
  bar's place to be still; the 600×960 PNG now shows the bar (looked at).
- `captureDialog`'s screenshot `style` makes everything but the dialog
  invisible (`body *` outside the dialog `visibility: hidden`, the dialog
  `visible`), in place of only turning off the header's blur; the DOM is
  untouched, and `reader-page`/`reader-header` capture what is hidden. It
  applies to every sheet and popover capture, `reader-popover` included.
- New `reader-page-cards`, both sizes: the body with `seedCards`' five cards
  — the five margin markers (CardMarkerDot), the translated-range strips and,
  at 960, the panel with the cards.
- FOUND_ISSUES 37 filed (the AnchoredPanel placement race); 26 gains what the
  request sends; 33 cites `gloss.ts:108-110` for the key check. The script's
  header points at 37.
- **Manifest:** against `79171e4` (before 5a) `git diff --numstat` is `74 0`,
  so the 180 earlier lines are byte-identical; against `23bc734` it is `22
  18`: the four `reader-page-cards` lines added and 18 lines changed, all
  PNGs — the 17 sheet and popover screenshots (their corners) and
  `600x960/reader-batch-proposal.png`. No `.html` changed. 254 files, 37
  captures (18 at 960, 19 at 600).
- **U five runs in a row, full, against the rewritten manifest:** after `--write-manifest`
  (242 s), `npm run verify:markup` five times, each `PASS — 254/254 files
  match docs/refactor/phase2/markup.sha256` (248 s, 243 s, 246 s, 242 s,
  239 s for the captures; about 4 min each with the builds). Before that, two
  reader-only runs of the new harness in separate processes were identical
  (74/74).
- **Breakages** (temporary edits restored from a `cp` backup, `src/` clean
  after each): (1) the batch bar's text ("cost
  nothing" → "cost nothing at all") → exit 1, 250/254: `reader-batch-proposal`
  `.html` and `.png` at both sizes, the 600×960 PNG among them; (2)
  CardMarkerDot's title ("Open this translation" → "Open this one
  translation", `BlockList.tsx`) → exit 1, 252/254: `reader-page-cards.html`
  at both sizes (a title does not paint, so the PNGs match).
- **Not a check's fault, seen while looking:** in every QuranSheet capture
  the verse's Uthmani marks (ٱ, the small high signs) draw as "NO GLYPH" boxes.
  `ArabicVerse` sets no font, so the sheet's Arabic falls back from
  `system-ui` to this container's fonts, which lack them; the blocks set the
  reader's font inline and render the same verse whole. On the tablet the
  system Arabic font decides; only the tablet can show it.
- **R** first and alone: the first run **hung** after the landscape report
  (landscape 240,000 px, 33.3 s, 1,905 nodes, 0 long tasks), the CPU idle, and
  was killed at 10 min; re-run once alone, as the plan's Design §1.5 says:
  PASS 28/28 in 1 min 35 s, landscape 240,000 px in 33.3 s, 1,905 nodes, 0
  long tasks; portrait 175,800 px in 24.4 s, 1,904 nodes, 0 long tasks — as
  4n. This is the second R hang on an unchanged bundle (4n's was the first);
  the plan says a second hang in a row stops the step, and these were not in a
  row (5a's R ran clean), but it is recorded for the reviewer. **S** PASS
  30/30. **T** exit 0. **B** main chunk 790,214 B (unchanged). **L**
  `--check`: no file-level cycle, 11 rules hold.

**Check R's hang, 2026-11-17** (the owner's amendment to Q2)
- R hung twice on unchanged bundles at two different points (4n; the 5a
  fix). Five runs with `DEBUG=pw:api` afterwards all passed (28/28, 88–90 s,
  performance as the baseline), so the cause was not caught. The 5a
  re-review's candidate: the seed's IndexedDB transactions had `oncomplete`
  and `onerror` but no `onabort`, so an aborted write would wait forever.
- By the owner's choice, `scripts/verify-reader-scroll.mjs` now gives the
  setup and teardown waits limits of their own (`within(ms, label, …)`: the
  seed, the
  onboarding write, opening and closing each context, closing the browser
  and the preview server), adds `onabort` to the seed's transactions and
  `onblocked` to its open, and runs a ten-minute watchdog that bounds every
  other wait (the checks' own `evaluate` calls, `newPage`,
  `addInitScript`), printing the step it was in and exiting 2. No assertion
  changed. Review of `2b2f9da`: PASS WITH NOTES — no failure can become a
  pass, `onblocked` cannot fire on a version-less open, the limits are
  generous; this wording corrected, and §1.5 and Q2 now point at the
  amendment.
- **Proven:** a normal run PASS 28/28 (240,000 px in 33.4 s, 1,905 nodes, 0
  long tasks; 175,800 px in 24.4 s, 1,904 nodes); a seed made never to
  finish fails after 61 s with "timed out after 60000 ms: seeding the book"
  and exit 1, instead of hanging; restored from a copy (`cmp` equal).

**Step 5b, measured 2026-11-17** (no `src/` change; `git diff --quiet -- src`
holds)
- **27 new checks** in `scripts/verify-reader-scroll.mjs`, after the two
  existing profiles, **each scenario in a fresh browser context** with its own
  seed: R's 1,500 blocks plus three `read` marks (blocks 400, 450, 500), two
  translation cards (blocks 300 and 1000) and a one-entry synthetic
  dictionary book (`role: 'dictionary'`, root ع م ل). Landscape, 9 scenarios:
  Ctrl+`\` (2 checks), Hide cards and the edge tab (2), a marker opening its
  card in the panel and flashing its block, cleared after 1.6 s (2), a card
  tap bringing block 1000 to the middle and flashing it (2), the read-mark
  ↑ ↓ (4), double-tap (2), the restore applied once (1), the divider by mouse
  (3), the divider by finger (report). Portrait, 4: the sheet's handle (2), a
  marker opening a popover (1), the read-mark ↑ ↓ (4), double-tap (2). Every
  setup and teardown wait is in `within()` and every scenario names its
  `step()`; a scenario that throws is one named FAIL and the run goes on. The
  28 existing checks keep their labels, order and values; R is now 55 checks.
- **Run time** 134–137 s for the whole of R (was ≈90 s): the scenarios add
  about 45 s.
- **Five runs in a row**, each `timeout 1200 npm run verify:reader`, first and
  alone: PASS 55/55 (137 s), PASS 55/55 (135 s), PASS 55/55 (136 s), PASS
  55/55 (134 s), PASS 55/55 (135 s). Landscape 240,000 px in 33.4 / 33.3 /
  33.3 / 33.3 / 33.4 s, 1,905 nodes, 0 long tasks; portrait 175,800 px in
  24.4 s, 1,904 nodes, 0 long tasks, every run — the baseline. Every new
  check's line and every report line was byte-identical across the five; the
  only difference in any line was an existing check's detail (portrait
  "scrolling up into never-seen blocks": 5 or 6 pairs on screen, worst gap 0),
  as before 5b. No flake to fix, no hang.
- **Report lines** (not judged; every later step must print the same):
  `{"fingerDrag":{"from":525,"to":645,"before":432,"after":405,"userSelect":"none","storedWidth":405,"afterStrayMouseMove":300}}`
  — under CDP touch emulation the finger drag resized the panel for its first
  30 px (432 → 405, stored), then the browser took the gesture, the drag was
  never ended (`user-select` left `none`) and a later plain mouse move with no
  button resized the panel to 300 px: FOUND_ISSUES 27 as measured in Chromium's
  emulation; the tablet (M item 3) is still the answer. And, in both
  profiles, `{"readMarkDown":{"from":450,"next":500,"atMiddle":450}}` — ↓ from
  a mark that ↑ centred stays on it (FOUND_ISSUES 39, filed here).
- **Departures from the plan's table.** (1) The pointer drag goes 120 px
  **right** and then far left: at 960 px the saved 460 px already renders at
  the clamp's ceiling (45% = 432 px), so a drag left cannot widen it; the far
  drag checks the clamp instead. (2) The read marks are judged as ↓ once from
  the top, then ↑ twice from past the marks, not "↓ twice and ↑ once": a
  second ↓ does not move (FOUND_ISSUES 39), so that sequence would either fail
  on today's code or bake the bug in; it is a report line. (3) "In the middle"
  for the read marks means the block at the middle of the area below the
  header, not a distance from the screen's middle: every centred jump lands
  one header height below the screen's middle and `settleOn` retries it eight
  times (FOUND_ISSUES 40, filed here); the card tap keeps the search check's
  tolerance, as planned. (4) Every scenario has its own context, not one
  context per profile, so a failure cannot leak into the next scenario and the
  divider's width write is isolated anyway. (5) The plan's breakage for
  "position, once" (`restoredRef` not set) changes nothing observable: the
  restore effect's dependencies do not change within one book, so it runs
  once with or without the guard (run 11 below passes 55/55); the only route
  to a second restore today is a book-to-book hash change (FOUND_ISSUES 31).
  The check is proven instead with the restore applied a second time, 2 s
  after the first. (6) Q16 asked for a `torjuman-reader` reading of 5b's
  additions before the baseline. The additions were built by the
  `torjuman-reader` agent itself, which cannot start another agent, so the
  independent read was the `torjuman-reviewer`'s, after the baseline was
  committed (`ad16fdc`) — as for 5a. A departure from Q16, reported to the
  owner.
- **Breakages**, each a temporary edit to `ui/reader/ReaderScreen.tsx`
  restored from a `cp` backup (`cmp` equal, `git diff --quiet -- src` after
  each), each a full `npm run verify:reader`; none failed any of the 28
  existing checks:
  1. the divider's `clampPanelWidth` removed from its move handler → exit 1,
     54/55: "dragged far left it stops at the clamp…" (panel 432, stored 760);
  2. Ctrl+`\` listening for `|` → 53/55: both Ctrl+`\` checks;
  3. the header's Hide cards writing the current `panelCollapsed` → 53/55:
     both Hide cards checks;
  4. the marker's `if (panelVisible)` inverted → 52/55: both marker → panel
     checks (a popover opened) and marker → popover;
  5. the read-mark jump to `order + 1` → 49/55: the three judged read-mark
     checks at both sizes (block 401, 501, 451 at the middle);
  6. the saved position applied a second time, 2 s after the first → 54/55:
     "after the restore, a jump elsewhere stays where it landed" (restored
     700, jumped to 95, 2.5 s later 700); its second restore also landed in
     the report's scroll (7.1 s / 6.1 s), which is not judged;
  7. the `dblclick` listener not added → 51/55: both double-tap checks at both
     sizes (no sheet; the word stays selected and the rail shows);
  8. the sheet's handle not toggling → 53/55: both sheet checks;
  9. `flash` a no-op → 53/55: the marker's flash and the card's flash;
  10. `focusCard` not jumping → 53/55: both card → text checks;
  11. (the plan's) `restoredRef.current = true` removed → exit 0, 55/55, as
      explained in (5) above.
- **S** PASS 30/30. **T** exit 0. **B** main chunk 790,214 B (unchanged).
  **L** `--check`: no file-level cycle, 11 rules hold. **U** last: PASS
  254/254 (250 s).
- FOUND_ISSUES **39** (↓ from a centred read mark) and **40** (centred jumps
  one header low, `settleOn`'s eight passes) filed, left unfixed. RESTRUCTURE
  §5's R row now says 55 and names the report lines.

- **Review of 5b (`ad16fdc`): PASS WITH NOTES; "ready for 5c".** Two R runs
  55/55, every new line identical to the builder's; each new check can fail
  and none passes when its element is missing; the departures acceptable
  (the read-mark checks do not build FOUND_ISSUES 39 in); 39 and 40
  accurate. Coverage gaps for the parts to come, guarded by reading the
  same-name props only: CommentaryBars' sharḥ notice and busy bar, the card
  panel's per-kind collapse/delete/note/glossary actions, the sheets' close
  paths. Note: the portrait read-mark checks pass by 8–9 px, deterministic;
  a header-height change of ~17 px would flip them (U would show it too).
  Applied: the script header said nothing "checked" those states before 5b,
  untrue given U's captures — now "asserted the behaviour of"; departure (6)
  above records what happened; FOUND_ISSUES 39's line range.

**Step 5c, measured 2026-11-17** (no `src/` change; `git diff --quiet -- src`
holds)
- **Check P** (`scripts/verify-translate.mjs`, `npm run verify:translate`,
  record `docs/refactor/phase5/translate.json`): the production build under
  `vite preview`, Chromium 960×600 touch, en-US, UTC, service workers
  blocked; a synthetic 12-block book (a verse — Ibrāhīm 2 from the committed
  muṣḥaf, as U — a numbered matn, two sharḥ blocks, the next matn, test
  sentences) with a Qurʾān and a ḥadīth entity. The two model hosts are
  answered from canned responses copied from Q's (Gemini's SSE and error
  JSON; Anthropic's Messages event stream with the strict emit_translation
  tool and a web-search research turn, non-zero cache read and write), **each
  request held until its scenario answers it**; every other host is aborted.
  Every scenario goes through the reader's own controls (a selection and the
  rail's Translate, the card's Retranslate menu, the verse sheet's footer, a
  600 ms press on the matn's margin and Translate all…). Watchdog,
  `within()` and `step()` as R (the amendment to Q2).
- **23 scenarios in 6 groups, 18 requests.** With Gemini and sunnah.com keys,
  the default profile: `translate` (three blocks, the middle a verse;
  recorded while held, and again with a second selection showing the rail's
  busy button), `cache-hit` (no request), `retranslate` (same model, forced),
  `retranslate-with` (Flash Lite 3.5: the model in the URL and on the card),
  `stale` (a glossary row written, reloaded: the old card's stale note —
  `isStale`'s `cacheKeyFor` — then a cache miss with the glossary in the
  prompt), `block` (the verse sheet's "Translate the surrounding passage"),
  `error-400` (api), `error-auth` (403, auth), `error-truncated` (MAX_TOKENS
  twice: two requests, the doubled budget, `rawResponse`), `error-network`
  (dropped), `error-cached` (the failed card served from the cache, no
  request: FOUND_ISSUES 41), `retranslate-no-key` (a Claude model with no
  Claude key: 7 cards → 6, FOUND_ISSUES 42), `batch` (the proposal; each of
  three requests held, "Translating k of 3…"; the third a 500: "Finished — 2
  of 3 blocks translated, 1 did not complete."), `batch-again` (all from the
  cache, no request). Without a key: `no-key` (banner, notice, no request, no
  card), `no-key-dismiss`, `no-key-batch` ("0 of 3 …, 3 did not complete",
  the notice). Gemini profiles: `external-lookup` (GeminiProvider sends no
  flag, so this pins only the card's `usedExternalLookup` and its "web
  search" label — FOUND_ISSUES 43), `transliteration`
  (`TRANSLITERATION_INSTRUCTION` in the system prompt). A Claude profile
  (fake Anthropic key): `claude-translate` (one request with the tool; the
  card's cost and usage; "Claude: 1 · $0.0072", "2,048 tokens from cache")
  and `claude-external-lookup` (a second profile with allowExternalLookup made
  active, reloaded: the research request carries the `web_search` tool, then
  the structure request; "Claude: 1 · $0.014"). On the device:
  `offline-no-bundle` (the bundled English refused: a plain Error, mapped by
  `translate` itself to `api` — the only route found to that branch) and
  `offline` (the model download refused: OfflineProvider's own `network`).
- **Recorded per scenario:** each model request (method, URL, every header
  Chromium sends — `allHeaders()` — and the body, parsed JSON that
  re-serializes to the exact text sent), the `cards` rows in key order as
  IndexedDB holds them, and the screen: the bars above the text, the session
  line, each panel card's text, the rail's Translate when up; some scenarios
  also a state while a request is held. **Record 352,616 bytes, 4,951
  lines.**
- **Masked:** `x-goog-api-key`'s and `x-api-key`'s values (after each is
  asserted to be its host's fake key, so the record can be asserted
  key-free); the SDK's `x-stainless-os`, `-arch`, `-runtime`,
  `-runtime-version` exactly as Q masks them; `user-agent`, `sec-ch-ua`,
  `sec-ch-ua-platform` (the OS and Chromium build, which would differ on the
  owner's PC); the preview origin in `origin` and `referer` (its port is the
  first free one). No id, timestamp or card field.
- **Pinned:** `page.clock` fixed, **one instant per page load, a minute after
  the last**; `Math.random` seeded (D's mulberry32) before the app's scripts.
  Found while building: with one instant for every load, `newId` repeated
  its ids after a reload (its counter restarts with the page, the seed is
  installed afresh), and a card written after the reload overwrote an older
  one (`error-400`'s card replaced `retranslate-with`'s).
- **Asserted** every run: each model key in its own header (`x-goog-api-key`,
  `x-api-key`) of every request to its own host and nowhere else; the
  sunnah.com key only in a request to sunnah.com (directly or through the
  proxy's `/sunnah/`), never in a model request or a card; no key in any
  request's URL, body or other header (`allHeaders()`), any IndexedDB store,
  sessionStorage, a cookie, Cache Storage's names, the DOM, the page's URL,
  `history.state`, `window.name`, the console or page errors, the record; in
  localStorage only its own entry; no `Authorization`; every held request
  answered and none unexpected; a request is tagged with the scenario it
  arrived in, so one that comes late fails its own scenario rather than
  being taken by the next.
- **Not seen by any scenario, so 5i3's reviewer checks them by reading**
  (also in the script's header): the offline stats updater
  (`useTranslator.ts:263-270` — both offline scenarios fail before it, and
  `translateProse` always loads the model, `OfflineProvider.ts:365`); the
  streaming entry's removal in `finally` (`:356-360` — the streaming text
  renders only while a card is loading, and a fulfilled response arrives at
  once); `SessionStats.cacheWriteTokens` (`:330` — summed, read nowhere in
  `src/ui`); and the cost sum's accumulation (`previous.costUsd +`,
  `:322-331` — each Claude session line follows one translation after a
  fresh load, so a sum that dropped the previous total would show the same
  figure). Everything else Design §7 moves is seen, the per-provider count
  and the cost of a single Claude translation through the Claude group.
- **Run time** 62–63 s for the script, about 70 s for `npm run
  verify:translate` with its build.
- **Determinism:** the final script: a run with `--out`, then `--write` from
  a second run, byte-identical to each other; a compare under
  `TZ=America/St_Johns` PASS; and the gate run PASS. Earlier versions were as
  stable (before the Claude group: five identical, under two other zones).
- **Breakages**, each a temporary edit restored from a `cp` backup (`cmp`
  equal; `git diff --quiet -- src` after each run), each a full
  `npm run verify:translate` against the final record, all exit 1:
  1. the cache check skipped when not forced → 25 assertions (an unexpected
     request at `cache-hit`, named there, and every later scenario off);
  2. the no-key notice's text changed → 3 assertions;
  3. `errorKind` dropped from the failed card → 10 scenarios differ;
  4. `isStale`'s `cacheKeyFor` dropped (never stale) → 11 scenarios differ;
  5. `contextBefore` joined with `\n` → 9 scenarios differ;
  6. `TRANSLITERATION_INSTRUCTION` dropped → `transliteration` differs;
  7. the cloud stats not incremented → 18 scenarios differ;
  8. the non-TranslationError kind `api` → `network` → the two offline
     scenarios differ;
  9. (`useBatchTranslate.ts`) the range run in reverse → `batch`,
     `batch-again` differ;
  10. the Gemini key written into a failed card's `rawResponse` → 3
      assertions (IndexedDB, the DOM, the record);
  11. `setBusy(true)` dropped → `translate` differs (the rail's busy button);
  12. `allowExternalLookup` dropped from the request literal → 1 assertion
      (`claude-external-lookup` gets no research request; 17 requests);
  13. the cost sum dropped in the cloud stats updater → both Claude
      scenarios differ (the session line's $);
  14. the `requestsByProvider` key swapped (always `gemini`) → both Claude
      scenarios differ;
  15. the sunnah.com key written into a failed card → 3 assertions.
- **Gates**, after the fixes: R first and alone, `timeout 1200 npm run
  verify:reader`: PASS 55/55; landscape 240,000 px in 33.4 s, 1,905 nodes, 0
  long tasks; portrait 175,800 px in 24.4 s, 1,904 nodes, 0 long tasks;
  report lines as at 5b. **T** exit 0. **B** main chunk 790,214 B
  (unchanged; its hash moves with the build time). **L** `--check`: 169
  files, 134 directory edges, no file-level cycle, 11 rules hold. **Q** PASS.
  **S** PASS 30/30. **P** PASS.
- **Departures from the plan.** (1) Masked: the machine and SDK platform
  headers and the preview origin beside the keys (above); the plan said
  "nothing masked" of ids and timestamps, which holds. (2) More than Design
  §1.4's nine scenarios and five breakages (the plan's five are 1, 3, 5, 6,
  7), and a Claude group, which §1.4 put out of scope ("the hook is
  provider-blind") but which is the only way to see the request's external
  lookup flag, the cost sum and the per-provider count. (3) Breakage 9 is in
  `useBatchTranslate.ts`: the batch's order lives there. (4) The CLAUDE.md
  Commands row is written by the main session.
- **The `torjuman-llm` read (Q16): NOT READY, two must-fixes, both done.**
  M1: GeminiProvider never reads `allowExternalLookup` and its cost is
  always null, so deleting the flag from the request literal, the cost sum
  or the per-provider key would have passed P, and the `external-lookup`
  scenario's description claimed a flag it did not record — fixed by the
  Claude group (fake Anthropic key, Q's Anthropic stream copied, SDK platform
  headers masked as Q does, the key asserted only in `x-api-key`), the
  description corrected, and breakages 12–14. M2: the claim that every step
  Design §7 moves is seen was false — the three unseen steps are now named
  (above, and in the script's "Not covered"). Also taken from its optional
  list: `allHeaders()` for the record and the key scan, the page's URL,
  `history.state` and `window.name` scanned, a fake sunnah.com key (breakage
  15), and late requests failing in their own scenario. FOUND_ISSUES 41, 42
  and 43 filed from its read, left unfixed.

- **Review of 5c (`ea6c34e`): PASS WITH NOTES; "ready for 5d1".** Two P runs
  identical (one under `TZ=Asia/Riyadh`); key containment traced — each fake
  key in its own header to its own host and nowhere else, no scan vacuous
  where it matters; the masks cover nothing `useTranslator` produces;
  FOUND_ISSUES 41–43 accurate. Applied: the script header still said "the
  Claude provider in the browser" is not covered, untrue since the Claude
  group — now Claude's error paths and retries; and the cost sum is seen
  only from zero, so its accumulation joins the steps 5i3's reviewer checks
  by reading (header and above).

**Step 5d1, measured 2026-11-17**
- `Section` (`SettingsScreen.tsx:70-87`) moved verbatim into the new
  `ui/settings/Section.tsx`, `export` added (rule 4 (b)); a four-line
  header. It imports `type ReactNode` and `SettingsSection` (copies of the
  source's import lines, filtered); `SettingsScreen` drops both and imports
  `Section`. The move was done by a script that copies each declaration with
  the comment above it; its first run cut the function at `}: {` and was
  caught by the typecheck, restored, and the script fixed before any check
  ran. Comments made untrue here, for 5j (Q13): `ui/kit/SettingsSection.tsx`'s
  header still says "SettingsScreen's local Section".
- **T** exit 0. **B L R S U**, run on the tree just before the commit
  (which added only this entry): **B** exit 0, main chunk 790,214 B
  (unchanged), only `index.js` differs (the function's place), CSS
  byte-identical; **L** 170 files, 134 edges, rules hold; **R** first and
  alone 55/55, 240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px
  in 24.4 s, 1,904 nodes; **S** 30/30; **U** 254/254.
- **Review of 5d1: PASS WITH NOTES; "ready for 5d2".** Byte-identical
  move; all seven `<Section` uses resolve to the import; the filtered
  `import { type ReactNode }` is rule 4 (a); the kit comment deferred to 5j
  as Q13 says.

**Step 5d2, measured 2026-11-17**
- `CatalogSection` with its doc comment moved verbatim into the new
  `ui/settings/CatalogSection.tsx`, `export` added; a two-line header. It
  imports `LinkButton` and `Section`; `SettingsScreen` imports
  `CatalogSection` and keeps `LinkButton`, which its header's Library button
  uses (the commit message says it drops it; it does not).
- **T** exit 0. **B L R S U**, on the committed tree: **B** exit 0, main
  chunk 790,214 B (unchanged), only `index.js` differs, CSS byte-identical;
  **L** 171 files, 134 edges, rules hold; **R** first and alone 55/55
  (240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s,
  1,904 nodes); **S** 30/30; **U** 254/254.
- **Review of 5d2: PASS WITH NOTES; "ready for 5d3".** A pure move; the
  note on `LinkButton` corrected above.

**Step 5d3, measured 2026-11-17**
- `TranslationSection` moved verbatim into the new
  `ui/settings/TranslationSection.tsx`, `export` added; a three-line header.
  It imports `useApp`, `secrets`, `allProviders`/`defaultModelFor`/
  `modelsFor`, `CloudProviderId`, `Field`/`inputClass` and `Section`
  (filtered copies of the source's lines); `SettingsScreen` drops
  `defaultModelFor` and `modelsFor` and imports `TranslationSection`.
- **T** exit 0. **B L R S U**, on the committed tree: **B** exit 0, main
  chunk 790,214 B (unchanged), only `index.js` differs, CSS byte-identical;
  **L** 172 files, 134 edges, rules hold; **R** first and alone 55/55
  (240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s,
  1,904 nodes); **S** 30/30; **U** 254/254.
- **Review of 5d3: PASS; "ready for 5d4".** The doc comment moved with the
  function; every import kept or dropped is right.

**Step 5d4, measured 2026-11-17**
- `KeysSection` and its private parts `TestState`, `ProviderKeyField` and
  `SunnahKeyField` moved verbatim, in their order, into the new
  `ui/settings/KeysSection.tsx`; only `KeysSection` is exported. A
  four-line header. It imports `useState`, `secrets`, `allProviders`/
  `providerFor`, `CloudProviderId`, `Button`/`inputClass` and `Section`;
  `SettingsScreen` drops `secrets`, `allProviders`, `providerFor` and
  `CloudProviderId` and imports `KeysSection`. `SunnahKeyField`, one of the
  ḥadīth-only pieces Design §8 names, now lives in this file, rendered only
  by `KeysSection`.
- **T** exit 0. **B L R S U**, on the committed tree: **B** exit 0, main
  chunk 790,214 B (unchanged), only `index.js` differs, CSS byte-identical;
  **L** 173 files, 134 edges, rules hold; **R** first and alone 55/55
  (240,000 px in 33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s,
  1,904 nodes); **S** 30/30; **U** 254/254.
- **Review of 5d4: PASS; "ready for 5d5".** The four declarations
  byte-identical in their order; the three parts used nowhere else; keys
  still only through `secrets`.

**Step 5d5, measured 2026-11-17**
- `ReadingSection` moved verbatim into the new
  `ui/settings/ReadingSection.tsx`, `export` added; a three-line header. It
  imports `useApp`, `Field`/`inputClass` and `Section`, all still used by
  `SettingsScreen` too, which only gains the import of `ReadingSection`.
- **T** exit 0. **B L R S U**, on the committed tree: **B** exit 0, main
  chunk 790,214 B (unchanged), only `index.js` differs, CSS byte-identical;
  **L** 174 files, 134 edges, rules hold; **R** first and alone 55/55
  (240,000 px in 33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.4 s,
  1,904 nodes); **S** 30/30; **U** 254/254.
- **Review of 5d5: PASS; "ready for 5d6".** Byte-identical; no comment
  above it to move; imports minimal.

**Step 5d6, measured 2026-11-17**
- `DisplaySection` with its doc comment moved verbatim into the new
  `ui/settings/DisplaySection.tsx`, `export` added; a three-line header. It
  imports `useApp`, the `useLayoutMode` line (copied whole, multi-line),
  `PanelPosition`, `Field`/`inputClass` and `Section`; `SettingsScreen`
  drops the `useLayoutMode` import and `PanelPosition`, and imports
  `DisplaySection`.
- **T** exit 0. **B L R S U**, on the committed tree: **B** exit 0, main
  chunk 790,214 B (unchanged), only `index.js` differs, CSS byte-identical;
  **L** 175 files, 134 edges, rules hold; **R** first and alone 55/55
  (240,000 px in 33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s,
  1,904 nodes); **S** 30/30; **U** 254/254.
- **Review of 5d6: PASS; "ready for 5d7".** Byte-identical with its doc
  comment; the `ui/settings → ui` edge only moved file.

**Step 5d7, measured 2026-11-17**
- `QuranSection` moved verbatim into the new `ui/settings/QuranSection.tsx`,
  `export` added; a three-line header. It imports `useEffect`/`useState`,
  `useApp`, `listEnglishTranslations`/`TranslationResource`,
  `Field`/`inputClass` and `Section`; `SettingsScreen` drops `useEffect`,
  the `retrieval/quran` import, `Field` and `inputClass`, and imports
  `QuranSection`.
- **T** exit 0. **B L R S U**, on the committed tree: **B** exit 0, main
  chunk 790,214 B (unchanged), only `index.js` differs, CSS byte-identical;
  **L** 176 files, 134 edges, rules hold; **R** first and alone 55/55
  (240,000 px in 33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.4 s,
  1,904 nodes); **S** 30/30; **U** 254/254.
- **Review of 5d7: PASS; "ready for 5d8".** Its effect and `[http]` deps
  moved unchanged; imports minimal.

**Step 5d8, measured 2026-11-17**
- `BackupSection` with its doc comment moved verbatim into the new
  `ui/settings/BackupSection.tsx`, `export` added; a three-line header. It
  imports `useRef`/`useState`, `useApp`, `WorkBundle`, `saveFile`, `Button`
  and `Section`; `SettingsScreen` drops all of them but `LinkButton` and
  `TopBar`, and imports `BackupSection`. `SettingsScreen.tsx` is now 62
  lines: its imports and the list, as Design §3 said (about 70). Made untrue
  here, for 5j (Q13): `scripts/verify-storage-harness.ts:901` names
  `SettingsScreen` as the backup's caller.
- **T** exit 0. **B L R S U D**, on the committed tree: **B** exit 0, main
  chunk 790,214 B (unchanged), only `index.js` differs, CSS byte-identical;
  **L** 177 files, 134 edges, rules hold; **R** first and alone 55/55
  (240,000 px in 33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.4 s,
  1,904 nodes); **S** 30/30; **U** 254/254; **D** PASS, identical.
- **Review of 5d8: PASS WITH NOTES; "ready for 5e1".** `exportWork` and
  `importWork` still go through `storage`; "adding a section is one file
  and one line" is now true. Comments made untrue by 5d1–5d8, for 5j: the
  kit's `SettingsSection.tsx:3-9` and `verify-storage-harness.ts:901`, as
  the plan lists, and FOUND_ISSUES 32's line reference
  (`SettingsScreen.tsx:533-546`, now `BackupSection.tsx:26-39`).

**Step 5e1, measured 2026-11-17**
- `HadithSheet` (`EntitySheet.tsx:457-756`, with the `ḥadīth` divider and
  its doc comment) and its private part `Diagnostic` (`:68-77`) moved
  verbatim, in their order, into the new `ui/reader/HadithSheet.tsx`; only
  `HadithSheet` is exported (rule 4 (b)). A five-line header. Byte diff of
  each block against the old file: `Diagnostic` identical, `HadithSheet`
  identical but for the added `export`; what stays in `EntitySheet.tsx` is
  the old file minus those lines and four import lines, nothing reordered.
  `HadithSheet.tsx` imports `useEffect`/`useState`, `useApp`, `useReadOnly`,
  `navigate`, `secrets`, `useOnline`, `BidiText`, `lookupHadith`,
  `DorarDiagnostics`, `Book`/`Entity`/`HadithRecord`, `commentaryWorks`,
  `AnchoredPanel` and `Button`/`Spinner` (filtered copies of the source's
  lines); `EntitySheet` drops `lookupHadith`, `DorarDiagnostics`,
  `HadithRecord` and `commentaryWorks`, keeps every other import (the
  Qurʾān sheet and CompileTab use them), and imports `HadithSheet`.
  `HadithSheet.tsx` imports nothing from `EntitySheet.tsx`, so no cycle.
  `EntitySheet.tsx` is 441 lines. No comment made untrue: `:49` ("a verse
  or ḥadīth is tapped") is still the dispatcher's, and nothing outside the
  file names the moved lines (`plans/phase3-provider-seams.md:710`'s
  `EntitySheet.tsx:341-359` is a closed plan's record of CompileTab, whose
  lines shift up by 14 here and move at 5e3).
- **T** exit 0. **B L R S U**, on the tree just before the commit: **B**
  exit 0, main chunk 790,214 B (unchanged), only `index.js` differs
  (`compare-bundles` against post-5d8: the module's place), CSS
  byte-identical (`cmp`); **L** 178 files, 134 edges, 0 directory and 0
  file-level cycles, rules hold; **R** first and alone 55/55 (240,000 px in
  33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s, 1,904 nodes,
  0 long tasks); **S** 30/30; **U** 254/254, `reader-hadith` and
  `reader-hadith-diagnostics` at both sizes among them.
- **Review of 5e1 (`ad81ec7`): PASS WITH NOTES; "ready for 5e2".** Both
  blocks byte-identical (only `export` added); the `ḥadīth` divider travels
  with its section rather than being left over nothing at the file's end;
  `HadithSheet.tsx` imports nothing from `EntitySheet.tsx`, so no cycle,
  type-only or other.

**Step 5e2, measured 2026-11-17**
- `interface QuranSheetData` (`EntitySheet.tsx:88-99` at `ad81ec7`; no
  comment directly above it, so the `Qurʾān` divider at `:86` stays with
  `QuranSheet`) moved verbatim into the new `ui/reader/quranSheetData.ts`,
  `export` added; a four-line header. Byte diff: identical but for the
  `export`; `EntitySheet.tsx` is the old file minus lines 88-100 and the
  import changes, nothing reordered. The new file imports
  `QuranEnglish`/`QuranIndex`, `RelatedAyah`/`SurahInfoResult`/
  `TafsirResult`/`TopicResult` and `QuranVerse`, filtered from the source's
  lines and written `import type` (rule 4 (a)): the source's inline
  `type` modifiers, filtered to types alone, would under
  `verbatimModuleSyntax` leave a bare side-effect import of
  `quran/quranIndex` and `qul/service`. `EntitySheet` drops those seven
  names from its three lines (`loadQuranEnglish`/`loadQuranIndex` and the
  `qul/service` functions stay) and adds `import type { QuranSheetData }`.
  `quranSheetData.ts` imports nothing from `ui/reader`, so 5e3 and 5e4 can
  both import it without a cycle. `EntitySheet.tsx` is 424 lines. No
  comment made untrue.
- **T** exit 0. **B L R S U**, on the tree just before the commit: **B**
  exit 0, main chunk 790,214 B (unchanged), **every chunk identical after
  masking** (`compare-bundles` against post-5e1, exit 0, `index.js`
  included), CSS byte-identical (`cmp`); **L** 179 files, 134 edges, 0
  directory and 0 file-level cycles, rules hold; **R** first and alone
  55/55 (240,000 px in 33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in
  24.6 s, 1,904 nodes, 0 long tasks); **S** 30/30; **U** 254/254.
- **Review of 5e2 (`bdd5a5c`): PASS; "ready for 5e3".** The interface
  byte-identical but for `export`; every chunk identical after masking;
  the `import type` lines confirmed right under `verbatimModuleSyntax`
  (filtered inline `type` names would have left side-effect imports).

**Step 5e3, measured 2026-11-17**
- `CompileTab` (`EntitySheet.tsx:281-424` at `bdd5a5c`: the `compiled`
  divider, which heads only it, its doc comment and the function) moved
  verbatim into the new `ui/reader/CompileTab.tsx`, `export` added; a
  four-line header. Byte diff: identical but for the `export`;
  `EntitySheet.tsx` is the old file minus lines 280-424 and the import
  changes, nothing reordered. It has no private helper. It imports
  `useEffect`/`useState`, `useApp`, `secrets`, `useOnline`, `BidiText`, the
  `qul/compile` line whole, `isCloudProvider`, `Entity`/`ProviderId`/
  `QulCompilation`, `Button`/`Spinner` and `type QuranSheetData` from
  `./quranSheetData` — nothing from `EntitySheet.tsx`, so no cycle.
  `EntitySheet` drops `secrets`, `useOnline`, the `qul/compile` import,
  `isCloudProvider`, `ProviderId` and `QulCompilation`, keeps the rest
  (`QuranSheet` uses them), and imports `CompileTab`. `EntitySheet.tsx` is
  270 lines.
- **Comments.** `quran/quranIndex.ts:427` ("`data.verse?.english ||
  data.bundledEnglish` in EntitySheet"), which plan Design §10 lists as
  untrue from 5e3, is by reading still true: the expression is in both
  sheets, but the sentence is about what "the sheet shows", which is
  `QuranSheet`'s line (`EntitySheet.tsx:227`), still here;
  `CompileTab.tsx`'s copy (`:80`) feeds the model, shows nothing. It
  becomes untrue at 5e4, when `QuranSheet` moves; for 5j either way. No
  other comment made untrue.
- **T** exit 0. **B L R S U**, on the tree just before the commit: **B**
  exit 0, main chunk 790,214 B (unchanged), only `index.js` differs
  (`compare-bundles` against post-5e2: the module's place), CSS
  byte-identical (`cmp`); **L** 180 files, 134 edges, 0 directory and 0
  file-level cycles, rules hold; **R** first and alone 55/55 (240,000 px in
  33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.6 s, 1,904 nodes,
  0 long tasks); **S** 30/30; **U** 254/254, `reader-quran-compiled` at
  both sizes among them.
- **Review of 5e3 (`aa423d9`): PASS; "ready for 5e4".** Byte-identical
  but for `export`; the `compiled` divider heads only `CompileTab` and went
  with it; no cycle. The correction to Design §10 confirmed:
  `quran/quranIndex.ts:427` stays true through 5e3 (the line it describes,
  what "the sheet shows", is `QuranSheet`'s) and becomes untrue at 5e4.

**Step 5e4, measured 2026-11-17**
- `QuranSheet` (`EntitySheet.tsx:73-270` at `aa423d9`: the `Qurʾān`
  divider and the function), `TabId` (`:50`) and the verse-sheet design
  comment (`:35-48`, the plan's `:51-64`) moved verbatim, in their order,
  into the new `ui/reader/QuranSheet.tsx`; only `QuranSheet` is exported.
  A five-line header. The split comment, adaptation (l): `:33` ("The sheet
  that opens when a verse or ḥadīth is tapped.", the plan's `:49`) stays
  above the dispatcher, a blank line between as before; the `//` line
  joining the two halves (`:34`, the plan's `:50`), which belongs to
  neither, is dropped at the seam. Byte diff: the design comment, `TabId`,
  `:33` and the dispatcher (`:51-71`) identical; `QuranSheet`'s block
  identical but for the `export`.
- `QuranSheet.tsx` imports every line `EntitySheet` had but `Book` and
  `HadithSheet` (filtered copies, in order), `CompileTab` and `type
  QuranSheetData` among them, and nothing from `EntitySheet.tsx`, so no
  cycle. `EntitySheet` keeps only `Book`/`Entity` and `HadithSheet` and
  imports `QuranSheet`. **`EntitySheet.tsx` is 29 lines** — its imports,
  `:49`'s line and the dispatch — against Design §4's "about 55": the
  estimate counted the old import block, which went with the sheets.
- **Made untrue here, for 5j (Q13):** `quran/quranIndex.ts:427`
  ("`data.verse?.english || data.bundledEnglish` in EntitySheet"); the
  line it describes is now `QuranSheet.tsx:208`.
- **T** exit 0. **B L R S U**, on the tree just before the commit: **B**
  exit 0, main chunk 790,214 B (unchanged), only `index.js` differs
  (`compare-bundles` against post-5e3: the module's place), CSS
  byte-identical (`cmp`); **L** 181 files, 134 edges, 0 directory and 0
  file-level cycles, rules hold; **R** first and alone 55/55 (240,000 px in
  33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s, 1,904 nodes,
  0 long tasks); **S** 30/30; **U** 254/254, `reader-quran`,
  `reader-quran-similar` and `reader-quran-compiled` at both sizes among
  them.
- **Review of 5e4 (`539de97`): PASS WITH NOTES; "ready for 5f1".** The
  three moved pieces byte-identical (only `export` added); dropping the
  bare `//` joiner at the split's seam accepted; `QuranSheet.tsx` imports
  nothing from `EntitySheet.tsx`; `EntitySheet.tsx` is the dispatcher
  Design §4 describes. One wording note, applied in 5f1's commit (comment
  only): the header now says the sheet has "the Translation tab, one more
  per installed QUL resource that has something for the āyah, and the
  Compiled tab when Settings turns it on".

**Step 5f1, measured 2026-11-17**
- `TYPE_CLASS` (`BlockList.tsx:63-72` at `539de97`) and `TYPE_CHROME` with
  its doc comment ("Keep in step with TYPE_CLASS", `:74-91`) moved
  verbatim, in their order, into the new `ui/reader/blockLayout.ts`,
  `export` added; `diff` identical but for the `export`. The margin-layout
  comment (`:55-61`) stays: it describes `BlockRow`'s gutters.
- The text-height estimate, adaptation (j): its doc comment (`:266-272`)
  and the three statements of `estimateTextHeight`'s body (`:275-277`)
  moved into `export function textHeightFor(block, columnWidth, fontSize,
  lineHeight): number` — the three names the body closed over, all numbers
  (the 0.43 em, `Math.max(8, …)`, `Math.max(1, …)`) as they were. Only the
  indentation changed (comment 2 → 0 spaces, statements 6 → 2): with it
  stripped, `diff` is identical. In `BlockList` the `useCallback` stays, its
  first line, deps line `[columnWidth, fontSize, lineHeight],` and close
  character for character today's, its body `(block: Block) =>
  textHeightFor(block, columnWidth, fontSize, lineHeight)`. `estimateSize`'s
  inline `useCallback` and `intrinsicHeight` are untouched; no memo or
  callback added. `settleOn` is 5f2's.
- Imports: `blockLayout.ts` imports `type { Block, BlockType }`;
  `BlockList` drops `BlockType` and imports `TYPE_CHROME`, `TYPE_CLASS`
  and `textHeightFor`. Outside the moved text, `BlockList.tsx` is the old
  file but for those two import lines and the callback's body (`diff`).
  It is 688 lines (728 before). `blockLayout.ts` has a seven-line
  header saying the three are together because of trap 7.
- **Made untrue here, for 5j (Q13, Design §10):** CLAUDE.md trap 7
  ("`TYPE_CHROME` in `BlockList.tsx`") and its map; `.claude/agents/
  torjuman-reader.md:19-23` (the estimates "+ `TYPE_CHROME[type]`" under
  `BlockList.tsx`). Also line references that shift up here: FOUND_ISSUES
  `BlockList.tsx` ~134 (`pageIndexOf`, now 105), `:285` (now 245),
  `:314-334` and `:328` (`settleOn`, now 274-294 and 288), `:360-369` (now
  320-329), `:559` (now 519); and FOUND_ISSUES 40's `attempts >= 8`
  (`:323`, now 283; added at 5f1's review).
- **T** exit 0. **B L R S U**, on the tree just before the commit: **B**
  exit 0, main chunk 790,249 B (+35 B, the new function and its call),
  only `index.js` differs (`compare-bundles` against post-5e4; the first
  difference is a minified name), CSS byte-identical (`cmp`), so moving the
  class strings to a `.ts` file changed no Tailwind output; **L** 182
  files, 134 edges, 0 directory and 0 file-level cycles, rules hold; **R**
  first and alone 55/55 (240,000 px in 33.4 s, 1,905 nodes, 0 long tasks /
  175,800 px in 24.5 s, 1,904 nodes, 0 long tasks), and every one of its
  `ok` lines, measured positions included (jump to ص 120 top 66 / 109,
  contents entry top 66 / 109, restore 700 → 95), identical to 5e4's run;
  **S** 30/30; **U** 254/254.
- **Review of 5f1 (`2d72185`): PASS WITH NOTES; "ready for 5f2".** The
  maps byte-identical but for `export`; the estimate's text identical but
  for indentation; the `useCallback`'s deps character for character. Tailwind
  v4 detects `.ts` sources on its own, so the classes in `blockLayout.ts`
  are scanned (and CSS was byte-identical). Notes, applied in 5f2's commit:
  the header's "before it has been" finished as "before it has been laid
  out"; FOUND_ISSUES 40's `attempts >= 8` (`:323`) added to the 5j list
  above.

**Step 5f2, measured 2026-11-17**
- `settleOn`'s doc comment (`BlockList.tsx:263-273` at `2d72185`) and the
  body of its `useCallback` (`:276-293`) moved, adaptation (j), into
  `export function settleOn(virtualizer, listRef, topInset, index, align):
  void` at the end of `blockLayout.ts`. **No text substitution:** the three
  names the body closed over became parameters with the same names, and
  `index`/`align` were already the callback's. Only indentation changed
  (comment 2 → 0, statements 6 → 2): with it removed, `diff` is identical,
  the 8 attempts, the 4 px, the two `requestAnimationFrame`s and FOUND_ISSUES
  40's centring test against `window.innerHeight / 2` included.
- When each input is read is unchanged (Phase 4's correction 1): `listRef`
  is passed as the ref object and `.current` is read inside the second
  frame, as before; `virtualizer` is the same object the `useCallback`
  closes over, its `scrollToIndex` called at each attempt; `topInset` is
  the number the callback closed over (a prop, not a ref), as before;
  `window.innerHeight` is still read inside the frame.
- In `BlockList` the `useCallback` stays, `[topInset, virtualizer],` and its
  first and last lines character for character, its body `(index: number,
  align: 'start' | 'center') => settleOnBlock(virtualizer, listRef,
  topInset, index, align)`. The module function is imported as `settleOn as
  settleOnBlock`: Design §5 and Q8 name it `settleOn`, the same name as the
  `useCallback` it is called from, so it needs a local name there (an
  import alias; no symbol renamed). `useImperativeHandle` and its deps
  `[blocks, settleOn]` untouched. Its parameter types are new, rule (i):
  `ReturnType<typeof useWindowVirtualizer>` and `RefObject<HTMLDivElement |
  null>`, from two type-only imports in `blockLayout.ts`. Outside the moved
  text, `BlockList.tsx` is the old file but for the import line and the
  callback (`diff`); 659 lines (688 before). `blockLayout.ts`'s header now
  names `settleOn` and both steps.
- **Made untrue here, for 5j:** the 5f1 line references to `settleOn` now
  point into `blockLayout.ts` — FOUND_ISSUES 40's `:314-334` →
  `blockLayout.ts:74-99`, `:328` → `blockLayout.ts:93`, `attempts >= 8`
  (`:323`) → `blockLayout.ts:88`; and `BlockList.tsx` `:360-369` → 291-300,
  `:559` → 490 (`:285` → 245 and `pageIndexOf` → 105 as at 5f1).
  `.claude/agents/torjuman-reader.md`'s "`settleOn` retries `scrollToIndex`"
  under `BlockList.tsx` (Design §10 lists 5f1 and 5h1 for that file).
- **T** exit 0. **B L R S U**, on the tree just before the commit: **B**
  exit 0, main chunk 790,267 B (+18 B), only `index.js` differs
  (`compare-bundles` against post-5f1; the first difference is a minified
  name), CSS byte-identical (`cmp`); **L** 182 files (no new file), 134
  edges, 0 directory and 0 file-level cycles, rules hold; **R** first and
  alone 55/55, every `ok` line identical to 5f1's run (`diff`), and every
  report line identical but the two perf timings: `readMarkDown` `{"from":
  450, "next":500, "atMiddle":450}` twice (FOUND_ISSUES 40 and 39 intact),
  `fingerDrag` unchanged; 240,000 px in 33.7 s (33.4 at 5f1), 1,905 nodes,
  0 long tasks / 175,800 px in 24.4 s (24.5), 1,904 nodes, 0 long tasks;
  **S** 30/30; **U** 254/254.
- **Review of 5f2 (`24629fb`): PASS; "ready for 5f3".** Text identical but
  for indentation, no substitution; `listRef.current` still read inside the
  second frame, `window.innerHeight` likewise; deps `[topInset,
  virtualizer]` unchanged; the `settleOn as settleOnBlock` import alias
  confirmed as the smallest legal way round the name clash. The reviewer's
  own R run gave 33.4 s, so 5f2's 33.7 s was noise.

**Step 5f3, measured 2026-11-17**
- `BlockRow` (`BlockList.tsx:382-516` at `24629fb`, with its doc comment),
  `MarginTarget` (`:518-622`) and `CardMarkerDot` (`:624-659`), each with
  its doc comment, moved verbatim, in their order, into the new
  `ui/reader/BlockRow.tsx`; only `BlockRow` is exported (`export const
  BlockRow = memo(…)`), the other two are its private parts, as Design §5
  says. `cmp` of the block against the old lines: identical but for the
  `export`. `memo` is still evaluated once, at module load. `BlockList`
  renders `<BlockRow …/>` where it did, with the same props: no key,
  wrapper or memo change. A five-line header.
- Imports: `BlockRow.tsx` takes `memo`/`useRef`, `Block`/`EntityRange`/
  `MarkRange`, `PageMeta`, `toArabicNumerals`, `isDivider`, `BlockText`,
  `CardMarker` and `TYPE_CLASS` (filtered copies of the source's lines),
  and nothing from `BlockList.tsx`, so no cycle. `BlockList` drops `memo`,
  `toArabicNumerals`, `isDivider`, `BlockText` and `TYPE_CLASS`, keeps
  `useRef` (its `listRef`) and the types it uses, and imports `BlockRow`.
  Outside the moved lines, `BlockList.tsx` is the old file but for those
  import lines (`diff`). **`BlockList.tsx` is 377 lines**, against Design
  §5's "about 370".
- The margin-layout comment (`BlockList.tsx:56-62`) stays where it was:
  Design §5 keeps it and lists only the three components for 5f3.
- **Made untrue here, for 5j (Q13):** that margin-layout comment now
  describes `BlockRow.tsx`'s gutters ("nothing here narrows the Arabic
  column") from `BlockList.tsx`; `BlockList.tsx:82`'s "see MarginTarget"
  now points to another file (true, but the reader looks for it in
  `BlockRow.tsx`); `.claude/agents/torjuman-reader.md:25` ("`BlockRow` is
  memoized…", under `BlockList.tsx`); FOUND_ISSUES 38's `BlockList.tsx:559`
  (490 after 5f2) is now `BlockRow.tsx:127`.
- **T** exit 0. **B L R S U**, on the tree just before the commit: **B**
  exit 0, main chunk 790,267 B (unchanged), only `index.js` differs
  (`compare-bundles` against post-5f2: the module's place), CSS
  byte-identical (`cmp`); **L** 183 files, 134 edges, 0 directory and 0
  file-level cycles, rules hold; **R** first and alone 55/55. Against
  5f2's run every report line is identical but the landscape timing
  (`readMarkDown` twice and `fingerDrag` unchanged), and every `ok` line
  but one: the portrait restore "before 700, after 700" where 5f2 had
  "after 699". Both values pass and both occur on code this step does not
  touch: of R's 15 runs in 5d1–5f3, the portrait restore read 699 in 12
  and 700 in 3 (5d2, 5d6 and this run), so it is run-to-run noise. Perf
  240,000 px in 33.3 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.4 s,
  1,904 nodes, 0 long tasks; **S** 30/30; **U** 254/254, `reader-page`,
  `reader-page-cards` (the `CardMarkerDot`s) and `reader-margin-menu` at
  both sizes among them.
- **Review of 5f3 (`5561473`): PASS; "ready for 5g1".** The three
  components byte-identical (only `BlockRow` exported); no key, wrapper or
  memo change at the call site; the margin-layout comment kept in
  `BlockList.tsx`, as the plan says; the 699/700 restore accepted as noise.

**Step 5g1, measured 2026-11-17**
- The word-lookup region (`ReaderScreen.tsx:200-254` at `5561473`, as
  Design §6.1 lists it: the dictionary comment, the `dictionary`, `lookup`
  and `gloss` states, `requestGloss` (`[storage]`), the `loadDictionary`
  effect (`[storage]`) and `lookUpWord` (`[dictionary]`)) moved as one
  contiguous block into `export function useWordLookup({ storage })` in the
  new `ui/reader/useWordLookup.ts`. `cmp`: the 55 lines identical, at the
  same indentation. Adaptations: (f) one parameter field, `storage`; (i)
  its type `ReturnType<typeof useApp>['storage']`; (g) one `return {
  dictionary, lookup, setLookup, gloss, setGloss, requestGloss, lookUpWord
  }` — Design §6.1's seven, `setDictionary` staying the hook's own; (h) the
  call, `const { dictionary, lookup, setLookup, gloss, setGloss,
  requestGloss, lookUpWord } = useWordLookup({ storage });`, stands where
  the region's first line was, between the margin-menu state and
  `allCards`. Hook order and effect order are unchanged: the three
  `useState`s, two `useCallback`s and the one effect are called in the
  same sequence at the same point, and `loadDictionary(storage)` is still
  the screen's first own effect after the domain hooks; the gloss's
  `glossWord(storage, …)` still runs only on a request. No deps changed,
  nothing returned is wrapped anew. FOUND_ISSUES 33 (`meaningAvailable`)
  and 38 are untouched.
- Imports: `useWordLookup.ts` takes `useCallback`/`useEffect`/`useState`,
  `useApp` (type only, for the parameter's type), `secrets`, `Block`,
  `GlossState`, `glossWord`/`GLOSS_PROVIDER_ID`, `ANTHROPIC_GLOSS_MODEL`
  and the `dictionaryService` line whole, in the source's order, the
  type-only ones as `import type` (`verbatimModuleSyntax`, as at 5e2).
  `ReaderScreen` drops `GlossState`, `glossWord`, `ANTHROPIC_GLOSS_MODEL`
  and the `dictionaryService` import, keeps `secrets` and
  `GLOSS_PROVIDER_ID` (the rail's `meaningAvailable`), and imports
  `useWordLookup`. A four-line header. `ReaderScreen.tsx` is 1,291 lines
  (1,349).
- **For 5j:** every FOUND_ISSUES reference into `ReaderScreen.tsx` past
  `:254` now sits 58 lines higher (26's `:1102-1115`, 27's `:649-666`,
  28's `:1025`, 30's `:389-400`, 33's `:1043` → 985, 34's and 37's
  `:1089` (37's added at 5g1's review), 39's `:1240-1275`), and 31's
  `:124` 5 lines higher; 5g2–5h4 move them again,
  so 5j recomputes them from the final file.
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 790,460 B (+193 B, the hook's function and returned
  object), only `index.js` differs (`compare-bundles` against post-5f3),
  CSS byte-identical (`cmp`); **L** 184 files, 134 edges, 0 directory and
  0 file-level cycles, rules hold; **R** first and alone 55/55, every `ok`
  line identical to 5f2's run (against 5f3's, only the portrait restore,
  back to "after 699"), every report line identical but the timings:
  240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s,
  1,904 nodes, 0 long tasks; **S** 30/30; **U** 254/254, `reader-meaning`,
  `reader-meaning-cached` and `reader-rail` at both sizes among them;
  **P** PASS, identical to `phase5/translate.json` (6 groups, 23
  scenarios, 18 requests). P sends no gloss request; the gloss is U's
  `reader-meaning*`.
- **Review of 5g1 (`c0ea5e3`): PASS WITH NOTES; "ready for 5g2".** The 55
  lines identical; hook order and effect order confirmed, `loadDictionary`
  still the screen's first own effect after the domain hooks; the seven
  returned names exactly Design §6.1's. Note, applied above: FOUND_ISSUES
  37's `ReaderScreen.tsx:1089` (the same line as 34's) added to the 5j list.

**Step 5g2, measured 2026-11-17**
- The reading-position region (`ReaderScreen.tsx:305-327` at `c0ea5e3`:
  the restore effect `[loading, blocks.length, storage, bookId]` with its
  comment, and the persist effect `[visibleBlock, storage, bookId]`, 900 ms,
  with its comment — one contiguous block, directly after the
  `entitiesByBlock` memo) and `restoredRef` (`:119`, between
  `headerHeight` and `shareButtonRef`, used only by the restore) moved into
  `export function useReadingPosition({ storage, bookId, loading, blocks,
  visibleBlock, listRef })` in the new `ui/reader/useReadingPosition.ts`:
  `restoredRef`'s line first, a blank line, then the region. `cmp`: both
  identical, at the same indentation. Adaptations: (f) the six fields
  Design §6.1 lists, same names; (i) their types, `ReturnType<typeof
  useApp>['storage']`, `string`, `boolean`, `Block[]`, `Block | null` and
  `RefObject<BlockListHandle | null>`; (g) nothing returned; (h) the call
  `useReadingPosition({ storage, bookId, loading, blocks, visibleBlock,
  listRef });` stands where the restore's comment was.
- **Effect order, before and after:** … entities (`[storage, book,
  blocks.length, readOnly]`), restore, persist, biography availability,
  `selectionchange`, … — unchanged, the two effects called at the same
  point in the same order. The only hook that moves is `restoredRef`'s
  `useRef`, from among the screen's refs to the hook's start, as Design
  §6.1 allows (no effect; hook order is fixed per build). The two storage
  calls are unchanged in text, order and timing: `storage.getReadingPosition
  (bookId)` once the blocks are in (and `listRef.current` still read inside
  its `requestAnimationFrame`, not at call time), `storage.putReadingPosition`
  900 ms after the visible block settles. FOUND_ISSUES 31 is preserved:
  `restoredRef` lives as long as the mounted screen and is never reset when
  `bookId` changes, as before.
- Imports: `useReadingPosition.ts` takes `useEffect`/`useRef` (and `type
  RefObject`, new for (i)), `type useApp`, `type Block` and `type
  BlockListHandle`, filtered from the source's lines; `BlockList.tsx`
  imports nothing back, so no cycle. `ReaderScreen` keeps every import
  (`useRef` and `BlockListHandle` are still its own) and imports
  `useReadingPosition`. A four-line header. `ReaderScreen.tsx` is 1,269
  lines (1,291).
- **For 5j:** FOUND_ISSUES 31's `ReaderScreen.tsx:124` (`restoredRef`) and
  `:365` (the early return) are now `useReadingPosition.ts:26` and `:30`;
  the screen's later references shift up a further 22.
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 790,609 B (+149 B), only `index.js` differs
  (`compare-bundles` against post-5g1; minified names), CSS byte-identical
  (`cmp`); **L** 185 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55, every `ok` line
  identical to 5g1's run — "restored after a reload — before 700, after
  700" / "after 699" and "restored 700, jumped to 95, 2.5 s later 95"
  included — and every report line but the timings. The first run's
  timings were high (33.9 s / 25.6 s); a second run, alone, gave 33.6 s /
  24.5 s with every `ok` line again identical, so the first was noise
  (the step adds no work to scrolling: the persist effect is the same
  effect). Perf: 240,000 px in 33.6 s, 1,905 nodes, 0 long tasks / 175,800
  px in 24.5 s, 1,904 nodes, 0 long tasks; **S** 30/30 (its "the reading
  position follows the screen" checks among them); **U** 254/254; **P**
  PASS, identical.
- **Review of 5g2 (`63f03d7`): PASS WITH NOTES; "ready for 5g3".** Both
  effects and `restoredRef` byte-identical; effect order and the two
  storage calls' order and timing confirmed; FOUND_ISSUES 31 preserved.
  The reviewer's own R run: 55/55 at 33.7 s / 25.1 s, judged noise. Note:
  the new header (`useReadingPosition.ts:7`) said "throttled", but the save
  is debounced (it lands 900 ms after the visible block stops changing);
  fixed at 5g3, the header word only, the moved comment untouched.

**Step 5g3, measured 2026-11-17**
- 5g2's note: `useReadingPosition.ts:7` "saved, throttled," → "saved,
  debounced,", nothing else changed (the moved "throttled so scrolling
  does not thrash IndexedDB" comment stays verbatim).
- The navigation region (`ReaderScreen.tsx:442-473` at `63f03d7`, the
  plan's 520-553: `flash` `[]` with its 1,600 ms, `jumpToBlock` `[blocks,
  flash]`, `jumpToPage` `[blocks]`, `focusCard` `[jumpToBlock]`, one
  contiguous block) and `flashBlockId`'s `useState` (`:97`, the plan's
  101) moved into `export function useReaderNavigation({ blocks, listRef,
  setActiveCardId })` in the new `ui/reader/useReaderNavigation.ts`:
  `flashBlockId`'s line first, a blank line, the region, then (g) `return
  { flashBlockId, flash, jumpToBlock, jumpToPage, focusCard }`. `cmp`: both
  identical, at the same indentation; every `useCallback`'s deps character
  for character. (f) the three fields Design §6.1 lists; (i) `Block[]`,
  `RefObject<BlockListHandle | null>`, `Dispatch<SetStateAction<string |
  null>>`; (h) the call `const { flashBlockId, flash, jumpToBlock,
  jumpToPage, focusCard } = useReaderNavigation({ blocks, listRef,
  setActiveCardId });` stands where `flash` was. The `navigation` section
  divider above it stays in the screen (it is the screen's section
  heading, and the section is still there: the call); the plan's 520 is
  that divider. `setFlashBlockId` stays the hook's own. `listRef.current`
  is still read inside the jumps, at call time of each jump.
- Hook order: only `flashBlockId`'s `useState` moves (from among the
  screen's states to the hook's start), as Design §6.1 allows; the four
  `useCallback`s are called at the same point in the same order; no effect
  is involved. Callers unchanged: `handleMarkerClick`'s deps (with
  `flash`), `BlockList`'s `flashBlockId`, `JumpToPage`'s and the contents'
  `jumpToPage`, the search column's `jumpToBlock` and the panel's
  `onFocusCard={focusCard}` are the same text.
- Imports: `useReaderNavigation.ts` takes `useCallback`/`useState` (with
  `type Dispatch`, `type RefObject`, `type SetStateAction`, new for (i)),
  `type Block`/`Card` and `type BlockListHandle`; `ReaderScreen` keeps
  every import (it still uses `useCallback`, `useState`, `Card`) and
  imports `useReaderNavigation`. A four-line header. `ReaderScreen.tsx` is
  1,239 lines (1,269); `useReaderNavigation.ts` 55.
- **For 5j:** the screen's references past `:473` (the old end of the
  region) shift up a further 30; those from `:60` to `:96` move down 1
  (the added import); `:98` to `:441` do not move (the import's +1 and
  `flashBlockId`'s removed line −1 cancel). Corrected at 5g4's review.
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 790,823 B (+214 B), only `index.js` differs
  (`compare-bundles` against post-5g2; minified names), CSS byte-identical
  (`cmp`); **L** 186 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55; against 5g2's second
  run every `ok` line identical but the portrait restore (700 here, 699
  there — the noise seen since 5d1), every jump, contents, search, marker
  and card line with its measured position included; report lines
  identical but the timings: 240,000 px in 33.4 s, 1,905 nodes, 0 long
  tasks / 175,800 px in 24.4 s, 1,904 nodes, 0 long tasks; **S** 30/30;
  **U** 254/254; **P** PASS, identical (6 groups, 23 scenarios, 18
  requests).
- **Review of 5g3 (`24d1188`): PASS WITH NOTES; "ready for 5g4".** Region
  and state byte-identical, deps character for character, callers
  unchanged. Keeping the `navigation` divider in the screen judged right.
  Notes: the 5j shift sentence was wrong (lines `:98`–`:441` do not move;
  `:60`–`:96` move down 1), corrected above at 5g4; `flash`'s `setTimeout`
  is never cleared, as before the move — a no-op after unmount in React 19,
  so not a FOUND_ISSUES entry.

**Step 5g4, measured 2026-11-17**
- The panel-controls region (`ReaderScreen.tsx:517-556` at `24d1188`, the
  plan's 627-666: the "Toggling the panel from the keyboard" doc comment,
  the keydown effect `[settings.panelCollapsed, updateSettings]`, the
  `divider` section heading, `dragging = useRef(false)` and the window
  `pointermove`/`pointerup` effect `[updateSettings]`, one contiguous
  block between `handleMarkerClick` and the header's layout effect) moved
  into `export function usePanelControls({ settings, updateSettings })` in
  the new `ui/reader/usePanelControls.ts`, then (g) `return { dragging }`.
  The `divider` heading sits inside the region, so it moved with it. `cmp`:
  the 40 lines identical, at the same indentation; both deps arrays
  character for character. (f) Design §6.1's two fields, `settings` passed
  whole (`settings.panelCollapsed` as written); (i) `ReturnType<typeof
  useApp>['settings']` and `['updateSettings']`; (h) the call `const {
  dragging } = usePanelControls({ settings, updateSettings });` stands
  where the doc comment was. The row's I/O list is complete: `dragging`
  (written by the divider's `onPointerDown` in the screen) is the only name
  the screen still reads from the region.
- Effect order: … `dblclick`, keydown, divider, then the header's layout
  effect — unchanged, the two effects called at the same point in the same
  order. Each effect's listeners are still created inside it and removed
  in its own cleanup (`keydown` on `document`; `pointermove` and
  `pointerup` on `window`), so their identities and pairing are as before.
  FOUND_ISSUES 27 kept exactly: still no `pointercancel` listener.
- Imports: `usePanelControls.ts` takes `useEffect`/`useRef`, `type
  useApp` and `clampPanelWidth`; `ReaderScreen` keeps every import (it
  still uses `useEffect`, `useRef` and `clampPanelWidth`, for the panel's
  width) and imports `usePanelControls`. A four-line header.
  `ReaderScreen.tsx` is 1,201 lines (1,239); `usePanelControls.ts` 59.
- **For 5j:** the screen's references past `:556` shift up a further 38
  (40 lines become 1, the import adds 1); `:61`–`:516` move down 1.
  FOUND_ISSUES 27's `ReaderScreen.tsx:649-666` is now in
  `usePanelControls.ts`; the entry itself still names the screen, to be
  updated at 5j. (Wrapped at 5g5's review note.)
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 790,918 B (+95 B), only `index.js` differs
  (`compare-bundles` against post-5g3; minified names), CSS byte-identical
  (`cmp`); **L** 187 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55; every `ok` line
  identical to 5g3's run but the portrait restore (699 here, 700 there,
  the known noise), "Ctrl+\\ hides the panel… stored panelCollapsed
  true", "dragging the divider 120 px right… panel 432 → 315, stored 315",
  the clamp ("panel 432, stored 432") and "text selection is off during
  each drag" included; `fingerDrag` and `readMarkDown` reports unchanged.
  The first run's portrait perf had one long task (61 ms, 11 ms blocking)
  for the first time since Phase 4 (R.log had one of 55 ms on unchanged
  code); a second run, alone, gave 0, with the same `ok` lines, so it is
  noise — the step adds nothing to scrolling. Perf (second run): 240,000
  px in 33.5 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.5 s, 1,904
  nodes, 0 long tasks; **S** 30/30; **U** 254/254; **P** PASS, identical.
- **Review of 5g4 (`8810abb`): PASS WITH NOTES; "ready for 5g5".** The 40
  lines byte-identical, both deps arrays character for character;
  `dragging`'s `useRef` did not move relative to its neighbours (it was
  inside the region); keeping the `divider` heading in the hook is
  consistent with 5g3's choice, since here it sat inside the region; both
  5j shift sentences checked right; the 61 ms long task accepted as noise.
  Notes: FOUND_ISSUES 27's entry still names `ReaderScreen.tsx` for the
  divider, on the 5j list above; one over-long line in the "For 5j" bullet,
  wrapped at 5g5.

**Step 5g5, measured 2026-11-17**
- The header's height (`ReaderScreen.tsx:114-120` at `8810abb`, the plan's
  117-123: the "sticky header's height" doc comment, `headerRef =
  useRef<HTMLElement>(null)` and `[headerHeight, setHeaderHeight] =
  useState(0)`, between `listRef` and `shareButtonRef`) and the screen's
  only layout effect (`:520-528`, the plan's 668-676: `headerRef.current`,
  a `ResizeObserver` on it, `observer.disconnect()` in the cleanup, deps
  `[loading, book]`) moved into `export function useHeaderHeight({
  loading, book })` in the new `ui/reader/useHeaderHeight.ts`: the state
  first, a blank line, the effect, then (g) `return { headerRef,
  headerHeight }`. `cmp`: both identical, at the same indentation; the deps
  character for character. (f) Design §6.1's two fields; (i) `boolean` and
  `Book | null`; (h) the call `const { headerRef, headerHeight } =
  useHeaderHeight({ loading, book });` stands where the layout effect was,
  between `usePanelControls` and `stickyColumn`, so the layout effect keeps
  its place. The effect reads nothing else, and the screen uses no setter:
  `setHeaderHeight` stays the hook's own. The I/O list is complete.
- Hook order: only the `useRef` and `useState` move (from among the
  screen's refs to the hook's start), as Design §6.1 allows. Readers of
  `headerHeight`, all in the screen's same render as before:
  `stickyColumn` (`top` and `height`; the search column, the divider,
  the aside and the collapsed edge tab use it) and `BlockList`'s
  `topInset={headerHeight}`; `ref={headerRef}` stays on the `<header>`.
  `scrollMargin` is `BlockList`'s own measurement of the screen root, not
  this value. No sheet or anchored panel reads it.
- Imports: `useHeaderHeight.ts` takes `useLayoutEffect`/`useRef`/
  `useState` and `type Book`; `ReaderScreen` drops `useLayoutEffect` (no
  other use; `tsc` reports it unused otherwise) and imports
  `useHeaderHeight`. A three-line header. `ReaderScreen.tsx` is 1,187
  lines (1,201); `useHeaderHeight.ts` 28. 5g1–5g5 done: Design §6's
  "about 750-850" is for after 5h4.
- **For 5j:** the screen's references from `:62` to `:113` move down 1
  (corrected at 5g5's review: old `:62`, blank, and `:63`, `export
  function ReaderScreen`, move too); `:121` to `:519` up 6; past `:528` up
  14.
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 791,027 B (+109 B), only `index.js` differs
  (`compare-bundles` against post-5g4; minified names), CSS byte-identical
  (`cmp`); **L** 188 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55; against 5g4's second
  run every `ok` line identical but the portrait restore (700 here, 699
  there, the known noise) — the header and sticky-column lines ("the
  header stays at the top… headerBottom 51 / 93", "the card panel is a
  column held under the header… aside 51–600", "the cards sheet stays at
  the bottom"), and every jump landing (ص 120 top 66 / 109, contents 66 /
  109, search 50 / 300, card 295) included; report lines identical but the
  timings: 240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in
  24.4 s, 1,904 nodes, 0 long tasks; **S** 30/30; **U** 254/254; **P**
  PASS, identical.
- **Review of 5g5 (`98f44f8`): PASS WITH NOTES; "ready for 5h1".** State
  and layout effect byte-identical, deps character for character, the
  layout effect at its place; every reader of `headerHeight` checked;
  dropping the unused `useLayoutEffect` import is rule (a). Note: the "For
  5j" shift started at `:64`; it starts at `:62` (old `:62` and `:63` move
  down 1 too), corrected above at 5h1.

**Step 5h1, measured 2026-11-17**
- The `<header>` subtree (`ReaderScreen.tsx:602-664` at `98f44f8`, the
  plan's 764-826) moved into `export function ReaderHeader(…)` in the new
  `ui/reader/ReaderHeader.tsx`, returned as is (`return ( <header …> )`,
  no wrapper, no `Fragment`, the same conditions inside, no `memo`, no
  effect, no `useApp()`); `ref={headerRef}` stays on the `<header>`. With
  it, whole and in their order, `ReadMarkNav` (`:1072-1113`, with its doc
  comment) and `JumpToPage` (`:1142-1187`, with its doc comment), private
  to the file — the header was their only user (`grep` over `src/` and
  `scripts/`: only the header renders them; the scripts name
  `ReadMarkNav` in comments). Byte diff: the subtree identical after
  removing 2 spaces of indentation (it is one level shallower under
  `return (`); both components identical (`cmp`). Outside those lines,
  `ReaderScreen.tsx` is the old file but for two import lines and the
  call (`diff`).
- Adaptation (f): 17 props, each the screen's own name passed `x={x}`, in
  the subtree's order of first use: `headerRef`, `readOnly`, `book`,
  `activeTocTitle`, `currentMeta`, `pageMeta`, `jumpToPage`, `marks`,
  `visibleBlock`, `listRef`, `setShowToc`, `setShowSearch`,
  `shareButtonRef`, `setShowShare`, `sideBySide`, `updateSettings`,
  `settings`. `headerRef` and `shareButtonRef` are props of those names,
  not `ref`, like `BlockList`'s `handleRef`. Objects passed whole
  (`marks.readPositions`, `settings.panelCollapsed` as written). The
  subtree's inline arrows (`onJump={(order) => listRef.current?.
  scrollToOrder(order, 'center')}`, `() => setShowToc(true)`, the Search,
  Share and Show/Hide cards handlers) stay inline in the moved text, as
  (f) says, each over a prop of its own name; `listRef.current` is still
  read when ↑/↓ is tapped. (i) types: `ReturnType<typeof useHeaderHeight>
  ['headerRef']`, `ReturnType<typeof useReaderNavigation>['jumpToPage']`,
  `ReturnType<typeof useMarks>`, `ReturnType<typeof useApp>['settings']`
  and `['updateSettings']`, `Dispatch<SetStateAction<boolean>>` for the
  three setters, `RefObject<BlockListHandle | null>`,
  `RefObject<HTMLSpanElement | null>`, `Book`, `Block | null`, `PageMeta |
  undefined`, `string | undefined`, `Map<number, PageMeta>`, `boolean`.
  (h) `<ReaderHeader … />` stands where the `<header>` was, between
  `NoKeyBanner` and the importing notice.
- Imports: `ReaderHeader.tsx` takes `useState` (and `type Dispatch`/
  `RefObject`/`SetStateAction`), `type useApp`, `parseArabicNumber`/
  `toArabicNumerals`, `type PageMeta`, `type Block`/`Book`, `type
  useMarks`, `Button`/`LinkButton`, `type BlockListHandle`, `type
  useReaderNavigation`, `type useHeaderHeight`; none imports it back, so
  no cycle. `ReaderScreen` drops `parseArabicNumber` and `Button` (no other
  use) and imports `ReaderHeader`. A six-line header. `ReaderScreen.tsx`
  is 1,054 lines (1,187); `ReaderHeader.tsx` 211.
- **For 5j:** the screen's references from `:63` to `:601` move down 1;
  `:665` to `:1071` up 43; `:1115` to `:1140` (`blockElementFor`,
  `NoKeyBanner`) up 86. FOUND_ISSUES 39's `ReadMarkNav`
  (`ReaderScreen.tsx:1240-1275` at the plan's base) is now in
  `ReaderHeader.tsx`; the entry itself still names the screen, to be
  updated at 5j. **Untrue from 5h1, fixed at 5j (Q13, Design §10):**
  `.claude/agents/torjuman-reader.md:14-16` ("`ReaderScreen.tsx` composes
  …, the header is `sticky top-0 z-30`"): the header is now
  `ReaderHeader.tsx`. (Both added at 5h1's review.)
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 791,495 B (+468 B: the props object and the part's
  function), only `index.js` differs (`compare-bundles` against post-5g5;
  minified names), CSS byte-identical (`cmp`); **L** 189 files, 134 edges,
  0 directory and 0 file-level cycles, rules hold; **R** first and alone
  55/55, every `ok` line identical to 5g5's run (`diff`, no difference at
  all) — the header lines ("stays at the top… headerBottom 51 / 93"), the
  ج/ص jumps (top 66 / 109), and the read-mark lines (counter "3", ↓ to
  block 400, ↑ to 500 and 450, in both profiles) included — and every
  report line but the portrait timing (`readMarkDown` unchanged): 240,000
  px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.6 s, 1,904
  nodes, 0 long tasks; **S** 30/30; **U** 254/254, `reader-header`,
  `reader-page` and `reader-page-cards` at both sizes among them; **P**
  PASS, identical.
- **Review of 5h1 (`0c52e6b`): PASS WITH NOTES; "ready for 5h2".** The
  subtree identical but for its indentation, both components byte-
  identical, all 17 props checked `x={x}` one by one with no swap; no
  wrapper, `memo`, effect or `useApp()`. Notes, both added to the 5j list
  above: (i) `.claude/agents/torjuman-reader.md:14-16` is untrue from 5h1
  (it puts the `sticky top-0 z-30` header in `ReaderScreen`), fixed at 5j;
  (ii) FOUND_ISSUES 39's entry still names `ReaderScreen.tsx:1240-1275`,
  where `ReadMarkNav` was.

**Step 5h2, measured 2026-11-17**
- The four ḥadīth bars (`ReaderScreen.tsx:642-683` at `0c52e6b`, the
  plan's 847-888: the sharḥ notice with its comment, the batch proposal
  with its comment, the running batch, the sharḥ search in progress —
  adjacent, blank lines only between them, nothing else) moved into
  `export function CommentaryBars(…)` in the new
  `ui/reader/CommentaryBars.tsx`, returned as one `Fragment` of the four
  conditionals: `return ( <> … </> )`, no wrapper element, the conditions
  inside, no `memo`, no effect, no `useApp()`. `cmp`: the 42 lines
  identical, at the same indentation (six spaces, as under the screen's
  root `div`). The named ḥadīth-only piece Design §8 asks for.
- Adaptation (f), 5 props, each `x={x}`, in the order of first use:
  `sharh`, `batchProposal`, `batch`, `activeProfile`, `setBatchProposal`.
  Objects passed whole (`sharh.notice`, `sharh.setNotice`, `sharh.busy`,
  `batch.progress`, `batch.run`, `batch.cancel`, `batch.dismiss`,
  `activeProfile.model` as written). No two props are same-typed
  callbacks: the only callback prop is `setBatchProposal`. The same-typed
  pairs are inside the moved text, unchanged — `BatchProposal`'s
  `onStart`/`onCancel` and `BatchRunning`'s `onStop={batch.cancel}` /
  `onDismiss={batch.dismiss}`. (i) types: `ReturnType<typeof useSharh>`,
  `ReturnType<typeof useBatchTranslate>`, `ReturnType<typeof
  useApp>['activeProfile']`, and the screen's own state shape `{ range:
  Block[]; estimate: BatchEstimate } | null` restated for `batchProposal`
  and inside `Dispatch<SetStateAction<…>>` for its setter (the screen names
  no type for it). (h) `<CommentaryBars … />` stands where the sharḥ
  notice's comment was, between the translator notice and the columns.
- Imports: `CommentaryBars.tsx` takes `type Dispatch`/`SetStateAction`,
  `type useApp`, `type Block`, `BatchProposal`/`BatchRunning`, `type
  BatchEstimate`, `type useSharh`, `type useBatchTranslate`; none imports
  it back, so no cycle. `ReaderScreen` drops the `BatchTranslateBar`
  import (no other use; it keeps `BatchEstimate` for its state) and
  imports `CommentaryBars`. A four-line header. `ReaderScreen.tsx` is
  1,019 lines (1,054); `CommentaryBars.tsx` 81.
- **For 5j:** the screen's references from `:28` to `:63` move up 1 (the
  dropped import); `:64` to `:641` do not move (the added import cancels
  it); `:684` on move up 35.
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 791,684 B (+189 B), only `index.js` differs
  (`compare-bundles` against post-5h1; minified names), CSS byte-identical
  (`cmp`); **L** 190 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55, every `ok` line
  identical to 5h1's run but the portrait restore (699 here, 700 there,
  the known noise), every report line identical but the portrait timing:
  240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.7 s,
  1,904 nodes, 0 long tasks; **S** 30/30; **U** 254/254, with
  `reader-batch-proposal` at both sizes the capture of these bars (no
  capture shows the sharḥ notice or the sharḥ search bar; `reader-notice`
  is the translator's notice, still in the screen); **P** PASS, identical,
  its `batch`, `batch-again` and `no-key-batch` scenarios included.
- **Review of 5h2 (`1a3e6a6`): PASS WITH NOTES; "ready for 5h3".** The 42
  lines identical, the five props `x={x}`, the same-typed pairs inside the
  moved text unchanged. The reconciliation question answered: the four
  bars move from the root `div`'s children into a `Fragment` under a
  component that mounts with the screen and never changes type, so nothing
  remounts after the first render. The sharḥ notice and sharḥ search bars
  have no capture: the documented gap of the plan's §1.1, not a 5a miss,
  left to the owner's tablet check 8. Note (a): adaptation (i) was read to
  allow restating an anonymous state shape (`batchProposal`'s) when no
  hook's return type can express it. **For 5j, the plan's "Corrections
  found in review"** (started here): that reading of (i) — widened at
  5h3's review to: restating anonymous state shapes and the screen's
  `useCallback`/`useMemo` signatures (locals with no exported type) when
  no hook's return type can express them; with it, 5e3's
  correction to Design §10 (`quran/quranIndex.ts:427` untrue from 5e4, not
  5e3) and 5f2's `settleOn as settleOnBlock` import alias (the module
  function and the `useCallback` share Q8's name). Added at 5i3: a
  correction to Design §7's 5i3 rows — `withOfflineRequest` and
  `withCloudRequest` are module functions in `useTranslator.ts`, not in
  `translationSteps.ts`, since importing `SessionStats` there is a
  file-level cycle (the plan's amendment to Q12); `withoutStream` is in
  `translationSteps.ts` as planned.

**Step 5h3, measured 2026-11-17**
- The eight sheet conditionals (`ReaderScreen.tsx:795-989` at `1a3e6a6`,
  the plan's 1035-1229: `SelectionRail`, `BiographySheet`,
  `DictionarySheet`, `MarginMenu`, `EntitySheet`, `CardPopover`,
  `ShareChapter`, `TocDrawer`, adjacent, blank lines only between them,
  from just after the bottom sheet to the root `div`'s close) moved into
  `export function ReaderSheets(…)` in the new
  `ui/reader/ReaderSheets.tsx`, returned as one `Fragment`: `return ( <>
  … </> )`, no wrapper, every condition inside, no `memo`, no effect, no
  `useApp()`. With them, whole, `blockElementFor` (`:994-998`, with its
  doc comment), a module function used only by the rail's three handlers
  (`:806`, `:820`, `:829`). `cmp`: the 195 lines identical at the same
  indentation, `blockElementFor` identical. Outside them `ReaderScreen.tsx`
  is the old file but for eleven import lines and the call (`diff`).
- Adaptation (f), 40 props, each `x={x}`, in the moved text's order of
  first use: `selection`, `translator`, `dictionary`, `biographyAvailable`,
  `withSelection`, `setBiography`, `runTranslate`, `explanations`,
  `setActiveCardId`, `setGloss`, `lookUpWord`, `blocks`, `requestGloss`,
  `marks`, `biography`, `lookup`, `gloss`, `setLookup`, `visibleBlock`,
  `marginMenu`, `readOnly`, `addNoteToBlock`, `proposeBatch`,
  `setMarginMenu`, `entitySheet`, `setEntitySheet`, `runTranslateBlock`,
  `sharh`, `popover`, `citationFor`, `setPopover`, `showShare`,
  `shareButtonRef`, `bookId`, `tocNodes`, `activeTocNodeId`,
  `setShowShare`, `showToc`, `setShowToc`, `jumpToPage`. Objects passed
  whole (`translator`, `marks`, `explanations`, `sharh`, `selection`).
  (i) types from the hooks where one returns it (`ReturnType<typeof
  useTranslator>`, `useMarks`, `useExplanations`, `useSharh`; the seven
  `useWordLookup` fields; `useReaderNavigation`'s `jumpToPage`), the
  screen's anonymous state shapes restated (as 5h2's review allowed), and
  the screen's `useCallback`s' signatures restated (`withSelection`,
  `runTranslate`, `runTranslateBlock`, `addNoteToBlock`, `proposeBatch`,
  `citationFor`). (h) `<ReaderSheets … />` stands where `selection.active
  && (` was, the last child of the root `div`.
- Same-typed props, for the reviewer: `Dispatch<SetStateAction<boolean>>`
  — `setShowShare` (only `ShareChapter`'s `onClose`) and `setShowToc`
  (only `TocDrawer`'s `onClose` and `onSelect`); `boolean` — `showShare`
  (`ShareChapter`'s condition), `showToc` (`TocDrawer`'s),
  `biographyAvailable` (the rail's prop), `readOnly` (`MarginMenu`'s
  condition); `Dispatch<SetStateAction<string | null>>` — only
  `setActiveCardId` (the rail's `onExplain`); `(block: Block) =>
  Promise<void>` — `addNoteToBlock` (`MarginMenu`'s `onAddNote`) and
  `runTranslateBlock` (`EntitySheet`'s `onTranslateSurrounding`); the four
  `{… anchor: HTMLElement} | null` setters differ by shape, so `tsc` would
  catch a swap among them. Every `onClose` stays an inline arrow, so
  `AnchoredPanel` re-registers its outside tap on the same renders as
  before (FOUND_ISSUES 34, 37).
- Sheets with state of their own: `SelectionRail`, `BiographySheet`,
  `DictionarySheet`, `CardPopover`, `ShareChapter`, `TocDrawer` (each
  `useState`), and the entity sheet through `QuranSheet`/`HadithSheet`;
  `MarginMenu` has none. Each mounts and unmounts under its own
  condition, as before; `ReaderSheets` renders whenever the book is
  loaded, never changes type, so no sheet remounts. `shareButtonRef.current`
  is still read in the same render pass.
- Imports: `ReaderSheets.tsx` takes the eight sheet components, `secrets`,
  `GLOSS_PROVIDER_ID`, `entityContext`/`entityText` and the types it names;
  none imports it back, so no cycle. `ReaderScreen` drops the eight sheet
  imports, `GLOSS_PROVIDER_ID`, and `entityContext`/`entityText` from the
  `entityService` line, keeps `secrets` (its `hasKey`), and imports
  `ReaderSheets`. A five-line header. `ReaderScreen.tsx` is 850 lines
  (1,019), at the top of Design §6's "about 750-850" with 5h4 to come;
  `ReaderSheets.tsx` 325.
- **For 5j:** the screen's references among the imports move up 3 to 11;
  `:64` to `:794` up 10; past `:989` up 163 (the root `div`'s close) and
  169 (`NoKeyBanner`). FOUND_ISSUES 26's `:1102-1115`, 33's `:1043` and
  34's and 37's `:1089`, `:1098`, `:1168`, `:1199` (the plan's base) are
  now in `ReaderSheets.tsx`; 28's `:1025` (the bottom sheet's handle)
  stays in the screen.
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 792,831 B (+1,147 B: the 40-prop object and the
  part's destructuring), within ±2 KB; only `index.js` differs
  (`compare-bundles` against post-5h2; minified names), CSS byte-identical
  (`cmp`); **L** 191 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55, every `ok` line
  identical to 5h2's run but the portrait restore (700 here, 699 there,
  the known noise) — the popover that follows its anchor, the double-tap
  dictionary sheet and "no rail" after it, the marker popover and the
  contents landings included — and every report line but the portrait
  timing: 240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in
  24.4 s, 1,904 nodes, 0 long tasks; **S** 30/30 (it taps Translate on the
  rail); **U** 254/254 — the sheet captures `reader-rail`,
  `reader-biography`, `reader-meaning`, `reader-meaning-cached`,
  `reader-margin-menu`, `reader-hadith`, `reader-hadith-diagnostics`,
  `reader-quran`, `reader-quran-similar`, `reader-quran-compiled`,
  `reader-popover` (600×960), `reader-share`, `reader-toc` and
  `reader-batch-proposal` (opened from the margin menu) all match; **P**
  PASS, identical, its `translate`, `block`, `no-key` and `batch`
  scenarios (the rail's Translate, the entity sheet's surrounding passage,
  the refusal, and Translate all…) included.
- **Review of 5h3 (`dbfa2c4`): PASS WITH NOTES; "ready for 5h4".** The 195
  lines and `blockElementFor` byte-identical; all 40 props checked
  `name={name}`, the same 40 names in the same order at the call site, in
  the destructuring and in the type keys, so no swap is possible; every
  `onClose` still inline; no sheet remounts. Both extra items on the 5j
  Corrections list (5e3's §10, 5f2's alias) belong there. Notes, applied
  at 5h4: (c) the Corrections item on (i) widened to the screen's
  `useCallback`/`useMemo` signatures (above); (d) `ReaderSheets.tsx`'s new
  header said "`blockElementFor` is its own helper", true but odd, now
  "with `blockElementFor`, the helper only the rail uses" (header only,
  not moved text).

**Step 5h4, measured 2026-11-17**
- The `cardPanel` element's `<CardPanel …>` (`ReaderScreen.tsx:542-578` at
  `dbfa2c4`, the plan's 712-750; defined after the early returns and
  `activeTocTitle`, not inside a conditional, reading nothing computed
  between it and its two uses) moved into `export function
  ReaderCardPanel(…)` in the new `ui/reader/ReaderCardPanel.tsx`, returned
  as is (`return ( <CardPanel …/> )`, no wrapper, no `memo`, no effect, no
  `useApp()`). `cmp`: the 37 lines identical, at the same indentation.
  `const cardPanel = ( <ReaderCardPanel … /> );` stays in the screen, so
  its two render sites, the aside (`{cardPanel}`) and the bottom sheet,
  are unchanged. The per-kind collapse and delete now sit in one named
  place, the "card kinds" of Design §8.
- Adaptation (f), 17 props, each `x={x}`, in the moved text's order of
  first use: `allCards`, `blocks`, `pageMeta`, `translator`,
  `activeCardId`, `readOnly`, `sharedScope`, `settings`, `settledRange`,
  `sectionNodeId`, `setSharedScope`, `updateSettings`, `focusCard`,
  `marks`, `explanations`, `sharh`, `editNote`. Objects passed whole
  (`translator.streaming`, `.stats`, `.isStale`, `settings.panelScope`,
  `marks.noteCards` as written). The element's inline arrows
  (`onScopeChange`, `onToggleCollapse`, `onCollapseAll`, `onRetranslate`,
  `onDelete`, `onEditNote`, `onAddGlossaryTerm`) stay inline in the moved
  text. (i) types: `Card[]`, `Block[]`, `Map<number, PageMeta>`,
  `ReturnType<typeof useTranslator>`, `string | null` (twice), `boolean`,
  `PanelScope`, `ReturnType<typeof useApp>['settings']` and
  `['updateSettings']`, `VisibleRange | null`,
  `Dispatch<SetStateAction<PanelScope>>`, `ReturnType<typeof
  useReaderNavigation>['focusCard']`, `ReturnType<typeof useMarks>`,
  `useExplanations`, `useSharh`, and `editNote`'s restated `(card: Card)
  => Promise<void>`.
- Same-typed: `activeCardId` and `sectionNodeId` (`string | null`; the
  first only `activeCardId={activeCardId}`, the second only
  `sectionNodeId={sectionNodeId}`). No two callback props share a type;
  the per-kind collapse and delete are not props but the moved text's own
  `onToggleCollapse` and `onDelete` arrows, each dispatching on
  `card.kind` to `marks`, `explanations`, `sharh` or `translator`, as
  before.
- Two render sites, no state or identity change: `cardPanel` was one
  `CardPanel` element rendered in the aside (beside) or the bottom sheet
  (sheet), never both at once; it is now one `ReaderCardPanel` element
  rendered in the same two places. `CardPanel` holds state (its `filter`
  `useState`, a `containerRef`); that state is per render site, as before:
  each site is its own instance, a switch between beside and sheet
  unmounts one and mounts the other, as it did. `ReaderCardPanel` never
  changes type, so no `CardPanel` remounts otherwise.
- The screen's header: `ReaderScreen.tsx` had none; a new comment after
  the imports says what the screen owns, which parts and hooks it uses,
  and why it stays at about 850 lines (Design §6.5, Q11): the shared state
  and the code that writes it, the columns' JSX and the props; the data
  loading left in because a hook holding the blocks would run before
  `useTranslator` and reorder every open's storage requests; the selection
  tracking left in because its doc comment sits above the wrong effect
  (FOUND_ISSUES 30); a context rejected (Q10). 5h3's review note (d):
  `ReaderSheets.tsx`'s header reworded.
- Imports: `ReaderCardPanel.tsx` takes `CardPanel` (with `type
  PanelScope`) and the types it names; none imports it back, so no cycle.
  `ReaderScreen` keeps `PanelScope` as `import type { PanelScope } from
  './CardPanel'` (a filtered `{ type PanelScope }` would leave a
  side-effect import under `verbatimModuleSyntax`) and imports
  `ReaderCardPanel`. A five-line header. `ReaderScreen.tsx` is 854 lines
  (850 before: the import and the 20-line header comment add 22, the
  element's 37 lines become 19), against Design §6's "about 750-850";
  `ReaderCardPanel.tsx` 95. 5g1–5h4 done.
- **For 5j:** the screen's references from `:54` to `:541` move down 22
  (the new import and the header comment); past `:579` down 4 (the
  element's 37 lines became 19).
- **T** exit 0. **B L R S U P**, on the tree just before the commit: **B**
  exit 0, main chunk 793,235 B (+404 B), only `index.js` differs
  (`compare-bundles` against post-5h3; minified names), CSS byte-identical
  (`cmp`); **L** 192 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55, every `ok` line
  identical to 5h3's run but the portrait restore (699 here, 700 there,
  the known noise) — the card panel "held under the header… aside
  51–600", Ctrl+\\ and Hide cards with the edge tab, the marker that
  makes its card active "in the panel", the card tap to the middle, and
  "the handle opens a sheet 55% of the screen tall" and closes it,
  included — and every report line identical, the timings too: 240,000 px
  in 33.4 s, 1,905 nodes, 0 long tasks / 175,800 px in 24.4 s, 1,904
  nodes, 0 long tasks; **S** 30/30; **U** 254/254, `reader-cards`,
  `reader-retranslate` (both sizes), `reader-collapsed` (960×600) and
  `reader-sheet-open` (600×960) among them; **P** PASS, identical, its
  `retranslate`, `retranslate-with` and `retranslate-no-key` scenarios
  included.
- **Review of 5h4 (`eec59a5`): PASS WITH NOTES; "ready for 5i1".** Every
  claim in the screen's new header comment checked true against the code
  and the plan; the element's identity and its two render sites (the aside
  and the bottom sheet) unchanged; `import type { PanelScope }` right
  under `verbatimModuleSyntax`. Notes: (n1) the header comment is 20 lines
  (`ReaderScreen.tsx:56-75`), not 21; the +22 and every shift were right,
  and the entry above now says "20-line"; (n2) the header's "(Q10)" is
  more exact as "(Design §6.3, Q10)", fixed at 5i1 in the header comment
  (new text in the screen, not moved text; one token, kept on its line, so
  no line moves); (n3) for the PR: the owner's Q11 answer was "about 800",
  and 854 is at the top of the plan's "about 750-850". Not FOUND_ISSUES, a
  naming note: `selection.ts:20` exports a different `blockElementFor(node)`
  that shares the name of `ReaderSheets.tsx`'s private helper; it predates
  5h3.

**Step 5i1, measured 2026-11-17**
- Two runs of `translate` (adaptation (k), Design §7) moved into the new
  `ui/reader/translationSteps.ts`, module-level and pure: the passage
  statements (`useTranslator.ts:215-223` at `eec59a5`, the plan's line
  numbers: `selected`, `before`/`after`, the verse comment and `known`),
  contiguous, no free name reassigned, nothing read between them but
  `selected` by `known` inside the run; and the request literal handed to
  `providerFor(useProviderId).translate` (`:275-290`), one expression, no
  free name reassigned (`apiKey`, the one `let`, is not in it).
- Signatures: `passageFor(blocks: Block[], entities: Entity[], anchor:
  Pick<SelectionAnchor, 'startBlockId' | 'endBlockId'>)`, its return
  inferred (`{ selected, before, after, known }`); `translationRequestFor({
  anchor, before, after, selected, activeProfile, glossary, useModel,
  known, digDeeper })` → `TranslationRequest`, one object parameter (as (f)
  for a hook, so no two same-typed names can swap by position: `before`,
  `after` and `selected` are all `Block[]`), its fields the literal's nine
  free names in order of first use, typed `Pick<SelectionAnchor,
  'sourceText'>`, `Block[]` ×3, `TranslationProfile`, `GlossaryEntry[]`,
  `string`, `ReturnType<typeof passageFor>['known']`, `boolean`. The
  anchor types are `Pick`s of what each body reads, because
  `TranslateRequest` is in `useTranslator.ts` and importing it back would
  make a file-level cycle. The declared return type keeps the literal
  contextually typed, as the argument position did.
- Word diff (`git diff --no-index --word-diff` of the removed lines
  against the bodies, indentation aside): `passageFor`'s nine lines
  identical, its comment included, then one added `return { selected,
  before, after, known };`; the literal identical but `{+return+}` before
  its `{` and `[-},-]{+};+}` at its end (the argument's comma becomes the
  statement's semicolon).
- Call sites (h): `const { selected, before, after, known } =
  passageFor(blocks, entities, anchor);` where `selected` was, so every
  later line reads the same names; `translationRequestFor({ … })` as the
  first argument of the same `translate` call, still after `providerFor`'s
  lookup, before `apiKey`. No statement with a side effect moved: no
  `await`, setter, storage call, `newId`, `Date.now` or `beginActivity`.
  Both `cacheKeyFor` calls (`translate`'s `:195-205`, `isStale`'s
  `:140-158`) untouched, so no cache key changes (trap 5); `translate`'s
  deps array untouched. `SessionStats` and `EMPTY_STATS` stay.
- What stays in `translate`, in order (Design §7's list): the provider
  choice and key check with its `setNotice`; `cacheKeyFor`; the cache read
  and `upsert`; the `passageFor` call; the loading card literal (5i2's);
  `upsert`, `setBusy`, `setNotice`, `beginActivity`; the offline branch
  with its `setStats` updater (5i3's); the provider call with
  `translationRequestFor`; `coverageOf`; the finished card with its
  `await enrichSegments`; `putCard`, `upsert`, the cloud `setStats`
  updater (5i3's); the `catch` with the failed card (5i2's); `finally`.
- Imports: `translationSteps.ts` takes `import type` of `Block`, `Entity`,
  `GlossaryEntry`, `TranslationProfile` (`types`) and `TranslationRequest`
  (`translation/TranslationProvider`), `TRANSLITERATION_INSTRUCTION`
  (`translation/prompt`), and the functions the moved text calls:
  `knownReferencesIn` (`quran/entityService`) and `blocksInRange`,
  `contextAround` with `type SelectionAnchor` (`./selection`, value
  imports, so no side-effect-only import). It does not import
  `useTranslator`. `useTranslator.ts` drops `knownReferencesIn`,
  `TRANSLITERATION_INSTRUCTION` and the two selection functions, keeps
  `SelectionAnchor` as `import type { SelectionAnchor } from
  './selection'` (`verbatimModuleSyntax`), and imports `passageFor`,
  `translationRequestFor`. A six-line header. `useTranslator.ts` is 453
  lines (466); `translationSteps.ts` 68. 5h4's review notes: n1 the
  "20-line" above; n2 the screen header's "(Design §6.3, Q10)", one token
  on `ReaderScreen.tsx:74`, the line left long rather than rewrapped so no
  screen line moves.
- **For 5j and 5i2–5i3:** `useTranslator.ts`'s `:9-18` up 1; old `:19`
  (the selection import) becomes `:18-19`; from `:20` nothing moves,
  through `:214`; `:215-223` now the call at `:215` (the text at
  `translationSteps.ts:19-27`); `:224-274` up 8; `:275-290` now the call
  at `:267-277` (the literal at `translationSteps.ts:52-67`); past `:290`
  up 13. FOUND_ISSUES: 26's `:195-205` and `:207-213` unchanged, its
  `:215-223` and `:277-288` now `translationSteps.ts:19-27` and `:54-65`;
  `:32`, `:62`, `:66-68`, `:88-94` unchanged; `:246` now `:238`; `:330`
  now `:317`; `:343-350` now `:330-337`; `:378-394` now `:365-381`. The
  plan's 5i2/5i3 ranges: the loading card `:217-239`, the updaters
  `:255-262` and `:309-318`, the failed card `:322-336`, `withoutStream`'s
  `:343-347`.
- **T** exit 0. **B L R S U P Q**, on the tree just before the commit:
  **B** exit 0, main chunk 793,551 B (+316 B), only `index.js` differs
  (`compare-bundles` against post-5h4; minified names), CSS byte-identical
  (`cmp`); **L** 193 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55, every `ok` line
  identical to 5h4's run, the portrait restore too (699 both), and every
  report line identical: 240,000 px in 33.4 s, 1,905 nodes, 0 long tasks
  / 175,800 px in 24.4 s, 1,904 nodes, 0 long tasks; **S** 30/30; **U**
  254/254; **P** PASS, identical — every request and card, its
  `translate`, `cache-hit`, `retranslate`, `external-lookup`, `error`,
  `block`, `batch` and `transliteration` scenarios included; **Q** PASS,
  identical to `docs/refactor/phase3/requests.json`.
- **Review of 5i1 (`8be21cd`): PASS WITH NOTES; "ready for 5i2".** The
  reviewer's own word diff matched the entry's; all three callees
  (`blocksInRange`, `contextAround`, `knownReferencesIn`) pure; the
  argument evaluation order unchanged; both `cacheKeyFor` calls untouched.
  The object parameter and the `Pick` types allowed under (f), (i) and (k);
  the 90-character `ReaderScreen.tsx:74` accepted (n4). Notes: (n1) the new
  header said `translate` keeps "both cache keys in its own order", but
  only one `cacheKeyFor` call is in `translate`, the other in `isStale`:
  fixed in 5i2's header; (n2) its "Pure — no storage, no state, no clock"
  becomes untrue at 5i2 (`loadingCard` carries `newId` and `Date.now`):
  amended in 5i2, the step that makes it untrue (Q13); (n3) the "For 5j"
  line's "`:9-19` up 1" corrected above to "`:9-18` up 1; old `:19` … from
  `:20` nothing moves". For 5j's Corrections list (optional): (k)'s wording
  could add "an object parameter when names share a type".

**Step 5i2, measured 2026-11-17**
- Two more runs of `translate` (adaptation (k), Design §7) moved into
  `ui/reader/translationSteps.ts`: the loading card literal
  (`useTranslator.ts:217-239` at `8be21cd`, the plan's 225-247), its
  `newId('card')` and `Date.now()` inside it at the same places; and, in
  the `catch`, the two statements that build the failed card (`:322-336`,
  the plan's 335-349: `const error = …` and `const failed: TranslationCard
  = { … }`), contiguous, `error` read only by the `failed` literal and by
  nothing after it. The `await storage.putCard(failed)`, `upsert(failed)`
  and `return failed` after them stay in `translate`, so the value and the
  side effects separate without a reorder. No free name in either run is
  reassigned (`card`, `caught`, the consts and the destructured
  parameters).
- Signatures: `loadingCard({ bookId, anchor, activeProfile, glossaryHash,
  useProviderId, useModel, cacheKey, digDeeper }): TranslationCard`, one
  object parameter (`bookId`, `glossaryHash`, `useModel` and `cacheKey`
  are all `string`), the literal's eight free names in order of first use,
  typed `string`, `Pick<SelectionAnchor, 'startBlockId' | 'startOffset' |
  'endBlockId' | 'endOffset' | 'sourceText'>` (the five fields it reads,
  `TranslateRequest['anchor']`'s shape, restated since `TranslateRequest`
  cannot be imported back), `TranslationProfile`, `string`, `ProviderId`,
  `string`, `string`, `boolean`; `failedCard(card: TranslationCard,
  caught: unknown): TranslationCard`, positional as the plan names it (the
  two types differ; `caught` is `unknown` as the `catch` binding is).
- Word diff (`git diff --no-index --word-diff`, indentation aside): the
  loading card's 23 lines identical, its comment included, but
  `[-const card: TranslationCard =-]{+return+} {` on the first line — the
  declaration stays at the call site, the literal moved; the failed card's
  15 lines identical, then one added `{+return failed;+}`.
- Call sites (h): `const card: TranslationCard = loadingCard({ bookId,
  anchor, activeProfile, glossaryHash, useProviderId, useModel, cacheKey,
  digDeeper });` at `:216`, the declaration and its type as written;
  `const failed = failedCard(card, caught);` at `:308`, the first line of
  the `catch`, so `putCard`, `upsert` and `return` read `failed` as
  written. `TranslationError` leaves `useTranslator.ts`'s imports (it was
  used only there); `newId` stays (`addGlossaryTerm`).
- Evaluation order of `newId('card')` and `Date.now()`: before, the
  literal was the initializer of `const card` straight after the
  `passageFor` call, its properties evaluated in order — `newId` first,
  then plain reads, then `Date.now()`, then plain reads — and then
  `upsert(card)`. Now the argument object is built first from eight
  `const`s and parameters (plain local reads, no getters, no calls), then
  `loadingCard` runs the same literal in the same order and returns. So
  between the `passageFor` call and `upsert(card)` the only effects are
  still `newId` (its counter, `Date.now` and `Math.random`) and then
  `Date.now()`, in that order, at the same moment relative to every other
  statement in `translate`. `failedCard` constructs a `TranslationError`
  when `caught` is not one, as before, before the `putCard`.
- FOUND_ISSUES 41 and 42 preserved exactly: the failed card is still
  `{ ...card, … }`, so it keeps the loading card's `cacheKey`, and is still
  written with `putCard` in `translate` (41); `retranslate` and
  `translate`'s key check are untouched (42). P's `error`,
  `error-cached`, `batch-again` and `retranslate-no-key` scenarios record
  both, identical below. No `await`, setter or storage call moved; both
  `cacheKeyFor` calls, `translate`'s deps array, `SessionStats` and
  `EMPTY_STATS` untouched, so no cache key changes (trap 5).
- The header (5i1's review notes n1, n2, Q13 in the step that makes it
  untrue): "Pure — no storage, no state, no clock" and "both cache keys"
  replaced by: no storage, no React state, no `await`; the loading card's
  `newId('card')` and `Date.now()` inside its literal, run when the card
  is built; `translate` keeps its cache key (`isStale` keeps the other);
  moved in steps 5i1 and 5i2. Nine lines.
- Imports: `translationSteps.ts` adds `ProviderId`, `TranslationCard` to
  its `import type` from `types` (now multi-line), `newId` (`lib/id`), and
  `TranslationError` as a value beside `type TranslationRequest` from
  `translation/TranslationProvider`. `useTranslator.ts` drops
  `TranslationError` and imports `failedCard`, `loadingCard`. No cycle.
  `useTranslator.ts` is 425 lines (453); `translationSteps.ts` 145 (68).
- **For 5j and 5i3**, `useTranslator.ts` from `8be21cd`: `:9-216` up 1
  (old `:8`, `TranslationError`'s import, gone); `:217-239` now the call at
  `:216-225`; `:240-321` up 14; `:322-336` now the call at `:308`; past
  `:336` up 28. 5i3's ranges: the updaters `:241-248` and `:295-304`,
  `withoutStream`'s `:315-319`. `translationSteps.ts` moved by its longer
  imports and header: `passageFor`'s body now `:30-38`, the request
  literal `:63-78`, the loading card `:103-125`, the failed card
  `:129-143`. FOUND_ISSUES against the plan's base: 26's `:195-205` now
  `:194-204`, `:207-213` now `:206-212`, `:215-223` and `:277-288` now
  `translationSteps.ts:30-38` and `:65-76`; 41's `:343-350` now
  `translationSteps.ts:137-143` with its `putCard` at `:309`, its `:244`
  now `translationSteps.ts:122`, its `:207-212` now `:206-211`; 42's
  `:378-394` now `:337-353`, `:383-384` now `:342-343`, `:185-192` now
  `:184-191`; 43's `:246` now `translationSteps.ts:124`; 43's `:330` now
  `:303`. In the up-1 range, the references of FOUND_ISSUES.md:431, 454,
  491 and 499 (29's `:62`, 31's `:66-68`, 35's `:88-94`, 36's `:32`) are
  now `:61`, `:65-67`, `:87-93` and `:31`.
- **T** exit 0. **B L R S U P Q**, on the tree just before the commit:
  **B** exit 0, main chunk 793,801 B (+250 B), only `index.js` differs
  (`compare-bundles` against post-5i1; minified names), CSS byte-identical
  (`cmp`); **L** 193 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55, every `ok` line
  identical to 5i1's run but the portrait restore (700 here, 699 there,
  the known noise), and every report line but the landscape timing:
  240,000 px in 33.3 s (33.4), 1,905 nodes, 0 long tasks / 175,800 px in
  24.4 s, 1,904 nodes, 0 long tasks; **S** 30/30; **U** 254/254; **P**
  PASS, identical — P pins `Date.now` and `Math.random`, so the card ids
  (`newId` embeds the clock, its counter and a random draw) and
  `createdAt` values it records also show the calls happen in the same
  order and number; its `error`, `error-cached`, `batch-again` and
  `retranslate-no-key` scenarios included; **Q** PASS, identical to
  `docs/refactor/phase3/requests.json`.
- **Review of 5i2 (`a44f5bd`): PASS WITH NOTES; "ready for 5i3".** `error`
  read only by the `failed` literal; `TranslationError`'s constructor only
  assigns fields; the evaluation order of `newId('card')` and `Date.now()`
  unchanged; FOUND_ISSUES 41 and 42 preserved; P re-run identical. Notes:
  (n1) the "For 5j and 5i3" bullet said "`:32`, `:62`, `:66-68`, `:88-94`
  unchanged", but they are in the up-1 range, so `:31`, `:61`, `:65-67`,
  `:87-93` at `a44f5bd`, and they are FOUND_ISSUES.md:431, 454, 491 and
  499's references, not 43's: corrected above; (n2) the header's "keeps
  every side effect" reads as excepting `newId`'s counter, as intended;
  left, or made explicit when the header is next touched.

**Step 5i3, measured 2026-11-17**
- The three updater bodies of `translate` moved (adaptation (k), Design
  §7 as amended for Q12): the offline branch's `setStats` updater
  (`useTranslator.ts:241-248` at `a44f5bd`, the plan's 263-270) and the
  cloud branch's (`:295-304`, the plan's 322-331) as module functions
  `withOfflineRequest` and `withCloudRequest` in `useTranslator.ts`,
  straight after `EMPTY_STATS`, with a four-line comment saying why they
  are there; the `finally`'s `setStreaming` updater (`:315-319`, the
  plan's 356-360) as `withoutStream` in `translationSteps.ts`, after
  `failedCard`. Each was one arrow's body; the arrow and its `setStats(…)`
  or `setStreaming(…)` call stay in `translate`, a fresh arrow per call as
  before, so the updater's identity is as irrelevant as it was. No free
  name in them is reassigned (`previous` is the arrow's parameter;
  `useProviderId`, `result` and `card` are `const`s).
- The probe that led to the amendment: `import type { SessionStats } from
  './useTranslator'` added to `translationSteps.ts` made `check-layers
  --check` exit 1 with `file-level cycle: {ui/reader/translationSteps.ts,
  ui/reader/useTranslator.ts}` (scratchpad `l-5i3-probe.txt`); the file
  was restored before any other change. The owner chose to keep the stats
  updaters beside `SessionStats` (the plan's amendment to Q12, and an item
  on the 5j Corrections list above).
- Signatures: `withOfflineRequest(previous: SessionStats): SessionStats`;
  `withCloudRequest(previous: SessionStats, useProviderId: ProviderId,
  result: TranslationResult): SessionStats`, positional as the plan names
  them (the three types differ); `withoutStream(previous: Record<string,
  string>, card: Pick<TranslationCard, 'id'>): Record<string, string>`.
  Under (f) the last takes `card`, not the plan's `cardId`: the body reads
  `card.id`, and a same-named parameter keeps it verbatim and keeps the
  read of `.id` inside the updater, where it was. The return types are the
  state types the setters' updaters had contextually.
- Word diff (`git diff --no-index --word-diff`, indentation aside): the
  offline updater's 8 lines `[-setStats((previous) => ({-]{+return {+}`,
  6 identical lines, `[-}));-]{+};+}`; the cloud updater's 10 lines the
  same pair around 8 identical lines; `withoutStream`'s 3 body lines
  identical, `[-setStreaming((previous) => {-]` and `[-});-]` the call that
  stays.
- Call sites (h): `setStats((previous) => withOfflineRequest(previous));`
  at `:280`, `setStats((previous) => withCloudRequest(previous,
  useProviderId, result));` at `:327`, `setStreaming((previous) =>
  withoutStream(previous, card));` at `:338`. React still receives one
  updater function per call and calls it with the same `previous`; the
  values each reads (`useProviderId`, `result`, `card.id`) are the same
  `const`s, read when the updater runs, as before.
- `translate` after 5i3 against Design §7's "What stays", item by item:
  (1) the provider choice and key check with its `setNotice` (`:218-231`),
  in place; (2) both `cacheKeyFor` calls, `translate`'s (`:233-243`) and
  `isStale`'s (`:178-196`), untouched (trap 5); (3) the cache read and its
  `upsert` (`:245-251`); then the `passageFor` and `loadingCard` calls
  (`:253`, `:255-264`), 5i1's and 5i2's; (4) `upsert`, `setBusy`,
  `setNotice`, `beginActivity` (`:268-273`); (5) the offline branch
  (`:276-282`), `runOffline` not moved; (6) the provider call
  (`:284-298`) with `translationRequestFor`; (7) `coverageOf` (`:303`);
  (8) the finished card literal with its `await enrichSegments`
  (`:305-322`), not moved; (9) the `putCard`s, here and in the offline
  branch and the `catch`, with the `upsert`s and both `setStats` calls;
  the `catch` with `failedCard` (`:330-334`); (10) `finally` (`:335-339`)
  with `endActivity`, `setBusy(false)` and `setStreaming`. Every `await`,
  setter, storage call and `beginActivity` is in `translate` in its old
  order. `translate`'s deps array (`:341-353`) unchanged; `SessionStats`
  and `EMPTY_STATS` stay, so RESTRUCTURE §2's "request counts in
  `useTranslator.ts`" holds.
- The header of `translationSteps.ts` (5i2's review note n2 made
  explicit): it now lists the streaming text without the card's entry;
  "The one exception is the loading card's `newId('card')` (a module
  counter and a random draw) and `Date.now()`"; `translate` keeps "every
  other side effect"; the stats updaters stay in `useTranslator.ts` since
  importing `SessionStats` would make a file cycle; steps 5i1, 5i2 and 5i3
  and the amendment to Q12 named. Fourteen lines.
- Imports: `useTranslator.ts` adds `import type { TranslationResult }`
  (`translation/TranslationProvider`) for `withCloudRequest`'s `result`
  and `withoutStream` to its `translationSteps` import (now multi-line);
  `translationSteps.ts` adds nothing (`TranslationCard` was imported). No
  cycle. `useTranslator.ts` is 444 lines (466 at the plan base, 453 after
  5i1, 425 after 5i2; the two module functions and their comment add 32);
  `translate` is 147 lines (`:208-354`), 207 at the plan base;
  `translationSteps.ts` 159 (145).
- **For 5j**, `useTranslator.ts` from `a44f5bd`: `:8-17` down 1 (the new
  type import); `:18` (the `translationSteps` import) now `:19-25`;
  `:19-55` down 7; then the 32 new lines (`:63-94`); `:56-240` down 39;
  `:241-248` now `:280`; `:249-294` down 32; `:295-304` now `:327`;
  `:305-314` down 23; `:315-319` now `:338`; past `:319` down 19.
  `translationSteps.ts` from `a44f5bd`: the header five lines longer, so
  every line after it down 5: `passageFor`'s body `:35-43`, the request
  literal `:68-83`, the loading card `:108-130`, the failed card
  `:134-148`, `withoutStream` `:152-159`. FOUND_ISSUES against the plan's
  base: 26's `:195-205` now `:233-243`, `:207-213` now `:245-251`,
  `:215-223` and `:277-288` now `translationSteps.ts:35-43` and `:70-81`;
  29's `:62` now `:100`, its `:252` and `:355` (`setBusy`) now `:269` and
  `:337`; 31's `:66-68` now `:104-106`; 35's `:88-94` now `:126-132`; 36's
  `:32` now `:38`, its `:173` now `:211`, its `:246` and `:289` now
  `translationSteps.ts:129` and `:82`; 41's `:343-350` now
  `translationSteps.ts:142-148` with its `putCard` at `:332`, its `:244`
  now `translationSteps.ts:127`, its `:207-212` now `:245-250`; 42's
  `:378-394` now `:356-372`, `:383-384` now `:361-362`, `:185-192` now
  `:223-230`; 43's `:246` now `translationSteps.ts:129`, its `:330` now
  `:91` (in `withCloudRequest`). P's header
  (`scripts/verify-translate.mjs:99-105`) names the plan base's `:263-270`,
  `:356-360`, `:330` and `:322-331`: now `withOfflineRequest`
  (`useTranslator.ts:67-76`), `withoutStream` (`translationSteps.ts:152-159`),
  `:91` and `withCloudRequest` (`:78-93`).
- **T** exit 0. **B L R S U P Q**, on the tree just before the commit:
  **B** exit 0, main chunk 793,868 B (+67 B), only `index.js` differs
  (`compare-bundles` against post-5i2; minified names), CSS byte-identical
  (`cmp`); **L** 193 files, 134 edges, 0 directory and 0 file-level
  cycles, rules hold; **R** first and alone 55/55, every `ok` line
  identical to 5i2's run, the portrait restore too (700 both), and every
  report line but the timings (33.4 s and 24.5 s here, 33.3 s and 24.4 s
  there): 240,000 px, 1,905 nodes, 0 long tasks / 175,800 px, 1,904
  nodes, 0 long tasks; **S** 30/30; **U** 254/254; **P** PASS, identical
  — the session lines (the cloud updater's request counts and cost)
  included; **Q** PASS, identical to
  `docs/refactor/phase3/requests.json`. P's header
  (`scripts/verify-translate.mjs:97-107`) names what no scenario can show,
  so it rests on the word diff above and the reviewer's reading: the
  offline updater (both offline scenarios fail before it), the streaming
  entry's removal (a canned response arrives at once), `cacheWriteTokens`
  (read nowhere in `src/ui`) and the cost sum's accumulation across
  translations.
- **Review of 5i3 (`6ed8c0d`): PASS WITH NOTES; "ready for 5j", nothing
  that must be fixed.** The three updater bodies identical to the removed
  arrows' bodies by word diff; the `setStats(…)` and `setStreaming(…)` calls,
  every `await`, setter and storage call still in `translate` in their old
  order; keeping the stats updaters beside `SessionStats` matches the
  owner's amendment to Q12. Notes: P cannot reach the offline updater, the
  streaming entry's removal, `cacheWriteTokens` or the cost sum's
  accumulation across translations, and the reviewer accepted the word-diff
  proof for those four; P's header line numbers
  (`scripts/verify-translate.mjs:97-107`) still named the plan base's lines
  in `useTranslator.ts`, fixed at 5j.

**Step 5j, docs and comments, 2026-11-17** (comments and docs only; no
statement in `src/` or `scripts/` changed: every `+`/`-` line of `git diff
-U0 -- src scripts` is a comment line)
- Design §10's rows: `ui/kit/SettingsSection.tsx`'s header now says the old
  local Section is `ui/settings/Section.tsx` and the seven sections it serves
  are files of their own; `scripts/verify-storage-harness.ts:901` names
  `BackupSection`; `quran/quranIndex.ts:427` says "in QuranSheet" (the line
  it describes is `QuranSheet.tsx:208`); `.claude/agents/torjuman-reader.md`'s
  "How the reader works" names the screen's hooks and parts, puts the header
  in `ReaderHeader.tsx`, and `TYPE_CHROME` and `settleOn` in
  `blockLayout.ts`, `BlockRow` in `BlockRow.tsx`; its "28 checks" for R is
  55. CLAUDE.md's trap 7 and map are the main session's (as in 4n).
- The 5j list above: `BlockList.tsx`'s margin-layout comment now says the
  gutters are the list's container padding and `BlockRow.tsx` draws in them
  (one line longer, so `BlockList.tsx` is 378 lines), and its "see
  MarginTarget" names `BlockRow.tsx`; P's header names `withOfflineRequest`
  (`useTranslator.ts:67-76`), `withoutStream` (`translationSteps.ts:152-159`),
  `cacheWriteTokens` (`useTranslator.ts:91`) and `withCloudRequest`
  (`useTranslator.ts:78-93`), with the plan base's lines kept as history.
- FOUND_ISSUES: every reference of 26–43 into a file Phase 5 moved or
  shifted recomputed by content from the final files (each quoted line found
  with `grep` and checked with `sed -n`, not by chaining the shift sentences
  above), and 10's `pageIndexOf` (~103); 32's is `BackupSection.tsx:26-39`,
  40's `attempts >= 8` `blockLayout.ts:88`. A note at the top of the file
  says so. The entries' text is otherwise unchanged.
- RESTRUCTURE: the status, §6's row (complete, what was done, the checks
  run), and §5's sentence on where the baselines are (D, U, Q, P compare
  with their record files); §5's R row (55/55) and P row were written in 5b
  and 5c. The plan: "Corrections found in review", eight items.
- Left, by the plan or because still true: `ui/reader/useAnimatedList.ts:12`
  (Design §10: the debounce's call is in the screen); `torjuman-reviewer.md:43`
  (names no file); each moved file's verbatim moved comments; the header of
  `scripts/verify-translate.mjs:8-10` (what Phase 5 moves, said when P was
  written; still true of the steps that left `useTranslator.ts`).
- **T** exit 0. **L** (`check-layers --check`) exit 0: 193 files, 134
  edges, 0 directory and 0 file-level cycles, all eleven rules hold. The end
  checks (T B L S R U P Q D, the SSR build of `verify-parsers.ts`, then X on
  the whole phase) are run by the main session on the commit.

## Phase 5 result

| | Plan base (`9afb2c7`, Phase 4 end) | Phase 5 end |
| --- | --- | --- |
| `ReaderScreen.tsx` | 1,349 lines: state, data loading, selection, the position, navigation, panel and header-height logic, the header, the ḥadīth bars, the columns, the card panel, eight sheets, `ReadMarkNav`, `JumpToPage` | 854 lines: the shared state and the code that writes it, the data loading and selection tracking, the columns' JSX and the props, with the reason for its size at its top (Design §6.5, Q11) |
| `EntitySheet.tsx` | 756 lines: the dispatcher, the verse sheet, the compile tab, the ḥadīth sheet | 29 lines: the dispatcher |
| `BlockList.tsx` | 728 lines: the virtualizer, the estimates and their tables, `settleOn`, the row and its margin parts | 378 lines: the virtualizer, its callbacks and the list |
| `SettingsScreen.tsx` | 608 lines: the list and seven inline sections with their `Section` | 62 lines: its imports and the list |
| `useTranslator.ts` | 466 lines; `translate` 207 | 444 lines; `translate` 147, its pure steps named (`SessionStats`, `EMPTY_STATS` and the two stats updaters stay) |
| new files in `ui/reader/` | — | `HadithSheet.tsx` 335, `ReaderSheets.tsx` 326, `BlockRow.tsx` 296, `QuranSheet.tsx` 251, `ReaderHeader.tsx` 211, `CompileTab.tsx` 168, `translationSteps.ts` 159, `blockLayout.ts` 99, `ReaderCardPanel.tsx` 95, `CommentaryBars.tsx` 81, `useWordLookup.ts` 77, `usePanelControls.ts` 59, `useReaderNavigation.ts` 55, `useReadingPosition.ts` 51, `useHeaderHeight.ts` 28, `quranSheetData.ts` 26 lines |
| new files in `ui/settings/` | — | `KeysSection.tsx` 163, `BackupSection.tsx` 101, `TranslationSection.tsx` 95, `QuranSection.tsx` 88, `ReadingSection.tsx` 67, `DisplaySection.tsx` 48, `CatalogSection.tsx` 25, `Section.tsx` 25 lines |
| new check | — | **P** (`npm run verify:translate`): 6 groups, 23 scenarios, 18 requests, identical at every step from 5g1 |
| check R | 28/28 | 55/55 (27 new at 5b); landscape 240,000 px in 33.4 s, 1,905 nodes, 0 long tasks / portrait 175,800 px in 24.5 s, 1,904 nodes, 0 long tasks at 5i3 (33.3 s / 24.4 s at Phase 4's end) |
| check U | 180 files | 254 files (70 added at 5a, 4 more at its fix), identical at every step after |
| check S | 30/30 | 30/30 at every step |
| checks D, Q | identical | D identical at 5d8; Q identical at 5c and 5i1–5i3 |
| main JS chunk | 790,214 B | 793,868 B (+3,654: the parts' props objects and the new functions), CSS byte-identical at every step |
| layers | 134 directory edges, no cycle | 134 directory edges, no directory or file-level cycle, all eleven rules |

Every step was reviewed before the next began; 5j's review is pending.
**Owed before merge:**
- **V**, `npm run verify` on the owner's PC. Phase 5 changes one module it
  imports, a comment in `quran/quranIndex.ts` (5j); the count should be
  Phase 4's.
- **M** on the staged build (`npm run stage`) on the tablet, by touch, in
  Chrome, the plan's fourteen items in landscape (960×600) and portrait
  (600×960). Two things the checks do not show rest on it: the sharḥ notice
  and sharḥ search bars, which no U capture shows (item 8), and the paths P
  cannot reach — the offline stats updater and the on-device model, the
  streaming entry's removal, `cacheWriteTokens`, and the cost summed across
  several translations in one session (item 5 with a real key; the
  on-device model is on the plan's list of what only the tablet shows).
  Also the finger on the divider (item 3, FOUND_ISSUES 27), the native
  handles, the real fonts, the real APIs and the shared read-only view
  (item 12, if the owner has a published link).

**Open, and not this phase's to fix:** FOUND_ISSUES 26–43, found during the
phase and left as found (structure only), their references now pointing at
the final files. The ones that matter most on the tablet: 26 ("Translate
this entry" stored under the visible block's key, a wrong translation
possible), 27 (the divider by finger), 39 (the read-mark ↓), 41 (a failed
card served from the cache) and 42 (Retranslate deletes the card before the
key check). Each needs its own change, if the owner wants one.

## Open

- V baseline count from the owner's PC.
- The owner's list of creed-book features (for the Phase 5b plan): set aside by the owner until the restructure is finished.

## Later

None: Phase 3's recorded-request check and Phase 4's check D are built.
