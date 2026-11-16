# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ḥāshiya / Torjuman — a personal Arabic study application for reading Islamic texts from the Shamela
digital library (shamela.ws) with on-demand, LLM-powered English translation of selected passages.
It is being prepared to lead a multi-year study circle. Target device is a Samsung Galaxy Tab with
S Pen; it deploys as a PWA to `https://khacha329.github.io/Torjuman/`.

**Everything runs client-side. There is no backend** — no server, no database, no accounts. The only
network traffic is to shamela.ws (through a proxy), the retrieval APIs, and the user's own LLM
provider.

`README.md` is the project's design document, and it is unusually load-bearing: for nearly every
decision it records the measurement or the failure that forced it. Read the relevant section before
changing a subsystem. Most of what looks like an odd choice is deliberate and the README says what
it is protecting.

## Commands

| Command | Notes |
|---|---|
| `npm run dev` | Vite on `:5173`, bound to all interfaces so the tablet can reach it over the LAN |
| `npm run build` | `tsc -b && vite build` — the typecheck gate *is* the build |
| `npm run typecheck` | Types only |
| `npm run verify` | The whole test suite. 770 checks, ~1 min |
| `npm run stage` | Builds the working tree and deploys it to the staging Worker (HTTPS, its own origin) |
| `npm run catalog` | Rebuilds `public/catalog.json` by refetching each book page off Shamela. Needs `npm run dev` running, for the proxy |
| `npm run glossary` | Merges `glossary-sources/*.json` into `glossary-import.json`, reporting every override |
| `npm run share:add -- <file\|dir>` | Files a downloaded share bundle into `public/shares/` under the id in its own header |

