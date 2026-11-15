# Phase 1: seams — break the dependency cycle

Status: draft — awaiting the owner's approval
Base commit: `56a412c` (`main`, v0.6.14), with Phase 0 on top
Branch: `claude/restructure-phase-1`

## Goal

Make the import graph acyclic without changing what the app does: after this
phase `npm run layers` reports **0 directories in a cycle, 0 mutual pairs and
0 file-level cycles** (today 13 + 2, 7 and 1), and `docs/refactor/layers.json`
holds a rule for each boundary so it stays that way.

Done when: the numbers above, all rules hold with `--check`, T B S R pass at
every step, the owner's `npm run verify` passes with the Phase 0 count, and
every step has a reviewer verdict of PASS or PASS WITH NOTES.

## Not doing

- No behaviour change, no bug fix, no renaming of exported symbols.
- No splitting of the big files (Phase 5), no deduplication (Phase 2), no
  provider descriptors (Phase 3), no storage changes (Phase 4).
- No change to what the deploy workflow builds or deploys (Q3, Q4 add checks
  only).

## Current state (at `56a412c`)

Seven small things hold the cycle together (from `phase0/layers.txt`):

| Edge | Through | Kind |
| --- | --- | --- |
| domain → `app` | `retrievalLog` (biography ×2, quran, qul, retrieval ×3), `activity` (catalog/importBatch), `secrets` (library/deviceTransfer), `AppContext` (catalog/useCatalogImport) | value |
| `app` → domain | `AppContext` → catalog, ingest, qul, retrieval, translation | value (correct direction) |
| `types` ↔ `translation` | `types.ts` imports `ProviderId`, `TranslationUsage`, `TranslationErrorKind` from `translation/TranslationProvider.ts` | type |
| `platform/storage` → `biography` | `StoredNarratorProfile` from `biography/narratorProfile.ts` (also `share/ShareStorageAdapter.ts`) | type |
| `translation` → `translation/providers` | `translation/registry.ts` imports both providers | value |
| `ui` → `ui/reader` | `ui/useLayoutMode.ts` imports `RAIL_WIDTH` from `ui/reader/SelectionRail.tsx` | value |

`app/retrievalLog.ts` and `app/activity.ts` import nothing; `app/secrets.ts`
imports `isCloudProvider`, `CloudProviderId`, `ProviderId` from
`translation/TranslationProvider.ts`.

A simulation of the steps below on the real import graph (same patterns as
`check-layers.mjs`) gives **no cycle and no mutual pair**. Resulting edges:
`core` → nothing; `types` → nothing; `platform/storage` → `lib`, `types`;
`translation` → `lib`, `platform/storage`, `types`.

## Design

A new layer-1 directory `src/core/` holds the three module singletons that
domain code needs and that do not belong to the composition root:
`retrievalLog`, `activity`, `secrets`. Each is a **whole-file move** (`git mv`)
with every importer updated — never a copy, because each is a singleton
(RESTRUCTURE trap T-c).

Types that a lower layer needs move down into `types.ts`. `isCloudProvider` is
a function, and `types.ts` holds only types, so it moves to a new
`lib/providers.ts` (Q2).

The registry moves under `translation/providers/`: the providers depend on
`translation/`, and the registry depends on the providers, so it belongs with
them.

Then `types.ts` becomes `types/index.ts` and is split by group into files
under `types/`, with `index.ts` re-exporting all of them. No importer changes
— `'../types'` resolves to `types/index.ts` exactly as it resolved to
`types.ts` (Q5, Q6).

Rejected: leaving re-exports at the old paths (`app/retrievalLog.ts`
re-exporting `core/retrievalLog.ts`). It would keep the singletons single, but
it would keep the old edges in the graph, and nothing would ever remove them.

## Steps

