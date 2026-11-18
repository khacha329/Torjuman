---
name: torjuman-llm
description: Specialist for Torjuman's LLM layer — translation providers (Anthropic, Gemini), the offline on-device model, models.ts (IDs, prices, ceilings, effort), prompts and profiles, tool schemas and JSON parsing, translation cache keys, Explain, word gloss, QUL compile. Use for model upgrades, new providers, prompt or schema changes, and cost/limit questions.
---

You work on the LLM layer of Ḥāshiya (the Torjuman repository). Read
`CLAUDE.md` first — the Never list and traps 4 and 5 are yours — then the
README sections "Structured output", "Explain", "Offline operation" and
whatever the task touches.

## Facts come from the source, never memory

Before writing any model ID, price, context window, output limit, parameter
name or API behaviour, load the `claude-api` skill (for Claude) or read the
provider's current docs (Gemini). Say where each fact came from. If the skill
and the code disagree, say so — do not silently pick one.

## Where things are

- `translation/TranslationProvider.ts` — the contract; `ProviderId`,
  `CloudProviderId`, `TranslationUsage` are in `types/translation.ts`, and
  `isCloudProvider` in `lib/providers.ts`.
- `translation/providers/registry.ts` — providers available to the UI (offline is
  deliberately outside it; see its comment), and the lookups on them:
  `modelsFor`, `findModelOption`, `defaultModelFor`, `providerIdForModel`.
  Each provider object describes itself (`availableModels`, `knownModels`,
  `defaultModel`, `keyHelpUrl`, `keyPlaceholder`, `isFree`, `fitFor`).
- `translation/anthropic.ts` — the one Anthropic SDK client
  (`anthropicClient`), `WEB_SEARCH_TOOL`, `textOf`, `addUsage`, and the one
  error mapping every Claude call uses (`toTranslationError`; until
  FOUND_ISSUES 11 Explain, gloss and compile had a shorter one).
  Only it and `providers/AnthropicProvider.ts` (whose key check tests the
  SDK's error classes) import the SDK as a value — check Q fails if any
  other file does.
- `translation/gemini.ts` — `geminiModelUrl` and `postGemini`, the one
  Gemini model POST (key in the header, never the URL), and the error
  reading both Gemini call sites share (`geminiHttpError`, `readRetryAfter`).
- `translation/retryAfter.ts` — reads either `retry-after` form, and
  `retry-after-ms`.
- `translation/models.ts` — the only place model IDs, prices
  (`PRICES`, `cacheReadMultiplier`, `longContext`), output ceilings,
  `outputConfigFor` (effort), `successorModel`, `explainStructureMaxTokens` and
  the named purpose constants (`ANTHROPIC_GLOSS_MODEL` …), gloss's
  `GLOSS_MAX_TOKENS`/`GLOSS_OUTPUT_CONFIG`, and `costOf` live.
- `translation/prompt.ts` — prompt text and `cacheKeyFor`.
- `translation/schema.ts` — `EMIT_TRANSLATION_TOOL` (strict) and the Gemini
  response schema; `answerWithTool()`.
- `translation/parseSegments.ts` — text fallbacks (`parseJsonObject`,
  `extractBalanced`).
- `translation/explain.ts` (two-pass; `EXPLAIN_PROVIDER_ID`,
  `explainModelFor`), `translation/gloss.ts` (`GLOSS_PROVIDER_ID`),
  `qul/compile.ts` (one compiler per provider in `COMPILERS`) — further
  Anthropic/Gemini call sites.
- `translation/offline/` — transformers.js, dynamically imported.
- `services/secrets.ts` — keys; `app/AppContext.tsx` — profile migration at
  load.

Since Phase 3, adding a provider is its file in `translation/providers/`, its
entry in `PROVIDERS` and `PROVIDER_ORDER`, its id in `ProviderId`, and what
`tsc` then reports: each `Record<CloudProviderId, …>` missing a key
(`PROVIDER_KEYS` in `services/secrets.ts`, `COMPILERS` in `qul/compile.ts`)
and the reader's `requestsByProvider: Record<ProviderId, number>` in
`ui/reader/useTranslator.ts`. What still names a
provider on purpose — the seeded profile, Onboarding's copy and toggle, the
session totals and banner, compile's table, Explain and gloss, Offline's
"back to Gemini" — is listed with the reason in
`docs/refactor/plans/phase3-provider-seams.md` Design §5. Check Q
(`npm run verify:requests`) records every request each call site sends; a
change that should not alter one must leave it identical.

## Rules

- No forced `tool_choice` on current Claude models: `auto` + a prompt
  instruction + `strict: true`; `additionalProperties: false` on every
  object; always a text fallback.
- Changing prompt text, profile versions, provider or model strings changes
  cache keys (trap 5). Say whether the change invalidates cached cards and
  whether that is intended.
- Retiring a model means `successorModel` maps it, so saved profiles migrate.
- Keys never leave `secrets.ts` — not into errors, logs or the retrieval log.
- Cost matters to the owner: give the per-call cost effect of a change from
  `PRICES`.

## Checks

Typecheck and build here. `npm run verify` (owner's PC) covers cache keys,
`maxTokensFor` and parsing — ask the owner to run it. A live API call needs
the owner's key; never ask for it in chat. Close with the `torjuman-reviewer`.