There is no linter and no ESLint config — the compiler is the only static gate, and it is a strict
one. `tsconfig.app.json` sets `strict`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`
and `verbatimModuleSyntax`, so a leftover variable or an unused import **fails the build**, and
type-only imports must be written `import type`.

### Tests

`scripts/verify-parsers.ts` is a single ~5,000-line script, not a test framework. It runs the real
parsers and services over real fetched HTML and real QUL files, in Node, with jsdom supplying the
DOM and the reader's window globals. There are no describe blocks, no watch mode, and **no way to
run one test** — it is one pass over 45 sections, each check printing `ok` or `FAIL`, ending in
`PASS — n/n checks passed` and a non-zero exit on any failure.

So filter the output, not the run:

```bash
npm run verify 2>&1 | grep FAIL                              # only what broke
npm run verify 2>&1 | sed -n '/=== Shared views ===/,/^$/p'  # one section
grep -n '===' scripts/verify-parsers.ts | grep console       # list the sections
```

**It only runs in a local checkout.** It reads `fixtures/` (unmodified pages fetched from
shamela.ws) and `qul/` (resources downloaded from the Qurʾān Universal Library), both gitignored
because this repository is public and neither is this project's to redistribute. A fresh clone
cannot run it. CI therefore runs `npm run build` alone — **verification is a local gate, so run it
before pushing.**

### What the dev server cannot do

`npm run dev` serves plain HTTP on a LAN address, and three consequences follow:

- `crypto.subtle` and `crypto.randomUUID` are absent — both are secure-context only. SHA-256 and id
  generation are hand-written in plain JS for exactly this reason (`src/lib/hash.ts`,
  `src/lib/id.ts`). Share encryption genuinely needs `crypto.subtle` and fails there with a named
  error rather than silently.
- Service workers do not register, so nothing about offline or install is testable.
- IndexedDB is per-origin, and a LAN IP is a different origin from the deployed site — with its own
  empty database.

Use `npm run stage` to test anything in that list.

## Architecture

### Two swap points and one composition root

The app is written so it can move to Capacitor later, and the whole of that preparation is two
interfaces:

- [`src/platform/http/HttpClient.ts`](src/platform/http/HttpClient.ts) — the only place that fetches
  shamela.ws or the retrieval APIs. `WebHttpClient` rewrites those URLs onto a proxy path.
- [`src/platform/storage/StorageAdapter.ts`](src/platform/storage/StorageAdapter.ts) — the only
  persistence interface the app knows about. `IdbStorageAdapter.ts` is the single file in the
  codebase that mentions IndexedDB.

Both concretes are chosen in [`src/app/AppContext.tsx`](src/app/AppContext.tsx) and nowhere else.
Every screen reaches its data through `useApp().storage` and none of them know which implementation
that is.

`StorageAdapter` has ~79 methods. A new object store must be created in **both** paths of
`IdbStorageAdapter`'s `upgrade` callback — the incremental `oldVersion` branch *and* the
fresh-create path below it. Missing the second one has happened twice; it works on your device
(which upgrades) and throws on a new install (which creates).

### Shared views are an adapter swap, not a second reader

Three files, and understanding one without the others is misleading:

1. [`src/share/ShareStorageAdapter.ts`](src/share/ShareStorageAdapter.ts) — a read-only
   `StorageAdapter` over a downloaded bundle. Every method either reads the bundle, delegates to the
   visitor's own storage (verses, tafsīr — data that lives on their device), or is an ignored no-op.
   Writes go nowhere; `exportWork`/`importWork` throw.
2. `StorageOverride` in `AppContext.tsx` — re-provides the whole app context with that adapter for
   one subtree.
3. [`src/app/readOnly.ts`](src/app/readOnly.ts) — a React context gating every mutating control.

The payoff: [`ShareScreen.tsx`](src/ui/share/ShareScreen.tsx) renders the ordinary `ReaderScreen`
unchanged. There is no second reading surface to keep in sync.

Two rules for that gating. It is a **context, not a prop**, because the mutating controls sit in six
components at three nesting levels and a missed prop means a visitor gets a button that spends
somebody's money. And it **hides, never disables** — always `{!readOnly && <Thing/>}`, never
`disabled={readOnly}`, because a visitor has no key and no provider and a greyed-out control only
invites them to debug a setup they do not have.

### Routing

[`src/app/router.ts`](src/app/router.ts) is a ~40-line hash router over `useSyncExternalStore` — no
routing dependency for six routes, and hash routing keeps the app working on a static host with no
rewrite rules. `App.tsx` dispatches on it.

The `share` route is checked **before** the onboarding and catalog gates, and that is load-bearing:
a first-time visitor arrives in exactly the state both gates fire on, so without it they would be
asked to pick a provider and import books before being allowed to read a chapter someone sent them.

### The data model

[`src/types.ts`](src/types.ts) holds it all. Four things that matter more than the rest:

- **Block IDs are derived, not allocated**: `bookId:p{page}:{index}`. Same book, same page, same
  position, same id — on any device, in any order. This is what lets a work backup restore onto a
  device where the books were imported separately. An earlier monotonic counter was not
  reproducible, and a re-import stranded every card and mark pointing at the old ids.
- **`Block.text` is lossless and never mutated.** Harakāt preserved, nothing rewritten.
  `Block.normalized` is a *parallel* string used only as a search index. Qurʾānic verses appear
  inline mid-sentence rather than as their own blocks, so `Block.spans: InlineSpan[]` records inline
  runs by character offset into `text`.
- **Entities (verses, ḥadīth) are derived data** in their own store. Re-running detection over a
  book rebuilds markers only and leaves cards, glossary and caches untouched — `regenerateEntities`
  is a supported operation, not a migration.
- **Cards extend a shared `CardBase`** carrying the anchor fields. The card panel sorts, scopes and
  renders against `CardBase`, not against translation specifics, so note/explanation/sharḥ cards
  drop into the same list.

### Normalization: one frozen fold, with domain folds layered on top

`normalize` in [`src/lib/arabic.ts`](src/lib/arabic.ts) built every block index in every user's
database. **Treat it as frozen** — changing it invalidates those indexes.

Where a domain needs a different fold, it adds its own on top rather than editing `normalize`:
`quranFold` (muṣḥaf vs. plene orthography), `foldName` (dorar narrator matching), `foldQuery`
(biographical names), `foldRoot` (dictionary roots), `letterFold`. Each exists because three or four
systematic differences survive `normalize` and each one alone is enough to make a lookup silently
return nothing. Follow that pattern.

### Translation

`src/translation/` is the seam. Nothing outside it names a provider except the registry and the
settings screen; everything else asks [`registry.ts`](src/translation/registry.ts) for the provider a
profile pins and calls the `TranslationProvider` interface.

**The offline path is deliberately not a `TranslationProvider`.** It is absent from `PROVIDERS`, and
`ProviderId` is narrowed to `CloudProviderId` wherever a real provider is required, so no code can
treat the three interchangeably and hand the on-device NMT model a whole selection with scripture in
it. The type checker enforces this.

Structured output is **enforced, not requested**: Anthropic gets a forced tool call
(`emit_translation`), Gemini a `responseSchema`. Anything needing web search runs as **two passes** —
search and reason with `tool_choice: auto`, then structure with the tool forced — because a forced
`tool_choice` prevents the model from calling search at all. Read text from *every* content block,
never `content[0]`. Check `stop_reason`/`finishReason` on every response and distinguish truncation
from a parse failure. **A paid response is never discarded**: on any failure the card shows what came
back, with the reason, a Retry, and the raw text persisted.

### Retrieval and enrichment

`src/retrieval/` handles quran.com, sunnah.com and dorar.net. `src/quran/` matches quoted verses
against the bundled Uthmānī muṣḥaf locally — no model call, no network. `src/lib/takhrij.ts` renders
the ~30 fixed takhrīj phrases from a table, and both translation paths call it (offline finishes them
in `segmentSelection`, cloud overwrites the model in `enrich.ts`).

Detection throughout is **by content, not by delimiter or class name**. Shamela's inline classes
(`c2`/`c4`/`c5`) are generated and unstable across volumes; dorar's fields are read by the Arabic
label it prints, not by class; QUL files are identified by their first bytes and inner shape, not by
filename.

### Reaching Shamela: three deployments

shamela.ws sends no CORS headers, so a browser can only reach it through something that adds them.

| `PROXY_URL` | Requests go to | Importing |
|---|---|---|
| dev server | `/shamela/...`, same origin (Vite forwards it) | works |
| set | `https://…workers.dev/shamela/...` (`proxy/worker.js`) | works |
| unset | refused up front with `ProxyUnavailableError` | desktop import + Library transfer |