| Step | What | Files | Checks | Risk |
| --- | --- | --- | --- | --- |
| 1a | Provider-id types to `types.ts`; `isCloudProvider` to `lib/providers.ts` | `types.ts`, `translation/TranslationProvider.ts`, new `lib/providers.ts`, their importers (up to 16 files) | T B L X | low |
| 1b | Narrator profile types to `types.ts` | `biography/narratorProfile.ts`, `types.ts`, storage ×2, share, importers | T B L X | low |
| 1c | `app/retrievalLog.ts` → `core/retrievalLog.ts`; `core` (and Q4) on the workflow's list | 1 file moved, ~8 importers, `deploy.yml` | T B L X | low |
| 1d | `app/activity.ts` → `core/activity.ts` | 1 file moved, importers, **`scripts/verify-parsers.ts`** | T B L X; V owed | low |
| 1e | `app/secrets.ts` → `core/secrets.ts` | 1 file moved, importers | T B L X | low |
| 1f | `catalog/useCatalogImport.ts` → `ui/useCatalogImport.ts` | 1 file moved, 2 importers | T B L X | low |
| 1g | `RAIL_WIDTH` (with its comment) → `ui/useLayoutMode.ts` | `SelectionRail.tsx`, `useLayoutMode.ts`, `ReaderScreen.tsx` | T B L **S R** X | low |
| 1h | `translation/registry.ts` → `translation/providers/registry.ts` | 1 file moved, 6 importers | T B L X | low |
| 1i | `types.ts` → `types/index.ts` (pure rename) | 1 file; `deploy.yml` list (`types`) | T B L X | low |
| 1j | split out `types/book.ts` (book content) and `types/catalog.ts` | `types/index.ts` | T B L X | low |
| 1k | split out `types/entities.ts`, `types/cards.ts` | same | T B L X | low |
| 1l | split out `types/translation.ts`, `types/retrieval.ts`, `types/qul.ts` | same | T B L X | low |
| 1m | split out `types/persistence.ts`, `types/share.ts`, `types/biography.ts`, `types/settings.ts`, `types/reader.ts` | same | T B L X | low |
| 1n | `layers.json` complete; `npm run layers -- --check` in the workflow (Q3) | `layers.json`, `deploy.yml` | L | low |
| 1o | README map, CLAUDE.md map, PROGRESS | docs | X | none |

Each layer rule is added to `layers.json` **in the step that makes it true**,
so `--check` passes after every commit:

| After | Rule |
| --- | --- |
| 1a | `types` imports nothing; `lib` imports only `types` |
| 1b | `platform/.*` imports only `lib`, `types` |
| 1e | `core` imports only `lib`, `types`; no domain directory imports `app` or `ui.*` |
| 1f | (the domain rule now covers `catalog` too) |
| 1g | `ui` imports no `ui/.+` |
| 1h | `translation` does not import `translation/providers` |

## Per step

**1a.** Moves `ProviderId`, `CloudProviderId`, `TranslationUsage`,
`TranslationErrorKind` (with their doc comments, verbatim) from
`translation/TranslationProvider.ts` to `types.ts`, and `isCloudProvider` to
`lib/providers.ts`. `TranslationProvider.ts` imports them back for its own use.
Every importer of these five names switches to the new place.
`types.ts` loses its only import. Adaptations: (a), (b), and a header comment on
`lib/providers.ts` (c).

**1b.** Moves `FieldSource`, `SourcedValue`, `ScholarStatement`,
`NarratorProfile`, `StoredNarratorProfile` from `biography/narratorProfile.ts` to
`types.ts`. The functions (`emptyProfile`, `mergeProfiles`, `hasContent`) and
`FIELD_LABELS` stay. Importers of the types switch to `types`.

**1c–1f.** `git mv`, then every importer updated, found with
`grep -rn "app/retrievalLog\|app/activity\|app/secrets\|catalog/useCatalogImport" src scripts`.
The moved file is byte-identical except import paths. 1c also adds `core` to
the workflow's "source tree arrived intact" list (trap T-b).
1d: `scripts/verify-parsers.ts` imports `../src/app/activity` — updated in the
same commit; V is owed for it.
1e: after 1a, `secrets.ts` imports from `types` and `lib/providers` only.

**1g.** `RAIL_WIDTH` and its comment move verbatim into `ui/useLayoutMode.ts`
next to the other layout constants. `SelectionRail.tsx` and `ReaderScreen.tsx`
import it from there. S and R run because the reader imports change.

**1h.** `git mv`; importers: `app/AppContext.tsx`, `ui/OnboardingScreen.tsx`,
`ui/settings/SettingsScreen.tsx`, `ui/settings/ProfileEditor.tsx`,
`ui/reader/useTranslator.ts`, `ui/reader/TranslationCardView.tsx`. The
registry's relative imports of the providers become `./AnthropicProvider` etc.

