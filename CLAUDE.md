# Ḥāshiya (Torjuman) — working rules for Claude

A personal Arabic study app: a React 19 + Vite + TypeScript PWA that reads
books imported from the Shamela library, translates selected passages with an
LLM into cards, and works offline on an Android tablet. Everything runs in the
browser; IndexedDB is the only store. Deployed to GitHub Pages from `v*` tags.

The owner is the only user and the only other developer. The main device is an
**Android tablet** (touch, Chrome or DuckDuckGo, 960×600 landscape and
600×960 portrait). A change that works on a desktop mouse and not on the
tablet does not work.

`README.md` is the design record: every non-obvious decision has a section
there, and the code comments say *why* at length. Read the README section for
the area before changing it. `docs/refactor/` holds the restructure plan and
its progress log.

## Commands

| Command | What | Where it runs |
| --- | --- | --- |
| `npm run typecheck` | `tsc -b --noEmit` | anywhere |
| `npm run build` | typecheck + production bundle into `dist/` | anywhere |
| `npm run verify` | ~5,500 lines of checks over real Shamela pages and QUL data | **owner's PC only** — needs the gitignored `fixtures/` and `qul/` |
| `npm run verify:selection` | Playwright: touch selection across scrolling, 3 profiles | anywhere (Chromium is in the cloud container) |
| `npm run verify:reader` | Playwright: every scroll-dependent reader feature | anywhere |
| `npm run layers` | import graph by directory, cycles, layer rules (`-- --check` to fail on a break) | anywhere |
| `node scripts/compare-bundles.mjs <a> <b>` | are two copies of `dist/assets` the same JS, build time and chunk hashes masked | anywhere |
| `npm run verify:markup` | Playwright: DOM and screenshots of every screen showing a shared UI piece, against `docs/refactor/phase2/markup.sha256` (~2 min) | anywhere |
| `npm run stage` | a build on Cloudflare staging, to try on the tablet before tagging | owner's PC |

