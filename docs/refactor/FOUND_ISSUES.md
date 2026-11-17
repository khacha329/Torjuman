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
build itself is unaffected. Phase 1 asks (Q4) whether to add them when it adds
`core`. Left as is. Found by the Phase 0 survey.

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

- `translation/registry.ts:10` says it is "The only place outside the
  settings screen that names a provider". Not so: `app/AppContext.tsx`,
  `translation/profiles.ts`, `qul/compile.ts`, `ui/OnboardingScreen.tsx`,
  `ui/reader/ReaderScreen.tsx`, `ui/reader/useExplanations.ts` and
  `ui/settings/OfflineTranslation.tsx` all do.
- A model ID outside `models.ts`: `ui/settings/OfflineTranslation.tsx:210`
  saves `model: 'gemini-3.7-flash'` inline.
- Call parameters outside `models.ts`: `translation/gloss.ts:111,114` sets
  `max_tokens: 2000` and `output_config: { effort: 'low' }` inline (with
  comments saying why).

Left as is: Phase 3 (provider seams) is where these move, as structure. The
comment in `registry.ts` is corrected when the registry moves in Phase 1 step
1h only if the plan names it; otherwise in Phase 3.
