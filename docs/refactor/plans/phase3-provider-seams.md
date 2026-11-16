# Phase 3: provider seams — one Anthropic client, one Gemini call, providers that describe themselves

Status: **approved by the owner, 2026-11-16** (answers at the end)
Base commit: `ef2c626` (Phase 2 complete; PRs #8, #9, #10 stacked and open, not merged)
Branch: `claude/restructure-phase-3`

Line numbers below are at `ef2c626`. Paths are under `src/` unless they say
otherwise.

## Goal

RESTRUCTURE §6, Phase 3: "**Provider seams**: one Anthropic client and error
mapping used by all four call sites; one Gemini call; provider descriptors in
the registry (key field, placeholder, models, default) so Settings,
Onboarding, secrets and models stop naming providers — medium risk: cache keys
and requests must be byte-identical; checks T B L X; V (cache keys,
`maxTokensFor`); a recorded-request check built first." And §2: "Adding a
translation provider is one file in `translation/providers/` plus one registry
entry that carries its key field, model list and default."

Done when:

- a new check **Q** (recorded requests, Design §1) exists, was baselined on
  the old code, and passes **unchanged** after every step: every request each
  call site sends (method, URL, headers, body text byte for byte), every error
  each one maps (kind, message, `retryAfterSeconds`, `raw`), and every cache
  key and token budget for fixed inputs are the same as at `ef2c626`;
- the Anthropic SDK client is built in one function and used by all four call
  sites (`AnthropicProvider`, `explain.ts`, `gloss.ts`, `qul/compile.ts`); the
  three **identical** error mappings are one function; the provider's
  different mapping sits beside it in the same module and is **not** merged
  (Design §2);
- the Gemini POST is one function used by `GeminiProvider` and
  `qul/compile.ts`; the two error mappings, which differ in every branch, are
  kept (Design §3);
- the registry's providers carry the key placeholder and the full list of
  known models, and `modelsFor`, `findModelOption`, `defaultModelFor` and the
  legacy-profile inference are answered from the registry, so `models.ts`,
  Settings and `AppContext` name no provider (Design §4);
- what still names a provider after the phase is listed in Design §5 with the
  reason for each, so RESTRUCTURE §2's promise is stated truthfully (it cannot
  hold literally: `ProviderId` is a type union, see §5);
- U (check of Phase 2) shows identical DOM and screenshots for every capture,
  including the new provider captures added on the old code (Design §6);
- T, B, L, Q, X pass at every step; S and R after every step that touches a
  reader file; `npm run layers -- --check` holds; the SSR build of
  `verify-parsers.ts` resolves at every step that touches a module it imports;
- the owner's `npm run verify` passes, and the owner's live smoke test (M, the
  provider list in Checks) works on the staged build.

## Not doing

- **No change to any request, error, message, model, price, parameter or
  cache key.** Where two copies differ, both are kept; the difference goes to
  FOUND_ISSUES (Design §7) for a later, deliberate change.
- No unification of the two Anthropic error mappings or the two Gemini error
  mappings (Q4). No change to the SDK's own retries (`maxRetries` default 2).
- No new model fact. The inline values FOUND_ISSUES 4 names move to
  `models.ts` only verbatim and only if the owner agrees (Q6, Q7).
- No `compile` or "plain completion" method on the provider contract (Q5).
- No change to Onboarding's copy, the reader's no-key banner
  (`ReaderScreen.tsx:1291`), the session totals (`CardPanel.tsx:351-369`) or the
  key-store names in `services/secrets.ts` beyond what Q8–Q10 decide.
- No new dependency. Check Q runs in Node 22 through the existing Vite SSR
  build, like `npm run verify`; no test runner, no fetch-mocking library.
- No book-kinds/genre work: providers are independent of the kind of book.
  Nothing here touches `StructureProfile`.
- Q is not added to the deploy workflow (Q12).

## Current state (at `ef2c626`)

### 1. Anthropic: four clients, four error mappings

**Client construction.** All four are the same call with the same two options,
in the same order; none passes `baseURL`, headers, `maxRetries`, `timeout` or
`fetch`, so all four get the SDK defaults (`@anthropic-ai/sdk` 0.120.0:
`maxRetries` 2, timeout 10 min, `fetch` = the global `fetch` read **at
construction**, `client.mjs:101,110,111`).

| Site | Code | Built when |
| --- | --- | --- |
| `translation/providers/AnthropicProvider.ts:58-60` | private `client(key)`: `new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })` | per `validateKey` (`:65`) and per `translate` (`:87`) |
| `translation/explain.ts:168-171` | `new Anthropic({ apiKey: options.apiKey, dangerouslyAllowBrowser: true })` (written over four lines) | per `explainPhrase` |
| `translation/gloss.ts:103` | `new Anthropic({ apiKey: request.apiKey, dangerouslyAllowBrowser: true })` | per uncached, online, keyed `glossWord`, after the cache, `navigator.onLine` and empty-key checks (`:90-101`) |
| `qul/compile.ts:150` | `new Anthropic({ apiKey, dangerouslyAllowBrowser: true })` | per `compileWithAnthropic` |

Identical; can be merged. Three constructions are outside their `try`;
`validateKey`'s is inside it (`AnthropicProvider.ts:64-65`), and step 3d keeps
it there — Q cannot see this, since construction never throws in Node
(corrected by the `torjuman-llm` plan read before 3a).

**Error mapping.** Two different mappings, one of them written three times.

*The provider's* (`AnthropicProvider.ts:343-382`, `toTranslationError`, used at
`:78`, `:149`, `:218`):

| SDK error | kind | message | retryAfterSeconds |
| --- | --- | --- | --- |
| `TranslationError` | passed through | — | — |
| `AuthenticationError` (401) | `auth` | "Your Anthropic API key was rejected. Check it in Settings — this is a key problem, not a usage limit." | null |
| `PermissionDeniedError` (403) | `auth` | "That Anthropic key is valid but not permitted to use this model. Check the key’s workspace and model access." | null |
| `RateLimitError` (429) | `rate-limit` | "Anthropic is rate-limiting this key. Wait a moment and retranslate — your key is fine." | `Number(error.headers.get('retry-after'))`, or null when absent (`:359-364`) |
| `APIConnectionError` (incl. timeout) | `network` | "Could not reach api.anthropic.com. Check the network connection." | null |
| `BadRequestError` (400) | `api` | "Anthropic rejected the request: ${error.message}" | null |
| other `APIError` | `api` | "Anthropic API error ${error.status}: ${error.message}" | null |
| anything else | `api` | `error.message` or `String(error)` | null |

`validateKey` (`:62-80`) has a third, boolean mapping before it: 401 and 403 →
`false`; any other `APIError` → `true` ("a rate limit or a 400 still proves
the key authenticated"); the rest → `toTranslationError`. Note: the SDK's
`APIConnectionError` is an `APIError` with no status, so a network failure
also returns `true` — FOUND_ISSUES 12 (found by the plan read before 3a).

*The short one*, in `explain.ts:299-314`, `gloss.ts:165-177` and
`qul/compile.ts:176-187`:

| SDK error | kind | message |
| --- | --- | --- |
| `TranslationError` | passed through (explain `:300`, gloss `:166`; **compile has no such line**) | — |
| `AuthenticationError` | `auth` | "Your Anthropic API key was rejected." |
| `RateLimitError` | `rate-limit` | "Rate limited. Wait a moment and try again." (no `retryAfterSeconds`) |
| `APIConnectionError` | `network` | "Could not reach api.anthropic.com." |
| anything else (403, 400, 5xx included) | `api` | `error.message` or `String(error)` |

The three are the same statements in the same order with the same strings. The
one textual difference — compile's missing pass-through — cannot be observed:
compile's `try` (`:152-175`) contains only `messages.create` and a pure
mapping of its result, neither of which can throw a `TranslationError`. explain
and gloss need the pass-through, because their own `parse` errors
(`explain.ts:267`, `gloss.ts:142`) are thrown inside the `try`. explain's last
`throw` is wrapped over four lines (`:310-313`), gloss's and compile's are one
line. **The three may be merged; the provider's may not** (every row but
`auth`-401's kind differs in message, and 403, 429 and 400 differ in kind or
payload).

**Other repeated Anthropic code** (identical unless said):