Dev-server proxy routes: `/shamela`, `/quran-api`, `/dorar`. `/sunnah` is **commented out on
purpose** — `api.sunnah.com` authenticates with a header, and a key goes nowhere but its own
provider's endpoint. `api.anthropic.com` sends CORS headers and is called directly; the Anthropic key
never touches the Worker.

In the deployed PWA the import screen still renders, with the button disabled and the reason given.
There is no button that cannot succeed.

### Build-time configuration is derived, not hard-coded

`vite.config.ts` computes all of it from `GITHUB_REPOSITORY`, which Actions always sets:

- `base` — a project site serves from `/<repo>/`, and the same value is threaded through `VitePWA`'s
  `base` and `scope`, the manifest's `id`/`scope`/`start_url`, and Workbox's `navigateFallback`. **A
  mismatched scope is the quiet failure**: the service worker registers, controls nothing, and the app
  appears installed while never working offline. Override with `BASE_PATH`.
- `VITE_CATALOG_URL` and `VITE_SHARE_BASE_URL` — `raw.githubusercontent.com` on `main`, deliberately
  *not* the tag, so correcting the catalog or publishing a share is one commit rather than a release.
- `VITE_PROXY_URL` / `PROXY_URL` — unset is a supported state.

## Rules that are not style preferences

These are invariants. Each one is in the README with the reasoning; breaking one produces a quiet,
serious failure rather than a bug report.

**Scripture is never model-generated.** The load-bearing one:

> A ḥadīth with no offline source must never reach the translation model. Not as a fallback, not as
> a last resort.

