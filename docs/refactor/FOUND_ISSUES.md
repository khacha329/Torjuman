# Found issues

Bugs, inaccuracies and oddities found while restructuring. **Left as they
are** — a refactor step changes structure only. Each is fixed, if the owner
wants it fixed, in its own change, and the entry then says where.

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
  saves `model: 'gemini-3.7-flash'` inline.
- Call parameters outside `models.ts`: `translation/gloss.ts:111,114` set
  `max_tokens: 2000` and `output_config: { effort: 'low' }` inline (with
  comments saying why). **Moved in Phase 3 step 3j** (owner's Q6) to
  `models.ts` as `GLOSS_MAX_TOKENS` and `GLOSS_OUTPUT_CONFIG`, comments
  verbatim.

Left as is: Phase 3 (provider seams) is where these move, as structure. The
comment in `registry.ts` is corrected when the registry moves in Phase 1 step
1h only if the plan names it; otherwise in Phase 3.

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
- `pageIndexOf` — `ui/reader/BlockList.tsx` (~134) and
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

- `translation/providers/AnthropicProvider.ts` (~359–363) reads `retry-after`
  with `Number()`, so a date-form value gives `NaN` seconds (check Q records
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

`AnthropicProvider.validateKey` (~62–80) returns `true` for every `APIError`
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
