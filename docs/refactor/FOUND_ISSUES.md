# Found issues

Bugs, inaccuracies and oddities found while restructuring. **Left as they
are** — a refactor step changes structure only. Each is fixed, if the owner
wants it fixed, in its own change, and the entry then says where.

Line references in entries 26–43 were written against Phase 5's plan base
(`9afb2c7`). Phase 5 moved most of the code they point at into new files, so
at its last step (5j) each reference was recomputed by content from the final
files and pointed at the file and lines where that code now is; the text of
each entry is otherwise as it was written. The old line numbers are in the
plan's Design §9 and in git history. References into files Phase 5 did not
touch are unchanged.

## 1. The deploy workflow's source-tree check omits `biography` and `share` (2026-11-15, measured)

`.github/workflows/deploy.yml`, step "Check the source tree arrived intact",
lists the `src/` directories that must exist: `app catalog components
dictionary ingest lib library platform qul quran retrieval shamela translation
ui`. `src/biography/` and `src/share/` exist and are imported, but are not on
the list, so a `.gitignore` accident that dropped either would surface as
cryptic compiler errors — exactly what the check was written to prevent. The
build itself is unaffected. Found by the Phase 0 survey. **Fixed in Phase 1
step 1c** (owner's answer to Q4), when the list gained `services`.

## 2. README "How it fits together" was stale (2026-11-15, fixed in Phase 0)

It named a `translate/` directory (the code is in `translation/`), omitted
ten directories (`app`, `biography`, `catalog`, `components`, `dictionary`,
`lib`, `library`, `qul`, `quran`, `share`) — the Phase 0 commit message says
nine — and said `platform/http/` is the only place that
calls `fetch` against an external host. That is not true: the Gemini provider
(`translation/providers/GeminiProvider.ts`, `qul/compile.ts`) calls the Gemini
API directly, and `library/relayTransfer.ts` calls the Worker directly with binary
`PUT`/`GET`/`DELETE`, which `HttpClient` (text `GET`s only) cannot send.
The optional remote catalog and shared-chapter bundles are fetched directly
too. `HttpClient.ts`'s own header makes the narrower, true claim (shamela.ws and
the retrieval APIs). Docs only, so corrected in Phase 0.

## 3. `npm run verify` cannot run on a fresh clone (2026-11-15, by design)

It needs the gitignored `fixtures/` and `qul/`, so it runs only on the owner's
PC, and the cloud container can never run it. This is documented and
deliberate (public repository), but it means every restructure step that moves
a module `scripts/verify-parsers.ts` imports is verified by reading until the
owner runs it. Not a bug; recorded so the gap stays visible.

## 4. Provider and model knowledge outside its home (2026-11-15, measured)

Found by the Phase 0 review.

- `translation/registry.ts:10` (since Phase 1 step 1h
  `translation/providers/registry.ts:7`) says it is "The only place outside the
  settings screen that names a provider". Not so: `app/AppContext.tsx`,
  `translation/profiles.ts`, `qul/compile.ts`, `ui/OnboardingScreen.tsx`,
  `ui/reader/ReaderScreen.tsx`, `ui/reader/useExplanations.ts` and
  `ui/settings/OfflineTranslation.tsx` all do.
