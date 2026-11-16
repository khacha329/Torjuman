# Restructure progress

What has been done, what was measured, and what is open. Newest phase last.
Plan and rules: [`RESTRUCTURE.md`](RESTRUCTURE.md).

## Current state: Phases 0–3 complete (PRs khacha329/Torjuman#8, #9, #10, and Phase 3's on `claude/restructure-phase-3`), awaiting the owner's `npm run verify`, the tablet checks and merge

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

## Phase 4: storage (in progress, branch `claude/restructure-phase-4`)

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
| 4j follow-up — D covers a v10 without qulCompilations (`harness/odd-v10-without-qulCompilations`); the 4j review's comment notes | T D Q pass, run1 == run2, the new scenario proven; build identical to 4j after masking; review pending | this commit |

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

## Open

- V baseline count from the owner's PC.
- The owner's list of creed-book features (for the Phase 5b plan).

## Later

- Check D (IndexedDB schema dump) is built in Phase 4 step 0, on the old code.
- A recorded-request check for Phase 3 (the exact request bodies each
  provider sends for a fixed selection), built on the old code first.
