# Phase 5: big UI files — the reader's hooks and parts, the entity sheets, Settings' sections, BlockList's estimates, useTranslator's steps

Status: draft — awaiting the owner's approval
Base commit: `9afb2c7` (Phase 4 complete, stacked on `claude/restructure-phase-4`; PRs #8–#11 and Phase 4's open, not merged)
Branch: `claude/restructure-phase-5`

Line numbers below are at `9afb2c7`. Paths are under `src/` unless they say
otherwise. "The screen" is `ui/reader/ReaderScreen.tsx`.

## Goal

RESTRUCTURE §6, Phase 5: "**Big UI files**: `ReaderScreen` into hooks
(position, navigation, panel divider, gloss) and parts (header, sheets host);
`EntitySheet` into `QuranSheet`, `CompileTab`, `HadithSheet`;
`SettingsScreen` inline sections into files; `BlockList` estimates and
`settleOn` into a module; `useTranslator` steps into named functions —
medium: the reader is the app — S R on every step; T B L X; screenshots; M."
And "Coming after the restructure: book kinds": "**Phase 5** move[s]
ḥadīth-only UI (sheet tabs, margin actions, card kinds) behind named
components, so a kind can leave them out without editing the reader." That
is a constraint on how this phase cuts, not extra features; Phase 5b (genre
folders) is set aside by the owner and not planned here.

Done when:

- the checks the moves need exist **before** the first move and were
  baselined on the old code in their own commits (Design §1): new U captures
  of every reader state a part renders (entity sheets and their tabs, the
  gloss and dictionary sheet, the rail, the margin menu, the popover, the
  collapsed panel, the ḥadīth bars), new R scenarios for what R does not
  exercise today (the divider, collapse and sheet toggles, marker taps, card
  focus, read-mark jumps, double-tap), and a recorded check **P** of the
  translate pipeline through the real reader;
- `SettingsScreen.tsx` is the list and nothing else (~70 lines), each inline
  section in its own file (Design §3);
- `EntitySheet.tsx` is the dispatcher (~55 lines); `QuranSheet`, `CompileTab`
  and `HadithSheet` are files of their own (Design §4);
- `BlockList.tsx`'s `TYPE_CLASS`, `TYPE_CHROME`, text-height estimate and
  `settleOn` are in one module (Design §5);
- the screen's gloss, position, navigation and divider code are hooks; its
  header, ḥadīth bars, sheets host and card panel are components (Design §6);
- `translate` in `useTranslator.ts` reads as its steps, the pure parts of it
  named functions in a module, every side effect and both `cacheKeyFor`
  calls left in place (Design §7) — if the owner keeps that part (Q12);
- every rendered DOM in U is byte-identical, S 30/30, R 28/28 plus the new
  checks, P identical, at every step; R's performance within noise of
  landscape 240,000 px in 33.3 s, 1,905 nodes, 0 long tasks and portrait
  175,800 px in 24.4 s, 1,904 nodes, 0 long tasks (PROGRESS, 4n);
- the owner's `npm run verify` passes, and the tablet run (M, below) works
  on the staged build in both orientations.

## Not doing

- **No behaviour fix.** What the survey found is in Design §9 for
  FOUND_ISSUES and left — including the dictionary-entry cache collision (A)
  and the divider's missing `pointercancel` (B), both of which a tablet user
  could meet.
- **No new state library, no React context, no `memo`/`useMemo`/
  `useCallback` added or removed, no `key` added or changed, no wrapper
  element.** Parts receive props (Design §6.3).
- **No genre work.** `StructureProfile` is untouched; nothing switches on a
  book kind. The ḥadīth-only UI gets named components (Design §8) and that is
  all.
- **No moves the phase row does not name, except** the four the plan
  recommends for the same goal and asks about: `BlockRow.tsx` (Q8),
  `useHeaderHeight` (Q9), `CommentaryBars` and `ReaderCardPanel` (Q10).
- Not moved, with the reason (Design §6.5): the screen's data loading (its
  effects cannot keep their order), selection tracking (not in the row, and
  its doc comment is detached — FOUND_ISSUES draft E), `MarginMenu`,
  `CardPanel`, `SelectionRail`, the other reader files.
- No change to CSS, Tailwind classes, `TYPE_CHROME`'s numbers, `OVERSCAN`,
  the timings (150 ms, 220 ms, 900 ms, 1,600 ms, 480 ms), cache keys,
  prompts, requests, stores, settings or any saved data.
- No change to `scripts/verify-parsers.ts`'s imports: none of the files it
  imports from `ui/reader/` (`cardLayout`, `annotations`, `markLogic`,
  `selection`, `selectionPins`; `verify-parsers.ts:537`, `:925`, `:1121-1122`,
  `:1531`, `:2560`, `:5508-5509`) moves.
- No new dependency. P, like S, R, U and D, is Playwright in the container's
  Chromium.
- Nothing deleted except code that moves.

## Current state (at `9afb2c7`)

### 1. The five files

| File | Lines | Imported by |
| --- | --- | --- |
| `ui/reader/ReaderScreen.tsx` | 1,349 | `App.tsx:9`, `ui/share/ShareScreen.tsx:9` (the shared, read-only view, `:146`) |
| `ui/reader/EntitySheet.tsx` | 756 | `ReaderScreen.tsx:30` |
| `ui/reader/BlockList.tsx` | 728 | `ReaderScreen.tsx:40` |
| `ui/settings/SettingsScreen.tsx` | 608 | `App.tsx:12` |
| `ui/reader/useTranslator.ts` | 466 | `ReaderScreen.tsx:56`; `CardPanel.tsx:20` (type `SessionStats`) |

No script imports any of them (`grep` of `scripts/`);
`verify-storage-harness.ts:901` names `SettingsScreen` in a comment. README
names none of the five files.

### 2. `ReaderScreen.tsx`, by section

