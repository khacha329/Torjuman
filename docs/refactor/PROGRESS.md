# Restructure progress

What has been done, what was measured, and what is open. Newest phase last.
Plan and rules: [`RESTRUCTURE.md`](RESTRUCTURE.md).

## Current state: Phase 0 in PR khacha329/Torjuman#8; Phase 1 done on `claude/restructure-phase-1`, awaiting the owner's `npm run verify` and merge

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

## Phase 2: shared pieces (planning, branch `claude/restructure-phase-2`)

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
| review notes: 2e | applied | this commit |

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

## Open

- V baseline count from the owner's PC.
- The owner's list of creed-book features (for the Phase 5b plan).

## Later

- Check D (IndexedDB schema dump) is built in Phase 4 step 0, on the old code.
- A recorded-request check for Phase 3 (the exact request bodies each
  provider sends for a fixed selection), built on the old code first.