| Piece | Copies |
| --- | --- |
| text of every text block, `join('\n')` | `AnthropicProvider.ts:298-303` (`textOf`, exported, no importer outside the file); `explain.ts:219-222`, `:259-262`; `gloss.ts:136-139`; `compile.ts:163-166` (followed by `.trim()`, which stays) |
| usage accumulation | `AnthropicProvider.ts:309-314` `addUsage`; `explain.ts:317-322` `accumulate` (same body). `compile.ts:168-173` builds a fresh object instead (different; stays) |
| the web-search tool | `AnthropicProvider.ts:41-45` `WEB_SEARCH_TOOL` (`as const` on `type` and `name`); `explain.ts:207` inline `{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }` — same keys, order and values |
| research turn limit | `AnthropicProvider.ts:47` `MAX_RESEARCH_TURNS = 4`; `explain.ts:201` literal `4` |

**The SDK retries on its own.** With `maxRetries` 2, a 408, 409, 429, 5xx or a
connection failure is retried twice before the call site sees the error
(`client.mjs:704-738`), sleeping for `retry-after-ms`, else `retry-after`, else
0.5 s / 1 s with up to 25 % random jitter (`:739-778`). So a rate-limited
Claude call is three requests. Unchanged by this phase; Q records it.

### 2. Gemini: two calls