| Lines | What |
| --- | --- |
| 1-63 | imports |
| 66-73 | `useApp`, `useReadOnly`, `useLayoutMode`, `useViewportWidth` |
| 75-113 | 16 `useState`: book, blocks, toc, page meta, loading (75-79); toc/search/sheet toggles (81-83); selection (85-90); biography (92-97); active card, visible block and range, **flash** (101), match, popover, entities, entity sheet (98-113) |
| 115-143 | `listRef`; **`headerRef`, `headerHeight`** (117-123); **`restoredRef`** (124); `shareButtonRef`, `showShare`; `sharedScope` with its comment (127-143) |
| 147-159 | `panelVisible`; `settledRange = useDebounced(visibleRange, 220)`; `sectionNodeId` |
| 161-165 | `useTranslator`, `useMarks`, `useExplanations`, `useSharh`, `useBatchTranslate` |
| 167-193 | batch proposal state and `proposeBatch` (ḥadīth: `commentaryRange`, `estimateBatch` from `translation/hadithRange`) |
| 195-198 | margin menu state |
| **200-254** | **gloss and dictionary**: `dictionary`, `lookup`, `gloss` state; `requestGloss` (`useCallback [storage]`); effect `loadDictionary` `[storage]` (238-246); `lookUpWord` (`[dictionary]`) — contiguous |
| 256-300 | `allCards` memo; `editNote`, `addNoteToBlock` |
| 302-309 | `hasKey` state + window `focus` effect `[]` |
| 311-361 | load effect `[storage, bookId]` (313-336); entities effect `[storage, book, blocks.length, readOnly]` (346-356); `entitiesByBlock` memo |
| **363-385** | **position**: restore effect `[loading, blocks.length, storage, bookId]` (364-372, reads `listRef.current` inside a `requestAnimationFrame`); persist effect `[visibleBlock, storage, bookId]`, 900 ms (375-385) — contiguous |
| 387-451 | selection: doc comment (389-400) **above the biography-availability effect** (404-419), not above the `selectionchange` effect it describes (421-434); `withSelection` (437-451) |
| 453-487 | double-tap effect `[blocks, dictionary, lookUpWord]` |
| 489-518 | `runTranslate`, `runTranslateBlock` |
| **520-553** | **navigation**: `flash` (`[]`, 1,600 ms), `jumpToBlock` (`[blocks, flash]`), `jumpToPage` (`[blocks]`), `focusCard` (`[jumpToBlock]`) — contiguous |
| 555-578 | `translatedBlockIds`, `markers`, `citationFor` memos |
| 580-625 | `handleMarkerClick` (8 deps, including `flash`) |
| **627-645** | Ctrl/⌘+`\` effect `[settings.panelCollapsed, updateSettings]` |
| **647-666** | **divider**: `dragging` ref; window `pointermove`/`pointerup` effect `[updateSettings]` — no `pointercancel` |
| **668-676** | `useLayoutEffect` measuring the header, `[loading, book]` — the only layout effect among the screen's own hooks (`useLayoutMode.ts:74`, `:94`, `useMarks.ts:25`, `useExplanations.ts:36`, `useSharh.ts:23` are passive) |
| 678-682 | `stickyColumn` |
| 686-703 | early returns: loading, no book (every hook is above them) |
| 705-710 | current page meta, active toc node and title |
| 712-750 | the `cardPanel` element: per-kind collapse and delete (`note`, `explanation`, `sharh`, translation; 728-746) |
| 760-763 | root `div` (`flex min-h-full flex-col`), `NoKeyBanner` |
| **764-826** | **the header**: `sticky top-0 z-30`, `ref={headerRef}`; Library link, title, toc title, ج/ص badge, `JumpToPage`, `ReadMarkNav`, Contents, Search, Share (`shareButtonRef`), Show/Hide cards |
| 828-845 | importing notice; translator notice |
| **847-888** | **ḥadīth bars**: sharḥ notice (847-860), batch proposal (862-874), batch running (876-882), sharḥ busy (884-888) — contiguous |
| 890-1014 | columns: rail spacer (895-899), `BlockList` with 21 props (901-953), search column (955-967), divider + `aside` (969-992, `onPointerDown` 972-975), collapsed edge tab (998-1013) |
| 1016-1033 | the bottom sheet (`sticky bottom-0 z-30`), handle counting `translator.cards.length` (1025) |
| **1035-1229** | **the sheets**: `SelectionRail` (1035-1083), `BiographySheet` (1085-1091), `DictionarySheet` (1093-1117), `MarginMenu` (1119-1155), `EntitySheet` (1157-1190), `CardPopover` (1192-1205), `ShareChapter` (1207-1217, reads `shareButtonRef.current` during render), `TocDrawer` (1219-1229) |
| 1234-1275 | `ReadMarkNav` |
| 1277-1281 | `blockElementFor` |
| 1283-1302 | `NoKeyBanner` |
| 1304-1349 | `JumpToPage` (own state: volume, page) |

**Effect order on mount.** While `loading` the tree below the screen is a
spinner, so the screen's own effects run first, in declaration order: those
inside `useDebounced`, `useTranslator` (`listCards`, `useTranslator.ts:66-68`),
`useMarks`, `useExplanations`, `useSharh`; then `loadDictionary` (238), the
focus listener (305), the load (313), entities (346), restore (364), persist
(375), biography availability (404), `selectionchange` (421), `dblclick`
(460), keydown (634), divider (650). The storage requests they issue go out in
that order. The layout effect (668) runs before all of them in each commit.

**Refs shared between parts.** `listRef` (115): written by `BlockList`'s
`useImperativeHandle` (`BlockList.tsx:338-350`), read by restore (369),
`jumpToBlock` (531), `jumpToPage` (542), `ReadMarkNav`'s jump (805).
`headerRef` (122): attached to the header (765), read by the layout effect.
`shareButtonRef` (125): attached in the header (814), read by the sheets
during render (1207, 1214). `dragging` (649): written by the divider's
`onPointerDown` (973), read by the window listeners.

**Callbacks whose identity matters.** `BlockList` keeps its rows' handlers
stable through a `latest` ref (`BlockList.tsx:376-395`), so the screen's
callbacks may change identity without re-rendering rows. `onVisibleBlockChange`
and `onVisibleRangeChange` are state setters (946-947), stable. Every sheet's
`onClose` is an inline arrow, new on each render (1089, 1098, 1153, 1168,
1199, 1215, 1223), and `AnchoredPanel` re-registers its outside-tap listener
whenever `onClose` changes (`AnchoredPanel.tsx:107-131`, deps `:131`) — so how
often the screen renders decides how often that happens (FOUND_ISSUES draft
I). A part that rendered less often than the screen would change it.

### 3. `EntitySheet.tsx`

| Lines | What |
| --- | --- |
| 1-47 | imports |
| 49 | "The sheet that opens when a verse or ḥadīth is tapped." |
| 51-64 | "A verse sheet is a tabbed reference view" (the Qurʾān sheet's design) |
| 66 | `type TabId` |
| 68-77 | `Diagnostic` (used by the ḥadīth sheet only, 726-735) |
| 79-98 | `EntitySheet`: `entity.type === 'quran' ? <QuranSheet {...props}/> : <HadithSheet {...props}/>` |
| 102-113 | `interface QuranSheetData` (read by `QuranSheet` and `CompileTab`) |
| 115-310 | `QuranSheet`: one effect (133-189, 6 deps), `tabs` memo, `AnchoredPanel` with `preferSheet` |
| 312-455 | `CompileTab`: one effect (347-356), `run` |
| 457-756 | `HadithSheet` (ḥadīth-only): two effects (499-507, 509-540), dorar gradings, sunnah.com, sharḥ buttons, "Translate all…", diagnostics |

The three are already separate components. A switch between a verse and a
ḥadīth remounts (different types at one position); two taps on entities of
one type cannot reuse a sheet, because the first sheet's outside-tap handler
(`AnchoredPanel.tsx:107-111`) closes it on the second tap's `pointerdown`,
before its `click` opens the next.

### 4. `SettingsScreen.tsx`

| Lines | What | U capture (both sizes) |
| --- | --- | --- |
| 30-68 | `SettingsScreen`: the list of 21 sections | `settings` |
| 70-86 | local `Section` (title, description, body inside `SettingsSection`), used by the seven below | — |
| 88-106 | `CatalogSection` | `settings--add-from-catalog` |
| 108-191 | `TranslationSection` | `settings--translation`, `settings--translation--claude` |
| 193-215 | `KeysSection` | `settings--api-keys` |
| 217-305 | `TestState`, `ProviderKeyField` | (inside `settings--api-keys`) |
| 307-343 | `SunnahKeyField` (ḥadīth: the sunnah.com key) | (inside `settings--api-keys`) |
| 345-403 | `ReadingSection` | `settings--reading` |
| 405-438 | `DisplaySection` | `settings--display` |
| 440-517 | `QuranSection` (one effect, 445-449) | `settings--qur-an-translation` |
| 519-608 | `BackupSection` (calls `exportWork`/`importWork`) | `settings--work-backup` |

Every inline section is already a component, so moving one to a file
changes no React tree. U captures each one's DOM and screenshot
(`verify-markup.mjs:578-590`).

### 5. `BlockList.tsx`

| Lines | What |
| --- | --- |
| 25-48 | header comment (the document scrolls) |
| 50-54 | `OVERSCAN = 200` |
| 55-61 | margin layout comment (the gutters of `BlockRow`) |
| 63-72 | `TYPE_CLASS` |
| 74-91 | `TYPE_CHROME`, "Keep in step with TYPE_CLASS" |
| 93-136 | `BlockListHandle`, props, `pageIndexOf` |
| 171-192 | `scrollMargin` layout effect `[]` (the screen root's `ResizeObserver`) |
| 252-264 | `columnWidth` layout effect `[]` |
| 266-280 | `estimateTextHeight`, `useCallback [columnWidth, fontSize, lineHeight]`, the 0.43 em per character |
| 282-299 | `useWindowVirtualizer`; `estimateSize` an inline `useCallback` `[blocks, estimateTextHeight]` adding `TYPE_CHROME` (286-294) |
| 303-336 | `settleOn`, `useCallback [topInset, virtualizer]`: `scrollToIndex`, two `requestAnimationFrame`s, `listRef.current?.querySelector` **read inside the frame**, up to 8 attempts, 4 px |
| 338-350 | `useImperativeHandle(handleRef, …, [blocks, settleOn])` |
| 352-374 | visible block and range effects |
| 376-395 | stable row handlers through `latest` |
| 397-449 | render (`intrinsicHeight={Math.round(estimateTextHeight(block))}`, 437) |
| 451-585 | `BlockRow` (`memo`; reads `TYPE_CLASS`, 554) |
| 587-691 | `MarginTarget` (tap/hold, 480 ms, 8 px) |
| 693-728 | `CardMarkerDot` |

### 6. `useTranslator.ts`

`translate` (170-376) is one 200-line callback with 11 deps. In order: pick
provider and model, key check and notice (180-193); `cacheKeyFor` (195-205);
cache hit (207-213); `blocksInRange`, `contextAround`, `knownReferencesIn`
(215-223); the loading card, `newId('card')`, `Date.now()` (225-247);
`upsert`, `setBusy`, `setNotice`, `beginActivity` (251-256); offline:
`runOffline` (already named, 82-137), `putCard`, stats (259-272); cloud: the
`TranslationRequest` literal (274-293), `coverageOf` (298), the finished card
with `await enrichSegments` inside the literal (300-317), `putCard`, stats
(322-331); failure: the `TranslationError` and failed card (334-352);
`finally`: `endActivity`, `setBusy(false)`, the streaming entry removed
(353-361). `SessionStats`/`EMPTY_STATS` (40-55) are the `Record<ProviderId,
number>` RESTRUCTURE §2 names; they stay. `digDeeper` (32, 173, 246, 289,
381) has no caller left in `src/` (FOUND_ISSUES draft K).

### 7. What the checks cover today

| | ReaderScreen | EntitySheet | BlockList | SettingsScreen | useTranslator |
| --- | --- | --- | --- | --- | --- |
| **S** (`verify-selection.mjs`, 10 checks × 3 profiles) | rail Translate (`withSelection`, `runTranslate`); saved position follows the screen (`:280-293`) | — | pins, `rangeExtractor`, `OVERSCAN` | — | key present, network aborted (`:258`): cache miss, loading card, provider error, failed card stored — anchors and `sourceText` only |
| **R** (`verify-reader-scroll.mjs`, 15 landscape + 13 portrait) | sticky header, `aside` under it or sheet bar at the bottom (`:203-231`); ج/ص Go, Contents, Search jumps (`:262-302`); restore after reload (`:316-328`) | `QuranSheet` opened and following its anchor, **landscape only** (`:234-260`) | `scrollMargin`, estimates (contiguity, `:232`, `:275`, `:302`, `:313`), `settleOn` (every jump), performance report | — | — |
| **U** (`verify-markup.mjs`, 180 files) | `reader-header` (the `<header>` only, `:568-572`); `reader-cards`, `reader-retranslate` (the card panel, `:650-664`) | — | no capture shows the blocks (the header and the panel only) | **all seven inline sections** and the whole column | — |
| **Q** (`verify-requests.ts`) | — | — | — | — | **nothing**: Q calls the providers with hand-built `TranslationRequest`s (`:746-891`) and pins `cacheKeyFor` alone; the hook, a React hook over `useApp`, never runs |
| **D** | — | — | — | the adapter's `exportWork`/`importWork`, not the section | — |

Not exercised by any check: the divider; Ctrl+`\`, Show/Hide cards and the
edge tab; opening and closing the bottom sheet; a marker tap (panel or
popover); a card tap jumping the text (`focusCard`); `ReadMarkNav`;
double-tap; the rail's other actions; `DictionarySheet`, the gloss states;
`BiographySheet`; `HadithSheet`; `CompileTab`; the Qurʾān sheet's other tabs;
`MarginMenu`; `CardPopover`; `ShareChapter`; `TocDrawer`'s markup; the notices
and ḥadīth bars; `NoKeyBanner`; the read-only (shared) view; the translate
pipeline's request, cache hit, retranslate, external lookup, batch; the
offline path.

**R's hang.** In 4n a first R run right after U and S hung about 25 minutes at
its last step (the portrait restore after reload) with the CPU idle and was
killed; alone it passed with the same bundle (PROGRESS, 4n). R's
`page.evaluate` calls carry no timeout (e.g. `placement`, `topBlock`,
`verify-reader-scroll.mjs:102-133`), so a page that stops answering waits
forever.

### 8. Ḥadīth-only UI (the book-kinds constraint)

| Where | What |
| --- | --- |
| `EntitySheet.tsx:457-756` | `HadithSheet`: dorar gradings, sunnah.com English, one button per imported commentary (`commentaryWorks`), "Translate all…", diagnostics |
| `ReaderScreen.tsx:164-165`, `:174-193` | `useSharh`, `useBatchTranslate`, the batch proposal (`commentaryRange`) |
| `ReaderScreen.tsx:847-888` | sharḥ notice, batch proposal and running bars, sharḥ busy |
| `ReaderScreen.tsx:1152`, `MarginMenu.tsx:96-100` | margin menu "Translate all…" |
| `ReaderScreen.tsx:1176-1188` | the entity sheet's `onSharh`, `onTranslateAll` |
| `ReaderScreen.tsx:728-746`, `CardPanel.tsx:177-194` | the `sharh` card kind's collapse, delete and view |
| `ReaderScreen.tsx:925-931`, `:404-419` | narrator/person entities → `BiographySheet` (rijāl; also used for general names) |
| `useTranslator.ts:88-94`, `:285-287` | the offline ḥadīth cache; `hadithNumbers` in the request |
| `SettingsScreen.tsx:307-343` | the sunnah.com key field |

### 9. Layers

`node scripts/check-layers.mjs` at `9afb2c7`: 169 files, 134 directory edges,
no cycle, no mutual pair, no file-level cycle, 11 rules hold. `unitOf` folds
`ui/x/y/…` into `ui/x` (`check-layers.mjs:28`, `:47-52`), so a file or
subfolder in `ui/reader` or `ui/settings` adds no unit. File-level cycles
count **type-only** imports too (`:150-152`) and fail `--check` (`:214`).

## Design

### 1. The checks first, on the old code (5a–5c)

Every addition is recorded on the old code, in its own commit, before the
step it guards (RESTRUCTURE §3 rule 7), and each is proven by a deliberate
breakage in a scratch copy that is not committed (as Phase 4 did for D).

**1.1 U — new reader captures (5a).** Added to `verify-markup.mjs` after the
3b lines, in the plain build at both sizes, each in a fresh context, from
**new seeding options** so no existing capture's database changes (the 3b
pattern: `seedCards`, `verify-markup.mjs:274-301`, `:650-664`). The commit's
manifest diff must show the existing 180 lines untouched.

The new option `reader: true` writes, into that context only: the book row
with `nameIndexSize: 0` (so `ensureEntities` keeps seeded entities rather
than regenerating them, `quran/entityService.ts:101-103`), one block whose
text is a verse (14:7, as R's `VERSE`, `verify-reader-scroll.mjs:30-31`), a
`hadith_matn` block followed by two `sharh` blocks, and `entities` rows for a
Qurʾān, a ḥadīth and a narrator entity on them; three `read` block marks; one
`wordGlosses` row for one word; `compileEnabled: true` in settings for the
compile capture only. All synthetic, as the existing seed.

| Capture | Reached by | Shows (the part it guards) |
| --- | --- | --- |
| `reader-page` | open the book (no key: the banner shows) | the whole body: `NoKeyBanner`, header, rail spacer, columns, `aside` + divider (960) or sheet bar (600) — every part's placement |
| `reader-collapsed` (960) | tap Hide cards | the edge tab with its count |
| `reader-sheet-open` (600) | tap the sheet handle | the sheet as a page, not only the panel (`reader-cards` captures the panel) |
| `reader-quran` | tap the verse | `QuranSheet`, Translation tab (bundled English: quran.com is aborted) |
| `reader-quran-similar` | then the Similar tab, if the seeded matching-ayah resource gives one; otherwise the first non-Translation tab, or written up as not reachable | a QUL tab, `preferSheet` |
| `reader-quran-compiled` | `compileEnabled`, Compiled tab | `CompileTab`, blocked ("No gemini API key is set. Add one in Settings.") |
| `reader-hadith` | tap the ḥadīth | `HadithSheet` after its lookups fail (aborted): "No grading found", the honest-English note, footer buttons |
| `reader-hadith-diagnostics` | then Show dorar diagnostics | `Diagnostic` rows (Chromium's own error text; stable for one Chromium) |
| `reader-biography` | tap the narrator | `BiographySheet` |
| `reader-rail` | select one word | `SelectionRail` with Meaning |
| `reader-meaning` | rail → Meaning (no key) | `DictionarySheet` with the gloss error |
| `reader-meaning-cached` | select the seeded word → Meaning | the gloss ready state |
| `reader-margin-menu` | long-press the matn's margin (pointer down, 600 ms) | `MarginMenu`, with Translate all… |
| `reader-batch-proposal` | margin menu → Translate all… | the ḥadīth bars: `BatchProposal` |
| `reader-notice` | select, rail → Translate (no key) | the translator notice |
| `reader-popover` (600) | with `cards: true`, tap a margin marker | `CardPopover` |
| `reader-toc` | tap Contents | `TocDrawer` |
| `reader-search` | Search, type a word, results | the search column |
| `reader-share` | tap Share | `ShareChapter`'s dialog |

The dictionary (a book with `role: 'dictionary'`) is not seeded here: the
double-tap path is R's (§1.2), and `reader-rail` shows the rail without the
Dictionary action — written in the script's "Not captured" list with the
reason, like every state that cannot be reached here: the sharḥ notice and
busy bar (they need an imported commentary's search), a running batch (needs
answered translations; P covers it), `reader-quran-compiled` with a key, the
read-only view (needs a real encrypted share bundle).

**1.2 R — new scenarios (5b).** Assertions, as R's 28 are, in
`verify-reader-scroll.mjs`, in **a new browser context per profile after the
existing run**, with their own seeded book (R's 1,500 blocks plus three
`read` marks, two translation cards and a small synthetic dictionary book),
so the existing 28 checks and the performance report run on exactly today's
page. (Seeding cards or marks into the existing book would add marker and
band nodes and move the 1,905/1,904 DOM-node baseline.)

| Scenario | Profile | Checks |
| --- | --- | --- |
| divider, pointer drag | landscape | after dragging the divider 120 px left with `page.mouse`: the `aside` is wider by the drag (within the clamp), `settings.panelWidth` in IndexedDB equals the new width, `document.body.style.userSelect` is `''` again |
| divider, finger drag | landscape | **reported, not judged** (like the performance report): a touch drag through CDP `Input.dispatchTouchEvent` — the width change and `userSelect` after. It records what Chromium's emulation does with today's code (FOUND_ISSUES draft B); PROGRESS keeps the line, and every later step must print the same |
| Ctrl+`\` | landscape | the `aside` goes and the edge tab appears; again, it comes back; the setting is persisted |
| Hide cards / edge tab | landscape | the header button hides the panel, the edge tab shows it, the width is what it was |
| the sheet | portrait | the handle opens a 55 vh sheet and closes it; the page does not scroll |
| marker → panel | landscape | tapping a marker makes its card the active one and flashes the block (`bg-amber-100/70`), cleared after 1.6 s |
| marker → popover | portrait | tapping a marker opens `CardPopover` |
| card → text | landscape | tapping a card in the panel brings its block to the middle of the screen (the search check's tolerance) and flashes it |
| read-mark jumps | both | the counter says 3; ↓ twice and ↑ once land each target in the middle |
| double-tap | both | `dblclick` on a word opens the dictionary sheet and leaves the selection collapsed |
| position, once | landscape | after the restore, a jump elsewhere is not undone by a second restore (`restoredRef`) |

Each scenario is first run against a scratch copy with the code it guards
broken (the divider effect removed, `flash` made a no-op, `restoredRef` not
set, the keyboard effect's key changed, the double-tap effect removed) and
must fail there.

**1.3 S — no change.** S already drives `withSelection` → `runTranslate` →
`translate` on three profiles. Its anchors-only assertions are not enough
for useTranslator's steps; P is (§1.4).

**1.4 P — the translate pipeline, recorded (5c).** Q pins what the providers
send for hand-built requests; nothing pins how the reader builds those
requests, the cards it stores, or the order of its steps. A new
`scripts/verify-translate.mjs`, `npm run verify:translate` = `vite build
--logLevel warn && node scripts/verify-translate.mjs`, compares a normalized
record with the committed `docs/refactor/phase5/translate.json`.

- Chromium, 960×600 touch, en-US, UTC, service workers blocked, `page.clock`
  fixed and `Math.random` seeded (as D, so `newId('card')` and `createdAt`
  come out the same); a fake Gemini key (`AIza-p-check-…`) in `localStorage`
  under `services/secrets.ts`' name. The book is S's kind of synthetic book
  plus a verse block, a `hadith_matn` block with two `sharh` blocks, and the
  entities on them.
- `generativelanguage.googleapis.com` is answered with canned responses
  shaped as Q's Gemini success, truncated and error bodies (copied, since an
  `.mjs` cannot import `verify-requests.ts`); every other off-origin request
  is aborted, so enrichment fails the same way each run.
- **Recorded per scenario:** every request to the model host (method, URL,
  headers except the fake key's value, which is asserted to appear only in
  its header, and the JSON body); every `cards` row afterwards, in key
  order; the notice text; the panel's session line (`CardPanel`'s stats).

| Scenario | Through |
| --- | --- |
| `no-key` | key removed; rail → Translate: notice, no request, no card |
| `translate` | select across three blocks (one a verse) → Translate: one request; the complete card; stats 1 request |
| `cache-hit` | the same selection again: no request; the same card |
| `retranslate` | the card's Retranslate → Same provider and model: the old card deleted, `force`, one request |
| `external-lookup` | a profile with `allowExternalLookup`: the request's flag and the card's `usedExternalLookup` (the only way left to reach that branch, FOUND_ISSUES draft K) |
| `error` | a 400: the failed card (`status`, `error`, `errorKind`, `rawResponse`) |
| `block` | the verse sheet's "Translate the surrounding passage" (`runTranslateBlock`) |
| `batch` | margin menu on the matn → Translate all… → Start: the proposal's estimate text, then one request per range block, in order (`useBatchTranslate` → `translate`) |
| `transliteration` | a profile with `useTransliteration`: the system prompt carries `TRANSLITERATION_INSTRUCTION` |

**Not covered, and said in its header:** the Claude provider in the browser
(its requests are Q's; the hook is provider-blind, `useTranslator.ts:24-25`);
the offline path (`runOffline` downloads a model; it does not move, §7);
`addGlossaryTerm` (a `window.prompt`). Five breakages proven in a scratch
copy: `contextBefore` joined with `\n`; the cache check skipped when not
forced; `TRANSLITERATION_INSTRUCTION` dropped; stats not incremented;
`errorKind` dropped. Two clean runs identical.

**1.5 How the Playwright checks run.** R first and on its own, under a wall
clock: `timeout 1200 npm run verify:reader`; then S, U and P. A hang is
killed and R re-run once alone; both runs are recorded. A second hang stops
the step until the cause is found — two in a row are not a flake. R's script
is not changed for this (Q2).

### 2. Allowed adaptations

RESTRUCTURE §3 rule 4 allows (a) import paths, (b) `export` added, (c) a moved
file's true header, (d) a named re-export. Phase 4 added a fifth, (e), the
`handle` fetcher. This phase needs these, and nothing else; each needs the
owner's yes (Q3):

- **(f) Free names become same-named props or parameters.** A moved JSX
  subtree or hook body keeps its text. Each name it used from the enclosing
  component becomes a destructured prop (a part) or a field of the one
  object parameter (a hook) **with the same name**, and the call site passes
  it as `name={name}` or `{ name }`. Objects are passed whole (`settings`,
  `marks`, `translator`, `explanations`, `sharh`, `batch`), never picked
  apart, so `settings.panelCollapsed` and `marks.readPositions` stay as
  written.
- **(g) A hook returns what the component reads.** One `return { … }` at
  the end of a moved hook, and one destructuring at the call site, the names
  unchanged.
- **(h) The call site takes the place of the first moved statement.** A hook
  is called where its first hook call was; a part is rendered where its
  subtree was; the condition around a subtree stays inside the part, so the
  part is rendered unconditionally and its children mount and unmount as
  today.
- **(i) Props and parameter types** are new declarations — types only, no
  logic — using `ReturnType<typeof useTranslator>` and the like rather than
  restating shapes.
- **(j) A callback body becomes a call.** For `BlockList` only:
  `estimateTextHeight` and `settleOn` stay `useCallback`s in `BlockList`
  with **the same deps**, their bodies a single call to the moved function,
  which takes what the body closed over (`columnWidth`, `fontSize`,
  `lineHeight`; `virtualizer`, `listRef`, `topInset`). `listRef` is passed as
  the ref object and its `.current` read where it is read today, inside the
  second animation frame — Phase 4's lesson (its correction 1): a moved
  function must keep when it reads its inputs, or its behaviour before they
  exist changes.
- **(k) A statement run becomes a named function** (useTranslator only,
  Q12): a run of statements or one expression that computes a value without
  side effects is moved verbatim into a function in `translationSteps.ts`,
  its free names its parameters, and replaced by one call at the same place.
  Calls that write (`upsert`, `set*`, `storage.*`, `beginActivity`), every
  `await`, `newId` and `Date.now` stay in `translate` in their order, except
  where the moved expression already contained them (the loading card
  literal's `newId('card')` and `Date.now()`), and then the call is where the
  literal was.
- **(l) A split comment.** `EntitySheet.tsx:49` stays above the dispatcher;
  `:51-64` move with `QuranSheet`. Both halves verbatim.

Not allowed: a renamed symbol other than (j)'s module function names, a
reordered statement, a new `useMemo`/`useCallback`/`memo`, a `key`, a wrapper
element, a context, a part calling `useApp()` or `useReadOnly()` for a value
its parent already has.

### 3. `SettingsScreen` (5d1–5d8)

Each inline section moves whole into `ui/settings/<Name>.tsx`, the name its
function has, with the comment above it; `SettingsScreen` imports it. The
local `Section` moves first, to `ui/settings/Section.tsx`, exported, since
all seven use it (Q5). `KeysSection.tsx` takes `TestState`,
`ProviderKeyField` and `SunnahKeyField` with it, its private parts. After
5d8 `SettingsScreen.tsx` is its imports and the list (30-68), about 70
lines, and adding a section is one file and one line, as RESTRUCTURE §2 says.

No React tree changes: each function is already a component rendered at the
same place. U shows each section's DOM and screenshot. D runs once at 5d8,
because `BackupSection` is the caller of `exportWork`/`importWork` and
writes the bytes D's harness mimics (`verify-storage-harness.ts:901`); its
body is verbatim, so D cannot change, but it is the step to show it.

### 4. `EntitySheet` (5e1–5e4)

Order chosen so no step makes a file-level cycle, which `--check` fails even
for type-only imports (Current state §9):

1. **5e1** `HadithSheet` and `Diagnostic` → `HadithSheet.tsx`. Nothing else
   uses `Diagnostic`.
2. **5e2** `QuranSheetData` → `quranSheetData.ts`, exported, type only. Both
   `QuranSheet` and `CompileTab` read it; if it went with either, the other
   would import its type from a file that imports it back. B: the JS must be
   identical after masking (`compare-bundles.mjs`).
3. **5e3** `CompileTab` → `CompileTab.tsx`.
4. **5e4** `QuranSheet`, `TabId` and the comment `:51-64` → `QuranSheet.tsx`.

`EntitySheet.tsx` keeps its props and the dispatch (79-98), the line `:49`,
and its imports: about 55 lines. React output identical: the same component
functions render at the same positions. U's new `reader-quran*` and
`reader-hadith*` captures and R's popover check show it.

### 5. `BlockList` (5f1–5f3)

**5f1** `TYPE_CLASS` (63-72) and `TYPE_CHROME` (74-91) with their comments,
and the text-height estimate as `textHeightFor(block, columnWidth, fontSize,
lineHeight)` with its comment and the 0.43 em (266-280), → `blockLayout.ts`.
They go together because `TYPE_CHROME` must equal `TYPE_CLASS`'s margins
(trap 7, T-g): one file keeps "Keep in step with TYPE_CLASS" true. In
`BlockList`, `const estimateTextHeight = useCallback((block: Block) =>
textHeightFor(block, columnWidth, fontSize, lineHeight), [columnWidth,
fontSize, lineHeight]);` — the same deps, so `estimateSize`'s inline
`useCallback` (286-294), `intrinsicHeight` (437) and every number are
unchanged. The margin comment (55-61) stays: it describes `BlockRow`'s
gutters. Tailwind v4 scans every source file, so the class strings moving
files changes no CSS; B compares the CSS bytes.

**5f2** `settleOn`'s body → `settleOn(virtualizer, listRef, topInset, index,
align)` in `blockLayout.ts` (Q8 names), with its comment; the `useCallback`
stays with `[topInset, virtualizer]`. `useImperativeHandle`'s deps (349) and
the handle's identity are unchanged. Every jump R makes runs it.

**5f3** *(Q8)* `BlockRow`, `MarginTarget`, `CardMarkerDot` (451-728) →
`BlockRow.tsx`. `memo` is evaluated once at module load in either file, so
the memoized component's identity is as stable as today. `BlockList.tsx`
falls to about 370 lines; without 5f3 it is about 650 and needs a reason at
its top.

### 6. `ReaderScreen` (5g1–5g5 hooks, 5h1–5h4 parts)

**6.1 Hooks**, each one contiguous region, called at its first statement's
place (adaptation (h)), so the screen's effect order and its storage
requests' order do not change:

| Step | Hook, file | Moves | Takes | Returns |
| --- | --- | --- | --- | --- |
| 5g1 | `useWordLookup`, `useWordLookup.ts` (the row's "gloss") | 200-254 | `storage` | `dictionary`, `lookup`, `setLookup`, `gloss`, `setGloss`, `requestGloss`, `lookUpWord` |
| 5g2 | `useReadingPosition`, `useReadingPosition.ts` | 363-385, and `restoredRef` (124) | `storage`, `bookId`, `loading`, `blocks`, `visibleBlock`, `listRef` | nothing |
| 5g3 | `useReaderNavigation`, `useReaderNavigation.ts` | 520-553, and `flashBlockId` (101) | `blocks`, `listRef`, `setActiveCardId` | `flashBlockId`, `flash`, `jumpToBlock`, `jumpToPage`, `focusCard` |
| 5g4 | `usePanelControls`, `usePanelControls.ts` (the row's "panel divider") | 627-666: the Ctrl+`\` effect and the divider | `settings`, `updateSettings` | `dragging` |
| 5g5 | *(Q9)* `useHeaderHeight`, `useHeaderHeight.ts` | 668-676, and `headerRef`, `headerHeight` (117-123) | `loading`, `book` | `headerRef`, `headerHeight` |

What moves relative to the rest: only `useState`/`useRef` calls —
`flashBlockId` from 101 to 520, `restoredRef` from 124 to 363,
`headerRef`/`headerHeight` from 122 to 668. They have no effects, and React's
hook order is fixed per build, so this is not observable. 5g5's layout
effect stays at its place; it is the screen's only one. The divider's JSX
(972-975) is unchanged because the hook returns the ref it writes (Q9). Two
hooks read refs: `listRef` is read inside the restore's animation frame and
inside the jumps, never at call time; `restoredRef` is the hook's own.

**6.2 Parts.**

| Step | Component, file | Moves | Notes |
| --- | --- | --- | --- |
| 5h1 | `ReaderHeader`, `ReaderHeader.tsx` | the `<header>` (764-826), `JumpToPage` (1304-1349), `ReadMarkNav` (1234-1275) | `ref={headerRef}` stays on the `<header>`; `headerRef` and `shareButtonRef` are props of those names (not `ref`), like `BlockList`'s `handleRef` |
| 5h2 | *(Q10)* `CommentaryBars`, `CommentaryBars.tsx` | 847-888: sharḥ notice, batch proposal, batch running, sharḥ busy | the ḥadīth bars, one named component (Design §8); a `Fragment` of the four conditionals |
| 5h3 | `ReaderSheets`, `ReaderSheets.tsx` (the row's "sheets host") | 1035-1229, and `blockElementFor` (1277-1281) | a `Fragment` of the eight conditionals; about 40 same-name props |
| 5h4 | *(Q10)* `ReaderCardPanel`, `ReaderCardPanel.tsx` | the `cardPanel` element's `CardPanel` (712-750) | the per-kind collapse and delete in one named place (the "card kinds" of Design §8); `const cardPanel = <ReaderCardPanel … />` keeps the two places it is rendered (989, 1029) |

**6.3 Props, not a context** (Q10). Every part gets its inputs as props with
the names they have in the screen (adaptation (f)). The reviewer checks that
every prop is `x={x}`: a swapped pair of same-typed callbacks is the one
mistake `tsc` would not see, and U, R and P are what would. A
`ReaderContext` was considered and rejected: it is a new pattern in the app;
its value object would be new on every render, so every consumer re-renders
anyway; and a diff of `useContext` reads is harder to check against the moved
text than a props list. One object prop (`reader={…}`) was rejected for the
same reason.

**6.4 When a part can change the DOM or behaviour, and when not.** A part
adds a component between the screen and the subtree. The DOM cannot change
when the subtree's text is the same, it is returned as is (a `Fragment` for
siblings, never a wrapper), at the same position, under the same conditions:
React emits the same elements. U shows it. Behaviour can change in these
ways, each named so the reviewer looks for it:

- **Mount and unmount.** A part rendered under a different condition than
  its subtree had would mount or unmount its children at different times.
  Adaptation (h) keeps every condition inside the part, and the parts are
  rendered whenever the book is loaded. Of the parts' descendants only
  `JumpToPage` has state of its own at this level, and the header is always
  mounted once loaded.
- **Render frequency.** The parts are not memoized, so they render exactly
  when the screen does; the sheets' inline `onClose`s, and so
  `AnchoredPanel`'s re-registration (FOUND_ISSUES draft I), keep today's
  rhythm. A `memo` here would change it.
- **Effects.** No part has an effect of its own. Their descendants' effects
  (`AnchoredPanel`, `CardPanel`, `SelectionRail`) were descendants before; a
  child's effects run before its parent's either way.
- **Refs during render.** `ShareChapter`'s `anchor={shareButtonRef.current}`
  (1214) is read in the host's render, in the same render pass as before, so
  it sees the same value.
- **Keys.** None added. `BlockList` stays in the screen, so the virtualizer,
  `scrollMargin` and the rows are not touched by any part step.

**6.5 What stays in the screen, and why.** State shared by the header, the
columns and the sheets (75-113, 125-143), the five domain hooks (161-165),
`proposeBatch`, notes, `hasKey`, the data loading, selection tracking and
double-tap, the translate callbacks, the marker memos and
`handleMarkerClick`, the columns and the bottom sheet. Two candidates are
left on purpose:

- **Data loading** (75-79, 109, 313-361). `blocks` and `entities` are needed
  by `useTranslator` at 161, so a hook holding them would be called before
  161 and its two effects would run before the translator's, marks' and
  dictionary's — the storage requests' order on every open would change. Not
  structure only.
- **Selection tracking** (85-90, 389-400, 421-487). Not in the row; its doc
  comment sits above the wrong effect (FOUND_ISSUES draft E), and moving the
  hook would mean moving the comment off the effect it is attached to.

**Size.** After 5g1–5h4 the screen is about 750-850 lines (measured at each
step): the shared state with its long comments, the columns' JSX, and about
80 lines of props passed to the parts. RESTRUCTURE §2 asks for a reason at
the top of a file over ~500 lines; 5h4 (or the last part step done) adds it
— the screen owns the state its parts share, and splitting further needs a
context (Q11).

### 7. `useTranslator` (5i1–5i3, Q12)

`ui/reader/translationSteps.ts`, pure functions, each a verbatim expression
or statement run from `translate` (adaptation (k)):

| Step | Function | From |
| --- | --- | --- |
| 5i1 | `passageFor(blocks, entities, anchor)` → `{ selected, before, after, known }` | 215-223 |
| 5i1 | `translationRequestFor(…)` → the `TranslationRequest` | the literal 275-290 |
| 5i2 | `loadingCard(…)` → the card | the literal 225-247 (with its `newId('card')` and `Date.now()`, at the same place) |
| 5i2 | `failedCard(card, caught)` | 335-349 |
| 5i3 | `withOfflineRequest(previous)`, `withCloudRequest(previous, useProviderId, result)` | the updaters 263-270, 322-331 |
| 5i3 | `withoutStream(previous, cardId)` | 356-360 |

What stays in `translate`, in order: the provider choice and key check with
its `setNotice`; **both `cacheKeyFor` calls** (`translate`'s and `isStale`'s,
untouched — trap 5); the cache read; `upsert`, `setBusy`, `setNotice`,
`beginActivity`; the offline branch; the provider call; `coverageOf`; the
finished card literal with its `await enrichSegments` (an `await` inside a
literal, so it is not moved); `putCard`s; `finally`. `runOffline`, already a
named function, does not move. `SessionStats` and `EMPTY_STATS` stay, so
RESTRUCTURE §2's "request counts in `useTranslator.ts`" stays true.
`translate`'s deps array is unchanged (the functions are module-level). P is
the check; S also runs it; Q is run as a sanity check that no provider code
changed.

The file is 466 lines today, under RESTRUCTURE §2's ~500; this part is for
reading the steps, not for size, and is the one part of the phase that is
not a whole-thing move. The owner may drop it (Q12).

### 8. Ḥadīth-only UI behind names (the book-kinds constraint)

After the phase, the ḥadīth-only UI of Current state §8 sits behind these
names, which a later genre descriptor can leave out without editing the
screen's body:

- `HadithSheet` (5e1) — the ḥadīth sheet, dispatched by `EntitySheet`;
- `CommentaryBars` (5h2) — the sharḥ and batch bars;
- `ReaderCardPanel` (5h4) — the one place card kinds are dispatched for
  collapse and delete; `CardPanel.tsx:177-194` dispatches their views;
- `SunnahKeyField` — inside `KeysSection.tsx` (5d4), a named component
  already.

Left as they are, and named here for 5b: `useSharh`, `useBatchTranslate` and
`proposeBatch` in the screen; `MarginMenu`'s "Translate all…"
(`MarginMenu.tsx:96-100`), which a genre would hide by not passing
`onTranslateAll`; the narrator entity's route to `BiographySheet`
(925-931). No switch on `StructureProfile` is added.

### 9. For FOUND_ISSUES (written in 5a, left)

- **A. "Translate this entry" stores a card under the visible block's key.**
  `onTranslateEntry` (`ReaderScreen.tsx:1102-1115`) anchors the dictionary
  entry's text (`DictionarySheet.tsx:42`, `:79`) on the whole visible block.
  The cache key is built from the anchor's ids and offsets, not the text
  (`useTranslator.ts:195-205`), and is looked up before anything else
  (`:207-213`). So translating that whole block later returns the dictionary
  entry's card, and if the block was translated whole before, "Translate this
  entry" returns the block's card. The card also sits on the visible block,
  showing an entry's English. By reading. Could put a wrong translation in
  front of a lesson.
- **B. The divider ignores `pointercancel` and has no `touch-action`.**
  `ReaderScreen.tsx:650-666`, `:971-980`. A finger drag the browser takes
  over for panning ends in `pointercancel`, which leaves `dragging` true and
  `body` `user-select: none` until the next `pointerup`. Whether a finger
  drag resizes the panel on the tablet at all is not known; R's touch report
  (5b) shows what Chromium's emulation does, and the tablet (M) is the
  answer. Every `pointermove` also writes the settings row
  (`app/AppContext.tsx:221-227`).
- **C. The sheet handle counts translations only.** `▲ Cards
  (${translator.cards.length})` (`:1025`); the collapsed edge tab counts all
  cards (`:1009`), and the sheet shows notes, explanations and sharḥ cards
  too.
- **D. `busy` is one flag for every translation.** `useTranslator.ts:62`,
  `:252`, `:355`: when two run at once (a manual one during a batch), the
  first to finish clears it, and the rail's Translate
  (`SelectionRail.tsx:128-139`) re-enables while the other runs.
- **E. A detached doc comment.** `ReaderScreen.tsx:389-400` describes the
  `selectionchange` effect (`:421-434`) but sits above the
  biography-availability effect (`:404-419`). Docs.
- **F. The screen is not keyed by book.** `App.tsx:94`,
  `ShareScreen.tsx:146`: a hash change straight from one book to another
  keeps `restoredRef` true (`:124`, `:365`), so the second book's position is
  not restored, and `listCards` (`useTranslator.ts:66-68`) is not cancelled.
  Only reachable by editing the URL.
- **G. A failed work export says "Preparing…" forever.**
  `SettingsScreen.tsx:533-546` has no `try`; its message counts no sharḥ
  cards or glosses (like FOUND_ISSUES 25 for the restore).
- **H. When Meaning is offered.** `meaningAvailable={navigator.onLine ||
  key !== ''}` (`:1043`) offers it offline with a key (fails unless cached)
  and hides it offline without one (where a cached gloss would work,
  `translation/gloss.ts:97-106`). May be intended; unstated.
- **I. Anchored panels re-register their outside tap on every reader
  render.** Inline `onClose`s (`:1089`, `:1098`, `:1168`, `:1199`) change
  each render, and `AnchoredPanel` removes its `pointerdown` listener and
  re-adds it a tick later (`AnchoredPanel.tsx:122-131`); the screen renders
  on each top-block change while scrolling. A tap in that tick is missed.
  Minor; this phase keeps it exactly (Design §6.4).
- **J. Offline translation reads every ḥadīth's cache row, one at a time.**
  `useTranslator.ts:88-94`, for each translation, whatever the selection
  covers. Performance on a large collection.
- **K. `digDeeper` is unreachable.** `TranslateRequest.digDeeper` and
  `retranslate`'s option (`useTranslator.ts:32`, `:173`, `:246`, `:289`,
  `:381-387`) have no caller in `src/`; the card's button was replaced by
  Explain (`TranslationCardView.tsx:229-232`). Dead option, kept by this
  phase.

### 10. Comments and docs made untrue

| Text | Untrue from | Fixed in |
| --- | --- | --- |
| a moved file's own header (QuranSheet's design comment, `blockLayout.ts`, each hook and part) | its step | its step (rule 4 (c)) |
| `ui/kit/SettingsSection.tsx:3-9` "SettingsScreen's local Section" | 5d1 (its "line in SettingsScreen's list" stays true) | 5j |
| `scripts/verify-storage-harness.ts:901` "The bytes SettingsScreen saves" | 5d8 | 5j |
| `quran/quranIndex.ts:427` "in EntitySheet" | 5e3 | 5j |
| CLAUDE.md trap 7 "`TYPE_CHROME` in `BlockList.tsx`", and the map | 5f1 | 5j (applied by the main session, as in 4n) |
| `.claude/agents/torjuman-reader.md` "How the reader works" (`ReaderScreen` composes …, the header, `settleOn`, `TYPE_CHROME`) | 5f1, 5h1 | 5j |
| `.claude/agents/torjuman-reviewer.md:43` (`TYPE_CHROME`) | — (names no file) | — |
| `ui/reader/useAnimatedList.ts:12` "lives in ReaderScreen" | — (`useDebounced`'s call stays in the screen) | — |

README names none of the five files, so it needs no change. PROGRESS notes
each interval (Q13).

## Steps

Ordered by risk: the checks; Settings (already components, fully in U);
the entity sheets (already components); `BlockList`'s pure functions; the
screen's hooks (no tree change); the screen's parts (tree change); then
`useTranslator` (the one part that is not a whole move). One extraction per
commit. Commit message: `Restructure phase 5 step 5xN: <what> to <where>`, a
summary, a `Checks:` paragraph. "All" in the checks column is **T B L R S U X**
(R first, alone: Design §1.5).

| Step | What | Files | Checks | Risk |
| --- | --- | --- | --- | --- |
| 5a | U's reader captures, baselined; FOUND_ISSUES A–K | `scripts/verify-markup.mjs`, `docs/refactor/phase2/markup.sha256` (lines added), FOUND_ISSUES, PROGRESS | U (two runs; existing 180 lines unchanged; breakages); T B unchanged | none for the app |
| 5b | R's new scenarios, baselined | `scripts/verify-reader-scroll.mjs`, RESTRUCTURE §5 R row, PROGRESS | R (28 + new, old report unchanged; breakages) | none |
| 5c | check P, baselined | new `scripts/verify-translate.mjs`, `package.json`, new `docs/refactor/phase5/translate.json`, RESTRUCTURE §5 (P row), CLAUDE.md Commands row | P (two runs; five breakages); T B unchanged | none |
| 5d1 | `Section` → `ui/settings/Section.tsx` | new file; `SettingsScreen.tsx` | all | low |
| 5d2 | `CatalogSection` → its file | new; `SettingsScreen.tsx` | all | low |
| 5d3 | `TranslationSection` | new; `SettingsScreen.tsx` | all | low |
| 5d4 | `KeysSection` with `TestState`, `ProviderKeyField`, `SunnahKeyField` | new; `SettingsScreen.tsx` | all | low |
| 5d5 | `ReadingSection` | new; `SettingsScreen.tsx` | all | low |
| 5d6 | `DisplaySection` | new; `SettingsScreen.tsx` | all | low |
| 5d7 | `QuranSection` | new; `SettingsScreen.tsx` | all | low |
| 5d8 | `BackupSection` | new; `SettingsScreen.tsx` | all, D | low |
| 5e1 | `HadithSheet`, `Diagnostic` → `HadithSheet.tsx` | new; `EntitySheet.tsx` | all | low |
| 5e2 | `QuranSheetData` → `quranSheetData.ts` | new; `EntitySheet.tsx` | all; B identical JS (`compare-bundles`) | none |
| 5e3 | `CompileTab` → `CompileTab.tsx` | new; `EntitySheet.tsx` | all | low |
| 5e4 | `QuranSheet`, `TabId`, comment `:51-64` → `QuranSheet.tsx` | new; `EntitySheet.tsx` | all | low |
| 5f1 | `TYPE_CLASS`, `TYPE_CHROME`, `textHeightFor` → `blockLayout.ts` | new; `BlockList.tsx` | all; CSS bytes identical | low–medium (T-g) |
| 5f2 | `settleOn` → `blockLayout.ts` | `blockLayout.ts`, `BlockList.tsx` | all | medium (every jump) |
| 5f3 | *(Q8)* `BlockRow`, `MarginTarget`, `CardMarkerDot` → `BlockRow.tsx` | new; `BlockList.tsx` | all | low–medium |
| 5g1 | `useWordLookup` | new; screen | all, P | low |
| 5g2 | `useReadingPosition` | new; screen | all, P | low–medium |
| 5g3 | `useReaderNavigation` | new; screen | all, P | low–medium |
| 5g4 | `usePanelControls` | new; screen | all, P | low |
| 5g5 | *(Q9)* `useHeaderHeight` | new; screen | all, P | low–medium (sticky columns) |
| 5h1 | `ReaderHeader` with `JumpToPage`, `ReadMarkNav` | new; screen | all, P | medium |
| 5h2 | *(Q10)* `CommentaryBars` | new; screen | all, P | low |
| 5h3 | `ReaderSheets` with `blockElementFor` | new; screen | all, P | **medium–high** (about 40 props) |
| 5h4 | *(Q10)* `ReaderCardPanel`; the screen's reason at its top | new; screen | all, P | medium |
| 5i1 | *(Q12)* `passageFor`, `translationRequestFor` → `translationSteps.ts` | new; `useTranslator.ts` | all, P, Q | medium |
| 5i2 | *(Q12)* `loadingCard`, `failedCard` | `translationSteps.ts`, `useTranslator.ts` | all, P, Q | medium |
| 5i3 | *(Q12)* the stats and streaming updaters | `translationSteps.ts`, `useTranslator.ts` | all, P, Q | low |
| 5j | docs and comments made true; end-of-phase checks | Design §10's list; RESTRUCTURE status, §5, §6 row; PROGRESS result; the plan's corrections | T B L S R U P Q D; SSR build; X | none |

## Per step

**5a — U.** As Design §1.1. The `torjuman-reader` agent reads this plan and
the new captures before the baseline is committed (Q16). Two runs must give
the same files. Breakages in a scratch copy, each changing named captures: a
class removed from the header (`reader-page`, `reader-header`); a ḥadīth
footer button removed (`reader-hadith`); the compile blocked message
changed (`reader-quran-compiled`); `preferSheet` dropped
(`reader-quran-similar`); the batch bar's text changed
(`reader-batch-proposal`). FOUND_ISSUES A–K are written, each with the line
that shows it.

**5b — R.** As Design §1.2. PROGRESS records the new count, that the first
28 checks and the performance report are as at 4n, and the finger-drag
report's line. The divider's pointer drag is the only check that writes a
setting; it runs last in its context.

**5c — P.** As Design §1.4. The `torjuman-llm` agent reads the plan and the
script before the baseline (as it did for Q). PROGRESS records the run time
and the record's size. Nothing is masked; if two runs differ, only `newId`
ids and timestamps may be masked, named in the record's header.

**5d1–5d8 — Settings.** Each a cut and paste plus an import; the moved text
byte-identical (`git diff --color-moved` shows it). `ReactNode`, `useEffect`,
`useRef`, `useState` imports leave `SettingsScreen.tsx` as their last users
go. 5d1: the kit's comment (`ui/kit/SettingsSection.tsx:3-9`) becomes untrue
here — Design §10. 5d8: D.

**5e1–5e4 — entity sheets.** As Design §4. 5e2's B is the identical-JS check.
After 5e3, `quran/quranIndex.ts:427` is untrue — Design §10. R's popover check
and U's `reader-quran*` at 5e3–5e4.

**5f1–5f3 — `BlockList`.** As Design §5. 5f1 makes trap 7's "`TYPE_CHROME`
in `BlockList.tsx`" (CLAUDE.md) and the reader agent's map untrue — Design
§10. The reviewer checks that the `useCallback` deps are character for
character today's, and that `listRef.current` is read inside the second
frame. R's contiguity and every jump; the performance report.

**5g1–5g5 — hooks.** As Design §6.1. For each: the moved region is one
contiguous block (the diff shows a single hunk out of the screen); the call
is where its first line was; the deps arrays are unchanged; nothing returned
is wrapped anew. 5g2: R's restore and "position, once"; S's position check.
5g3: R's jumps, marker and card scenarios. 5g4: R's divider and Ctrl+`\`
scenarios, the finger report unchanged. 5g5: R's sticky-column checks.

**5h1–5h4 — parts.** As Design §6.2–6.4. The reviewer reads the part's body
against the removed subtree (`--color-moved`) and checks the call site's
props one by one. 5h1: R's ج/ص, read-mark and header checks; U `reader-header`,
`reader-page`. 5h3: every U sheet capture; S (the rail); P (`no-key`,
`translate`, `block`, `batch`). 5h4: U `reader-cards`, `reader-retranslate`,
`reader-collapsed`, `reader-sheet-open`; P (`retranslate`); the screen's
header comment gains the reason for its size.

**5i1–5i3 — `useTranslator`.** As Design §7. P must be identical; the
reviewer checks with a word diff that each function's body is the removed
text and that no statement with a side effect moved. If the owner drops Q12,
these steps are skipped.

**5j — docs.** As Design §10; RESTRUCTURE status and §6 row (complete), §5
(P's row; R's count); PROGRESS's Phase 5 result; "Corrections found in
review" in this plan. End checks: T B L S R U P Q D, the SSR build of
`verify-parsers.ts` (it imports no moved file; run as the phase's last
proof), then X on the whole phase.

## Checks

| Check | When |
| --- | --- |
| T | every step |
| B | every step; main chunk within ±2 KB of the previous step (each part's props add a few hundred bytes minified, which the commit says); no dynamic chunk merged (T-h); CSS byte-identical at every step; **5e2 identical JS after masking** |
| L | every step: 134 directory edges unchanged (every new file imports only what its source did), the file count up by one per new file, no file-level cycle, `--check` holds |
| **R** | every step from 5b, **first and alone, under `timeout 1200`** (Design §1.5); 28 + the new checks; report within noise of 4n's; the finger-drag report unchanged |
| **S** | every step; 30/30 |
| **U** | every step from 5a; identical to the manifest |
| **P** | built in 5c; every step from 5g1, and 5j; identical to `translate.json` |
| Q | 5i1–5i3, 5j (no provider code changes; Q does not run `useTranslator`) |
| D | 5d8 (the backup's caller moves), 5j; no storage call path changes elsewhere — `useReadingPosition` moves two calls verbatim, which S and R exercise |
| SSR build of `verify-parsers.ts` | 5j (no step touches a file it imports) |
| X (reviewer) | after every commit, before the next step |

**Only the owner can run:**

- **V** `npm run verify` on the PC, once before merging. No module it imports
  changes except a comment in `quran/quranIndex.ts` (5j); owed by RESTRUCTURE
  §3 rule 9. The count should be the same as Phase 4's.
- **M** on the staged build (`npm run stage`), on the tablet, by touch, in
  Chrome; each item **in landscape (960×600) and in portrait (600×960)**
  unless it says which:
  1. Open a long book. Scroll: the header stays; the ج/ص badge follows.
     Contents → a chapter; Search → a result; ج/ص Go; each lands below the
     header.
  2. Reload: the place is restored. Rotate: it stays.
  3. Landscape: drag the panel divider **with a finger**, then with a mouse
     or stylus if you use one. Say whether the finger drag worked on the
     deployed app too (FOUND_ISSUES draft B). Hide cards, then the edge tab;
     Ctrl+`\` if a keyboard is attached.
  4. Portrait: open and close the Cards sheet; its count.
  5. Select across several screens with the native handles → the rail →
     Translate (a real key). The card appears; tap it — the text jumps and
     flashes. Tap its margin marker: the panel in landscape, a popover in
     portrait. Retranslate once.
  6. Select one word → Meaning; double-tap a word (with a dictionary
     imported) → the dictionary sheet.
  7. Tap a verse: Translation, then Tafsīr / Similar / Topics / Surah as
     installed; Compiled if enabled (Settings → Qurʾān translation).
  8. In a ḥadīth collection: tap a ḥadīth — gradings, footer; tap a
     commentary button (sharḥ notice or card); Translate all… → the
     proposal bar → **Cancel** (nothing is spent).
  9. Tap a narrator → the biography sheet.
  10. Margin: tap (skip band), long-press (menu), Add note; the note card.
  11. Read marks: mark two passages read; ↑ ↓ in the header.
  12. Share: the dialog opens (close it without publishing). Open one of
      your published links (Settings → Published chapters): the read-only
      view has no Share button and no margin menu.
  13. Settings: every section shows; Test key; change the text size and see
      it in the reader; Work backup → Export (a file downloads).
  14. Optional: DuckDuckGo — open a book, select, translate.

  What only the tablet shows: the native handles, the real fonts, the finger
  on the divider, the WebView, the real APIs (gloss, dorar, sunnah.com,
  compile), the on-device model. A failure there with U, R, S and P green is
  reported, not patched.

## Risks

- **R1. Effect order changes** (a hook called elsewhere than its first
  statement, or a region that was not contiguous). Each hook's region is
  contiguous at `9afb2c7` (Design §6.1); the reviewer checks the single hunk
  and the call's place; P records the requests' order; the data-loading hook
  that would break this is not done (§6.5).
- **R2. A part changes mount/unmount or render rhythm** (a condition moved
  out, a `memo`, a `key`). Forbidden by adaptation (h) and §2's list; U shows
  any DOM change; R's popover, divider and sheet checks; Design §6.4.
- **R3. A prop wired to the wrong value** (two same-typed callbacks
  swapped). Same-name props only, checked one by one; U's sheet captures, R's
  scenarios and P are where it would show.
- **R4. A moved function reads its input at a different time** (`listRef`
  dereferenced at call time; Phase 4's fetcher lesson). Ref objects passed,
  `.current` read where it is read today; R's jumps and restore.
- **R5. `TYPE_CHROME` drifts from the CSS** (T-g). The numbers and classes
  move byte for byte into one file; CSS bytes compared; R's contiguity checks.
- **R6. The reader slows down** (a callback's identity changed, rows
  re-render). Deps arrays unchanged; `BlockRow`'s stable handlers untouched;
  R's performance report against 4n.
- **R7. A translation is built differently** (useTranslator steps). P
  records requests, cards and order; both cache-key calls stay; Q; V's cache
  key checks.
- **R8. A file-level cycle** from the entity sheet split. The 5e order and
  `quranSheetData.ts`; L's `--check`.
- **R9. The new checks are flaky, or R hangs.** Two runs before each
  baseline; R alone under a timeout, one re-run, two hangs stop the step
  (Design §1.5).
- **R10. A new check bakes in a bug.** The finger-drag line is reported, not
  judged. FOUND_ISSUES A's collision is not put into P, so its later fix
  does not have to re-baseline P.
- **R11. The shared, read-only view breaks** (`readOnly` branches in moved
  JSX). Moved verbatim; no check reaches it (it needs a real share bundle);
  M step 12.
- **R12. The Phase 4 branch changes under this one.** Merged in, never
  rebased; U, R, S, P re-run after such a merge.
- **R13. Load order.** The new modules hold components, hooks, constants and
  pure functions; none reads `localStorage` or opens anything at load.
  `BlockRow`'s `memo` is created at load in either file.

## Questions

1. **Q1. The checks first, as designed** — U's new reader captures (5a), R's
   new scenarios in their own contexts (5b), and a new check **P** recording
   the translate pipeline through the real reader (5c), each baselined on the
   old code and proven by breakages? Recommended: yes. Alternatives: put P's
   scenarios into S (S is anchors-only assertions, so it would need a record
   file of its own anyway); or no P and drop Q12's steps.
2. **Q2. R runs first and alone, under `timeout 1200`**, a hang re-run once,
   two hangs stop the step? Recommended: yes, and leave R's script as is.
   Alternative: give R's `page.evaluate` calls a timeout in 5b, which would
   turn a hang into a failure — a change to R written on the old code.
3. **Q3. Adaptations (f)–(l)** (Design §2): same-name props and parameters
   with whole objects; a hook's one `return`; the call where the first moved
   line was; new prop types; a `BlockList` callback body becoming a call with
   the same deps; a pure statement run becoming a function (useTranslator);
   `EntitySheet`'s comment split. Recommended: yes, all seven, nothing else.
4. **Q4. Flat files** in `ui/reader/` and `ui/settings/`, named as the moved
   symbol (`HadithSheet.tsx`, `ReaderHeader.tsx`, `useWordLookup.ts`, …)?
   Recommended: yes — no unit changes, no existing file moves, and Phase 5b
   will lay out genre folders anyway. Alternative: subfolders
   (`ui/reader/sheets/`, `ui/reader/screen/`), which `unitOf` folds into
   `ui/reader`, but which would move `AnchoredPanel`, `QuranTabs`,
   `DictionarySheet`, `BiographySheet` too to be coherent.
5. **Q5. Settings' `Section` to `ui/settings/Section.tsx`**, keeping its
   name? Recommended: yes. Alternative: into `ui/kit` beside
   `SettingsSection` — but Phase 2's Q3 kept the kit's shell bare, and this
   one carries a heading layout only these seven use.
6. **Q6. One Settings section per commit** (5d1–5d8, eight commits)?
   Recommended: yes, per rule 3; each is minutes to check. Alternative: the
   three smallest (`Catalog`, `Reading`, `Display`) in one commit.
7. **Q7. The entity sheets in the order HadithSheet, the `QuranSheetData`
   type file, CompileTab, QuranSheet** (Design §4)? Recommended: yes — any
   order without the type file makes a type-only file cycle, which `--check`
   fails. Alternative: `QuranSheetData` moves with `CompileTab` and
   `QuranSheet` imports it from there (no extra file; the type lives with its
   second user).
8. **Q8. `blockLayout.ts`** holding `TYPE_CLASS`, `TYPE_CHROME`,
   `textHeightFor` and `settleOn`, with `BlockList`'s `useCallback`s kept
   (same deps) calling them; and **5f3, `BlockRow.tsx`** for `BlockRow`,
   `MarginTarget`, `CardMarkerDot`? Recommended: yes to both; with 5f3
   `BlockList.tsx` is about 370 lines, without it about 650 with a reason at
   the top. Alternatives: a hook `useBlockEstimates` (moves the
   `useCallback`s too, changing where hooks are called); other names
   (`blockEstimates.ts`; `estimateTextHeight` for the module function, which
   would shadow the local callback).
9. **Q9. The hooks**: `useWordLookup` (the row's "gloss": dictionary, lookup
   and gloss together, as they are contiguous), `useReadingPosition`,
   `useReaderNavigation`, `usePanelControls` (the divider **and** the
   Ctrl+`\` effect beside it, returning the `dragging` ref so the divider's
   JSX stays as written), and **`useHeaderHeight`** (5g5)? Recommended: yes.
   Alternatives: divider only, the keyboard effect staying; the hook
   returning an `onPointerDown` (the divider's JSX then changes); no 5g5.
10. **Q10. The parts**: `ReaderHeader` and `ReaderSheets` (the row), plus
    **`CommentaryBars`** and **`ReaderCardPanel`** for the book-kinds
    constraint, all with same-name props, no context? Recommended: yes.
    Alternatives: a `ReaderContext` (rejected in Design §6.3); only the two
    the row names.
11. **Q11. The screen stays ~750-850 lines with a reason at its top**, the
    data-loading and selection hooks not done (Design §6.5)? Recommended:
    yes. Alternative: a context to carry shared state, which would let the
    columns become a part too — a new pattern, better decided with 5b's
    genre descriptor in hand.
12. **Q12. useTranslator's steps** (5i1–5i3): pure builders and updaters in
    `ui/reader/translationSteps.ts`, every side effect, `await` and
    `cacheKeyFor` left in `translate`, checked by P? Recommended: yes — it is
    what the row asks and P makes it checkable. Alternative: drop it; the file
    is 466 lines, under the ~500 line, and its one long callback is already
    commented step by step.
13. **Q13. Comments made untrue** (Design §10): moved files' headers in
    their step; the rest in 5j, PROGRESS noting each interval, as Phase 4's
    Q8? Recommended: yes. Alternative: each in the step that makes it untrue
    (5d1, 5d8, 5e3, 5f1, 5h1), including CLAUDE.md's trap 7 at 5f1.
14. **Q14. FOUND_ISSUES A–K**, written in 5a and left? Recommended: yes. A
    (the dictionary entry's cache collision) can return a wrong translation,
    and B (the divider by finger) may make a feature unusable on the
    tablet; both are worth their own changes after the phase.
15. **Q15. M as written.** Do you resize the panel by finger on the tablet
    today (it decides how much B matters), and do you have a published
    chapter link for step 12?
16. **Q16. Review cadence.** Recommended: the `torjuman-reviewer` after every
    commit; `torjuman-reader` reading this plan and 5a's and 5b's additions
    before their baselines; `torjuman-llm` reading P before 5c's.
17. **Q17. The book-kinds seam** (Design §8): is naming `HadithSheet`,
    `CommentaryBars`, `ReaderCardPanel` and `SunnahKeyField` — and leaving
    `useSharh`, `useBatchTranslate`, `proposeBatch` and the margin menu's
    Translate all… in place for 5b — what you want from Phase 5?
    Recommended: yes; 5b's descriptor decides how they are switched.

## Owner's answers


**All seventeen as recommended** ("all as recommended, go ahead",
2026-11-16): U, R and P built and recorded on the old code before any move
(Q1); R first, alone, under a timeout, re-run once on a hang (Q2);
adaptations (f)–(l) (Q3); flat files (Q4); `Section` to
`ui/settings/Section.tsx` (Q5); one Settings section per commit (Q6); the
EntitySheet order with `quranSheetData.ts` (Q7); `blockLayout.ts` and
`BlockRow.tsx` (Q8); the five hooks (Q9); parts with same-name props, no
context (Q10); the screen at about 800 lines with a reason at its top
(Q11); the `useTranslator` steps (Q12); untrue comments in 5j, moved files'
headers in their step (Q13); FOUND_ISSUES A–K filed in 5a and left (Q14);
M as written (Q15) — the owner did not say whether the panel is resized by
finger or whether a published chapter link exists, so M's divider-by-finger
item stays (it is how B is judged) and step 12 is done only if the owner
has a link; the reviewer after every commit, `torjuman-reader` reading the
plan and 5a's and 5b's additions before their baselines, `torjuman-llm`
reading P before 5c's (Q16); the book-kinds seam as in Design §8 (Q17).