This is structural rather than remembered. `offline/segmentSelection.ts` cuts the selection at every
entity boundary *before* anything is translated and returns two things: finished segments, and a list
of plain prose spans. Scripture is never added to the prose list, and the prose list is the only
thing the model receives — so the guard is the shape of the data, not a conditional someone could
forget. Keep it that way. The same holds for verses: when retrieval fails, show the Arabic with an
explicit "translation unavailable" marker and never substitute a model's rendering. Everything else
degrades gracefully; a rough commentary translation is just rough, and the badge says so.

**Never guess markup.** Inspect real Shamela (or dorar, or QUL) output and add it to `fixtures/`
before writing a selector. That rule is what `npm run verify` exists to keep honest.

**Never mutate `Block.text`.** If you find yourself assigning a `normalize()` result to it, stop.

**No API key is ever embedded**, logged, interpolated into an error message, or sent anywhere but its
own provider's endpoint. Both providers are bring-your-own-key; a key in a distributed client is
trivially extractable and the bill is unbounded. Keys live in `localStorage` via
[`src/app/secrets.ts`](src/app/secrets.ts) and are deliberately **not** part of `AppSettings`, so no
backup file has ever carried one.

**Ship pointers, not content.** This repository is public and most of the works involved are in
copyright. The catalog names books rather than containing them; `public/qul/` names resources rather
than carrying them. Licences differ **per resource** — check each one individually, on its own page,
and record the judgement beside the decision in `src/qul/seed.ts`. "Exclusively licensed" in a README
means redistribution is not ours to grant; don't push it. `npm run verify` scans the built output for
commentary phrasing as a backstop.

**Leading slashes in `.gitignore` are load-bearing.** A pattern naming a top-level directory without
one matches at *every* level: `qul/` silently excluded `src/qul/` too, and that surfaced in CI as
sixteen unrelated-looking TS2307/TS7006 errors. Anchor them, and note that
`/dir/` excludes the directory so a later `!` cannot re-include anything — `/dir/*` is the idiom that
makes negations work.

**A share bundle and its key must never travel together.** `public/shares/` is default-deny: the
`.bin` ciphertext is committed (opaque without the key), everything else is excluded. The app's
"save link as a file" writes `<id>.link.txt`, and those carry the decryption key — they belong in
`/share-links/`, which is gitignored. Dropping one into `public/shares/` and running `git add -A`
would publish the keys and make the encryption pointless.

**Ask before adding a dependency.** The three beyond the original spec list are each flagged in the
README with a reason.

## Deploying

Pages deploys from `v*` tags, not from pushes to `main` — testers install this as a PWA and keep it,
so what they get should be something deliberately released. The tag name becomes the version shown in
Settings.

**Push `main` first, then tag.** A tag pointing at an older commit deploys that commit, and the
symptom is a change that "did not deploy" while the build log reports success:

```bash
git push origin main
git log v0.6.5..HEAD --oneline     # confirm only the new commits
git tag -a v0.6.6 -m "…" && git push origin v0.6.6
```

`npm run stage` is the way to look at a change before releasing it — a separate origin, a separate
build, no tester pointed at it. Use `workflow_dispatch` to redeploy the current tag without cutting a
new one.

Publishing a shared chapter is: Share in the reader (which downloads `<id>.bin` plus a link sidecar)
→ `npm run share:add -- <the .bin>` → commit `public/shares/<id>.bin` to `main`. No tag needed; the
loader reads from `main` via raw.githubusercontent. Note that republishing currently mints a **new**
id and key, so an updated chapter does not keep its old link.

## Code conventions

Match what is there. The distinctive thing about this codebase is its comments: most files open with
a block explaining *why* the file is shaped the way it is, usually naming the alternative that was
tried and what went wrong with it, and tricky decisions carry the measurement that settled them.
Inline comments explain reasoning, not mechanics. When you change a decision, update the comment that
justified the old one — a stale rationale is worse than none here, because these comments are what
the next change is reasoned from.

Other conventions: no abbreviations in type names; Arabic in UI strings is written out properly with
diacritics where the real text has them; user-facing failures land as a sentence naming what happened
and what to do, never as a blank screen or a greyed control.
