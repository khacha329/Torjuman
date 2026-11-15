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

## Open

- V baseline count from the owner's PC.
- The owner's list of creed-book features (for the Phase 5b plan).

## Later

- Check D (IndexedDB schema dump) is built in Phase 4 step 0, on the old code.
- A recorded-request check for Phase 3 (the exact request bodies each
  provider sends for a fixed selection), built on the old code first.