| | `GeminiProvider.translate` (`GeminiProvider.ts:83-252`) | `compileWithGemini` (`qul/compile.ts:190-254`) |
| --- | --- | --- |
| URL | `${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, built once before the loop (`:88-89`) | `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent` (`:198`) |
| method, headers | `POST`, `{ 'x-goog-api-key': key, 'content-type': 'application/json' }` (`:120-127`) | **same**, same key order (`:200-203`) |
| body | `JSON.stringify(body)`, body built at `:103-116`: `systemInstruction.parts[0].text` (JSON instruction stripped), `contents`, `generationConfig { responseMimeType, responseSchema, maxOutputTokens: budget }` | `JSON.stringify({ systemInstruction, contents, generationConfig: { maxOutputTokens: 4000 } })` inline (`:204-208`) |
| fetch throws | `network`, "Could not reach the Gemini API. Check the network connection." (`:128-133`) | `network`, "Could not reach the Gemini API." (`:211-213`) |
| 429 | retried up to 3 times (`MAX_RETRIES`, `:35`), waiting `retry-after` seconds or 2 s / 4 s / 8 s (`:135-142`, `lib/delay`); then `rate-limit`, "Gemini free-tier rate limit reached. …", `retryAfterSeconds` from the header, finite-checked (`:143-148`, `:255-260`) | `rate-limit`, "Gemini rate limit reached. Try again shortly.", no retry, no `retryAfterSeconds` (`:218-220`) |
| 401/403 | `geminiHttpError` (`:262-295`): reads the JSON error body; 401, 403, `PERMISSION_DENIED` or a message matching `/api[_ ]?key/i` → `auth`, "Your Gemini API key was rejected. Check it in Settings — …"; 400 with "not found|not supported" → `api`, model message; else `api`, "Gemini API error: ${message}" | `auth`, "Your Gemini API key was rejected." (`:215-217`); other non-OK → `api`, "Gemini API error: HTTP ${status}" (`:221-223`); the body is not read |
| response | SSE stream, every part of every candidate, cumulative usage overwrite (`:155-205`), `MAX_TOKENS` retry once with the budget doubled to `MAX_TOKENS_CEILING` (`:207-216`), `SAFETY`/`PROHIBITED_CONTENT` → `refusal`, text parsed by `parseSegments` | one JSON body, parts joined with `''` and trimmed; empty → `parse`, "Gemini returned no compiled text." |
| `validateKey` (`:64-81`) | `GET ${GEMINI_BASE}/models`, headers `{ 'x-goog-api-key': key }` only; 400/401/403 → false; else `response.ok`; fetch throws → `network` (provider's message) | — |

**Identical, and so mergeable:** the URL shape for a model method, and the
`POST` with those two headers and a `JSON.stringify`d body. **Everything else
differs** and stays at its call site.

### 3. Provider names outside the registry

| Where | What | A descriptor/registry form | Same behaviour? |
| --- | --- | --- | --- |
| `translation/models.ts:192-194` `modelsFor` | `'anthropic' ? ANTHROPIC_MODELS : GEMINI_MODELS` — **so `offline` gets the Gemini list** | `providerFor(id).availableModels` | yes: `providerFor` (`registry.ts:34-36`) maps a non-cloud id to `DEFAULT_PROVIDER_ID` = `'gemini'`. Same lists, same order (the provider's `availableModels` **is** the array) |
| `models.ts:197-203` `findModelOption` | Anthropic: offered + `SUPERSEDED_ANTHROPIC_MODELS` (`:68-72`, not exported); else Gemini | `providerFor(id).knownModels.find(…)` with a new `knownModels` field | yes, if `knownModels` is `[...ANTHROPIC_MODELS, ...SUPERSEDED_ANTHROPIC_MODELS]` for Anthropic and `GEMINI_MODELS` for Gemini (ids are unique, so the first match is the only match) |
| `models.ts:205-207` `defaultModelFor` | `'anthropic' ? ANTHROPIC_DEFAULT_MODEL : GEMINI_DEFAULT_MODEL` | `providerFor(id).defaultModel` | yes, same fallback reasoning |
| `services/secrets.ts:25-28` `PROVIDER_KEYS` | the two `localStorage` names; also `API_KEY_STORAGE_KEYS` (`:33`, used by `library/deviceTransfer.ts:152`) and `hasAnyProviderKey` (`:60-63`) | cannot come from the registry: `services` may import only `lib` and `types` (layer rule 4) | see Q8 |
| `ui/settings/SettingsScreen.tsx:274` | `placeholder={providerId === 'anthropic' ? 'sk-ant-…' : 'AIza…'}` | `provider.keyPlaceholder` (`provider` is already `providerFor(providerId)`, `:221`) | yes, same two strings (with U+2026) |
| `SettingsScreen.tsx:122`, `:127`, `:179`, `:187` | `modelsFor`, `defaultModelFor` from `models` | the same names from the registry | import path only |
| `ui/settings/ProfileEditor.tsx:6`, `:158` | `modelsFor` | from the registry | import path only |
| `ui/reader/TranslationCardView.tsx:4`, `:288` | `findModelOption` | from the registry | import path only |
| `ui/OnboardingScreen.tsx:20` | `useState<CloudProviderId>('gemini')` | — | Q9 |
| `OnboardingScreen.tsx:55`, `:156` | `providerId === 'gemini' ? (Gemini copy) : (Claude copy)` — two hand-written panels and a two-state toggle (`:157-177`) | — | Q9 |
| `OnboardingScreen.tsx:106` | `placeholder={providerId === 'gemini' ? 'AIza…' : 'sk-ant-…'}` | `provider.keyPlaceholder` (`provider` is `providerFor(providerId)`, `:25`) | yes |
| `app/AppContext.tsx:142-143` | `profile.providerId ?? (isClaudeModel(profile.model) ? 'anthropic' : 'gemini')` (legacy profiles without a provider) | the parenthesised expression as a registry function, `providerIdForModel(model)` | yes; `profile.providerId ??` stays in `AppContext` |
| `translation/profiles.ts:74-75` | the seeded profile: `providerId: 'gemini', model: GEMINI_DEFAULT_MODEL` | the translation core may not import the registry (layer rule 7) | left, with its comment (`:63-64`), see §5 |
| `qul/compile.ts:140-142` | `providerId === 'anthropic' ? compileWithAnthropic : compileWithGemini` | Q5 | — |
| `ui/reader/ReaderScreen.tsx:17`, `:221-222`, `:1043` | the gloss: `secrets.getProviderKey('anthropic')`, `ANTHROPIC_GLOSS_MODEL` | Anthropic-only by design | Q10 |
| `ui/reader/useExplanations.ts:57`, `:94-97` | Explain: `getProviderKey('anthropic')`, `providerId: 'anthropic'`, `isClaudeModel(activeProfile.model) ? activeProfile.model : ANTHROPIC_EXPLAIN_FALLBACK_MODEL` | Anthropic-only by design | Q10 |
| `useExplanations.ts:18` | `costOf` imported from `translation/providers/AnthropicProvider` (a screen reaching into one provider's file; also imported by `scripts/verify-parsers.ts:4159`) | `costOf` beside `PRICES` in `models.ts` | Q7 |
| `ui/settings/OfflineTranslation.tsx:205` | `saveProfile({ …, providerId: 'gemini', model: 'gemini-3.7-flash' })` — the model id inline (FOUND_ISSUES 4) | Q6 | — |
| `ui/reader/CardPanel.tsx:351-369`, `useTranslator.ts:43,51` | session totals: `requestsByProvider.anthropic` / `.gemini`, "Claude: …", "Gemini: … (free tier)" | visible copy per provider | left, see §5 |
| `TranslationCardView.tsx:267`, `:284` | `card.providerId === 'offline'` | the offline label, not a cloud provider | left |
| `translation/providers/registry.ts:7` | comment "The only place outside the settings screen that names a provider" — untrue (FOUND_ISSUES 4) | corrected in 3r | — |
| `translation/TranslationProvider.ts:12-14` | comment "Nothing outside src/translation/ may reference a provider by name, except the registry and the settings screen" — untrue | corrected in 3r | — |

Already descriptor-driven and unchanged: the provider cards in Settings →
Translation (`SettingsScreen.tsx:137-169`, `displayName`, `isFree`, `fitFor`),
the key fields' heading, badge and "Get a key →" link (`:250-266`,
`keyHelpUrl`), the retranslate menu (`TranslationCardView.tsx:457-470`,
`availableModels`), card badges (`badgeFor`, `registry.ts:39-42`), the
"No … API key" message (`useTranslator.ts:189`). Their order is
`PROVIDER_ORDER` (`registry.ts:18`, Gemini first), which does not change.

### 4. Anthropic-only by design

- **Explain** (`translation/explain.ts`) uses Anthropic's server-side web
  search; it runs on Claude even when the profile is on Gemini
  (`ANTHROPIC_EXPLAIN_FALLBACK_MODEL`, `models.ts:58-62`).
- **Word gloss** (`translation/gloss.ts`) is a strict-tool call on
  `ANTHROPIC_GLOSS_MODEL`; deliberately not routed through the profile
  (`gloss.ts:9-18`).
- **Compile** (`qul/compile.ts`) follows the profile's provider: it has an
  Anthropic and a Gemini branch.

Descriptors in this phase carry **no capability flags**. Explain and gloss are
Anthropic code, not provider-neutral features with an Anthropic default; a
`supportsWebSearch` flag would invite a second implementation nobody has
written. What Q10 offers instead is to let each module say which provider it
runs on (`EXPLAIN_PROVIDER_ID` in `explain.ts`), so the reader stops writing
`'anthropic'` itself; values, keys read and messages unchanged.

### 5. Layer graph and what `npm run verify` builds

`node scripts/check-layers.mjs` at `ef2c626`: 160 files, 134 directory edges,
no cycles, no mutual pairs, 11 rules hold. Relevant edges that already exist:
`translation/providers → translation`, `qul → translation`, `app →
translation/providers`, `ui/settings → translation/providers`, `ui/reader →
translation/providers`, `ui → translation/providers`. Rule 7 forbids
`translation → translation/providers`, so `explain.ts` and `gloss.ts` cannot
use anything placed under `providers/`. The tool reads relative imports only
(`check-layers.mjs:16`); a package such as `@anthropic-ai/sdk` is invisible to
it.

`scripts/verify-parsers.ts` imports, among the files this phase touches:
`translation/models` (`:494`, `:1418`, `:4071`, `:4158`; `findModelOption` at
`:4195`), `translation/prompt` (`cacheKeyFor`, `:493`),
`translation/providers/AnthropicProvider` (`costOf`, `:4159`), `qul/compile`
(`renderCompilePrompt`, `compileCacheKey`, `:2128`), `translation/schema`,
`translation/parseSegments`, `translation/profiles`. It does **not** import
`explain`, `gloss`, `GeminiProvider`, the registry or `secrets`. Its cache-key
checks (`:490-529`, `:2154-2163`) compare keys with each other; none pins a
value. No other script imports a file this phase touches.

## Design

### 1. Check Q — recorded requests (built first, on the old code)

**What it is.** `scripts/verify-requests.ts`, run as
`npm run verify:requests` =
`vite build --ssr scripts/verify-requests.ts --outDir .verify/requests --logLevel warn && node .verify/requests/verify-requests.js`.

**Why Node through the SSR build, not Playwright.** It imports the real modules
(`registry`, `AnthropicProvider`, `GeminiProvider`, `explain`, `gloss`,
`qul/compile`, `prompt`, `models`, `secrets`) by path and calls them, exactly as
`npm run verify` does, with no build of the app and no browser. It needs
neither `fixtures/` nor `qul/`, so it runs here. In the browser the modules are
minified into one chunk and could only be reached through the UI, which would
make every scenario a click path. The SDK's code is the same file in both
(its package `browser` map remaps only two tool modules this app does not
use); what differs is the platform headers, masked below. Its own `outDir`
because Vite empties the `outDir` it builds into, and `.verify/` holds U's
dumps.

**Injection.** The SDK reads the global `fetch` when a client is constructed
(`client.mjs:111`, `internal/shims.mjs:2-7`), and every call site constructs a
client per call, so replacing `globalThis.fetch` before each scenario reaches
all four Anthropic sites and both Gemini sites without touching `src/`. The
harness also installs, per scenario and restored after:

- a recording `fetch`: for each call, `method`, `url`, the headers (through
  `new Headers(init.headers)`, names lower-cased and sorted — header order is
  not part of HTTP's meaning and the SDK builds them through its own merge),
  the **body text exactly as passed** (not re-serialized: JSON key order is
  what "byte-identical" means), and the names of any other `init` fields
  (`signal`, …); it answers from the scenario's queue of canned responses;
- `setTimeout` wrapped: a delay under 60 s is recorded (`waits: [ms…]`) and
  run at 0 ms, so Gemini's 2/4/8 s backoff and the SDK's retry sleeps are
  pinned without being waited; longer ones (the SDK's 10-minute request
  timeout) pass through and are cleared as usual;
- `Math.random` fixed (the SDK's retry jitter), `Date.now` fixed (gloss's
  `createdAt`);
- `navigator.onLine` true (false in one gloss scenario) — Node 22's
  `navigator` has no `onLine`;
- a Map-backed `localStorage` for the `secrets` section;
- a stub `StorageAdapter` for `glossWord` (`getWordGloss` → none, or a cached
  gloss in one scenario; `putWordGloss` recorded).

**Masked headers, and why.** `x-stainless-os`, `x-stainless-arch`,
`x-stainless-runtime`, `x-stainless-runtime-version`: they describe the machine
running the check (Node on Linux here; Chrome on Android on the tablet), not
the code. Nothing else is masked. `user-agent` and
`x-stainless-package-version` carry the SDK version, which the lockfile pins
and this phase does not change, so they stay in the record; an SDK upgrade
would show up there, which is right. The keys are fake (`sk-ant-q-check-…`,
`AIza-q-check-…`), so the `x-api-key` and `x-goog-api-key` values are recorded
as they are.

**Key containment, asserted.** For every scenario: the fake key appears in
exactly one place per request — the `x-api-key` / `x-goog-api-key` header —
and in no URL, body, error message, `raw` or progress string. This is the
CLAUDE.md "Never" for keys, checked mechanically on every provider path.

**Canned responses.** Anthropic streams are written as SSE (`message_start`,
`content_block_start`, `content_block_delta` with `text_delta` or
`input_json_delta`, `content_block_stop`, `message_delta` with `stop_reason`
and `usage`, `message_stop`), `content-type: text/event-stream`; the
non-streaming `messages.create` gets a JSON message. Gemini SSE is served as a
`ReadableStream` in several chunks split **mid-line**, so the line buffer
(`GeminiProvider.ts:162-170`) is exercised. Every retryable Anthropic status
carries `retry-after-ms`, so the SDK never falls back to jittered backoff;
where the scenario tests the mapper's `retry-after`, both headers are sent.

**Scenarios.** Inputs are synthetic and short (a few invented words of
Arabic, a two-entry glossary), written for the check like U's books; one
Anthropic and one Gemini scenario use `STUDY_CIRCLE_PROMPT` so the JSON-
instruction stripping runs on the real profile text, the rest a one-line
system prompt.

| Group | Scenarios |
| --- | --- |
| Anthropic `translate` | tool call (Sonnet 5.5); tool call on Opus 5.5 (`output_config.effort`, the 128K ceiling); dig deeper: research `pause_turn` then `end_turn`, then structure (three requests; the second carries the assistant turn); `max_tokens` then success (budget doubled); `max_tokens` twice → `truncated`; no tool call, JSON in text → recovered; no tool call, prose → `parse`; `refusal` with `stop_details.explanation`; 401; 403; 429 with `retry-after: 7` (three requests, then `retryAfterSeconds` 7); 429 with an HTTP-date `retry-after` (records today's `NaN`, Design §7); 400; 500 (three requests); connection failure (three requests) |
| Anthropic `validateKey` | empty key (no request); 200; 401; 403; 429; 400; connection failure |
| Gemini `translate` | success in split chunks with cumulative usage; `MAX_TOKENS` then success; `MAX_TOKENS` twice → `truncated`; `SAFETY` → `refusal`; malformed text → `parse`; 429 ×4 with `retry-after: 0`; 429 without `retry-after`, then 200 (waits 2000); 401; 400 "API key not valid"; 400 "model not found"; 500 with a non-JSON body; fetch throws; 200 with no body |
| Gemini `validateKey` | empty; 200; 400; 401; 403; 500; fetch throws |
| Explain | both passes with a tool call; research `pause_turn`; structure in text → recovered; neither → `parse`; 401; 403; 429; 500; connection failure |
| Gloss | tool call; text recovered; `parse`; cached (no request); offline (no request); no key (no request); 401; 403; 429; connection failure |
| Compile | Anthropic success; 401; 403; 429; connection failure; Gemini success; 401; 403; 429; 500; fetch throws; empty text → `parse` |
| Pure values | `cacheKeyFor` for a fixed selection × each `ProviderId` × two models, and with a changed glossary hash, version, offsets; `glossaryHashOf`; `compileCacheKey` (resource order, provider, model); `maxTokensFor`, `explainStructureMaxTokens`, `outputCeilingFor`, `outputConfigFor` for every model id in `models.ts` and one unknown id, at three text lengths; `successorModel` for every id |
| Registry and models | `allProviders()` (id, displayName, isFree, keyHelpUrl, fitFor, availableModels, defaultModel), `cloudProviderIds()`, `DEFAULT_PROVIDER_ID`, `providerFor` and `badgeFor` for `anthropic`, `gemini`, `offline`; `modelsFor`, `defaultModelFor` for the three ids; `findModelOption` for the three ids × every model id (current, superseded, Gemini, offline, unknown); `createDefaultProfile()` |
| Secrets | `API_KEY_STORAGE_KEYS`; for each provider id, which `localStorage` name `setProviderKey` writes, what `getProviderKey` / `hasProviderKey` read back (offline included), `hasAnyProviderKey` before and after |

**The record.** For each scenario: the requests in order, `waits`, the
outcome — a result (segments, usage, `costUsd`, `raw`, for gloss the stored
gloss) or an error (`name`, `kind`, `message`, `retryAfterSeconds` with `NaN`
written as the string `"NaN"`, `raw`) — the number of progress callbacks and
the last progress string. Pure values are recorded as returned. The file is
pretty-printed JSON in scenario order, with request bodies as strings, so a
difference is reported by line and a body difference shows as one changed
string.

**The environment (added by the plan read before 3a).** The Anthropic SDK
reads `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_LOG` and
`ANTHROPIC_CUSTOM_HEADERS` from `process.env` when a client is built
(`client.mjs:68, :78, :107, :114`). The cloud container sets the first, which
would make every recorded URL machine-dependent; and a set
`ANTHROPIC_AUTH_TOKEN` would put a real credential into an `Authorization`
header of a committed file. The browser has no `process.env`, so the check
deletes every `ANTHROPIC_*` variable before it runs, and fails if any request
carries `Authorization`.

**What is committed.** The record itself,
`docs/refactor/phase3/requests.json` (synthetic inputs and prompt text that is
already in `src/`; measured in 3a at 349 KB, every retry kept as its own
request)
(Q11). Modes: `npm run verify:requests` compares and exits 1 listing each
differing scenario with its first differing lines; `--write` (3a only, and in
the two steps that add a section, Design §8); `--out <file>` to dump
elsewhere.

**Proof of the check, in 3a**, each edit undone and `git diff` empty after:

1. two runs: identical (determinism; also with `TZ` and locale changed, since
   `toLocaleString` is in the truncation messages and `localeCompare` in the
   glossary hash — the check pins `en-US` inside the script, since `LANG`
   does not reach Node's default locale everywhere);
2. one character changed in gloss's "Rate limited." → exit 1, naming the
   gloss 429 scenario;
3. `responseMimeType` and `responseSchema` swapped in `GeminiProvider.ts`'s
   body → exit 1 (key order is pinned);
4. `dangerouslyAllowBrowser: true` removed from `compile.ts:150` → exit 1 (a
   header disappears);
5. `cacheKeyFor`'s `join('|')` changed to `join('/')` → exit 1 on the cache-key
   section;
6. the run time, reported.

Its row for RESTRUCTURE §5:

| **Q** | `npm run verify:requests` (`scripts/verify-requests.ts`, from Phase 3): every provider call site driven in Node with a stubbed `fetch` and canned responses; requests (method, URL, headers less four platform ones, body text), retries and waits, mapped errors, results, cache keys and token budgets for fixed inputs | identical to `docs/refactor/phase3/requests.json`; no fake key outside its header | here |

### 2. One Anthropic module: `translation/anthropic.ts`

It must be importable by `explain.ts` and `gloss.ts` (rule 7 keeps them out
of `providers/`), by the provider (`providers → translation` exists) and by
`qul/compile.ts` (`qul → translation` exists), so it sits in the translation
core. No new directory edge. Contents, each moved verbatim from the copy named:

```ts
/** The SDK client every Anthropic call uses. */
export function anthropicClient(apiKey: string): Anthropic
  // new Anthropic({ apiKey, dangerouslyAllowBrowser: true }), with the
  // dangerouslyAllowBrowser paragraph from AnthropicProvider.ts:32-36

