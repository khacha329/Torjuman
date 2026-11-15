# Phase 2: shared pieces — one copy of each helper and UI shell

Status: **approved by the owner, 2026-11-15** (answers at the end)
Base commit: `146dc62` (Phase 1 complete; PRs #8 and #9 open, not merged)
Branch: `claude/restructure-phase-2`

Line numbers below are at `146dc62`.

## Goal

RESTRUCTURE §6, Phase 2: "Shared pieces: `lib/gzip`, `lib/delay`,
`lib/format`, one proxy base, `ui/kit` (`ProgressBar`, `SettingsSection`,
`Button` and the rest of `ui/common`), and the 16 settings sections on the
shared shell — low–medium risk: markup must stay identical."

Done when:

- each repeated piece listed under Design exists once, and every copy that
  was **byte-for-byte the same** uses it;
- every copy that was *not* the same is either kept as it is (and listed
  here), or turned into a prop that reproduces it exactly, never merged into
  one version;
- the new check **U** (below) shows identical DOM, and identical screenshots
  at 960×600 and 600×960 touch, for every screen and state it captures, at
  every step;
- T, B, L pass at every step, S and R after the `ui/kit` move and at the end,
  `npm run layers -- --check` holds with the two rule changes named here;
- every step has a reviewer verdict of PASS or PASS WITH NOTES;
- the owner's `npm run verify` passes, and the staged build has been tried
  on the tablet (RESTRUCTURE §3 rule 9: this phase touches UI).

## Not doing

- **No visible change.** Two byte formatters and two progress bars differ
  from the rest; unifying them would change what the owner sees, so they are
  left as they are (Q5, Q6). Any unification is a separate change after the
  phase, if the owner wants it.
- No ḥadīth-only UI extraction (Design §8 says why; Q9).
- No splitting of `SettingsScreen.tsx`'s seven inline sections into files
  (Phase 5), no reader changes beyond import paths, no provider seams
  (Phase 3), no storage changes (Phase 4).
- No new dependency. The new check uses Playwright 1.63.0 (already a
  devDependency) and the Chromium already in the container; screenshots are
  compared by bytes with Node's `Buffer.equals`, not an image library.
- The check is not added to the deploy workflow (Q12).

## Current state (at `146dc62`)

### Helpers

| Piece | Copies | Same? |
| --- | --- | --- |
| `delay(ms)` | `ingest/importer.ts:297-299` (exported; used at `:85` and by `ingest/crawler.ts:7,129,203`); `translation/providers/GeminiProvider.ts:296-298` (private; used at `:139`) | **identical** bodies |
| inline sleeps | `library/transfer.ts:141` (`setTimeout(resolve, 0)`), `library/relayTransfer.ts:200` | not `delay` calls; left (rewriting an expression is not a move) |
| `formatBytes` | `ui/reader/ShareChapter.tsx:48-52` (used `:349`, `:412`); `ui/settings/PublishedShares.tsx:32-36` (used `:94`) | **identical**: `B` under 1 KiB, `toFixed(0)` KB, `toFixed(1)` MB |
| `sizeOf` | `ui/settings/DeviceTransfer.tsx:221-224` | **differs**: no `B` branch (`Math.max(1, …)`, so 500 B shows "1 KB"); KB rounded with `Math.round` and grouped with `toLocaleString` (1,000 KB and up shows "1,000 KB", `formatBytes` shows "1000 KB") |
| `mb` | `library/deviceTransfer.ts:392` (inside `roomFor`) | **differs**: MB only, `Math.ceil`, `toLocaleString` (300 KB shows "1 MB") |
| inline MB | `ui/settings/LibraryTransfer.tsx:41` | **differs**: always MB, `toFixed(1)` (300 KB shows "0.3 MB") |
| proxy URL | `platform/http/WebHttpClient.ts:76-78` `PROXY_BASE` = `DEV ? '' : (VITE_PROXY_URL ?? '').replace(/\/+$/, '')`; `library/relayTransfer.ts:24` `RELAY_BASE` = the same expression **without** the `DEV` branch | the expression is identical; the two constants are **not** (in `npm run dev`, `PROXY_BASE` is empty and `RELAY_BASE` is not) — both values must survive |
| gzip | see the next table | three different shapes |
| `subtle()` | `share/crypto.ts:91-95`; `library/relayTransfer.ts:101-105` | **identical**; `relayTransfer.ts:1` already imports `InsecureContextError` and `randomBytes` from `share/crypto` |

The gzip copies share only the platform call. Everything around it differs,
deliberately:

| Where | Compress | Decompress |
| --- | --- | --- |
| `library/transfer.ts` | `:149-158`: bytes → `Blob`; no `CompressionStream` → an uncompressed `Blob` typed `application/x-ndjson` | `:190-197`: by file name (`.gz`); no `DecompressionStream` → throws "This browser cannot read compressed transfer files." |
| `library/deviceTransfer.ts` | `:218-224`: a stream → `Blob`; fallback an untyped `Blob`, with a comment | `:432-442`: by magic bytes; same message as above |
| `share/crypto.ts` | `:156-168` `gzip`: bytes → bytes plus a `compressed` flag for the header | `:170-177` `gunzip`: "This browser cannot read compressed shares." |

### UI shells

**`ui/common.tsx`** (111 lines, no header comment): `Button`, `LinkButton`
(imports `hrefFor`, `Route` from `app/router`), `TopBar`, `Field`,
`inputClass`, `Spinner`. **30 importers**: `ui/` ×6 (`CatalogScreen`,
`ImportScreen`, `LibraryScreen`, `OnboardingScreen`, `ReceiveTransferScreen`,
`UpdateBar`), `ui/reader/` ×9, `ui/settings/` ×14, `ui/share/ShareScreen`.
No script imports it, nor any module that imports it.

**Progress bars: nine, in three markups.**

| # | Where (track line) | Track classes | Fill | Width |
| --- | --- | --- | --- | --- |
| 1 | `ui/LibraryScreen.tsx:163` | standard¹ | standard² | `percent` (`:117-121`) |
| 2 | `ui/CatalogScreen.tsx:322` | `mt-2 ` + standard | standard | `percent` (`:285-288`) |
| 3 | `ui/ReceiveTransferScreen.tsx:220` | standard | standard | inline, `progress && progress.total > 0 ? … : 0` |
| 4 | `ui/settings/DeviceTransfer.tsx:158` | standard | standard | inline, `progress.total > 0 ? … : 0` |
| 5 | `ui/settings/DeviceTransfer.tsx:172` | standard | standard | inline, same on `relayProgress` |
| 6 | `ui/settings/LibraryTransfer.tsx:108` | standard | standard | inline, as 4 |
| 7 | `ui/settings/OfflineTranslation.tsx:189` | standard | standard | `progress.percent` |
| 8 | `ui/ImportScreen.tsx:287` | **`mb-2 h-2 w-full …`** (taller, margin below) | standard | `percent` (`:268-271`) |
| 9 | `ui/reader/BatchTranslateBar.tsx:99` | **`mt-1.5 h-1 overflow-hidden …`** (thinner, no `w-full`) | **`h-full bg-accent transition-[width] duration-300`** | `percent` (`:65`, no zero guard) |

¹ `h-1.5 w-full overflow-hidden rounded-full bg-rule`.
² `h-full bg-accent transition-all`, `style={{ width: \`${…}%\` }}`.

The Phase 0 survey counted nine; it is nine, but 1–7 are one markup and 8, 9
are two others.

**Settings section shell.** RESTRUCTURE says "all 16". The real count:
**14 section files** open with the same
`<section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">`
— `ReferenceWorks.tsx:74`, `RetrievalSection.tsx:109`, `BuildSection.tsx:141`,
`DeviceTransfer.tsx:98`, `QulResources.tsx:122`, `EntitySection.tsx:54`,
`HadithSourceSection.tsx:48`, `OfflineCapabilities.tsx:56`,
`NarratorSources.tsx:84`, `PublishedShares.tsx:64`, `GlossaryTable.tsx:112`,
`ProfileEditor.tsx:50`, `LibraryTransfer.tsx:80`,
`OfflineTranslation.tsx:134` — and the local `Section` in
`SettingsScreen.tsx:71-87` (line 81) is the 15th copy, used by the seven
inline sections (`CatalogSection` `:96`, `TranslationSection` `:118`,
`KeysSection` `:196`, `ReadingSection` `:350`, `DisplaySection` `:416`,
`QuranSection` `:457`, `BackupSection` `:576`). So **21 sections, 15 copies
of the shell**. The list is `SettingsScreen.tsx:42-64`.

What sits inside differs, and that decides the design:

- 12 files follow the shell with `<h2 className="text-base font-semibold">`
  and a `<p className="mt-0.5 mb-4 text-sm text-muted">` whose content is JSX
  (links, `<strong>`, `<code>`), and then their content **as siblings**.
- `OfflineCapabilities.tsx:57` wraps its `h2` in a flex row with a badge;
  `GlossaryTable.tsx:113` puts `h2` and a `max-w-xl` paragraph in a
  `justify-between` row.
- The local `Section` takes `description` as a **string**, renders the
  paragraph only when it is given, and wraps the children in
  `<div className={description ? '' : 'mt-4'}>` — a wrapper the files do not
  have. Moving the files onto `Section` as it is would add a `div` to 14
  sections: not identical.

### Layer graph (`node scripts/check-layers.mjs` at `146dc62`)

154 files, 128 directory edges, no cycles, no mutual pairs, 10 rules hold.
Rule 6 forbids `ui` → `ui/.+` (anchored: `^(?:ui/.+)$`), so a new
`ui/kit` directory would put the six top-level screens that import
`common` in breach. Step 2g changes that rule in the same commit.

### What `npm run verify` (V) builds among the files touched

`scripts/verify-parsers.ts` imports `ingest/importer` (`:260`, `:1287`,
`:1458`), `share/crypto` (`:4646`, `:4945`, `:5052` — `sealBundle` /
`openBundle` exercise `gzip` / `gunzip`), `library/deviceTransfer` (`:5149`,
export and restore through gzip), `library/relayTransfer` (`:5343`, with an
explicit `base`, so `RELAY_BASE` itself is not read), and
`platform/http/WebHttpClient` (`:4547`, `PROXIED_ORIGINS`). It also walks every
`src/**/*.ts(x)` for root-absolute `fetch` (`:4481-4500`), which new files
pass trivially. It does not import `library/transfer`, `GeminiProvider`,
`ShareChapter`, `PublishedShares`, `ui/common` or anything that imports it.

## Design

### 1. `lib/delay.ts`

`delay` moves verbatim from `ingest/importer.ts:297-299` to `lib/delay.ts`.
`importer.ts` and `crawler.ts` import it from there; `GeminiProvider.ts`
deletes its private copy and imports it. No re-export is left in
`importer.ts`. The two inline sleeps stay as they are.

### 2. `lib/format.ts`

`formatBytes` moves from `ShareChapter.tsx:48-52` to `lib/format.ts`;
`PublishedShares.tsx` deletes its identical copy and imports it. `sizeOf`,
`mb` and `LibraryTransfer.tsx:41` stay where they are (Q6). Their differences
are written into FOUND_ISSUES as a new entry ("four byte formats"), so a
later, visible change can decide.

### 3. One proxy URL: `platform/http/proxyUrl.ts`

```ts
/** The proxy Worker this build was given (vite.config.ts), no trailing slash; empty if none. */
export const PROXY_URL: string = (import.meta.env.VITE_PROXY_URL ?? '').replace(/\/+$/, '');
```

`WebHttpClient.ts:76-78` becomes `import.meta.env.DEV ? '' : PROXY_URL`,
keeping its comment; `relayTransfer.ts:24` becomes `RELAY_BASE: string =
PROXY_URL`, keeping its comment. Both exported names and both values stay.
The `define` comment at `vite.config.ts:142` ("Read by
src/platform/http/WebHttpClient.ts") is stale today and becomes "Read by
src/platform/http/proxyUrl.ts" — a pointer this plan names.

New directory edge: `library → platform/http` (value). Allowed: domain may
import layer 1.

Rejected: `lib/proxyUrl.ts`. `lib` is pure helpers; a build-time deployment
setting belongs to the platform layer that routes requests (Q8). Rejected too:
exporting the expression from `WebHttpClient.ts`, which would make the relay
depend on the HTTP client for one constant.

Load order (§3 rule 6): `PROXY_URL` is a constant over a `define`d literal,
with no side effect; evaluating it in a new module changes nothing observable.

### 4. `lib/gzip.ts` — the platform call only

The three copies agree only on "is the stream available" and
`pipeThrough(new …Stream('gzip'))`. The fallbacks, the error messages, how
compression is detected (name, magic bytes, header flag) and the input and
output types are each format's own, and stay at the call site:

```ts
export function canGzip(): boolean      // typeof CompressionStream !== 'undefined'
export function canGunzip(): boolean    // typeof DecompressionStream !== 'undefined'
export function gzipStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array>
export function gunzipStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array>
```

Each call site keeps its statements in the same order:
`typeof CompressionStream === 'undefined'` becomes `!canGzip()`, `typeof
DecompressionStream === 'undefined'` becomes `!canGunzip()`, and
`x.pipeThrough(new CompressionStream('gzip'))` becomes `gzipStream(x)`. The
throws, their messages, the fallbacks and every comment (`crypto.ts`'s
"Gzip, where the platform has it" block included) do not move. `crypto.ts`
keeps its `gzip` and `gunzip` wrappers, because they carry the flag.

Rejected: a `gunzipStream(stream, message)` that throws by itself. It would
need the `Blob` stream to exist before the check in `crypto.ts:170-176`, which
reorders statements (§3 rule 4).

Honest note: this shares four one-liners. Its value is one place that names
the format and the availability test; Q7 offers dropping it.

### 5. `ui/kit/` — a directory, imported as `'../kit'`

`git mv src/ui/common.tsx src/ui/kit/index.tsx`. The 30 importers change
specifier only (`'./common'` → `'./kit'`, `'../common'` → `'../kit'`). One
header comment is added, saying what the kit is and what it may import (the
plan names this adaptation; `common.tsx` has none today). New pieces get their
own file in `ui/kit/` and one `export { … } from './…'` line in `index.tsx`,
so every screen keeps a single import path (Q1, Q2).

`ui/kit` is a new directory unit. Edges after the move: `ui`, `ui/reader`,
`ui/settings`, `ui/share` → `ui/kit`; `ui/kit` → `app` (the router, for
`LinkButton`). `ui/share` → `ui` disappears (its only `ui` import was
`common`); `ui/reader` → `ui` and `ui/settings` → `ui` stay
(`useLayoutMode`).

### 6. `ProgressBar` — the seven identical copies

```tsx
export function ProgressBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <div className={`${className ? `${className} ` : ''}h-1.5 w-full overflow-hidden rounded-full bg-rule`}>
      <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
    </div>
  );
}
```

Copies 1–7 use it. Copy 2 passes `className="mt-2"`, which reproduces
`mt-2 h-1.5 w-full …` exactly. The width expressions move unchanged from the
`style` template into `percent={…}`; the rendered `style` string is the same.
Copies 8 (`ImportScreen`) and 9 (`BatchTranslateBar`) **keep their own
markup** (Q5).

Rejected: a `variant` prop for 8 and 9. It would hold two more complete class
strings and share nothing.

### 7. `SettingsSection` — the bare shell

```tsx
export function SettingsSection({ children }: { children: ReactNode }) {
  return (
    <section dir="ltr" className="ltr-isolate rounded-lg border border-rule bg-white p-5">
      {children}
    </section>
  );
}
```

The 14 files replace their opening and closing `section` tags with
`<SettingsSection>` / `</SettingsSection>`; the local `Section` in
`SettingsScreen.tsx` renders its `h2`, paragraph and `div` inside
`SettingsSection` instead of a `section`. Everything inside stays as it is.
This meets RESTRUCTURE §2 ("adding a settings section is one component using
the shared shell, plus one line in the list").

Rejected for now: `title` and `description` props on `SettingsSection`. They
fit only 12 of the 14 files, would move every description's JSX into a prop
(the riskiest edit for JSX whitespace), and could not absorb the local
`Section`'s wrapper `div` without a third mode. Offered as optional step 2j′
(Q3).

### 8. Ḥadīth-only UI: not in Phase 2

RESTRUCTURE's book-kinds paragraph has "Phase 2 and Phase 5 move ḥadīth-only
UI (sheet tabs, margin actions, card kinds) behind named components". Looking
at the code, none of it fits Phase 2:

- **Settings is already done.** Each section is a named component in its own
  file, and the ḥadīth-only ones — `HadithSourceSection`, `NarratorSources`,
  half of `EntitySection` ("Verse and ḥadīth detection") — are single lines in
  the list at `SettingsScreen.tsx:42-64`. That list is where a genre
  descriptor (Phase 5b) will choose sections. Phase 2 needs to add nothing.
- **The reader side is in Phase 5's files.** The sheet tabs are inside
  `EntitySheet.tsx` (Phase 5 splits it into `QuranSheet`, `CompileTab`,
  `HadithSheet`), the margin actions in `MarginMenu.tsx` and
  `ReaderScreen.tsx`, and the card kinds (`SharhCardView`, `NarratorCard`, the
  takhrīj parts of `TranslationCardView`) are wired from `ReaderScreen.tsx`.
  Extracting them now would cut the same files twice. It also needs S and R
  on every step and reader states check U does not capture.
- The two structure-profile labels (`LibraryScreen.tsx:154`,
  `ImportScreen.tsx:173`) are display text for `StructureProfile`, which is
  Phase 5b's to redesign.

So Phase 2 leaves it to Phase 5 (Q9).

### 9. Check U (UI markup), built first

A Playwright script, `scripts/verify-markup.mjs`, and an npm script
`verify:markup`. It is built in step 2a, on the old code, in its own commit
(§3 rule 7). It is added to the RESTRUCTURE §5 table as:

| Id | What | Pass | Where |
| --- | --- | --- | --- |
| **U** | `npm run verify:markup`: normalized DOM and screenshots of every screen and state that shows a shared UI piece, at 960×600 and 600×960 touch, in a build without and a build with a proxy | every DOM file and every screenshot matches the committed manifest | here |

**Builds.** The script runs `vite build` twice as child processes (no
`tsc`), with an explicit environment so the result does not depend on the
container: `GITHUB_REPOSITORY`, `BASE_PATH`, `VITE_CATALOG_URL`,
`VITE_SHARE_BASE_URL` and `PROXY_URL` removed, and
`VITE_PROXY_URL` set to `''` for `.verify/markup-build/plain` and
`https://proxy.invalid` for `.verify/markup-build/proxy`. (`/.verify/` is
already gitignored; no new pattern.) Each build is served with Vite's
`preview({ build: { outDir } })`, as `verify-reader-scroll.mjs:391-395` does
for one.

**Browser context**, per profile (the two of `verify-reader-scroll.mjs:399-408`):
`{ viewport: 960×600 | 600×960, hasTouch: true, isMobile: true,
deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'UTC',
serviceWorkers: 'block' }`. Blocking the service worker keeps every request
visible to `context.route` and keeps the update bar out. `page.clock.setFixedTime`
pins `Date` to a fixed instant (timers still run), so dates in filenames,
"Made …" and share rows do not change between runs. `document.fonts.ready` is
awaited before each capture (the fonts are local: `src/index.css:7-47`).

**Network.** Every request to a host other than the preview server is either
**held** (never answered, so the screen stays in its in-progress state) or
**aborted**:

- held: everything under `https://proxy.invalid/` (proxy build), the model
  host for the offline download state;
- aborted: everything else (`api.quran.com` in the plain build,
  `raw.githubusercontent.com`, …). An aborted fetch fails the same way every
  run.

**Seed.** As `verify-reader-scroll.mjs:171-180`: open the app once, set
`shamela-reader.onboarded` and `shamela-reader.catalogOffered` (except for the
onboarding capture), wait for the app to create its database (`DB_VERSION`
11), then write synthetic rows with `indexedDB.open('shamela-reader')` and
reload. Rows (all synthetic Arabic and English, like the existing scripts;
nothing from a real book):

- `books`: one complete book (pages, 40 blocks, 3 `tocNodes`) and one
  **partial** book (`importStatus` not `complete`, 40 of 100 pages fetched),
  plus a `crawlStates` row for it;
- `glossary`: two entries;
- `shareRecords`: three, with `bytes` 512, 300 × 1024 and 2.5 × 1024² — so
  `formatBytes` renders all three branches ("512 B", "300 KB", "2.5 MB").

**Captures.** Each is a pair of files per profile: `<name>.html` and
`<name>.png`.

| Build | Name | How it is reached | Pieces it shows |
| --- | --- | --- | --- |
| plain | `onboarding` | no `onboarded` flag | `Button`, `inputClass` |
| plain | `library` | `#/` with the seed | `TopBar`, `LinkButton`, `Button`, **`ProgressBar` 1** ("Import incomplete — 40%") |
| plain | `import` | `#/import` | `Field`, `inputClass`, the no-proxy note |
| plain | `catalog` | `#/catalog` | `Button`, the no-proxy note |
| plain | `receive` | `#/receive` | `TopBar`, `Button` |
| plain | `share-error` | `#/share/x/y` (the bundle fetch 404s) | `Button`, `Spinner` or the error |
| plain | `reader-header` | `#/read/<complete book>`; the `header` element only, so the virtualizer's measurements stay out | `Button`, `LinkButton` |
| plain | `settings` and `settings--<slug>` ×21 | `#/settings`; the whole column, then each `section` child of it, named by its `h2` text; each screenshot is `locator.screenshot()` | **`SettingsSection` ×15**, `Field`, `Button`, `formatBytes` (Published chapters) |
| plain | `settings--library-transfer-exporting` | `CompressionStream` replaced (by `page.evaluate`, just before the click) with a `TransformStream` whose `flush` never resolves; tap the complete book's export button. `exportBook` reaches "Compressing…" and stays there | **`ProgressBar` 6** at 100% |
| plain | `settings--device-transfer-exporting` | the same stub; tap the button that writes the transfer file. `exportDevice` stays on its last message | **`ProgressBar` 4** |
| plain | `settings--offline-downloading` | accept the `confirm` dialog; answer the model's `config.json` with a small JSON and hold the rest | **`ProgressBar` 7** — *if* two baseline runs agree; otherwise this capture is dropped and copy 7 is checked by reading, and step 2a's PROGRESS entry says so |
| proxy | `import-proxy`, `catalog-proxy`, `receive-proxy`, `settings-proxy` | as in the plain build (the relay and import texts differ when a proxy exists, e.g. `DeviceTransfer.tsx:127`, `:201`) | as above |
| proxy | `catalog-importing` | select the first entry, start the import; the row turns `importing` (`catalog/importBatch.ts:220`) before its first fetch, which is held | **`ProgressBar` 2** at 0% |
| proxy | `receive-fetching` | type a relay code, start; the first relay request is held | **`ProgressBar` 3**, "Starting…", 0% |
| proxy | `device-transfer-relay` | write the transfer file (no stub), then "Send through the proxy"; the first `PUT` is held | **`ProgressBar` 5** |
| proxy | `import-crawling` | the partial book's "Resume import" (`LibraryScreen.tsx:180`); the crawler publishes its progress before the first page fetch (`ingest/crawler.ts:93-102`), which is held | copy 8 (unchanged; a regression guard for `ImportScreen`) |

Not captured, with the reason: `BatchTranslateBar` (copy 9; reaching it needs
a running batch translation; its markup does not change in this phase, only
its import path), `UpdateBar` (needs a service-worker update; import path
only), `ShareChapter`'s sealed state (reached through the share dialog; its
`formatBytes` is moved verbatim, so the PublishedShares capture and the diff
cover it). The reviewer reads these.

Each in-progress capture waits until the captured element's `outerHTML` has
not changed for 1 s, with a 15 s limit (a timeout is a failure, not a pass).

**Normalization** of `<name>.html`: `document.body.innerHTML` (sheets and
popovers can sit outside `#root`), `<script>` elements removed, a line break
inserted between `>` and `<` so a difference is reported by line. Masks, each
with a comment in the script saying why:

- the "Built" time in `BuildSection.tsx:152` (`__BUILD_TIME__` differs per
  build);
- the storage usage in `OfflineTranslation.tsx:62-63` (`navigator.storage`
  varies with what the run has written);
- React `useId` ids (`«r…»`, `:r…:`, `_r_…_`). There are none at `146dc62`;
  the mask is there so a later one cannot make the check flaky.

Nothing else is masked. A mask found to be needed while taking the baseline is
added to the script and named in the 2a commit. In screenshots the same two
elements are painted over with Playwright's `mask` option, and
`animations: 'disabled'` stops the spinner and the bars' transitions.

**Comparison.** Strict: the normalized text must be equal byte for byte —
class order, attribute order and whitespace included, because "identical
markup" means exactly that. Screenshots are compared with `Buffer.equals`.

**What is committed.** `docs/refactor/phase2/markup.sha256`: one line per
file, the SHA-256 of each normalized `.html` and each `.png` (Q11). The dumps
themselves go to `.verify/markup/<label>/` (gitignored). Modes:

- `npm run verify:markup`: both builds, dump to `.verify/markup/current/`,
  compare against the manifest; exit 0 when all match, otherwise list each
  differing file, and for an `.html` the first differing lines when a
  `.verify/markup/base/` dump is present;
- `node scripts/verify-markup.mjs --write-manifest`: used once, in 2a;
- `node scripts/verify-markup.mjs --compare <dir-a> <dir-b>`: two dumps.

If `.verify/` has been cleared, a `base/` dump is re-made from the 2a commit
with `git worktree add` (with `node_modules` linked) and `VERIFY_OUT=…`.

**Proof of the check, in 2a** (like the compare-bundles harness in Phase 1):

1. two runs on the same code: every file identical (determinism);
2. a temporary one-token edit (swap two classes in copy 1's track in
   `LibraryScreen.tsx`) → exit 1, naming the `library` files; reverted, and
   the file restored byte for byte;
3. a temporary added space in one settings description → exit 1, naming that
   section; reverted;
4. the run time, reported.

Screenshots are claimed only if run 1 shows them byte-stable. If they are not,
the PNG hashes stay out of the manifest, the screenshots are kept for the PR
and the owner's eyes, and 2a's PROGRESS entry says so. The DOM comparison
carries the "identical" burden either way.

### 10. What B means in this phase

compare-bundles will **not** show identical JS: code moves into new modules,
and Rollup orders and names them differently. Per step, B is:

- `npm run build` exits 0;
- main chunk `index-*.js` within ±2 KB of the previous step (the whole phase
  should land within a few hundred bytes of 791,838 B);
- `node scripts/compare-bundles.mjs` reports **only** `index.js` as
  different: `transformers.web`, `sql-wasm-browser`, `node.browser`,
  `workbox-window` and the rest identical (no dynamic chunk merged — T-h);
- `index-*.css` **byte-identical** (`cmp`). Tailwind 4 builds the CSS from
  the class tokens it finds in the project, and every token stays somewhere
  in `src/`. Note: it also scans non-ignored docs, so a commit that only adds
  markdown can change the CSS when the markdown names a class nowhere else in
  use; such a difference is explained in the step's PROGRESS entry, never
  waved through.

U, not B, is the "nothing the owner sees changed" check.

### 11. Layer rules

| Step | Change to `docs/refactor/layers.json` |
| --- | --- |
| 2b–2e | none: `lib/delay`, `lib/format`, `lib/gzip` import nothing, and the existing `lib` rule (`lib` imports only `types`) covers them. `platform/http/proxyUrl.ts` imports nothing; the `platform/.*` rule covers it |
| 2g | rule 6 becomes `"from": "ui", "to": "ui/(?!kit$).+"`, why: "top-level ui does not reach into a screen's folder; the shared kit is not a screen (Phase 1 step 1g, Phase 2 step 2g)" |
| 2g | new rule `"from": "ui/kit", "to": "(?!(app|lib|types)$).*"`, why: "the kit imports no screen, no domain code and no service; `app` only for the router (Phase 2 step 2g)" |

The domain and `app` rules already forbid `ui(/.*)?`, so `ui/kit` is covered
from below without change. The tool works per directory, so "`app` only for
the router" is held by review, not by the rule (said in the rule's `why`).
2g runs two negative tests, each undone: a temporary file in `ui/kit` importing
`ui/reader/selection` → `--check` exit 1; a temporary rule forbidding
`ui → ui/kit` → exit 1 (proves the new exception is what lets the screens
through).

## Steps

Ordered by risk: helpers with no markup first, then the move, then the two
markup steps. One extraction or move per commit. Commit message:
`Restructure phase 2 step 2x: <what> to <where>`, then a summary and a
`Checks:` paragraph.

| Step | What | Files | Checks | Risk |
| --- | --- | --- | --- | --- |
| 2a | **Check U**, baselined on the old code | new `scripts/verify-markup.mjs`, `package.json` (`verify:markup`), new `docs/refactor/phase2/markup.sha256`, RESTRUCTURE §5 row, CLAUDE.md commands row, PROGRESS | U (determinism, two negative tests); T B unchanged (no `src/` change) | none for the app |
| 2b | `delay` → `lib/delay.ts` | new `lib/delay.ts`; `ingest/importer.ts`, `ingest/crawler.ts`, `translation/providers/GeminiProvider.ts` | T B L U; SSR build of verify; **V owed** (importer) | low |
| 2c | `formatBytes` → `lib/format.ts` | new `lib/format.ts`; `ui/reader/ShareChapter.tsx`, `ui/settings/PublishedShares.tsx` | T B L U (Published chapters, three branches) | low |
| 2d | one proxy URL → `platform/http/proxyUrl.ts` | new file; `platform/http/WebHttpClient.ts`, `library/relayTransfer.ts`, the comment in `vite.config.ts:142` | T B L U (both builds); SSR build; **V owed** | low |
| 2e | gzip platform call → `lib/gzip.ts` | new `lib/gzip.ts`; `library/transfer.ts`, `library/deviceTransfer.ts`, `share/crypto.ts` | T B L U (export states); SSR build; **V owed** (seal/open, device export/restore) | low–medium |
| 2f | *(optional, Q10)* `subtle()` exported from `share/crypto.ts`; `relayTransfer.ts` drops its copy | 2 files | T B L; SSR build; **V owed** | low |
| 2g | `ui/common.tsx` → `ui/kit/index.tsx`; layer rules | 1 file moved, 30 importers, `layers.json` | T B L (negative tests) **S R** U | low |
| 2h | `ProgressBar` in `ui/kit`, copies 1–7 | new `ui/kit/ProgressBar.tsx`, `ui/kit/index.tsx` (one re-export), 6 files | T B L U | medium (markup) |
| 2i | *(optional, Q10)* `percentOf(done, total)` in `lib/format.ts` for the six `total > 0 ? Math.round(done / total * 100) : 0` sites | `lib/format.ts`, `LibraryScreen`, `ImportScreen`, `ReceiveTransferScreen`, `DeviceTransfer` ×2, `LibraryTransfer` | T B L U | low |
| 2j | `SettingsSection` in `ui/kit`, 15 copies | new `ui/kit/SettingsSection.tsx`, `ui/kit/index.tsx`, 14 section files, `SettingsScreen.tsx` | T B L U | medium (markup) |
| 2j′ | *(optional, Q3)* `title`/`description` props on `SettingsSection` for the 12 files with the standard heading | 13 files | T B L U | medium |
| 2k | docs: maps, RESTRUCTURE status and the "16" count, FOUND_ISSUES, PROGRESS result; end-of-phase S R U | docs only | T B L S R U X | none |

## Per step

**2a — check U.** As Design §9. The commit changes no `src/` file, so T and B
are unchanged and the U baseline is the old code's. The manifest is written
from the second of the two determinism runs. PROGRESS records: the run time,
the number of captures per build and profile, every mask, whether screenshots
are in the manifest, and whether `settings--offline-downloading` made it in.
Gap: the states listed as "not captured".

**2b — `delay`.** Cut `importer.ts:297-299` verbatim into `lib/delay.ts` (with
a header comment, adaptation (c)); `importer.ts` gains
`import { delay } from '../lib/delay'`; `crawler.ts:7` drops `delay` from its
`./importer` specifier list (nothing else in the list moves) and gains the
`lib/delay` import; `GeminiProvider.ts:296-298` is deleted and the import
added. Callers: `importer.ts:85`, `crawler.ts:129`, `:203`,
`GeminiProvider.ts:139`. Grep `src` and `scripts` for `delay` from
`importer` first (none in scripts at `146dc62`). Edges: none new
(`ingest → lib`, `translation/providers → lib` exist). V: `importer` is in
the SSR build; run that build here.

**2c — `formatBytes`.** Move `ShareChapter.tsx:48-52` verbatim to
`lib/format.ts` (header comment saying `sizeOf` and `mb` are different on
purpose, see FOUND_ISSUES); delete `PublishedShares.tsx:32-36` (the separator
comment block above it, `:23-30`, belongs to the file's next section and stays).
Both import from `lib/format`. Edges exist. U: the three seeded rows.

**2d — proxy URL.** As Design §3. Callers of the two exported names
(`PROXY_AVAILABLE`, `RELAY_BASE`, `RELAY_AVAILABLE`) do not change. Grep:
`CatalogScreen.tsx:11`, `ImportScreen.tsx:6`, `ReceiveTransferScreen.tsx:15`,
`DeviceTransfer.tsx:8`. U's proxy build is what shows both values still arrive.
V owed: the SSR build bundles `WebHttpClient` and `relayTransfer`. M later:
the owner's staged build is the only place `PROXY_URL` is a real Worker.

**2e — gzip.** As Design §4, six call sites (three compress, three
decompress; corrected after the 2e review). The diff must show only: the new import, `typeof …` →
`!canGzip()` / `!canGunzip()`, and `.pipeThrough(new …Stream('gzip'))` →
`gzipStream(…)` / `gunzipStream(…)`. Every message, fallback and comment
stays. U's two export states cross `canGzip` and `gzipStream` in the browser
(the stub is still a `CompressionStream`, so `canGzip()` is true); V's
seal/open and device export/restore cross all four in Node.

**2f — `subtle()` (optional).** `export` added to `crypto.ts:91` (adaptation
(b)); `relayTransfer.ts:101-105` deleted; `subtle` appended to the existing
import at `relayTransfer.ts:1`. V owed.

**2g — `ui/kit`.** `git mv`, the header comment, the 30 specifiers (grep
`common'` in `src` and `scripts`), the two rule changes and their negative
tests (Design §11). L: edges +5 (`ui`, `ui/reader`, `ui/settings`,
`ui/share` → `ui/kit`, `ui/kit` → `app`), −1 (`ui/share` → `ui`); 132 edges.
S and R run because nine reader files change imports. B: expect the main
chunk within a few bytes (a rename).

**2h — `ProgressBar`.** As Design §6. Per site the diff replaces the
track-and-fill `div` pair with one element; the wrapper around it and the
text beside it do not change. Copy 2 takes `className="mt-2"`. Copies 8 and 9
are untouched. U: captures `library`, `catalog-importing`, `receive-fetching`,
`settings--device-transfer-exporting`, `device-transfer-relay`,
`settings--library-transfer-exporting`, and `settings--offline-downloading`
if it is in the manifest (otherwise copy 7 is read from the diff and the
commit says so).

**2i — `percentOf` (optional).** `percentOf(done: number, total: number):
number` returns `total > 0 ? Math.round((done / total) * 100) : 0`.
`ReceiveTransferScreen`'s `progress && …` becomes `progress ? percentOf(…) : 0`,
the same value for every input. `CatalogScreen` (capped at 99, `Math.max(1, …)`)
and `BatchTranslateBar` (no guard) differ and stay. U: widths and the
"Import incomplete — 40%" text.

**2j — `SettingsSection`.** As Design §7. Per file: one import, the opening
tag, the closing tag; nothing inside changes and nothing is re-indented. That
leaves the body indented one level too deep under the new tag, which is
correct JSX and the smallest diff; re-indenting would hide the change (and
`git diff -w` is how the reviewer reads it either way). `SettingsScreen.tsx`'s
local `Section` keeps its name, props and inner markup; only its outer tag
changes. U: all 21 `settings--*` captures and both full-screen ones, in both
builds.

**2j′ — heading props (optional).** Only if the owner answers Q3 that way:
`title: ReactNode` and `description: ReactNode`, rendering exactly the `h2`
and `p` of Design §7's 12 files, then the children. The description JSX moves
into the prop unchanged. `OfflineCapabilities`, `GlossaryTable` and the local
`Section` keep the bare shell. U is the whole check here: JSX whitespace
inside a moved fragment is the likeliest single-space slip.

**2k — docs.** CLAUDE.md map (`ui/kit`, `lib/delay`, `lib/format`,
`lib/gzip`, `platform/http/proxyUrl`) and its rules paragraph (now 11 rules);
README "How it fits together"; RESTRUCTURE status line, §1's "16" (21
sections, 15 shells), §6 Phase 2 row marked complete; FOUND_ISSUES: "four byte
formats" (if not written in 2c), "two progress bars that differ"
(`ImportScreen`, `BatchTranslateBar`), and the optional steps the owner
declined; PROGRESS result table. End of phase: S, R, U, `--check`, and the
report saved as `docs/refactor/phase2/layers.txt`.

## Checks

| Check | When |
| --- | --- |
| T | every step |
| B (as Design §10) | every step from 2b; 2a records the baseline sizes and the CSS hash after the plan commit |
| L | every step; `--check` must hold after each commit |
| U | built in 2a; every step from 2b |
| S, R | 2g, and at the end (2k) |
| SSR build of `verify-parsers.ts` (the here-runnable half of V) | 2b, 2d, 2e, 2f |
| X (reviewer) | after every commit, before the next step (Q13) |

**Only the owner can run:**

- **V** `npm run verify` on the PC, once before merging. Owed by 2b, 2d, 2e,
  and 2f if done. The count is compared with the Phase 0 baseline, which is
  itself still owed (PROGRESS "Open").
- **M** the staged build on the tablet (`npm run stage`): Library with a
  half-imported book, Settings scrolled through every section in both
  orientations, a book export and a tablet transfer started (progress bars),
  Receive, and the proxy-only paths (relay, import), which U sees only with a
  fake proxy. **And one book exported and imported back** (added after the 2e
  review): book export and import go through `lib/gzip` and no automated
  check covers them — V does not import `library/transfer.ts`, and U only
  holds the export mid-compression.

## Risks

- **R1. Markup drifts by a space, a class order or an attribute order.**
  Caught by U's strict comparison. Most likely in 2h (template-string class
  for copy 2) and 2j′.
- **R2. U does not see a state.** `BatchTranslateBar`, `UpdateBar`,
  `ShareChapter` sealed, perhaps the offline download. Those sites change only
  an import path in this phase (or, for `ShareChapter`, lose a function that
  moved verbatim), and the reviewer reads them; listed in 2a's PROGRESS entry.
- **R3. U is flaky.** Held requests instead of timing, a fixed clock, fixed
  locale and time zone, blocked service worker, disabled animations, local
  fonts, and the determinism run in 2a. Any mask added is named.
- **R4. CSS changes.** Caught by B's `cmp` on `index-*.css`. Docs that name
  class tokens can change it too (Design §10); explained when it happens.
- **R5. A script importer is missed.** `tsc -b` does not compile `scripts/`.
  Grep `scripts/` in every step; the SSR build here resolves every import of
  `verify-parsers.ts`; V on the PC.
- **R6. Load order.** `lib/*` and `proxyUrl.ts` have no side effects;
  `ui/kit/index.tsx` re-exports. The reviewer checks it in 2d and 2g.
- **R7. The new rule exception is wider than meant.** The patterns are
  anchored (`check-layers.mjs:219-220`); 2g's negative tests prove both
  directions.
- **R8. The gzip edit changes when an error is thrown.** Design §4 keeps every
  check where it was; the reviewer compares statement order site by site; V
  exercises the paths in Node.
- **R9. Phase 1 changes under this branch.** PRs #8 and #9 are open. If
  either changes before merging, `main` (or the Phase 1 branch) is merged into
  this branch — never rebased (CLAUDE.md, Never). U's manifest is re-checked
  after any such merge.

## Questions

1. **Q1. Name and shape of the kit.** Recommended: a directory `src/ui/kit/`,
   with `common.tsx` moved to `ui/kit/index.tsx`, new pieces in their own
   files, everything imported as `'../kit'`. Alternatives: `ui/common/` as the
   directory name; or keep `ui/common.tsx` where it is and put new pieces
   beside it (no rule change, but no single place for the kit).
2. **Q2. Split `ui/kit/index.tsx` into `Button.tsx`, `TopBar.tsx`,
   `Field.tsx`, `Spinner.tsx` behind the barrel?** Recommended: not in this
   phase. 111 lines is fine, and it would be four more commits of pure churn.
   It can follow in Phase 5 if `index.tsx` grows.
3. **Q3. `SettingsSection`: bare shell, or with `title`/`description`
   props (step 2j′)?** Recommended: bare shell only. It meets RESTRUCTURE §2,
   its identity is plain from the diff, and the props fit 12 of 14 files.
4. **Q4. Where `SettingsSection` lives.** Recommended: `ui/kit`, as
   RESTRUCTURE says, so a future genre's own settings section (Phase 5b) can
   use it without importing from `ui/settings`. Alternative:
   `ui/settings/SettingsSection.tsx`, since only settings uses it today.
5. **Q5. The two progress bars that differ** (`ImportScreen.tsx:287`, taller;
   `BatchTranslateBar.tsx:99`, thinner, with its own transition). Recommended:
   keep both as they are in Phase 2, and record them in FOUND_ISSUES. Making
   them match the others is a visible change, for a separate PR if wanted.
6. **Q6. The byte formatters that differ** (`sizeOf`, `mb`,
   `LibraryTransfer.tsx:41`). Unifying them changes visible text: a 500-byte
   file would show "500 B" instead of "1 KB", 1,000 KB and up would lose the
   comma, the room warning would show "300 KB" instead of "1 MB", and a small
   export would show "300 KB" instead of "0.3 MB". Recommended: leave them,
   record them in FOUND_ISSUES, and decide in a later change.
7. **Q7. `lib/gzip` as designed** (four one-liners; every fallback and message
   stays at its call site)? Recommended: yes — it is in the phase's scope and
   gives the format one home. Alternative: drop it; the copies are not the
   same code.
8. **Q8. Where the proxy URL lives.** Recommended:
   `platform/http/proxyUrl.ts`. Alternatives: export it from
   `WebHttpClient.ts`; or `lib/proxyUrl.ts`.
9. **Q9. Ḥadīth-only UI.** Recommended: none in Phase 2, for the reasons in
   Design §8 (settings is already one named component per section; the reader
   parts are in Phase 5's files). Phase 5's plan takes it on with the genre
   descriptor in view.
10. **Q10. Optional steps.** Recommended: include 2f (`subtle()`, which
    `relayTransfer` half-imports already) and 2i (`percentOf`, six identical
    expressions, checked by U). Leave for later: `parseHtml`
    (`shamela/parsePage.ts:58`, `parseBook.ts:54`, identical, but in the
    parsers V covers most heavily); `pageIndexOf` (`ui/reader/BlockList.tsx:134`,
    `share/buildBundle.ts:84`, identical; it parses block ids and wants a home
    with `blockIdFor` in `ingest/importer.ts`, which is a bigger question);
    `toLine` (`library/transfer.ts:85`, `deviceTransfer.ts:398`, the same body
    with different parameter types and comments); the plain card shell repeated
    in `ReceiveTransferScreen.tsx:160, 211, 232, 270` (like the settings shell
    but without `dir`/`ltr-isolate`). The red error boxes (nine, all
    different) are not duplicates.
11. **Q11. What U commits.** Recommended: only the SHA-256 manifest
    (`docs/refactor/phase2/markup.sha256`), a few kilobytes; the dumps stay in
    `.verify/`. Alternatives: commit the normalized DOM files too (easier
    diffs after a container reset, a few hundred KB of synthetic markup to
    maintain); or commit nothing and compare per step against a `.verify/`
    copy, as Phase 1 did with bundles.
12. **Q12. U in the deploy workflow?** Recommended: no — it needs Chromium,
    two builds and a few minutes, and it pins the markup, which any later UI
    change would then have to re-pin. Keep it as `npm run verify:markup` for
    Phases 2 and 5.
13. **Q13. Review cadence.** Recommended: the reviewer after every commit, as
    in Phase 1. Alternative: once per group (2a; 2b–2f; 2g; 2h–2i; 2j–2k).
14. **Q14. The PR.** Recommended: one PR for the phase, opened against
    `claude/restructure-phase-1` while #9 is open (so it shows only Phase 2),
    retargeted to `main` once #9 merges; merged by the owner after V and M.
15. **Q15. The `ui/kit` rule allows `app`** (for `LinkButton`'s router
    import). Recommended: yes, as written. Alternative: move `hrefFor`/`Route`
    out of `app/router.ts`, which is not structure-only for this phase.

## Owner's answers (2026-11-15)

**All fifteen as recommended** ("all as recommended, go ahead"):

| Q | Answer |
| --- | --- |
| Q1 | `src/ui/kit/`, `common.tsx` → `index.tsx`, new pieces in their own files, imported as `'../kit'` |
| Q2 | no split of `index.tsx` now |
| Q3 | bare `SettingsSection` only (2j′ not done) |
| Q4 | `SettingsSection` in `ui/kit` |
| Q5 | the two differing progress bars stay as they are; recorded in FOUND_ISSUES |
| Q6 | the differing byte formatters are not unified; recorded, decided later |
| Q7 | `lib/gzip` in its minimal form |
| Q8 | `platform/http/proxyUrl.ts` |
| Q9 | ḥadīth-only UI not in Phase 2 (Phase 5) |
| Q10 | include 2f `subtle()` and 2i `percentOf`; defer `parseHtml`, `pageIndexOf`, `toLine`, the Receive card shell |
| Q11 | U commits only the SHA-256 manifest |
| Q12 | U not in the deploy workflow |
| Q13 | the reviewer after every commit |
| Q14 | one PR, against `claude/restructure-phase-1` while #9 is open; the owner merges after V and M |
| Q15 | the `ui/kit` rule allows `app` |