- A model ID outside `models.ts`: `ui/settings/OfflineTranslation.tsx:210`
  (`:206` by Phase 3)
  saves `model: 'gemini-3.7-flash'` inline. **Replaced in Phase 3 step 3p**
  (owner's Q6 (b)) by `GEMINI_DEFAULT_MODEL`, the same value; the provider
  literal `'gemini'` stays ("back to Gemini", not "back to the default").
- Call parameters outside `models.ts`: `translation/gloss.ts:111,114` set
  `max_tokens: 2000` and `output_config: { effort: 'low' }` inline (with
  comments saying why). **Moved in Phase 3 step 3j** (owner's Q6) to
  `models.ts` as `GLOSS_MAX_TOKENS` and `GLOSS_OUTPUT_CONFIG`, comments
  verbatim.

Left as is: Phase 3 (provider seams) is where these move, as structure. The
comment in `registry.ts` is corrected when the registry moves in Phase 1 step
1h only if the plan names it; otherwise in Phase 3. **Phase 3 status:** the
model id and gloss's parameters moved (3j, 3p); the names in `AppContext`,
`compile.ts`, `ReaderScreen.tsx` and `useExplanations.ts` became registry,
table or module constants (3l, 3m, 3q); the registry's and
`TranslationProvider.ts`'s comments were corrected in 3r. What still names a
provider, and why, is the plan's Design §5. The call parameters still inline
are in entry 11's last paragraph.

## 5. A detached and miscounted comment about the API keys (2026-11-15, measured)

`src/types.ts` (~824–828 at `16e16a3`): the comment "Everything except the two
API keys … (see app/secrets.ts)" belongs to `AppSettings`, but sits before the
next interface's doc comment (`BiographyEntry`), far from it — already so at
`810b059`, before the restructure. It also says "two API keys", and README
(~174) says "Both keys": `services/secrets.ts` holds three (Anthropic, Gemini,
sunnah.com). Found by the 1e review. **Placement fixed in Phase 1 step 1m**
by the owner's decision: the comment now sits directly above `AppSettings` in
`types/settings.ts`, word for word. The "two API keys" wording (and README's
"Both keys") is left for a later fix.

Related, not a defect: since Phase 1 step 1e the key store is in layer 1,
which every domain directory may import. "Only `secrets.ts` reads and writes
keys" still holds, but by convention; a `layers.json` rule could restrict
which files import `services/secrets.ts` (today: `App.tsx`,
`ui/OnboardingScreen.tsx`, `library/deviceTransfer.ts`, six reader and
settings files). For the owner to decide.

## 6. "Resume import" can open the import screen on its input form (2026-11-15, measured)

`LibraryScreen.tsx` (~180): "Resume import" navigates to `#/import` first and
starts the crawler second, and `ImportScreen` picks its stage once, on mount,
from `crawler.isRunning`. When the screen mounts before the crawler has
started, it shows the empty input form instead of the crawl panel, though the
import is running. Reproduced at both tablet sizes while building check U, which
therefore waits on the Library for "Importing…" before opening `#/import`. Not
seen on the owner's tablet yet, as far as is known. Left as is. Found in Phase 2
step 2a.

## 7. "N pending of 3 bundled resources" counts resources that are not bundled (2026-11-15, measured; first version withdrawn)

`qul/seed.ts` (~311) writes "N pending of 3 bundled resources" to the
Retrieval log, but of the three entries in `SEED_MANIFEST` only
`matching-ayah` is bundled; the other two are left out of the build by
licence and, in the deployed build, always come back absent. So a fully
seeded install there reads "2 pending of 3 bundled resources" (a first boot
legitimately reads 3; on the owner's PC, licensed files in `public/qul/`
would be installed). Cosmetic. Left as is.

The first version of this entry blamed timing in the app for the count
varying between 2 and 3. That was wrong: the variation came from check U
reloading the page while the first boot was still seeding (its wait did not
wait), which the app survives by design — the next boot redoes the seed.
Fixed in the check, not the app. Found in Phase 2 step 2a and its review.

## 8. Byte sizes are written five different ways (2026-11-15, measured)

Only two of the app's byte formatters were the same; Phase 2 step 2c merged
those into `lib/format.ts` (`formatBytes`: "512 B", "300 KB", "2.5 MB",
whole kilobytes, one decimal for megabytes). The others differ, so merging
them would change text the owner sees (owner's answer to Phase 2 Q6: not now):

- `ui/settings/DeviceTransfer.tsx` `sizeOf` (~212): never shows bytes —
  anything under 1 MB is at least "1 KB", kilobytes rounded and with a
  thousands separator (just under 1 MB reads "1,000 KB" where `formatBytes`
  says "1000 KB", at most "1,024 KB"); megabytes as `formatBytes`.
- `library/deviceTransfer.ts` `mb` (~393), in the "not enough space" message:
  megabytes only, rounded **up**, with a separator ("1,024 MB").
- `ui/settings/LibraryTransfer.tsx` (~41), the export status: megabytes only,
  one decimal ("0.3 MB" for 300 KB).
- `ui/settings/OfflineTranslation.tsx` (~63, ~225), the storage-usage line:
  whole megabytes, no separator (`usageMB.toFixed(0)`).

Left as is. A later, visible change can pick one format. Found in Phase 2
planning, step 2c and its review.

## 9. Two progress bars look different from the other seven (2026-11-15, measured)

Phase 2 step 2h put the seven identical progress bars (`h-1.5`, rule-coloured
track, accent fill) on `ui/kit/ProgressBar`. Two differ, and keep their own
markup (owner's answer to Phase 2 Q5):

- `ui/ImportScreen.tsx` (~287), the crawl panel: taller (`h-2`) with a bottom
  margin (`mb-2`).
- `ui/reader/BatchTranslateBar.tsx` (~99), the batch translation bar:
  thinner (`h-1`) with `mt-1.5`, no `w-full`, and a width-only, 300 ms
  transition (`transition-[width] duration-300`). Its percentage (~65) also
  has no zero-total guard: `(done + failed) / total` with `total` 0 gives
  `NaN%`, where the other bars write 0. A batch always has at least one
  block (`useBatchTranslate.ts` returns early on an empty range), so it is not
  known to show.

Left as is; making them match would change what the owner sees. Found in
Phase 2 planning.

## 10. Duplicates left for later (2026-11-15, by the owner's answer to Phase 2 Q10)

Found while planning Phase 2, real duplicates but deferred:

- `parseHtml` — `shamela/parsePage.ts` (~58) and `shamela/parseBook.ts` (~54),
  identical; in the parsers `npm run verify` covers most heavily, so moved
  only with V in hand.
- `pageIndexOf` — `ui/reader/BlockList.tsx` (~134; ~103 after Phase 5) and
  `share/buildBundle.ts` (~84), identical; it parses block ids and belongs
  with `blockIdFor` in `ingest/importer.ts`, a larger question.
- `toLine` — `library/transfer.ts` (~85) and `library/deviceTransfer.ts`
  (~398), the same body with different parameter types and comments.
- The plain card shell in `ui/ReceiveTransferScreen.tsx` (four places) and
  `ui/OnboardingScreen.tsx` (~54), like the settings shell but without
  `dir`/`ltr-isolate`.
- A third `delay`, in a different form, in `scripts/build-catalog.ts` (~212):
  a build script, outside `src/` (found by the Phase 2 end review).
- `title`/`description` props on `SettingsSection` (Phase 2 step 2j′, owner's
  Q3: not now).

Not duplicates: the nine red error boxes, which all differ.

## 11. Error handling differs between the Claude call sites (2026-11-16, measured)

Found by the Phase 3 plan survey. Left as is (owner's answer to Phase 3 Q4:
unifying them is a behaviour change for its own PR):

- `translation/providers/AnthropicProvider.ts` (~359–363; since Phase 3 step
  3e `toTranslationError` in `translation/anthropic.ts` ~116–121) reads
  `retry-after` with `Number()`, so a date-form value gives `NaN` seconds (check Q records
  it: `anthropic.translate.429-retry-after-http-date`).
- Explain, gloss and compile map Anthropic errors more coarsely than
  translation: a 403 comes out as `api`, and a 429 carries no retry-after.
- Compile's Gemini branch does not retry a 429 or read the error body, so a
  bad key reported as a 400 comes out as `api`, not `auth`.
- The SDK retries twice by itself, so a rate-limited Claude call is three
  requests (check Q shows them).
- `ANTHROPIC_VERSION` (`translation/models.ts` ~117) is exported and unused.

More inline call parameters for FOUND_ISSUES 4's list, left where they are:
compile's `max_tokens` 4000 (both branches), research 8000 (both sites), the
research turn limit, the web-search `max_uses`, Gemini's `MAX_RETRIES`.

## 12. A network failure passes the Claude key check (2026-11-16, measured)

`AnthropicProvider.validateKey` (~62–80; ~51–69 by Phase 3) returns `true` for every `APIError`
that is not a 401 or 403, on the reasoning that a rate limit or a 400 still
proves the key authenticated. But the SDK's `APIConnectionError` is an
`APIError` with no status (`node_modules/@anthropic-ai/sdk/core/error.mjs`
~71), so with no network the key test reports the key as good — after three
attempts. Check Q records it (`anthropic.validateKey.connection-failure` →
`true`). Left as is; a fix would treat a status-less error as "could not
check". Found by the `torjuman-llm` plan read before Phase 3 step 3a.

## 13. The translation cache key depends on the device's locale (2026-11-16, measured)

`glossaryHashOf` (`translation/prompt.ts` ~20) sorts glossary entries with
`localeCompare`, whose order depends on the browser's locale. Two devices with
different locales could compute different glossary hashes, and so different
cache keys (trap 5), for the same glossary — a cached card made on one would
not be found on the other after a tablet transfer. Not known to have happened;
the owner's tablets share a locale. Check Q pins `en-US`. Left as is. Found by
the `torjuman-llm` plan read before Phase 3 step 3a.

## 14. Five error paths check Q's added scenarios expose (2026-11-16, measured)

Found while closing the 3a review's coverage gaps; each is recorded by a
scenario in `docs/refactor/phase3/requests.json`. Left as is:

1. A connection that drops after the headers (`TypeError` reading the body)
   escapes unmapped from Gemini translate and Gemini compile — no
   `TranslationError` (`gemini.translate.body-drop`,
   `compile.gemini.body-drop`).
2. At every Anthropic site the same drop maps to kind `api` with the message
   "network error", not kind `network` (`anthropic.translate.body-drop`,
   `anthropic.validateKey.body-drop`, `explain.body-drop`, `gloss.body-drop`,
   `compile.anthropic.body-drop`).
3. An error event inside the Anthropic stream reads "Anthropic API error
   undefined: {…json…}" (`anthropic.translate.stream-error-event`).
4. Gemini's `promptFeedback.blockReason` is ignored, so a blocked prompt is
   reported as a parse failure, not a refusal
   (`gemini.translate.prompt-blocked`).
5. Research notes from successive turns are joined with no separator ("Turn
   1: searching.Turn 2: …"), in translate and Explain
   (`anthropic.translate.research-out-of-turns`,
   `explain.research-out-of-turns`).

## 15. Four more error paths (2026-11-16, measured)

Exposed by check Q's second-round scenarios, recorded in
`docs/refactor/phase3/requests.json` except where marked. Left as is:

1. A 200 from Gemini that is not JSON — an empty body, or an HTML page such
   as a captive portal — escapes compile as a raw `SyntaxError`, not a
   `TranslationError` (`compile.gemini.200-empty-body`,
   `compile.gemini.200-non-json`). Beside FOUND_ISSUES 14.1.
2. An overload error that arrives after the Claude reply has started loses the
   partial reply: `raw` is null in the research and the structuring pass, and
   the progress text already shown is dropped (the tokens are probably billed
   all the same; neither the code nor the record shows that)
   (`anthropic.translate.dig-deeper-stream-error-after-text`,
   `anthropic.translate.stream-error-after-tool-deltas`).
3. Live progress runs a reply's text blocks together ("…first.Passage …"),
   while the notes sent onward join the same blocks with a newline. Cosmetic.
   Recorded for Explain (`explain.research-multi-text-blocks`); for translate
   it is true by reading (`turnText += delta` in `research()`), as the record
   keeps only translate's progress count.
4. The app reads only `retry-after`, never `retry-after-ms`: with only the
   latter `retryAfterSeconds` is null though the SDK knew the wait
   (`anthropic.translate.429-retry-after-ms-only`); with no header it is null
   too, and the SDK used its own backoff (`…429-no-retry-headers`). Pinned;
   not clearly a bug.

## 16. README's work-backup list is short (2026-11-16, measured)

`README.md:380-381` says the work backup holds "cards, explanations, marks,
notes, glossary, profiles, positions, the gloss cache". It also carries sharḥ
cards, the Qurʾān-verse and ḥadīth caches, share records (with their
decryption keys) and settings (`IdbStorageAdapter.ts:996-1007`; check D's
`work-backup` → `export`, the `exportWork` value). Docs only. Phase 4 plan,
Design §6 A.

## 17. RESTRUCTURE §4 T-e says `ShareStorageAdapter` throws on write (2026-11-16, measured)

T-e asks a reshuffle to keep the share adapter's "throw-on-write behaviour".
It has none: writes are ignored silently (`ShareStorageAdapter.ts:64-70`,
`:77-78`); `putSettings`, `putQuranVerse` and `putQulCompilation` write through
to the visitor's own database (`:330`, `:356`, `:397`); only the work backup and
the five whole-tablet calls throw (`:474-507`). Check D's `share-adapter`
scenario records all three kinds. Docs only. Design §6 B.

## 18. Compiled QUL views are in no work backup (2026-11-16, measured)

`qulCompilations` — "the one generated thing in the QUL feature"
(`StorageAdapter.ts:195`), each made by a paid model call — is not in
`exportWork` (`IdbStorageAdapter.ts:984-1008`), so a work backup restored onto a
new device brings none of them; they travel only in the whole-tablet transfer.
Check D's `work-backup`: the export's source has one compilation, the restored
database none. For the owner to decide. Design §6 C.

## 19. Share records outlive their book (2026-11-16, measured)

`ShareRecord` has a `bookId` (`types/share.ts:31`) but `deleteBook`
(`IdbStorageAdapter.ts:399-416`) leaves the record: check D's `delete-book`,
"listShareRecords (outlives its book)". Probably right — a published link still
works for others, and its key exists only in the link and this record — but
nothing says so. Design §6 D.

## 20. Databases from before v7 cannot be checked (2026-11-16, by design)

The existing-DB branch never adds an index to a store that already exists, and
never creates the twelve stores it assumes (`books`, `tocNodes`, `pages`,
`blocks`, `cards`, `profiles`, `glossary`, `quranVerses`, `hadiths`,
`crawlStates`, `positions`, `settings`). Versions 1–6 predate the repository
(its first commit, `810b059`, is v7), so whether their base stores had today's
indexes is unknown. Every database from v7 on has them (the fresh branch at
`810b059` creates them as today). Check D upgrades a synthetic `v1base` with
today's indexes, and v7–v10; the owner named no device with an older database
(Phase 4 Q2). Design §6 E.

## 21. The three QUL stores share one upgrade guard (2026-11-16, measured)

`qulResources`, `qulEntries` and `qulCompilations` are created together when
`qulResources` is missing (`IdbStorageAdapter.ts:233-239`). So a database with
`qulResources` but no `qulEntries` opens and never gets `qulEntries`; and one
with `qulEntries` but no `qulResources` cannot open at all — the upgrade
throws a ConstraintError ("An object store with the specified name already
exists"), Chromium aborts the version change, `init` rejects with an
AbortError and the database stays at its old version, every row kept. Neither
database can arise from the app's own code. Check D pins both:
`harness/odd-v10-without-qulEntries`, `harness/odd-v10-without-qulResources`;
and, since the 4j follow-up, a third, `harness/odd-v10-without-qulCompilations`
(opens, never gets `qulCompilations`).
Design §6 F.

## 22. A work backup is not a snapshot (2026-11-16, by reading)

`exportWork` reads each store in its own transaction
(`IdbStorageAdapter.ts:996-1006`), so a card saved while the export runs can be
in one store's read and its sibling's not. Minor; check D cannot show a race.
Design §6 G.

## 23. `importWork` ignores the backup's version (2026-11-16, by reading)

`WorkBundle.version` is written as `DB_VERSION` (`IdbStorageAdapter.ts:989`) and
never read by `importWork` (`:1011-1058`), so a backup from a newer app restores
the fields this one knows and drops the rest without a word. By design — block
ids are deterministic, so the rows bind wherever they land — but unstated.
Design §6 H.

## 24. Replacing a book from a Library transfer file deletes its cards and marks (2026-11-16, measured)

Found while building check D (Phase 4 step 4a). When a per-book file is
imported for a book already on the device, `ui/settings/LibraryTransfer.tsx:58-63`
asks: "Replace it with the contents of this file? Its translation cards and
marks are kept — they anchor to block IDs, which are the same either way."
They are not kept. On a yes, `importBookFile` calls
`storage.deleteBook(existing.id)` (`library/transfer.ts:248`), and `deleteBook`
purges every `BOOK_STORES` store — `marks`, `cards`, `explanationCards`,
`sharhCards` among them — and the book's reading position
(`IdbStorageAdapter.ts:399-416`); the per-book file carries none of them
(README "The transfer format"). Check D's `book-transfer` → `import-conflict`:
the snapshot "after onConflict false" has the book's mark, translation card,
explanation, sharḥ card and position; "after onConflict true" has none.

The same phase shows a second loss: a replacement that fails part way (a file
cut short) leaves **no** copy of the book, since the old one was deleted before
the new one was read and the rollback (`transfer.ts:353`) deletes the new one
(`… one block short, onConflict true`, then `getBook A` undefined). README
says "An import that fails partway rolls back to no book", which is true, but
on a replacement that means the original is gone too.

The dialog's wording has been the same since the first commit in git
(`810b059`), whose `deleteBook` already purged marks and cards. The work
survives only in a work backup or a whole-tablet file made beforehand.
**Possible data loss on the owner's tablet; left unfixed (structure-only
phase).** A fix — keep the user's work on a replacement, or say plainly that
it goes — is the owner's call, in its own change.

## 25. A work restore's card count leaves out sharḥ cards (2026-11-16, measured)

`importWork` reports `restoredCards` as translation cards plus explanation
cards (`IdbStorageAdapter.ts:1054`); sharḥ cards are restored but not counted.
Check D's `work-backup` → `import-fresh`: `restoredCards` 3 for two translation
cards and one explanation, with the one sharḥ card restored beside them.
Cosmetic.

## 26. "Translate this entry" stores a card under the visible block's key (2026-11-16, by reading)

Found by the Phase 5 survey. The dictionary sheet's "Translate this entry"
(`ui/reader/DictionarySheet.tsx:79`) hands the entry's text (`:42`) to
`onTranslateEntry` (`ui/reader/ReaderSheets.tsx:190-203`), which anchors it
on the whole visible block: `startBlockId`/`endBlockId` the visible block,
offsets `0` and `block.text.length`, `sourceText` the entry. The cache key is
built from the anchor's ids and offsets, not its text
(`ui/reader/useTranslator.ts:233-243`), and is looked up before anything else
(`:245-251`). So translating that whole block later returns the dictionary
entry's card, and if the block was translated whole before, "Translate this
entry" returns the block's card instead of the entry's English. Either card
also sits on the visible block in the panel and the margin. And the request
itself is built from the anchor, not the text: with the entry's text as
`targetText` it sends the visible block's surrounding context, its
`blockTypes`, its `hadithNumbers` and the verses known in it
(`knownQuranRefs`) (`ui/reader/translationSteps.ts:35-43`, `:70-81`), so the
model is told the entry is that block. **Could put a wrong
translation in front of a lesson; left unfixed (structure-only phase).** Not
pinned by any check, so a fix needs no re-baseline. Phase 5 plan, Design §9 A.

## 27. The panel divider ignores `pointercancel` and has no `touch-action` (2026-11-16, by reading)

`ui/reader/usePanelControls.ts:39-56`: the divider sets `dragging` on
`pointerdown` (`ui/reader/ReaderScreen.tsx:726-729`) and the window listens for `pointermove` and
`pointerup` only. A finger drag that the browser takes over for panning ends
in `pointercancel` instead, which leaves `dragging` true and `body`
`user-select: none` until some later `pointerup` — after which the next
unrelated finger movement resizes the panel. The divider (`ReaderScreen.tsx:725-734`) has no
`touch-action`, so on a touch screen the browser is free to take the drag. And
every `pointermove` while dragging writes the whole settings row
(`updateSettings`, `app/AppContext.tsx:221-227`). Whether a finger drag resizes
the panel on the tablet at all is not known: check R's touch report (Phase 5
step 5b) shows what Chromium's emulation does, and the tablet run (M) is the
answer. **May make a feature unusable on the tablet.** Phase 5 plan, Design §9 B.

## 28. The sheet handle counts translations only (2026-11-16, by reading, fixed in lane A)

`ui/reader/ReaderScreen.tsx:779`: the portrait sheet's handle says
`▲ Cards (${translator.cards.length})`, while the collapsed edge tab in
landscape counts every card kind (`allCards.length`, `:763`), and the sheet,
once open, lists notes, explanations and sharḥ cards too. A reader with only
notes sees "Cards (0)" over a sheet that is not empty. Cosmetic. Phase 5 plan,
Design §9 C.

**Fixed in lane A:** the handle now counts `allCards.length`, the same memo
(translations, notes, explanations, sharḥ) that the edge tab counts and the
sheet lists. Its format is unchanged: it still shows "(0)" when there are no
cards, where the edge tab drops the count.

## 29. `busy` is one flag for every translation (2026-11-16, by reading)

`ui/reader/useTranslator.ts:100` holds one `busy`; each translation sets it
(`:269`) and clears it in its `finally` (`:337`). When two run at once — a
manual Translate during a batch, or a retranslate during either — the first to
finish clears it, and the rail's Translate and Explain
(`ui/reader/SelectionRail.tsx:128-139`, `disabled={busy}`) come back while the
other is still running. Minor. Phase 5 plan, Design §9 D.

## 30. A detached doc comment in the reader (2026-11-16, by reading, fixed in lane A)

`ui/reader/ReaderScreen.tsx:317-328` ("Track whether a selection exists…
`selectionchange` on `document`, not `pointerup`…") describes the
`selectionchange` effect at `:349-362`, but sits above the
biography-availability effect (`:332-347`), whose own comment follows it
(`:329-331`). Docs only. Phase 5 plan, Design §9 E.

**Fixed in lane A:** the comment was moved, verbatim, from above the
biography-availability effect to directly above the `selectionchange` effect
it describes. No code changed.

## 31. The reader is not keyed by book (2026-11-16, by reading, fixed in lane A)

`App.tsx:94` renders `<ReaderScreen bookId={route.bookId} />` and
`ui/share/ShareScreen.tsx:146` `<ReaderScreen bookId={…} />`, neither with a
`key`. A hash change straight from one book to another reuses the mounted
screen: `restoredRef` (`ui/reader/useReadingPosition.ts:26`) is still true, so the
restore effect returns early (`:30`) and the second book opens at the top, not
at its saved position; and `useTranslator`'s `listCards` effect
(`ui/reader/useTranslator.ts:104-106`) has no cancellation, so a slow first list
can land after the second. Only reachable by editing the URL (the Library is
always between two books). Phase 5 plan, Design §9 F.

**Fixed in lane A:** both call sites pass `key` = the book id, so a hash
change from one book to another mounts a fresh `ReaderScreen`. `restoredRef`
starts false, and the second book opens at its saved position. The first
screen's `listCards` resolves into an unmounted component, whose `setCards`
React drops, so `useTranslator.ts` (lane B's) needed no cancellation. Keying
also stops a third problem, found by reading: the debounced position save
(`useReadingPosition.ts:41-51`) could write the first book's visible block
order under the second book's id. A remount resets only what going through
the Library already reset. R's "a second book opened by its URL restores its
own position" guards it: on the old code the second book opened at block 0.

## 32. A failed work export says "Preparing…" forever (2026-11-16, by reading)

`ui/settings/BackupSection.tsx:26-39`: `exportWork` sets "Preparing…" and
then awaits `storage.exportWork()` and `saveFile` with no `try`, so a failure
(a quota error, a refused download) leaves the message in place with nothing
said. Its success message counts translation cards, explanations, marks and
glossary entries, but not sharḥ cards or word glosses, which the backup does
carry (`WorkBundle`, `platform/storage/StorageAdapter.ts:48-60`) — like the
restore's count (FOUND_ISSUES 25). Phase 5 plan, Design §9 G.

## 33. When Meaning is offered (2026-11-16, by reading)

`ui/reader/ReaderSheets.tsx:131`: the rail gets `meaningAvailable={navigator.onLine ||
secrets.getProviderKey(GLOSS_PROVIDER_ID) !== ''}`. Offline with a key, Meaning
is offered and fails unless the word is cached; offline without a key it is
disabled, though a cached gloss would work with neither:
`translation/gloss.ts:97-100` returns the cache before checking the network
(`:102-106`) or the key (`:108-110`). May be intended; unstated. Phase 5 plan, Design §9 H.

## 34. Anchored panels re-register their outside tap on every reader render (2026-11-16, by reading)

The reader passes inline `onClose` arrows to its sheets
(`ui/reader/ReaderSheets.tsx:177`, `:186`, `:256`, `:287`), new on every
render. `AnchoredPanel`'s effect depends on `onClose`
(`ui/reader/AnchoredPanel.tsx:131`), so each render removes its document
`pointerdown` listener and adds it back a tick later (`setTimeout(…, 0)`,
`:122`). The screen renders on each change of the top block while scrolling, so
with a sheet open a tap landing in that tick is not seen as an outside tap.
Minor. Phase 5 keeps it exactly (its plan, Design §6.4). Phase 5 plan, Design
§9 I.

## 35. Offline translation reads every ḥadīth's cache row, one at a time (2026-11-16, by reading)

`ui/reader/useTranslator.ts:126-132`: before each on-device translation, the
loop awaits `storage.getHadith` for every ḥadīth entity in the book, one read
after another, whatever the selection covers. On a large collection that is
thousands of sequential reads per translation. Performance. Phase 5 plan,
Design §9 J.

## 36. `digDeeper` is unreachable (2026-11-16, by reading)

`TranslateRequest.digDeeper` (`ui/reader/useTranslator.ts:38`), its default
(`:211`), its two uses (`ui/reader/translationSteps.ts:129`, `:82`) and
`retranslate`'s option (`useTranslator.ts:359-365`) have no caller left in `src/`: the card's "Dig deeper" button was
replaced by Explain (`ui/reader/TranslationCardView.tsx:229-232`). A dead
option, kept by Phase 5. Phase 5 plan, Design §9 K.

## 37. An anchored popover is not re-placed when its content grows (2026-11-16, measured)

Found while baselining Phase 5 step 5a's U captures. `AnchoredPanel`
(`ui/reader/AnchoredPanel.tsx:59-95`) places a popover in `reposition`, a
`useCallback` on `[anchor, asSheet, onClose]` run by a layout effect, and
again on a window scroll or resize — never when its own content changes. It
measures the panel's height at that moment (`panelRef.current?.offsetHeight`,
280 only if the panel is not mounted — in the layout effect it is, so the height used is that of its short loading state) to choose above or below the anchor. A sheet whose
lookups fill in after it mounts (the ḥadīth sheet: dorar, sunnah.com, the
commentaries) keeps the place chosen for its short loading state. In check U's
landscape `reader-hadith` the popover came out at `top: 12px` on most runs and
at `top: 275.844px` on one: about 486 px tall, it ran off the bottom of the
600 px screen, with "Show dorar diagnostics" out of reach until the reader
scrolled. Whether it is re-placed after its content arrives depends on the
reader rendering again: every sheet's `onClose` is an inline arrow
(`ui/reader/ReaderSheets.tsx:177`, `:186`, `:256`, `:287`), so a reader
render makes a new `reposition` and re-runs the layout effect (the mechanism of
FOUND_ISSUES 34). It is right today only by that accident; a Phase 5 part that
rendered less often than the screen would change when — or whether — the
popover is re-placed. Check U now captures every sheet after a resize event so
its pixels do not depend on the race. On the tablet in landscape a ḥadīth sheet
can open partly off screen. Left unfixed (structure-only phase).

## 38. The Qurʾān sheet's verse uses the device's font, not the bundled one (2026-11-16, measured in the container)

`ArabicVerse` (`ui/reader/QuranTabs.tsx:23-34`) sets the class `arabic`,
which gives leading and font features but no font family
(`src/index.css:106-112`), so the verse inherits the body's
`ui-sans-serif, system-ui, …` stack. The reader's blocks
(`BlockRow.tsx:127`) and the dictionary sheet (`DictionarySheet.tsx:181`)
set the bundled reader font inline, and `index.css:3-5` says the fonts are
bundled so the app does not depend on the device. In this container the
verse's Uthmani marks (ٱ and the small high signs) draw as empty boxes in
check U's Qurʾān sheet captures; whether the tablet's system Arabic font
covers them is unconfirmed. Found by Phase 5 step 5a's captures; left
unfixed (structure-only phase). Check U's Qurʾān PNGs depend on the
container's fonts, which is stable here.

## 39. The read-mark ↓ does not move past a mark it has just centred (2026-11-17, measured)

Found while building check R's read-mark scenario (Phase 5 step 5b).
`ReadMarkNav` (`ui/reader/ReaderHeader.tsx:129-164`) picks "next" as the
first read mark after `currentOrder` (`:139`), which is the order of the
block at the **top** of the screen (`visibleBlock`, `:97`; `topIndex` in
`ui/reader/BlockList.tsx:289-298`). Its jump **centres** the mark
(`scrollToOrder(order, 'center')`, `:98`). A centred mark is below the top
block unless it is tall enough to reach behind the header, so the next ↓
finds the same mark and the page does not move. Measured in R, both
profiles: with read marks on blocks 400, 450 and 500, ↑ from block 450
centred and then ↓ leaves block 450 at the middle of the screen instead of
bringing 500 (R prints this as a report line every run, judged by nothing).
↑ is not affected: "previous" is before the top block, so a centred mark is
skipped correctly. By the same reading, ↓ from the top of the book reaches the
first mark and a second ↓ stays on it, so in a session ↓ never gets past the
first mark below the top of the screen. **May make the session navigation
look broken on the tablet.** Left unfixed (structure-only phase); R's judged
checks (↓ once from the top, ↑ twice from past the marks) do not depend on
it, so a fix changes only the report line.

## 40. A centred jump lands one header height low, and `settleOn` retries it eight times (2026-11-17, measured)

Found while building check R's 5b scenarios. The virtualizer has
`scrollPaddingStart: topInset` (`ui/reader/BlockList.tsx:243`); for
`align: 'center'` TanStack Virtual subtracts the padding and then centres in
the whole viewport (`getOffsetForIndex`/`getOffsetForAlignment` in
`@tanstack/virtual-core`), so the item's middle lands at
`innerHeight / 2 + topInset`. `settleOn` (`ui/reader/blockLayout.ts:74-99`) tests a
centred landing against `innerHeight / 2` (`:93`), finds it `topInset` off
(51 px in landscape, 93 px in portrait — the header's height), more than its
4 px, and calls `scrollToIndex` again, which lands in the same place, until
`attempts >= 8` (`:88`). Measured in R: a card tap brings block 1000 to
295–405 px on a 600 px screen (middle 350 = 300 + 51 − 1), and every read-mark
jump is 51 or 93 px below the screen's middle. So every centred jump (a search
result, a card tap, the read-mark ↑ ↓) runs all eight passes over sixteen
frames, and its target sits half a header below the middle of the visible
area (about 25 px in landscape, 46 px in portrait). Cosmetic and a little
wasted work; left unfixed (structure-only phase). R's search and card checks
use a tolerance and its read-mark checks judge which block is at the middle
of the visible area, so a fix needs no re-baseline.

## 41. A failed card is served from the translation cache (2026-11-17, measured)

Found while building check P (Phase 5 step 5c). A failed translation is
stored like a finished one: the failed card (`ui/reader/translationSteps.ts:142-148`)
keeps the `cacheKey` the loading card was given (`:127`) and is written with
`putCard` (`ui/reader/useTranslator.ts:332`). The cache read before every
translation (`useTranslator.ts:245-250`) returns any
card under that key without looking at its `status`, and
`getCardByCacheKey` (`platform/storage/idbWork.ts:64-69`) does not filter
either. So selecting the same passage again and tapping Translate returns the
failure, with no request; Translate all… does the same for each block of its
range (`ui/reader/useBatchTranslate.ts:85-98`), counting the cached failure
as "did not complete" — the proposal bar's "Blocks already translated are
served from the cache" holds for failures too. A transient failure (`network`,
`rate-limit`, a 500) therefore sticks until the card's own Retry or
Retranslate, which pass `force`. Measured in P: `error-cached` (the HTTP 400
block selected again: no request, the same failed card) and `batch-again`
(the batch re-run: no request, "Finished — 2 of 3 blocks translated, 1 did not
complete."). **A tablet user who retries by translating the passage again sees
the same error indefinitely.** Left unfixed (structure-only phase); a fix
changes those two scenarios of P.

## 42. Retranslate deletes the card before the key check refuses (2026-11-17, measured)

Found while building check P. `retranslate` (`ui/reader/useTranslator.ts:356-372`)
deletes the card from storage and from the list first (`:361-362`) and then
calls `translate`, whose key check returns `null` with a notice when the
chosen provider has no key (`:223-230`). So "Retranslate ▾ → a provider
whose key is not set" removes the card and translates nothing. For a Claude
card that throws away a paid response, against README.md:501 ("A paid
response is never discarded"). Measured in P, `retranslate-no-key`: the verse
block's Gemini card, Retranslate ▾ → a Claude model with no Claude key — the
cards store goes from 7 rows to 6 and the notice "No Claude API key is set.
Add one in Settings before translating." shows. Left unfixed; a fix changes
that scenario of P.

## 43. A Gemini card says "web search" though Gemini searches nothing (2026-11-17, by reading, recorded by P)

Found in the `torjuman-llm` agent's read of check P. The card's
`usedExternalLookup` is set from the profile (`digDeeper ||
activeProfile.allowExternalLookup`, `ui/reader/translationSteps.ts:129`)
whatever the provider, and the card's header shows "· web search" whenever it
is true (`ui/reader/TranslationCardView.tsx:313-315`). Only
`AnthropicProvider` reads `request.allowExternalLookup` (it runs a research
pass with the web-search tool, `translation/providers/AnthropicProvider.ts:86`);
`GeminiProvider` never does, so a Gemini card from a profile with external
lookup allowed claims a search that did not happen. P's `external-lookup`
scenario records exactly that (the request is the plain one, the card says
web search). Related, by reading: `SessionStats.cacheWriteTokens` is summed
(`ui/reader/useTranslator.ts:91`) and read nowhere in `src/ui` (the session line shows
cache reads only, `ui/reader/CardPanel.tsx:371-375`). Left unfixed.

## 44. The selection comment still names the bottom bar (2026-11-17, by reading)

`ui/reader/ReaderScreen.tsx:338` ("Track whether a selection exists, so the
bottom bar can show.") names the bottom bar of Amendment 10. README "Selection
actions are a left rail" records that the bar was replaced by `SelectionRail`,
a vertical rail on the left. The debounce paragraph's last sentence ("Nothing
is resolved or stored — only whether a selection exists and whether it is one
word.") is out of date too: `peekSelection` (`ui/reader/selection.ts:172-177`)
also stores `shortSelection` and `centerY`. A fix corrects both sentences. The
rest of the comment (why `selectionchange` and not `pointerup`, why debounced)
still holds. Found while moving the comment for 30; the second sentence by the
review of 30. Docs only. Left unfixed.