/** Explain, gloss and compile: the short mapping (explain.ts:300-313). */
export function anthropicCallError(error: unknown): TranslationError

/** Translation and the key check: the full mapping (AnthropicProvider.ts:343-382). */
export function toTranslationError(error: unknown): TranslationError
```

Call sites keep their `try`/`catch` and statement order: explain's and gloss's
`catch` bodies become `throw anthropicCallError(error);`, which rethrows the
same `TranslationError` instance in the pass-through case; compile's gains the
pass-through, unreachable there (Current state §1), which the reviewer
confirms by reading compile's `try`. The provider's `client()` method
becomes a call to `anthropicClient`. The two mappings sit side by side with a
comment saying they differ on purpose until a separate change decides
(FOUND_ISSUES, Design §7).

Optional, one commit each (Q3): `textOf` (five sites), `addUsage` (two),
`WEB_SEARCH_TOOL` (two) into the same module. Each is the same expression or
object at every site; Q shows the bodies unchanged.

After these steps, explain, gloss and compile use `Anthropic` only in type
positions (`Anthropic.MessageParam`, `.TextBlock`, `.ToolUseBlock`), and
their import becomes `import type Anthropic from '@anthropic-ai/sdk'`
(adaptation (a); needed anyway under `verbatimModuleSyntax` to make the intent
visible). `AnthropicProvider.ts` keeps its value import for `validateKey`'s
`instanceof` checks (`:72-75`), which stay where they are.

Rejected: `translation/providers/anthropic/client.ts` — explain and gloss could
not import it. Rejected: a client cached per key — construction reads the
global `fetch` (and any future option) at call time today; caching would
change when that happens.

### 3. One Gemini call: `translation/gemini.ts`

```ts
/** `${GEMINI_BASE}/models/<model>:<method>` (GeminiProvider.ts:88-89, compile.ts:198). */
export function geminiModelUrl(model: string, method: string): string

