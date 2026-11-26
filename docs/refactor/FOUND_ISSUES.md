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

**Fixed in lane B** (commits starting "11." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B"), except the closing paragraph on inline call parameters, which is still open.

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

**Fixed in lane B** (commit "12." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B").

`AnthropicProvider.validateKey` (~62–80; ~51–69 by Phase 3) returns `true` for every `APIError`
that is not a 401 or 403, on the reasoning that a rate limit or a 400 still
proves the key authenticated. But the SDK's `APIConnectionError` is an
`APIError` with no status (`node_modules/@anthropic-ai/sdk/core/error.mjs`
~71), so with no network the key test reports the key as good — after three
attempts. Check Q records it (`anthropic.validateKey.connection-failure` →
`true`). Left as is; a fix would treat a status-less error as "could not
check". Found by the `torjuman-llm` plan read before Phase 3 step 3a.

## 13. The translation cache key depends on the device's locale (2026-11-16, measured)

**Fixed in lane B** (commits "13." on `claude/lane-b-translation`, per DECISIONS 13).

A consequence the owner will see, found by the whole-branch review: where
the glossary's code-point order differs from its old `en-US` order (likely
for Arabic: إ and أ against ا, and the ḥarakāt), the glossary hash changes,
so every card made with that glossary shows the amber "changed since this
was translated" note once after the update, until retranslated. The cards
themselves are unchanged. Not measured on the owner's glossary.

`glossaryHashOf` (`translation/prompt.ts` ~20) sorts glossary entries with
`localeCompare`, whose order depends on the browser's locale. Two devices with
different locales could compute different glossary hashes, and so different
cache keys (trap 5), for the same glossary — a cached card made on one would
not be found on the other after a tablet transfer. Not known to have happened;
the owner's tablets share a locale. Check Q pins `en-US`. Left as is. Found by
the `torjuman-llm` plan read before Phase 3 step 3a.

## 14. Five error paths check Q's added scenarios expose (2026-11-16, measured)

**Fixed in lane B** (commits "14." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B").

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

**Fixed in lane B** (commits "15." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B"; 15.2 for translate only, Explain is 54).

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

**Fixed in lane B** (commits "26." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B"; older cards: 53).

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

## 27. The panel divider ignores `pointercancel` and has no `touch-action` (2026-11-16, by reading, fixed in lane A)

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

**Fixed in lane A:** the divider has `touch-none` (`touch-action: none`, on
the divider alone, so the page still pans elsewhere) and captures the pointer
on `pointerdown`; the captured events still bubble to the window listeners.
`usePanelControls` ends a drag on `pointercancel` exactly as on `pointerup`:
`dragging` off, `user-select` restored. A cancelled drag keeps the width it got
to, as a released one does. During the drag the width is the screen's own
state (`dragWidth`, shown in place of `settings.panelWidth`); `updateSettings`
runs once, when the drag ends, instead of on every `pointermove`. R judges it:
"a divider drag that ends in pointercancel" (three checks: nothing stored
during the drag; the cancel stores the width reached and restores
`user-select`; later moves leave the panel alone) and the finger drag's tail
(selection back on, a stray mouse move leaves the panel alone). On the old
code all four failed (stored during the drag, `user-select` "none", a stray
move to 300). Whether a real finger drag now resizes the panel is the tablet's
to show (plan item M3).

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

**Fixed in lane B** (commit "29." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B").

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
React drops, so `useTranslator.ts` (lane B's) needed no cancellation; the
same holds for `listMarks`, `listExplanationCards` and `listSharhCards`
(`useMarks.ts:25`, `useExplanations.ts:36`, `useSharh.ts:23`), which could
each have leaked the first book's list into the second. Keying
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

**Fixed in lane B** (commit "33." on `claude/lane-b-translation`, per DECISIONS 33).

`ui/reader/ReaderSheets.tsx:131`: the rail gets `meaningAvailable={navigator.onLine ||
secrets.getProviderKey(GLOSS_PROVIDER_ID) !== ''}`. Offline with a key, Meaning
is offered and fails unless the word is cached; offline without a key it is
disabled, though a cached gloss would work with neither:
`translation/gloss.ts:97-100` returns the cache before checking the network
(`:102-106`) or the key (`:108-110`). May be intended; unstated. Phase 5 plan, Design §9 H.

## 34. Anchored panels re-register their outside tap on every reader render (2026-11-16, by reading, fixed in lane A)

The reader passes inline `onClose` arrows to its sheets
(`ui/reader/ReaderSheets.tsx:177`, `:186`, `:256`, `:287`), new on every
render. `AnchoredPanel`'s effect depends on `onClose`
(`ui/reader/AnchoredPanel.tsx:131`), so each render removes its document
`pointerdown` listener and adds it back a tick later (`setTimeout(…, 0)`,
`:122`). The screen renders on each change of the top block while scrolling, so
with a sheet open a tap landing in that tick is not seen as an outside tap.
Minor. Phase 5 keeps it exactly (its plan, Design §6.4). Phase 5 plan, Design
§9 I.

**Fixed in lane A:** `AnchoredPanel` holds the latest `onClose` in a ref,
updated in a layout effect declared before the others, and its effects and
`reposition` call `onCloseRef.current()` instead of listing `onClose`.
`reposition` now depends on `[anchor, asSheet]` and the listener effect on
`[anchor, reposition]`, so neither the document listeners nor 37's size
observer are re-registered by a reader render. The call sites in
`ReaderSheets.tsx` keep their inline arrows. None of the six users
(`ShareChapter`, `QuranSheet`, `BiographySheet`, `HadithSheet`,
`CardPopover`, `DictionarySheet`) has an effect on `onClose`; they pass it on
or call it from a handler. The plan's Design §6.4 text records Phase 5 as it
was approved and is left as it is. R's "an open popover keeps its outside-tap
listener while the page scrolls" guards it: on the old code, eight 35 px
scrolls (top block 11 → 12) added the pointerdown listener 4 times. It also
requires the popover's own registration on opening, and then taps the text
outside the popover and expects it to close (the first outside tap in R or S).

## 35. Offline translation reads every ḥadīth's cache row, one at a time (2026-11-16, by reading)

**Fixed in lane B** (commits "35." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B").

`ui/reader/useTranslator.ts:126-132`: before each on-device translation, the
loop awaits `storage.getHadith` for every ḥadīth entity in the book, one read
after another, whatever the selection covers. On a large collection that is
thousands of sequential reads per translation. Performance. Phase 5 plan,
Design §9 J.

## 36. `digDeeper` is unreachable (2026-11-16, by reading)

**Fixed in lane B** (commits "36." on `claude/lane-b-translation`, per DECISIONS 36).

`TranslateRequest.digDeeper` (`ui/reader/useTranslator.ts:38`), its default
(`:211`), its two uses (`ui/reader/translationSteps.ts:129`, `:82`) and
`retranslate`'s option (`useTranslator.ts:359-365`) have no caller left in `src/`: the card's "Dig deeper" button was
replaced by Explain (`ui/reader/TranslationCardView.tsx:229-232`). A dead
option, kept by Phase 5. Phase 5 plan, Design §9 K.

## 37. An anchored popover is not re-placed when its content grows (2026-11-16, measured, fixed in lane A)

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

**Fixed in lane A:** `AnchoredPanel` observes its own panel with a
`ResizeObserver` and runs `reposition` whenever the panel's size changes,
disconnecting in the effect's cleanup; the scroll and resize listeners stay.
Placing moves only `top` and `left` (the width is fixed, the height is the
content's), so the observer does not answer its own placement. A sheet
(`asSheet`) is never placed, so it is not observed. R's "a popover is placed
again when its content grows" guards it: the bundled translation is held back
2.5 s, so the Qurʾān popover opens in its loading state below a verse low on
the screen with no reader render after. On the old code it stayed at top 433
as it grew from 138 to 297 px, ending at 730 on a 600 px screen. U's resize
step before each dialog capture stays. R's older "a popover follows its anchor
as the page scrolls" had measured that same stale placement (330 → 270, the
grown popover's bottom at 627); with the fix it raced the translation's arrival
(one run 12 → 270, see 47), so its setup now puts the verse at 120 px and waits
for the popover's content before measuring. Its assertion is unchanged.

## 38. The Qurʾān sheet's verse uses the device's font, not the bundled one (2026-11-16, measured in the container, fixed in lane A)

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

**Fixed in lane A:** `ArabicVerse` sets `fontFamily` from
`settings.fontFamily` with Amiri behind it, the same stack as `BlockRow` and
`DictionarySheet`, so it follows the reader-font setting. Measured with
Chromium's `CSS.getPlatformFontsForNode`: Amiri and Scheherazade New each draw
all 68 distinct non-ASCII characters of `public/quran/uthmani.json` (ٱ, the
small high signs U+06D6–06ED, U+08F0–08F2 included) with no fallback; the old
system stack fell back to DejaVu Sans and FreeSerif. U's Qurʾān captures no
longer depend on the container's fonts for the Arabic (their English and
labels still do).

## 39. The read-mark ↓ does not move past a mark it has just centred (2026-11-17, measured, fixed in lane A)

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

**Fixed in lane A:** `BlockList` also reports the block at the middle of the
area below the header (`onMiddleBlockChange`), the point a centred jump puts
its block on since 40, and `ReadMarkNav` counts "previous" and "next" from it
(`ReaderHeader.tsx`), falling back to the top block only before it is known.
The mark just centred is then neither, so ↓ moves on from it, and ↑ still
skips it (strict `<`). A mark already on screen above the middle now counts as
behind: from the very top of the book, ↓ goes to the first mark below the
middle of the first screen, and one above it is behind (↑) and is
already on screen; see 52. R judges it:
"↓ ↓ ↓ from the top visits the read marks in order" in both layouts (on the
old code 400, 400, 400 and ↓ still on), and the `readMarkDown` report line now
reads `atMiddle` 500.

## 40. A centred jump lands one header height low, and `settleOn` retries it eight times (2026-11-17, measured, fixed in lane A)

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

**Fixed in lane A:** `settleOn` (`ui/reader/blockLayout.ts`) computes a
centred landing itself: the block's top at
`topInset + (innerHeight - topInset - height) / 2`, so its middle is at the
middle of the area below the header, or at `topInset`, as a `start` jump, for
a block taller than that area. (TanStack's centring had put such a block's top
under the header, at `topInset + (innerHeight - height) / 2`: about 17 px under
it for block 1100's 633 px on a 600 px screen, only its text reaching the
header's edge.)
The first pass aims from the virtualizer's held heights through
`scrollToOffset` (`scrollToIndex` would have its reconciling pass re-aim at
TanStack's own centre); later passes correct from where the block actually
is, since a held height can still be an estimate. Its test uses the same
place. A centred landing found on target is looked at once more two frames
later, because a block still drawn at its content-visibility placeholder can
have grown to its real height by the next check (block 1100, in the column the
search panel narrows, measured 196 px at one check and 633 px at the next).
`start` jumps are unchanged. R's "a centred jump lands at the middle below the
header" guards it in both layouts: on the old code
the block's middle was 24 and 46 px low and the jump made 8 and 10 jump
writes; now 0–1 px, and 2 and 4. Portrait takes three passes, not two: its
taller visible area brings more estimated blocks above the target into view
and moves it once more.

## 41. A failed card is served from the translation cache (2026-11-17, measured)

**Fixed in lane B** (commit "41." on `claude/lane-b-translation`, per DECISIONS 41).

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

**Fixed in lane B** (commits "42." on `claude/lane-b-translation`, per DECISIONS 42).

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

**Fixed in lane B** (commit "43." on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B").

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

## 45. A batch translation keeps running, unseen, after the reader closes (2026-11-17, by reading)

`ui/reader/useBatchTranslate.ts:82-110` runs its loop to the end whatever
happens to the screen that started it. Leaving the reader (through the
Library, or by editing the URL to another book) unmounts the bar that shows
its progress and holds its Stop, but not the loop: it goes on translating
and saving cards for the first book, and it holds `beginActivity` until it
ends, so the PWA's update prompt waits for it. Before lane A's fix for 31,
editing the URL kept the reader mounted, so the bar stayed visible (in the
wrong book); the Library path has always behaved this way. Found by the
review of lane A's 31. Left unfixed.

## 46. A Similar āyah's high marks touch the label above it (2026-11-17, measured in the container)

Once the verse draws in the reader font (38), a stacked high mark on the
first line of a `RelatedAyahView` (`ui/reader/QuranTabs.tsx`) reaches into its
label line ("… words · N% coverage", `mb-1` above an `ArabicVerse` at 17 px
with line height 2.1). In U's `reader-quran-similar` at 960×600, the pause
mark ۗ (U+06D7) over 42:53's ٱلۡأَرۡضِ overlaps the "c" of "coverage", and 34:1's
ۚ (U+06DA, after ٱلۡأٓخِرَةِ) touches the bottom of "53%". Overlap, not clipping: nothing is cut off. The
Translation tab's single verse has the tab bar's padding above it and is
clear. Before 38 these marks drew as empty boxes inside the line, so the collision
was hidden. Cosmetic. Left unfixed.

## 47. A popover that fits neither below nor above covers its anchor (2026-11-17, measured)

`AnchoredPanel`'s `reposition` (`ui/reader/AnchoredPanel.tsx`) puts the
popover below its anchor if it fits, and otherwise at
`Math.max(MARGIN, rect.top - 8 - panelHeight)`: when it fits on neither side,
that clamps it to the top of the screen, over the anchored text. In R's
landscape run, the Qurʾān popover (297 px) over a verse whose top was near
277 px sat at top 12 to 309, covering the verse; a 60 px scroll then let it fit
below and it jumped to 270. Found while fixing 37, which made the popover
measure its real height (before, it placed itself at its 138 px loading height
and ran off the bottom instead). The placement rule itself is unchanged by
37. A product choice (cover the anchor, run off the screen, or shrink the
panel to the larger side). Left unfixed.

## 48. The margin menu re-registers its outside tap on every reader render (2026-11-17, by reading)

The pattern of 34, in `ui/reader/MarginMenu.tsx:29-43`: its effect depends on
`[onClose]`, which `ui/reader/ReaderSheets.tsx:241` passes as an inline arrow
(`() => setMarginMenu(null)`), new on every reader render; the effect adds its
document `pointerdown` listener after a `setTimeout(…, 0)` and removes it in
its cleanup. So with the margin menu open, each reader render takes the
listener away and adds it back a tick later, and a tap in that tick is not
seen as an outside tap. MarginMenu is not `AnchoredPanel`, so 34's fix does not
reach it. Found by the review of 34. Minor. Left unfixed.

## 49. An open popover is not re-placed if its anchor moves without a scroll (2026-11-17, by reading)

Since 34, `AnchoredPanel` places an open popover again only on a scroll, a
window resize, a change of its own size (37), or a new anchor or sheet mode —
no longer as a side effect of every reader render, which re-created
`reposition` and re-ran its layout effect. The one case none of these covers
is the anchor moving because layout above it changes inside the viewport with
no scroll and no change in the panel's size (a block above it growing or
shrinking, say). No concrete trigger was found: the virtualizer's own
corrections move the page by scrolling, which is seen. A possibility, not a
measured bug. Found by the review of 34. Left unfixed.

## 50. The divider's handlers ignore `pointerId` (2026-11-17, by reading)

`ui/reader/usePanelControls.ts`: while the divider is dragged, any
pointer's `pointermove` resizes the panel and any pointer's `pointerup` or
`pointercancel` ends the drag, so a second finger landing elsewhere during a
drag moves or ends it. Pre-existing; found by the review of lane A's 27.
Left unfixed.

## 51. Leaving the reader mid-drag leaves the page unselectable (2026-11-17, by reading)

The divider's `onPointerDown` sets `body` `user-select: none`, and only the
drag's `pointerup` or `pointercancel` restores it; the window listeners'
effect (`ui/reader/usePanelControls.ts`) removes the listeners on unmount but
does not restore `user-select`. A navigation away while a drag is under way
leaves text unselectable on the next screen until a reload. Since lane A's 27
such an unmount also loses the width reached (it is stored on release).
Pre-existing; found by the review of lane A's 27. Left unfixed.

## 52. A read-mark arrow does nothing for a mark that cannot reach the middle (2026-11-17, by reading)

`ReadMarkNav` (`ui/reader/ReaderHeader.tsx`) counts "previous" and "next" from
the block at the middle of the area below the header (39) and centres the mark
it jumps to. A mark in the first half-screen of the book cannot be centred:
the jump is clamped at the top of the page and nothing moves, so the middle
block stays after it and ↑ keeps offering the same mark, a tap that does
nothing; the same with ↓ for a mark in the last half-screen. The mark is on
screen all along. Before 39 the same happened from the top block (↓ to a mark
near the top of the book stayed on it). Whether such a mark should count as
reached, or the arrow be off, is a product choice. Found while fixing 39.
Minor. Left unfixed.

Lane B's entries were numbered 44–64 on its branch; on the owner's word
(2026-11-18) they were renumbered 53–73, after lane A's 44–52, so the two
lanes can merge. Each old number is the new one less 9. Commit subjects
keep the old numbers: "52." is 61, "59." is 68, and the fix to 72 went in
as "52.". An issue's number in a lane B commit subject from 44 up is the
old one.

## 53. Dictionary-entry cards made before the fix to 26 keep the block's key (2026-11-17, by reading)

Found by the review of lane B. A "Translate this entry" card stored before
FOUND_ISSUES 26 was fixed has no `standalone` flag and holds the visible
block's cache key, so a later Translate of that whole block, or Translate
all over it, still returns the entry's card. Nothing migrates such cards.
Retranslating such a card brings the old bug back each time: with no flag it
is treated as a block selection, so the request carries the visible block's
context, types, ḥadīth numbers and verses with the entry's text, and the new
card is stored under the block's key again. Left unfixed; a fix would need a
way to tell an old entry card from a block card (its `sourceText` differs
from the block's text).

## 54. Explain loses its research notes when the stream fails mid-reply (2026-11-17, by reading)

**Fixed in lane B2** (commit "54." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B. FOUND_ISSUES 15.2 was fixed for translate
(`withRaw` in `providers/AnthropicProvider.ts`); `translation/explain.ts`
still throws the mapped error without the notes written so far. Its scope
named translate only. Left unfixed.

## 55. A failure after a paid reply in translate keeps no raw text (2026-11-17, by reading)

**Fixed in lane B2** (commit "55." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B. In `ui/reader/useTranslator.ts`, if
`enrichSegments` or `storage.putCard(finished)` throws after the provider has
returned, the error is not a `TranslationError`, so `failedCard` sets no
`rawResponse` and the paid reply is not kept on the failed card. Left
unfixed.

## 56. README still names the per-card "dig deeper" toggle (2026-11-17, by reading)

Found by the review of lane B: README.md ~1108 says "beyond the per-card 'dig
deeper' toggle", stale since Explain replaced it (FOUND_ISSUES 36). The name
also survives for the Claude research pass, which still exists (reached only
through a profile's `allowExternalLookup`): README.md ~483 ("Dig deeper runs
as two passes"), the comment in `translation/providers/AnthropicProvider.ts`
(`translate`), `translation/models.ts` ("(dig deeper, Explain)"), and check Q's `anthropic.translate.dig-deeper*` scenario ids
(which should keep their names; renaming means a re-record for no behaviour
change). Lane D material. Left unfixed.

## 57. Consequences of 41 and 42 as decided (2026-11-17, by reading)

Found by the review of lane B, for the owner to know; each follows from
DECISIONS 41 and 42, none is a defect of the fix:

1. A passage that keeps failing gains one more failed card per attempt, and
   a later success leaves the failed cards beside it. Translate all the same.
2. If retranslating card A fails as F, and Retry on F then succeeds as B, A
   is not replaced (B replaces F): two complete cards for one range.
3. Two retranslations of one card started while the first is in flight both
   survive.

## 58. The Claude key check passes on a server error (2026-11-17, by reading)

**Fixed in lane B2** (commit "58." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B. `AnthropicProvider.validateKey` still returns
`true` for any 5xx (500, 529 overloaded) through the branch whose comment
says a rate limit or a 400 still proves the key authenticated, which does
not obviously hold for a server error. Check Q has no
`anthropic.validateKey.500` scenario. Outside 12 as decided. Left unfixed.

## 59. Two error messages repeat themselves (2026-11-17, by reading)

**Fixed in lane B2** (commit "59." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B. Cosmetic: the key screens read "Could not
reach Claude: Could not reach api.anthropic.com. …" (the screen's prefix
plus the mapped message; Gemini reads the same way), and an Anthropic 500 in
Explain, gloss and compile reads "Anthropic API error 500: 500 {…}" (the
status in the prefix and again in the SDK's message). Left unfixed.

## 60. `useSharh` keeps one busy flag (2026-11-17, by reading)

**Fixed in lane B2** (commit "60." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B. `ui/reader/useSharh.ts` has the single-flag
pattern FOUND_ISSUES 29 fixed in `useTranslator`; its busy bar is in
`CommentaryBars.tsx`. If two sharḥ lookups can run at once, the first to
finish hides the bar (inferred, not checked). Left unfixed.

## 61. On device, a marked name in the selection is treated as a ḥadīth (2026-11-17, by reading)

**Fixed in lane B** (commit "52." (lane B's old number for 61) on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B"; checked by V).

Found by the review of lane B. `translation/offline/segmentSelection.ts`
`pushEntity` emits every entity that is not a verse as a `hadith` segment,
and the reader passes it every entity, `narrator` and `person` included. So
on the on-device path a marked name inside the selection is cut out of the
prose sent to the model and shown as an untranslated "ḥadīth" with the
no-offline-source note; a narrator inside a ḥadīth also overlaps the ḥadīth
piece, and `cursor = max(...)` does not drop the overlap, so that text
appears twice. Left unfixed.

Since the fix, a verse quoted inside a ḥadīth is read in the ḥadīth's Arabic
and no longer gets a segment of its own, so its bundled English and
reference no longer show (before, they showed as a duplicate after the
ḥadīth). Where a clipped piece is emitted, `pushEntity` still substitutes
the whole `textUthmani` or verified Arabic, so in that edge case the overlap
can still show twice. Offline cards made before the fix keep their old
segments until retranslated.

## 62. The online signal is never corrected by request outcomes (2026-11-17, by reading)

Found by the review of lane B. `app/useOnline.ts` exports
`reportNetworkFailure` and `reportNetworkSuccess`, and its header says the
signal is "corrected by real request outcomes", but nothing in `src/` calls
either, so `useOnline()` is a reactive `navigator.onLine`. Related, since
FOUND_ISSUES 33: `glossWord`'s "No API key is set" branch is now reachable
only if the key is removed while the rail is open; it stays as a guard.
Left unfixed.

## 63. The structuring pass keeps less raw text than it could (2026-11-17, by reading)

**Fixed in lane B2** (commit "63." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B, beside 15.2. In
`translation/providers/AnthropicProvider.ts` `structure`:

1. A first attempt cut off at `max_tokens` has its streamed tool JSON
   (`partial`, paid) reset before the retry; if the retry fails, raw holds
   only the second attempt's.
2. Only tool `inputJson` deltas are collected while streaming; text the
   model writes instead is not in raw if the stream then fails.
3. A refusal keeps no raw, and the truncated and parse errors keep `partial`
   or the text but not the research notes, unlike `withRaw` on a stream
   error.

Left unfixed.

## 64. A failure after research loses the research pass's cost (2026-11-17, by reading)

**Fixed in lane B2** (commit "64." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B. When the structuring pass fails after a
research pass, the error carries no usage, so the research pass's tokens and
cost reach neither the failed card nor the session totals. Left unfixed.

## 65. Two finished cards under one key: the oldest id wins (2026-11-17, by reading)

**Fixed in lane B2** (commit "65." on `claude/lane-b2-translation`; the lane B2 work order).

Found by the review of lane B. Since 41, `getCardByCacheKey` walks
`byCacheKey` and returns the first complete row, which is the lowest primary
key, not necessarily the newest card. Two complete cards under one key
happen through 57.2, 57.3 or a failed `dropReplaced`. Left unfixed.

## 66. The "web search" badge names a provider (2026-11-17, by reading)

**Fixed in lane B2** (commit "66." on `claude/lane-b2-translation`; the lane B2 work order: a provider capability).

Found by the review of lane B. FOUND_ISSUES 43's fix shows the badge only
when `card.providerId === 'anthropic'` (`ui/reader/TranslationCardView.tsx`),
for cards stored before the fix. That is a new place in the UI that names a
provider, not in the Phase 3 plan's Design §5 list. Left as it is unless the
owner wants a provider capability instead.

## 67. Gemini's 429 wait has no cap (2026-11-17, by reading)

**Fixed in lane B2** (commit "67." on `claude/lane-b2-translation`; DECISIONS, lane B2: a 60 s cap).

Found by the review of lane B. Gemini translate waits whatever `retry-after`
asks, number or (since 11) date, before its next attempt, with no upper
bound, so a far-future value holds the card spinning. Request count is
unaffected. Left unfixed.

## 68. An unresolved ḥadīth reaches the on-device model (2026-11-17, by reading)

**Fixed in lane B** (commit "59." (lane B's old number for 68) on `claude/lane-b-translation`; DECISIONS, "Delegated to lane B"; checked by V).

Found by the review of lane B's fix to 61. **Against the ḥadīth invariant.**
`translation/offline/segmentSelection.ts` skips every entity whose
`matchQuality` is `'unresolved'`, and `quran/detectEntities.ts` (~311)
marks the ḥadīth entity of a `hadith_matn` block with no `hadithNumber` as
`unresolved`. Those entities are stored and passed to `useTranslator`
(`quran/entityService.ts` stores them all; only `markableByBlock` drops
them). So on device the whole text of an unnumbered matn goes into `prose`
and reaches the model, against "A ḥadīth with no offline source must never
reach the translation model" (README, "The invariant"; the header of
`segmentSelection.ts`). Present since 810b059 (2026-08-27); not caused by
lane B. The owner asked for it to be fixed in lane B (2026-11-18): an
unresolved ḥadīth is now cut out of the prose like a resolved one, with the
no-offline-source note.

Consequences of the fix the owner should know (from its reviews):
on-device cards made before it, over an unnumbered matn, keep a prose
segment holding the model's English for that ḥadīth. Their cache key is
unchanged (correctly: trap 5), so nothing marks them stale; they stay, in
backups and shares too, until retranslated. And a verse quoted inside an
unnumbered matn is now read in the ḥadīth's Arabic without its own bundled
English, as a numbered matn's already was (61). Also fixed by it: books
whose entities were detected under 810b059, which marked even a numbered
matn in an unmapped book `unresolved`.

## 69. A verse across two blocks shows twice in an offline card (2026-11-17, by reading)

Found by the review of lane B's fix to 61. `segmentSelection` emits a verse
once per block's share, and each time `pushEntity` uses the whole
`textUthmani` and English, so a verse spanning two blocks appears twice in
an offline card. Pre-existing. Left unfixed. (Since 68, a verse that starts
inside an unnumbered matn is no longer emitted as two verse segments: its
first block's part lies inside the ḥadīth and is skipped, and the whole verse
follows once — the 61 edge case, as for a numbered matn, so that first part
is still read twice, once in the ḥadīth's Arabic. The exception is 72.)

## 70. On device, prose from consecutive blocks is joined with no separator (2026-11-17, by reading and a probe)

Found by the `torjuman-llm` review of lane B's fix to 61. `pushProse` in
`translation/offline/segmentSelection.ts` merges a prose span into the one
before it with `previous.arabic += text`, so the last word of one block and
the first word of the next reach the on-device model glued together ("one
twothree four" in the probe). Pre-existing; since 61 it is more common,
because a marked name at a block edge no longer cuts the prose there. A fix
would join with a newline, which `splitSentences` already treats as a
boundary (a space would only keep the words apart). But the merge exists so
a sentence broken only by whitespace is not translated as two fragments, and
it fires only across blocks: a newline would split every sentence that runs
over a page break, a space would not. The fixer should weigh that. Left
unfixed.

## 71. On device, the ḥadīth invariant holds only once the entities have loaded (2026-11-18, by reading)

Found by the review of lane B's fix to 68. **A risk to the ḥadīth
invariant.** `segmentSelection` cuts a ḥadīth out of the prose only where an
entity marks it, and the reader's `entities` start as `[]`
(`ui/reader/ReaderScreen.tsx` ~126) and are filled by an asynchronous load
(~302–312, `void load.then(...)`, no rejection handler). An on-device
translation run before the load finishes, after `ensureEntities` rejects, or
on a shared chapter that carries no entities, puts every `hadith_matn` block
into `prose`, where the model translates it. Not measured. Pre-existing; not
caused by lane B. A fix could cut by `block.type === 'hadith_matn'` as well
as by entity, or refuse an on-device translation until the entities are in.
Left unfixed.

## 72. A verse and a ḥadīth with the same span: the verse can win (2026-11-18, by reading; fixed in lane B)

Found by the re-review of lane B's records for 68 and 69. In
`translation/offline/segmentSelection.ts` the sort
`a.start - b.start || b.end - a.end` leaves a tie on both start and end to
the input order. That happens when a verse starts in a matn block and runs
into the next, and either the selection starts inside the verse or the
verse's start is the block's offset 0: both pieces are then the block's
share to its end. `detectEntities` pushes a block's verses before its
ḥadīth, and ids are time plus counter, so the verse comes first in stored
order. It is then emitted with its whole `textUthmani`, the ḥadīth piece is
skipped, and the verse is emitted again in the next block: the verse shows
twice and the ḥadīth segment, with its no-offline-source note, is missing
from the card. Nothing goes to `prose`, so the invariant holds. Not
measured.

Partly caused by lane B, as the whole-branch review found: before 61 each
piece was sliced from its own start, so the tied ḥadīth was still emitted
(the verse showing twice is 69's, older). The skip 61 added is what drops
it. **Fixed in lane B** (commit "52." (lane B's old number for 61) after the re-record): on an exact tie
the ḥadīth goes first; checked by V.

The commonest tie, which the paragraph above does not list: in one block, a
selection lying wholly inside a verse quoted inside a matn clips both pieces
to the selection. Between 36b6a8d and the fix the card showed the verse (its
whole muṣḥaf text and bundled English) and dropped the ḥadīth; it now shows a
ḥadīth segment (the selected Arabic with the no-offline-source note, or the
whole verified ḥadīth if cached) and no verse English, as DECISIONS 61 says
for a verse inside a ḥadīth.

## 73. On device, part of a verified ḥadīth shows the whole of it (2026-11-18, by reading)

Found by the re-review of lane B's fix to 72. `pushEntity` in
`translation/offline/segmentSelection.ts` emits `verified?.arabic ||
sourceText`, so a selection covering only part of a ḥadīth whose verified
translation is cached shows the whole verified Arabic and English, not the
selected slice. Not measured; pre-existing. Left unfixed.

## 74. `stripApparatus` cuts inside words (2026-11-20, by reading)

Found by the review of 17ac63a (hadith text matching, step 0b).
`TAKHRIJ` and `ISNAD_CLOSER` in `retrieval/sharh.ts` are not word-anchored:
«رواه» and «أخرجه» match inside «ورواه», «فرواه», «وأخرجه» and «فأخرجه», and
`أنه?\s+قال` can stop at the start of «قالوا». The cut leaves a one- or
two-letter fragment («و», «ف», «وا») in the edge shingle, which then cannot
hit; on a short survivor that alone fails `agreement`. It affects the sharḥ
lookup and the hadith-json match alike. The step 0b report counts such misses
as "over-stripped". Not measured; pre-existing. Left unfixed.

## 75. `stripApparatus` never matches vowelled text (2026-11-20, by reading)

Found by the same review. The regexes run on the raw block text, before
`normalize`, so «رَوَاهُ» or «رَضِيَ اللَّهُ عَنْهُ» with ḥarakāt never match,
and a book printed vowelled keeps its takhrīj and isnād in the shingles.
Whether book 9260's matn blocks carry ḥarakāt was not checked. Pre-existing.
Left unfixed.