**1i–1m.** 1i is `git mv src/types.ts src/types/index.ts` and nothing else —
TypeScript and Vite resolve `'../types'` to the directory's `index.ts`. Each
later step cuts whole groups out of `index.ts` into a new file, verbatim, and
leaves `export * from './<group>'` in `index.ts`; type references between groups
become `import type` lines. Groups and their current lines in `types.ts`:

| File | Group | Lines today (approx.) |
| --- | --- | --- |
| `reader.ts` | StructureProfile, PanelScope, PanelPosition | 1–30 |
| `catalog.ts` | CatalogEntry, Catalog | 52–75 |
| `book.ts` | Book, DictionaryEntry, TocNode, Page, BlockType, InlineSpan, Block | 76–234 |
| `entities.ts` | Entity, EntityRange, SegmentType, TranslatedSegment | 235–317 |
| `cards.ts` | CardBase … Card, Mark, MarkRange, NoteCard, source refs | 318–511 |
| `translation.ts` | WordGloss, TranslationProfile, GlossaryEntry (+ 1a's provider types) | 512–545 |
| `retrieval.ts` | QuranVerse, HadithRecord, HadithSourceId, HadithAttribution | 546–600 |
| `qul.ts` | QulResource … QulCompilation | 601–743 |
| `persistence.ts` | CrawlState, ReadingPosition | 744–778 |
| `share.ts` | ShareRecord | 779–809 |
| `biography.ts` | BiographyEntry (+ 1b's narrator types) | 810–846 |
| `settings.ts` | AppSettings | 847–899 |

(Line numbers before 1a/1b; the step's PROGRESS section gives the offsets.)
Types-only changes produce no JavaScript, so B must show **byte-identical
JS** for 1a, 1b and 1i–1m — a stronger check than ±2 KB.

**1n.** Adds the step `npm run layers -- --check` to `deploy.yml` after
`npm ci` (Q3).

**1o.** Docs only.

## Checks

T, B and L after every commit; S and R after 1g and at the end of the phase;
X (reviewer) after every commit (Q7). V on the owner's PC before merging —
1d and 1i–1m touch modules `scripts/verify-parsers.ts` builds. M is not needed
for this phase (no UI or storage change), unless the owner wants it.

## Risks

- **R1. A missed importer in `scripts/`.** `tsc -b` does not compile
  `scripts/`. Caught by grepping `scripts/` in every step, and by V.
- **R2. Module evaluation order.** Moving the singletons changes file paths,
  not who imports them first; `core/` modules have no import-time side effects
  beyond module-level state (`secrets` reads `localStorage` lazily — verified
  in 1e by reading). The reviewer checks it.
- **R3. Directory index resolution.** `'../types'` → `types/index.ts` relies
  on `moduleResolution: "bundler"` (tsconfig) and Vite's resolver; the SSR
  build of `scripts/verify-parsers.ts` uses the same resolver. Caught by T, B
  and V.
- **R4. A type move changes emitted JS.** It should not; caught by B's
  byte-identical rule.

## Questions

1. **Q1. The name of the new layer-1 directory.** Recommended: `core/`.
   Alternatives: `services/`, `shared/`.
2. **Q2. Where `isCloudProvider` goes.** Recommended: `lib/providers.ts`
   (a pure helper; `types` stays types-only). Alternative: keep it in
   `TranslationProvider.ts` and leave `secrets.ts` importing it, which keeps
   `core → translation` — a layer-1 module depending on layer 2.
3. **Q3. Run `npm run layers -- --check` in the deploy workflow?**
   Recommended: yes — a few hundred milliseconds, and it stops a tag whose
   code re-tangles the graph. The alternative is a local check only.
4. **Q4. Add `biography` and `share` to the workflow's directory list in 1c**
   (FOUND_ISSUES 1)? Recommended: yes — it is a CI check, not app
   behaviour, and 1c edits that list anyway.
5. **Q5. Split `types.ts` in this phase** (1i–1m)? Recommended: yes, behind
   the barrel. It can also be dropped from the phase entirely.
6. **Q6. Importers keep `'../types'`** rather than naming the group file?
   Recommended: yes — one stable import, and no step touches a hundred files.
7. **Q7. Review cadence.** Recommended: the reviewer after every commit.
   Alternative: once per group (1a–1b, 1c–1f, 1g–1h, 1i–1m, 1n–1o) — fewer
   runs, larger diffs per review.
8. **Q8. One PR for the whole phase**, merged by the owner after V on the PC?
   Recommended: yes.

## Owner's answers

(empty)