/** POST a JSON body with the key in its header (GeminiProvider.ts:120-127, compile.ts:197-210). */
export function postGemini(url: string, apiKey: string, body: unknown): Promise<Response>
```

`postGemini` is `fetch(url, { method: 'POST', headers: { 'x-goog-api-key':
apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body) })`,
with the provider's note 1 (`GeminiProvider.ts:25-27`) moved over the header
and compile's pointer comment (`:201-202`) pointing at it. Both call sites
keep their own `try`/`catch`, messages, status handling and parsing; the
provider still builds its URL once before the loop (`method` =
`'streamGenerateContent?alt=sse'`), compile builds its body object in the
call's argument list as now. `validateKey`'s `GET` stays as it is (different
method and headers). Evaluation order is unchanged: URL, then body object,
then `JSON.stringify`, then `fetch`, all inside the same `try`.

Rejected: one Gemini error mapping — compile's would gain retries and body
messages (Q4).

### 4. Providers that describe themselves

The provider object in the registry **is** the descriptor: it already carries
`id`, `displayName`, `availableModels`, `defaultModel`, `keyHelpUrl`,
`isFree`, `fitFor` (`TranslationProvider.ts:80-95`). Two fields are added to
the interface and to both classes:

```ts
/** Shown in an empty key field: what this provider's keys start with. */
readonly keyPlaceholder: string;            // 'sk-ant-…' | 'AIza…'
/** Every model a card may name: the offered ones, then superseded ones still labelled. */
readonly knownModels: ModelOption[];        // [...ANTHROPIC_MODELS, ...SUPERSEDED_ANTHROPIC_MODELS] | GEMINI_MODELS
```

`SUPERSEDED_ANTHROPIC_MODELS` gains `export` (adaptation (b)). Then
`modelsFor`, `findModelOption` and `defaultModelFor` move from `models.ts` to
`registry.ts`, written over `providerFor`:

```ts
export function modelsFor(id: ProviderId): ModelOption[] { return providerFor(id).availableModels; }
export function findModelOption(id: ProviderId, model: string) { return providerFor(id).knownModels.find((entry) => entry.id === model); }
export function defaultModelFor(id: ProviderId): string { return providerFor(id).defaultModel; }
```

This is the one place the phase rewrites rather than moves: the
`'anthropic' ? … : …` ternaries become lookups. Equivalence, for every input:
`anthropic` → the Anthropic arrays and default (same array objects);
`gemini` → Gemini's; `offline` → today the ternary's else branch (Gemini),
tomorrow `providerFor`'s fallback to `DEFAULT_PROVIDER_ID` (`'gemini'`). Q
records all three ids × every model before and after. The one way they could
part is if the default provider changed later: then `modelsFor('offline')`
would follow it. No caller passes `offline` (Settings and the profile editor
show these only for a cloud profile; `TranslationCardView.tsx:286-288` asks
only for non-offline cards), so this is recorded, not guarded.

`registry.ts` imports `ModelOption` from `../TranslationProvider` and nothing
new from `models.ts`. The legacy inference becomes:

```ts
/** Which provider a profile saved before providers existed was on (AppContext). */
export function providerIdForModel(model: string): CloudProviderId {
  return isClaudeModel(model) ? 'anthropic' : 'gemini';
}
```

moved verbatim from `AppContext.tsx:143`, whose comment (`:133-139`) stays
where it is, and which then reads `profile.providerId ??
providerIdForModel(profile.model)`. Rejected: deriving it from descriptors
("the first provider whose models match, else the default"), which would tie
old profiles to whatever the default is later.

**Placeholders.** `SettingsScreen.tsx:274` and `OnboardingScreen.tsx:106`
become `placeholder={provider.keyPlaceholder}`.

### 5. What still names a provider after the phase, and why

| Where | Why it stays |
| --- | --- |
| `types/translation.ts:9` `ProviderId` | a type union; the type system cannot be driven from a runtime registry |
| `translation/models.ts` constants | model facts are per provider by nature (`ANTHROPIC_MODELS`, `GEMINI_MODELS`, purpose constants); no function there names a provider any more |
| each provider file and `registry.ts` | their job |
| `services/secrets.ts` `PROVIDER_KEYS` | Q8 (recommended: stays, typed by `CloudProviderId`, so `tsc` points at it) |
| `translation/profiles.ts:74` | the seeded profile starts on Gemini by a written decision (`:63-64`); the core cannot import the registry |
| `qul/compile.ts:140` | Q5 |
| Onboarding copy and toggle | Q9 |
| Explain and gloss (and their reader call sites) | Anthropic-only by design (Current state §4); Q10 |
| `CardPanel.tsx` session totals, `ReaderScreen.tsx:1291` banner | visible copy written per provider; making it generic changes text the owner sees. For Phase 6's `EXTENDING.md` |

So, after Phase 3, adding a provider means: its file in
`translation/providers/`, its entry in `PROVIDERS` and `PROVIDER_ORDER`, its
id in `ProviderId`, and then wherever `tsc` reports a `Record<CloudProviderId,
…>` missing a key (`PROVIDER_KEYS`, compile's table if Q5 is answered that
way). Onboarding, the session totals and the banner are copy, decided per
provider. RESTRUCTURE §2's wording is corrected to say this in 3r.

### 6. U: new captures, on the old code (step 3b)

U today proves the Gemini side only: `onboarding` (Gemini panel, `'AIza…'`),
`settings--api-keys` (both key fields, both placeholders: the DOM includes the
attribute), `settings--translation` (Gemini selected: Gemini's four options
and the selected model's note), `settings--translation-profiles` ("This
profile runs on Gemini — Flash 3.7 — recommended"). Nothing shows the Claude
side, or a card badge. Added in 3b, on the old code, in their own commit:

| Capture | How it is reached | Proves |
| --- | --- | --- |
| `onboarding--claude` | fresh, not onboarded; tap "Use Claude instead" | Onboarding's placeholder `'sk-ant-…'` and panel |
| `settings--translation--claude` | Settings; tap the Claude card (writes the profile: `chooseProvider` → `defaultModelFor('anthropic')`) | `modelsFor('anthropic')` options, the default model's note |
| `settings--translation-profiles--claude` | same page, after the tap | `providerFor(…).displayName`, `modelsFor` label lookup |
| `reader-cards` *(Q13)* | seeded translation cards: Gemini, Claude current, Claude superseded (`claude-sonnet-5`), on-device | `badgeFor`, `findModelOption` with a superseded model ("Sonnet 5") |
| `reader-retranslate` *(Q13)* | the same, the retranslate menu opened on one card | `allProviders()` order, `availableModels` |

The manifest (`docs/refactor/phase2/markup.sha256`) gains these lines; the
3b commit's diff shows its existing 160 lines untouched, which is the proof
that adding captures moved nothing. The two Claude captures click a button in
a fresh context, so they cannot affect the others.

### 7. FOUND_ISSUES entries (written in 3a, with the record that shows them)

- **Anthropic `retry-after` is parsed with `Number()`** (`AnthropicProvider.ts:359-363`):
  an HTTP-date value gives `NaN` seconds; Gemini's reader checks
  `Number.isFinite` (`GeminiProvider.ts:255-260`).
- **Explain, gloss and compile map Anthropic errors more coarsely** than
  translation: a 403 is `api` with the SDK's raw message, a 429 carries no
  `retryAfterSeconds`, a 400 is not told apart.
- **Compile's Gemini branch** neither retries a 429 nor reads the error body; a
  bad key reported as a 400 (`API key not valid`) comes out as `api`, not
  `auth`; its network message is shorter.
- **The SDK retries twice by itself** (`maxRetries` default), so a rate-limited
  Claude call is three requests and up to three waits before the card shows
  anything; Gemini's provider retries three times itself. Not a defect;
  recorded so it is not rediscovered.
- **`ANTHROPIC_VERSION`** (`models.ts:116-117`) is exported and imported by
  nothing; the SDK sends its own `anthropic-version` (`client.mjs:838`).
  Deleting it needs the owner's OK.
- **FOUND_ISSUES 4 extended**: more call parameters inline — compile's
  `max_tokens: 4000` and `maxOutputTokens: 4000` (`compile.ts:155`, `:207`),
  research `max_tokens: 8000` (`AnthropicProvider.ts:126`, `explain.ts:204`),
  the research turn limit (`:47`, `explain.ts:201`), `max_uses: 5`, Gemini's
  `MAX_RETRIES` (`GeminiProvider.ts:35`).

### 8. Q's record across the phase

The record must not change at any step, with two exceptions that **add** a
section and change nothing already in it: 3m (`providerIdForModel`, new) and
3q if done (`explainModelFor`, new). There, the new section's values are
checked by reading against the expression they replace, and the commit's
diff of `requests.json` must be additions only. Where a function the check
imports moves (3k `costOf`, 3n the three model functions), the check's
import changes in the same commit (rule 5) and its output does not.

Gap, said plainly: before 3m, `AppContext`'s inference is inside a React
callback and Q cannot call it; that one-line move is verified by reading.

### 9. What B means in this phase

As in Phase 2: build exits 0; `index-*.js` within ±2 KB of the previous step
(expect a few hundred bytes smaller over the phase); `compare-bundles` reports
only `index.js` as different — `transformers.web`, `sql-wasm-browser`,
`node.browser`, `workbox-window` identical (T-h); `index-*.css`
byte-identical (`cmp`), or the difference explained (docs naming class
tokens). The SDK stays in the main chunk where it is today.

### 10. Layer rules

No `layers.json` change: no step adds a directory edge (the two new files are
in `translation`, and every importer already imports `translation`; the
registry functions are imported by units that already import
`translation/providers`). L must show 134 edges at every step; a step that
adds one has gone wrong.

What the rules cannot see: which files import `@anthropic-ai/sdk` or call the
Gemini host. Q12 offers a small allowlist assertion inside
`verify-requests.ts`, added in 3r (after the moves, so the allowlist is the
end state): value imports of `@anthropic-ai/sdk` only in
`translation/anthropic.ts` and `translation/providers/AnthropicProvider.ts`,
type-only elsewhere; `GEMINI_BASE` imported only by `translation/gemini.ts`
and `GeminiProvider.ts`. Alternative: teach `check-layers.mjs` package rules,
which changes a tool the deploy workflow runs.

## Steps

Ordered by risk: the check first; pure domain merges that Q sees completely;
then registry functions Q sees completely; then UI. One extraction or move per
commit. Commit message: `Restructure phase 3 step 3x: <what> to <where>`, a
summary, a `Checks:` paragraph.

| Step | What | Files | Checks | Risk |
| --- | --- | --- | --- | --- |
| 3a | **Check Q**, baselined on the old code; FOUND_ISSUES entries (§7) | new `scripts/verify-requests.ts`, `package.json` (`verify:requests`), new `docs/refactor/phase3/requests.json`, RESTRUCTURE §5 row, CLAUDE.md commands row, `.gitignore` unchanged (`.verify/` already ignored), FOUND_ISSUES, PROGRESS | Q (determinism, four negative tests); T B unchanged (no `src/` change) | none for the app |
| 3b | **U captures** for the Claude side (and cards, Q13), on the old code | `scripts/verify-markup.mjs`, `docs/refactor/phase2/markup.sha256` (lines added) | U (new captures stable over two runs; old lines untouched) | none for the app |
| 3c | the short Anthropic error mapping → `translation/anthropic.ts` `anthropicCallError` | new file; `explain.ts`, `gloss.ts`, `qul/compile.ts` | T B L Q; SSR build; **V owed** (compile) | low |
| 3d | the client → `anthropicClient` | `translation/anthropic.ts`; `AnthropicProvider.ts`, `explain.ts`, `gloss.ts`, `compile.ts` (imports become `import type` where only types remain) | T B L Q; SSR build; **V owed** | low |
| 3e | the provider's mapping `toTranslationError` → `translation/anthropic.ts` | `anthropic.ts`, `AnthropicProvider.ts` | T B L Q; SSR build; **V owed** | low |
| 3f | *(optional, Q3)* `textOf` → `anthropic.ts`, five sites | `anthropic.ts`, `AnthropicProvider.ts`, `explain.ts`, `gloss.ts`, `compile.ts` | T B L Q; SSR; V owed | low |
| 3g | *(optional, Q3)* `addUsage` → `anthropic.ts` (explain's `accumulate` deleted) | `anthropic.ts`, `AnthropicProvider.ts`, `explain.ts` | T B L Q; SSR; V owed | low |
| 3h | *(optional, Q3)* `WEB_SEARCH_TOOL` → `anthropic.ts` | `anthropic.ts`, `AnthropicProvider.ts`, `explain.ts` | T B L Q; SSR; V owed | low |
| 3i | the Gemini POST → `translation/gemini.ts` | new file; `GeminiProvider.ts`, `compile.ts` | T B L Q; SSR; V owed (compile) | low–medium |
| 3j | *(Q6)* gloss's `max_tokens` and `effort` → `models.ts` | `models.ts`, `gloss.ts` | T B L Q; SSR; V owed (models) | low |
| 3k | *(optional, Q7)* `costOf` → `models.ts` | `models.ts`, `AnthropicProvider.ts`, `ui/reader/useExplanations.ts`, `scripts/verify-parsers.ts:4159`, `scripts/verify-requests.ts` | T B L Q **S R** U; SSR; V owed | low |
| 3l | *(Q5)* compile's provider choice → a `Record<CloudProviderId, …>` table | `compile.ts` | T B L Q; SSR; V owed | low |
| 3m | legacy inference → `registry.ts` `providerIdForModel` | `registry.ts`, `app/AppContext.tsx`, `verify-requests.ts` (section added) | T B L Q (additions only) U | low |
| 3n | `knownModels` on the contract; `modelsFor`, `findModelOption`, `defaultModelFor` → `registry.ts` | `TranslationProvider.ts`, both providers, `models.ts`, `registry.ts`, `SettingsScreen.tsx`, `ProfileEditor.tsx`, `TranslationCardView.tsx`, `scripts/verify-parsers.ts:4195`, `verify-requests.ts` | T B L Q **U S R**; SSR; V owed | medium |
| 3o | `keyPlaceholder` on the contract; Settings and Onboarding read it | `TranslationProvider.ts`, both providers, `SettingsScreen.tsx`, `OnboardingScreen.tsx` | T B L Q U (`settings--api-keys`, `onboarding`, `onboarding--claude`) | low–medium (markup) |
| 3p | *(Q6)* `OfflineTranslation.tsx:205`'s inline provider and model | `OfflineTranslation.tsx` | T B L Q U (read: the handler is not captured) | low |
| 3q | *(Q10)* `EXPLAIN_PROVIDER_ID`, `explainModelFor` in `explain.ts`; `GLOSS_PROVIDER_ID` in `gloss.ts`; the reader uses them | `explain.ts`, `gloss.ts`, `useExplanations.ts`, `ReaderScreen.tsx`, `verify-requests.ts` (section added) | T B L Q (additions only) U **S R** | low |
| 3r | docs; comments that became true; the SDK allowlist (Q12); end-of-phase checks | `registry.ts:7-10` and `TranslationProvider.ts:12-14` comments, `.claude/agents/torjuman-llm.md` ("Where things are", the "still hard-coded" paragraph), CLAUDE.md map and Never/trap 4 pointers, README "How it fits together" (`:73-75`, the call-site list), RESTRUCTURE status, §2 wording (§5 above), §6 row, FOUND_ISSUES 4, PROGRESS result | T B L Q U S R X | none |

## Per step

**3a — check Q.** As Design §1. No `src/` file changes. The record is written
from the second determinism run. PROGRESS records the run time, the number of
scenarios and requests, the record's size, and the masks. The FOUND_ISSUES
entries of Design §7 are written here, each citing the scenario that shows it.
Gap: the browser's platform headers are not recorded (masked by design); M
covers the real browser.

**3b — U captures.** As Design §6. Two runs to show the new captures are
stable; the manifest diff is additions only. If `reader-cards` cannot be made
stable in reasonable time (it is the first reader capture with cards), it is
dropped, PROGRESS says so, and 3n relies on Q's `badgeFor`/`findModelOption`
records plus reading. The script's header ("Not captured …") is updated.

**3c — short mapping.** Cut `explain.ts:301-313` into `anthropicCallError`
(with the pass-through `:300` as its first statement, returning instead of
throwing, so callers write `throw anthropicCallError(error)`). Each site's
`catch (error) { … }` body becomes that one statement. The diff shows the three
deleted blocks are the same lines. Callers: none outside the three files. V:
compile is in the SSR build. Q: the explain, gloss and compile error scenarios.

**3d — client.** `anthropicClient(apiKey)` with the `dangerouslyAllowBrowser`
paragraph from `AnthropicProvider.ts:32-36` moved over it (the provider's header
keeps its output-shape paragraph `:38-39`). Four sites call it; the provider's
private `client()` method keeps its name and becomes `return
anthropicClient(key);` (removing the method would touch three lines more for
nothing). Construction stays outside each `try`. Q: every Anthropic scenario
(headers include `anthropic-dangerous-direct-browser-access`).

**3e — full mapping.** Move `AnthropicProvider.ts:343-382` verbatim; the
provider imports it. `validateKey`'s boolean `instanceof` checks stay in the
provider. Q: every provider error scenario.

**3f–3h — optional helpers.** Each: the function or constant moved from the
provider verbatim, each other copy replaced by a call or a reference; compile's
`.trim()` and explain's inline `turn < 4` are not touched (the latter is a
FOUND_ISSUES 4 item). Q shows bodies, progress strings and usage unchanged.

**3i — Gemini POST.** As Design §3. The diff in the provider: `:88-89`
becomes `geminiModelUrl(request.model, 'streamGenerateContent?alt=sse')`,
`:120-127` becomes `postGemini(url, key, body)`; in compile, `:197-210` becomes
`postGemini(geminiModelUrl(model, 'generateContent'), apiKey, { … })` with the
body object unchanged. `GEMINI_BASE` is still imported by the provider
(`validateKey`) and no longer by compile. Q: every Gemini scenario, URLs and
body text included.

**3j — gloss parameters (if Q6 says so).** `GLOSS_MAX_TOKENS = 2000` and
`GLOSS_OUTPUT_CONFIG = { effort: 'low' }` (typed with `models.ts`'s `Effort`)
in `models.ts`, beside `ANTHROPIC_GLOSS_MODEL`, carrying the two comments from
`gloss.ts:108-110` and `:112-113` verbatim; `gloss.ts:111` and `:114` reference
them. The request's key order does not change (the keys stay where they are in
the object literal). Q: the gloss request body.

**3k — `costOf` (optional).** Move `AnthropicProvider.ts:316-341` verbatim to
`models.ts` beside `PRICES`; the provider, `useExplanations.ts:18` and
`verify-parsers.ts:4159` import it from there. `models.ts` gains a `type`
import of `TranslationUsage`. A reader file changes its import, so S and R
run.

**3l — compile's choice (if Q5 says the table).**
`const COMPILERS: Record<CloudProviderId, (model, apiKey, prompt) => Promise<CompileResult>> = { anthropic: compileWithAnthropic, gemini: compileWithGemini }`
and `return COMPILERS[options.providerId](options.model, options.apiKey, prompt);`.
Same for both ids; a value outside `CloudProviderId` (which the type forbids
and `EntitySheet.tsx:341-359` guards) would throw a `TypeError` instead of
going to Gemini — recorded in the commit, unreachable. Q: compile scenarios.

**3m — legacy inference.** As Design §4. `AppContext.tsx:143` becomes
`profile.providerId ?? providerIdForModel(profile.model)`; `isClaudeModel` leaves
its import if nothing else there uses it (it does not: `:18` imports it for
this line only). Q gains a section: `providerIdForModel` for every model id
and `'some-model'`, `''`. U runs because `app/` changed (boot path).

**3n — models from the registry.** As Design §4. Order inside the commit:
`knownModels` on the interface and both classes; the three functions deleted
from `models.ts:192-207` and written in `registry.ts`; importers updated —
`SettingsScreen.tsx:6` (merge into the registry import at `:5`),
`ProfileEditor.tsx:6` (same at `:5`), `TranslationCardView.tsx:4` (into `:6`),
`verify-parsers.ts:4195` (`models.findModelOption` → the registry's, imported
in that block), `verify-requests.ts`. Grep `src` and `scripts` for the three
names first. Q: every id × model. U: `settings--translation`, `--claude`,
`settings--translation-profiles`, `--claude`, `reader-cards`,
`reader-retranslate`. S R: a reader file changed.

**3o — placeholders.** As Design §4. U is the whole check: the two placeholder
strings are copied by hand into the providers, and an ASCII `...` for `…`
would be the likeliest slip.

**3p — Offline's "use a cloud provider" (if Q6 says so).** Per the owner's
answer: either `model: GEMINI_DEFAULT_MODEL` (provider literal stays), or
`providerId: DEFAULT_PROVIDER_ID, model: defaultModelFor(DEFAULT_PROVIDER_ID)`.
Both give `'gemini'`, `'gemini-3.7-flash'` today (Q records
`DEFAULT_PROVIDER_ID` and `defaultModelFor('gemini')`). U shows the section
unchanged; the handler itself is read, not run (it needs an installed
on-device model).

**3q — Explain and gloss say which provider they run on (if Q10 says so).**
`export const EXPLAIN_PROVIDER_ID = 'anthropic' as const` and
`explainModelFor(profileModel: string): string` (the expression at
`useExplanations.ts:95-97`, moved) in `explain.ts`;
`export const GLOSS_PROVIDER_ID = 'anthropic' as const` in `gloss.ts`.
`useExplanations.ts:57`, `:94`, `:95-97` and `ReaderScreen.tsx:221`, `:1043`
use them. The notice text "needs an Anthropic key" (`:62`) is copy and stays.
Q gains `explainModelFor` for every model id. S R: reader files.

**3r — docs and end of phase.** As the table. RESTRUCTURE §2's provider
sentence becomes what Design §5 says is true. CLAUDE.md map: `translation/`
gains `anthropic` (SDK client, error mappings) and `gemini` (the POST).
End of phase: T, B, L `--check` (report saved as `docs/refactor/phase3/layers.txt`),
Q, U, S, R, SSR build; then the reviewer on the phase.

## Checks

| Check | When |
| --- | --- |
| T | every step |
| B (Design §9) | every step from 3c; 3a records sizes and the CSS hash after the plan commit |
| L | every step: 134 edges, `--check` holds |
| **Q** | built in 3a; every step from 3c; must be identical except the additions named in Design §8 |
| U | built in Phase 2, extended in 3b; every step that changes a file under `ui/` or `app/` (3k, 3m–3q), and 3r |
| S, R | 3k, 3n, 3q, and 3r |
| SSR build of `verify-parsers.ts` | every step touching `models.ts`, `AnthropicProvider.ts`, `compile.ts`, or the registry (3c–3n except 3m) |
| X (reviewer) | after every commit, before the next step (Q14) |

**Only the owner can run:**

- **V** `npm run verify` on the PC, once before merging: owed by 3c–3l and 3n
  (`models`, `AnthropicProvider`, `compile`, and `verify-parsers.ts`'s own
  imports at `:4159` and `:4195`). It covers cache-key relations,
  `maxTokensFor`, prices and `findModelOption`; Q pins the absolute values
  here.
- **M** on the staged build (`npm run stage`), with the owner's real keys —
  the one thing Q cannot do is send a request to the real APIs from the real
  browser: Settings → test both keys; translate one passage on Gemini and one
  on Claude; Dig deeper once; Explain once; tap a word for its Meaning (gloss);
  Compile one āyah on each provider; switch the profile between providers and
  see the model list and default follow. Onboarding is optional here: U
  already covers its markup, and reaching it needs a fresh browser profile.
  A failure here with Q green would mean the browser build differs from Node's
  — the SDK's platform headers — and is reported, not patched.

## Risks

- **R1. A request changes by a byte** (key order, a dropped `as const`
  property, a header). Caught by Q's text comparison of bodies and full
  header sets.
- **R2. An error message or kind changes in a merge.** Only identical copies
  are merged (Current state §1–2); Q records every mapped error; the reviewer
  compares deleted blocks line by line.
- **R3. Q is not deterministic** (SDK jitter, clocks, locale in
  `toLocaleString`). Pinned in the harness; two runs and a changed `TZ` in 3a.
- **R4. Q drives Node, the app runs in Chrome.** Same SDK file, same module
  code; platform headers masked. Covered by M.
- **R5. A cache key changes.** No step edits `prompt.ts`, `profiles.ts`'s
  ids or any stored provider id; Q pins absolute `cacheKeyFor`,
  `glossaryHashOf` and `compileCacheKey` values; V's relation checks on the PC.
- **R6. The `offline` fallback in `modelsFor`/`defaultModelFor`/`findModelOption`
  changes** (Design §4). Q records all three ids; the equivalence holds while
  `DEFAULT_PROVIDER_ID` is `'gemini'`, which the commit message says.
- **R7. A script importer is missed** (`verify-parsers.ts:4159`, `:4195`).
  Grep `scripts/`; the SSR build resolves every import here; V on the PC.
- **R8. Load order.** `anthropic.ts` and `gemini.ts` have no side effects
  (functions and one constant). The registry still constructs both providers
  at load; the two new fields are constant properties. Nothing reads
  `localStorage` at a new time.
- **R9. A placeholder or label is copied wrong.** U (`settings--api-keys`,
  both onboarding captures, the translation captures).
- **R10. The phase-2 branch changes under this one.** PRs #8–#10 are open. If
  any changes before merging, it is merged into this branch, never rebased;
  Q and U are re-run after such a merge.
- **R11. `costOf` moving into `models.ts` (3k) adds a type import there.**
  It is type-only and from `types`, which `models.ts` already imports, so it
  adds no directory edge.

## Questions

1. **Q1. Check Q as designed** — Node through the Vite SSR build, stubbed
   global `fetch`, four platform headers masked, the record committed?
   Recommended: yes. Alternative: Playwright in the built app (real browser
   headers, but every scenario becomes a UI path and most error paths are
   unreachable).
2. **Q2. Where the shared Anthropic code lives.** Recommended:
   `translation/anthropic.ts` (Explain and gloss cannot import from
   `providers/`), and `translation/gemini.ts` for the Gemini POST.
   Alternative: relax rule 7 so `translation` may import one file under
   `providers/` — weakens a rule for a placement preference.
3. **Q3. Optional Anthropic helpers** (3f `textOf`, 3g `addUsage`, 3h
   `WEB_SEARCH_TOOL`). Recommended: include all three — identical copies, Q
   proves the bodies. Alternative: only the client and the mapping, which is
   what the phase row asks for.
4. **Q4. The two Anthropic mappings and the two Gemini mappings stay
   separate.** Recommended: yes, in this phase; they differ in messages,
   kinds and `retryAfterSeconds`. Unifying them (Explain/gloss/compile
   getting translation's fuller messages and 403/429 handling; compile's Gemini
   getting retries) is a behaviour change for its own PR after the phase, if
   wanted — recorded in FOUND_ISSUES.
5. **Q5. Compile's provider choice** (`compile.ts:140-142`). Recommended: a
   `Record<CloudProviderId, …>` table in `compile.ts` (3l), so a new provider
   is a `tsc` error there rather than a silent fall into Gemini. Alternatives:
   leave the ternary; or a "plain completion" method on the provider contract
   that compile calls through the registry — rejected for this phase: it grows
   the contract for one QUL feature, adds the edge `qul →
   translation/providers`, and would have to carry compile's own (short) error
   messages.
6. **Q6. FOUND_ISSUES 4's inline values.** (a) gloss's `max_tokens: 2000` and
   `effort: 'low'` → `models.ts` as `GLOSS_MAX_TOKENS` / `GLOSS_OUTPUT_CONFIG`
   with their comments (3j); (b) `OfflineTranslation.tsx:205`: either
   `GEMINI_DEFAULT_MODEL` (same meaning: "back to Gemini"), or
   `DEFAULT_PROVIDER_ID` + `defaultModelFor(…)` (meaning "back to the default
   cloud provider", same value today) (3p). Recommended: (a) yes; (b) the
   first — it removes the inline id without deciding a new meaning. The other
   inline parameters (compile 4000 ×2, research 8000 ×2, turn limit, `max_uses`,
   Gemini `MAX_RETRIES`) are added to FOUND_ISSUES 4 and left.
7. **Q7. `costOf` into `models.ts` (3k)?** Recommended: yes — it is pricing
   over `PRICES`, and today a reader hook imports a provider file for it.
   Alternative: leave it in `AnthropicProvider.ts`.
8. **Q8. `services/secrets.ts`.** It cannot read the registry (layer 1).
   Options: (a) keep `PROVIDER_KEYS` as a `Record<CloudProviderId, string>` —
   `tsc` flags it for a new provider; (b) derive the names from the id
   (`shamela-reader.${id}-api-key`, identical for both today) with a
   `CLOUD_PROVIDER_IDS` list in `lib/providers.ts`. Recommended: (a). These are
   the names of saved data on the tablet; a derivation that a later edit could
   quietly change is a worse failure (keys "lost") than one line to add.
9. **Q9. Onboarding.** Its two panels are hand-written product copy with JSX
   (`<strong>no payment method</strong>`) and a two-state toggle; the screen's
   own comment says it deliberately leads with the free path. Recommended: only
   the placeholder moves to the descriptor (3o); the copy and the `'gemini'`
   ternaries stay, with a comment saying a new provider needs its own copy here.
   Alternative: a per-provider copy table in the screen (more churn in JSX,
   which U then has to prove; no gain for two providers).
10. **Q10. Explain and gloss in the reader.** Recommended: 3q —
    `EXPLAIN_PROVIDER_ID`, `explainModelFor` and `GLOSS_PROVIDER_ID` exported
    by the modules that are Anthropic code, so the reader names no provider.
    No capability flags on descriptors (Current state §4). Alternative: leave
    the reader's `'anthropic'` literals (they are honest: these features are
    Anthropic-only).
11. **Q11. What Q commits.** Recommended: the whole normalized record,
    `docs/refactor/phase3/requests.json` (synthetic, already-public prompt
    text, reviewable as a diff). Alternative: a SHA-256 per scenario, as U does,
    with dumps in `.verify/` — smaller, but a failure then needs a base dump to
    explain itself.
12. **Q12. Enforcing "only these files import the SDK".** Recommended: an
    allowlist assertion in `verify-requests.ts`, added in 3r; Q stays out of the
    deploy workflow, like U. Alternatives: package rules in `check-layers.mjs`
    (enforced on deploy, but a tool change); or review only.
13. **Q13. Reader captures in U** (`reader-cards`, `reader-retranslate`).
    Recommended: yes, attempted in 3b; dropped with a note if they cannot be
    made stable. They are the only rendered proof for 3n's `findModelOption`
    move on cards.
14. **Q14. Review cadence.** Recommended: the reviewer after every commit, as
    in Phases 1 and 2; and the `torjuman-llm` agent asked to read the plan
    once before 3a (cache keys, SDK behaviour). Alternative: per group (3a–3b;
    3c–3i; 3j–3m; 3n–3q; 3r).
15. **Q15. The PR.** Recommended: one PR for the phase, opened against
    `claude/restructure-phase-2` while #10 is open (so it shows only Phase 3),
    retargeted as the stack merges; merged by the owner after V and M.
16. **Q16. RESTRUCTURE §2's provider sentence.** It cannot hold literally
    (`ProviderId` is a type; see Design §5). Recommended: reword it in 3r to
    "one file in `translation/providers/`, one registry entry, its id in
    `ProviderId`, and whatever `tsc` then reports", with Onboarding and the
    session totals named as copy.

## Owner's answers (2026-11-16)

**All sixteen as recommended** ("all as recommended, go ahead"): check Q as
designed (Q1); shared code in `translation/anthropic.ts` and
`translation/gemini.ts` (Q2); the three optional helper merges (Q3); the two
Anthropic and two Gemini error mappings stay separate (Q4); compile's provider
table (Q5); gloss's inline values into `models.ts` verbatim and
`OfflineTranslation` on `GEMINI_DEFAULT_MODEL` (Q6); `costOf` into `models.ts`
(Q7); `PROVIDER_KEYS` kept (Q8); only Onboarding's placeholder moves (Q9);
Explain and gloss export their provider (Q10); the full record committed
(Q11); the SDK-import allowlist inside Q, Q out of the deploy workflow (Q12);
reader captures tried in 3b (Q13); the reviewer after every commit and the
`torjuman-llm` agent reads the plan before 3a (Q14); one PR stacked on #10,
merged after V and M (Q15); RESTRUCTURE §2's provider sentence reworded (Q16).