In the cloud container `npm run verify` fails at once on the missing
`fixtures/`; that is expected. Say so, and ask the owner to run it when the
change touches anything it covers (`shamela/`, `ingest/`, `lib/`,
`components/`, `translation/`, `quran/`, `qul/`, the reader's card logic).

## Never

- **Commit book or third-party data.** The repository is public. No
  `fixtures/`, `qul/`, `glossary-sources/`, share links (`*.link.txt`), book
  text in tests or screenshots beyond what is already committed. A new
  `.gitignore` pattern that names a top-level directory gets a leading slash
  (see the comment at the top of `.gitignore` — `qul/` once excluded
  `src/qul/`); extension patterns like `*.pem` stay unanchored.
- **Let an API key leave `localStorage`.** Keys live only behind
  `services/secrets.ts`. Never in `AppSettings`, a backup, a log, the retrieval
  log, an error message or a URL. The one exception is the whole-tablet
  transfer, and only when its "Include my API keys" box is ticked.
- **Add a dependency** without the owner's OK. Name it, its size, and why the
  platform cannot do it.
- **Force-push, rebase a pushed branch, amend a pushed commit, or move a tag.**
  Merge `main` into a branch instead.
- **Push a tag or release.** Deploys happen when the owner pushes a `v*` tag
  (this container cannot push tags anyway). Tell the owner the exact commit
  hash to tag.
- **Merge a PR** without the owner's word in this conversation.
- **Delete** a file, store, setting or saved data path without the owner's OK.
- **Change the IndexedDB schema** without bumping `DB_VERSION` and editing
  *both* upgrade branches in `IdbStorageAdapter.init` — see trap 6.
- **Force a tool call** (`tool_choice: tool` or `any`) on current Claude
  models — they reject it with a 400. See trap 4.
- **Guess model facts.** Model IDs, prices, context windows and output limits
  come from the `claude-api` skill (or the provider's docs), never memory, and
  belong in `src/translation/models.ts` (known exceptions: FOUND_ISSUES 4).
- **Skip, weaken or delete a check** to get green.

## Working pattern

- One branch and one PR per change, named `claude/<topic>`. The PR lists every
  feature the change touches and how each was checked; a UI change carries
  screenshots at the tablet sizes.
- A restructure phase starts only after its written plan in
  `docs/refactor/plans/` is approved by the owner, with the owner's answers to
  its questions recorded in the plan. See `docs/refactor/RESTRUCTURE.md`.
- **A refactor commit changes structure only.** A bug found while moving code
  is written in `docs/refactor/FOUND_ISSUES.md` and left; it is fixed later in
  its own change, if the owner wants.
- Before pushing: typecheck, build, the Playwright checks the change can
  affect, `npm run layers`, and the `torjuman-reviewer` agent on the commit.
  Never start the next step until the review is in.
- Say plainly what was verified by running, what by reading, and what was not
  checked (above all: what only the tablet can show).

## Subagents (`.claude/agents/`)

| Agent | Use it for |
| --- | --- |
| `torjuman-planner` | Turning a feature request into a written plan in `docs/plans/` — files, extension points, risks, checks, questions for the owner. Read-only on code. |
| `torjuman-reviewer` | Adversarial review of a commit or PR against these rules and the plan. Read-only. Fixed verdict format. Run on every commit before the next step. |
| `torjuman-verifier` | Running the gates (typecheck, build, Playwright, layers) and reporting exact results, so long output stays out of the main context. Changes nothing. |
| `torjuman-llm` | Anything touching providers, models, prompts, schemas, cache keys, Explain/gloss, offline translation. |
| `torjuman-reader` | Anything touching the reader: scrolling, virtualization, selection, the card panel, layout modes, popovers, marks. |
| `torjuman-storage` | IndexedDB schema and migrations, the storage adapters, backups, book/tablet transfer, the relay, shares. |

The main session plans with the owner, delegates to a specialist where the
change is in its area, and always closes a step with the reviewer.

## Map

```
src/
  main.tsx, App.tsx    mount, PWA registration, route switch + onboarding gates
  types/               the domain types, one file per area; import `types`
  app/                 composition root (AppContext), hash router, PWA update,
                       online state, read-only context
  services/            module singletons the lower layers share: API keys
                       (secrets), retrieval log, activity
  platform/http/       HttpClient + WebHttpClient (proxy routing)
  platform/storage/    StorageAdapter + IdbStorageAdapter (the only IndexedDB code)
  lib/                 pure helpers: arabic, hash, id, saveFile, takhrij,
                       providers (isCloudProvider)
  components/          BidiText
  shamela/             HTML parsers for shamela.ws pages
  ingest/              book import + resumable crawler
  dictionary/          roots and the root index
  quran/               verse/ḥadīth detection, bundled muṣḥaf index
  biography/           narrator names, rijāl profiles (itqan, taqrīb)
  retrieval/           quran.com, sunnah.com, dorar.net, sharḥ, enrichment
  qul/                 Qurʾān Universal Library resources (seed, read, compile)
  translation/         provider contract, models, profiles, prompt, schema,
                       parsing, Explain, gloss
    providers/         AnthropicProvider, GeminiProvider, the registry
    offline/           on-device model (transformers.js)
  library/             per-book transfer, whole-tablet transfer, relay, share target
  share/               encrypted shared chapters
  catalog/             recommended books + batch import
  ui/                  screens; reader/ and settings/ hold most of the UI
proxy/                 Cloudflare Worker: CORS proxy + transfer relay (KV)
scripts/               verify-*.{ts,mjs}, check-layers.mjs, build tools
```

`npm run layers` prints the real dependency graph; trust it over this map.
Since Phase 1 it has no cycle, and `npm run layers -- --check` (also run by
the deploy workflow) fails on any cycle or any import the ten rules in
`docs/refactor/layers.json` forbid: `types` imports nothing and `lib` only
`types`; `platform`, `services` and `components` import only `lib` and
`types`; domain directories import neither `app` nor the UI (`components`
included); `app` does not import the UI; top-level `ui` does not reach into a
screen folder (`ui/reader` …); the translation core does not import its
providers; and nothing outside the root imports `main.tsx` or `App.tsx`.

## Traps

Things that have already gone wrong once. Most have a README section; 5, 6,
10 and 12 are recorded only here and in the code.

1. **`.gitignore` without a leading slash matches at every level.** And the
   deploy workflow's "source tree arrived intact" list names `src/`
   directories — a new top-level `src/` directory goes on that list (it
   missed `biography` and `share` until Phase 1: FOUND_ISSUES 1).
2. **API keys** — see Never. `services/secrets.ts` is the only reader and
   writer.
3. **Public repo** — see Never. Screenshots for a PR use the synthetic books
   the Playwright scripts build, not a real imported book.
4. **Claude API.** Current models reject forced `tool_choice`; the code uses
   `auto` plus a prompt instruction plus `strict: true` tools, and strict needs
   `additionalProperties: false` on every object in the schema. Every call has
   a text fallback (`parseSegments.ts`). Opus 5.5 takes `output_config.effort`.
   IDs, prices (with per-model cache-read multipliers and Haiku 5.5's long
   context tier), output ceilings and effort belong in `translation/models.ts`;
   the few that are still inline elsewhere are listed in FOUND_ISSUES 4.
   Saved profiles are migrated when a model is retired (`successorModel`).
5. **Translation cache keys** (`cacheKeyFor` in `translation/prompt.ts`) are
   a hash of selection, profile id and version, glossary hash, provider and
   model. Changing any input, or the join, silently invalidates every cached
   card. `npm run verify` pins this.
6. **IndexedDB.** `DB_VERSION` in `IdbStorageAdapter.ts`; the existing-DB
   branch uses `objectStoreNames.contains` guards, the fresh-install branch
   creates everything — both must agree. A new store also needs:
   `StorageAdapter` methods, `ShareStorageAdapter` (it implements the whole
   interface), `BOOK_STORES` if per book, `WorkBundle` if backed up. The
   whole-tablet transfer copies every store raw and refuses a different
   schema version, so both tablets must run the same app version.
7. **The reader scrolls the page, not a box.** `useWindowVirtualizer` with
   `scrollMargin` measured from the screen root (observing `body` never fires:
   `html, body { height: 100% }`), a sticky header, a sticky card-panel
   column, overscan 200, `content-visibility: auto` on block text.
   `TYPE_CHROME` in `BlockList.tsx` must match the CSS margins of each block
   type or every jump lands off target. Selection endpoints are pinned
   (`selectionPins.ts`) and `readSelection` takes text from stored blocks, not
   the DOM. Run both Playwright checks after any reader change.
8. **WebView browsers (DuckDuckGo on Android).** `blob:` downloads come out
   0 B, a `data:` link the size of a library crashes the tab, and the Web
   Share API refuses gzip files. `lib/saveFile.ts` (`needsDataUrl`) picks
   `blob:` or `data:` for a download; for a whole library the owner uses
   "Send through the proxy" instead (`library/relayTransfer.ts` and the
   Worker's `/transfer/` route), which the transfer screen promotes in those
   browsers.
9. **Plain-HTTP LAN dev** has no `crypto.subtle` or `crypto.randomUUID`;
   `lib/hash.ts` and `lib/id.ts` are plain JS for that reason.
10. **The PWA** uses `registerType: 'prompt'`; the update bar appears on
    reopen, reload or hourly. `public/share-target.js` is pulled into the
    service worker by workbox `importScripts`. The Pages base path is derived
    from `GITHUB_REPOSITORY` in `vite.config.ts`.
11. **Proxy routes are listed in three places** that must agree:
    `PROXIED_ORIGINS` in `platform/http/WebHttpClient.ts`, the dev proxy in
    `vite.config.ts`, and `ROUTES` in `proxy/worker.js`. The Worker is
    deployed by the owner with `wrangler` from the branch that has the change.
12. **GitHub Pages deploys sometimes sit "queued"** on GitHub's side. Not a
    code problem; the owner force-cancels and re-runs.

## Style

- Comments explain *why*, in full sentences, the way the existing ones do —
  what went wrong, what was measured, what the alternative was. Moved code
  keeps its comments verbatim.
- Names say what a thing is in the reader's terms ("block", "card", "mark",
  "profile"), matching the README.
- TypeScript strict, no `any` without a comment saying why. No default
  exports. Tailwind for styling, tokens in `src/index.css`.
- Arabic text handling goes through `lib/arabic.ts` (`normalize`, folding) —
  never an ad-hoc regex over diacritics.
