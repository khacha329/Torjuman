# Shamela Reader & Translation Study Tool

A personal Arabic study application for reading Islamic texts from the Shamela
digital library with on-demand, LLM-powered English translation of selected
passages.

Everything runs client-side. There is no backend.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173, also served on the LAN for the tablet
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run verify` | Runs the parsers and the ingest pipeline over real Shamela HTML in `fixtures/`. 70 checks. |
| `npm run glossary` | Merges `glossary-sources/*.json` into `glossary-import.json`, reporting every overridden term. |
| `npm run catalog` | Rebuilds `public/catalog.json` by reading each recommended book's page off Shamela. Needs the dev server running. |
| `npm run build` | Type-checks and produces a production bundle. |
| `npm run typecheck` | Types only. |

`npm run dev` binds to all interfaces, so the tablet can open
`http://<your-machine-ip>:5173`. Because that is plain HTTP rather than HTTPS,
`crypto.subtle` and `crypto.randomUUID` are unavailable there — the SHA-256 and
ID generation are written in plain JS for exactly this reason
(`src/lib/hash.ts`, `src/lib/id.ts`).

## How it fits together

```
src/
  platform/          the two swap points for Capacitor
    http/            HttpClient interface + WebHttpClient (uses the dev proxy)
    storage/         StorageAdapter interface + IdbStorageAdapter
  shamela/           parsers: parseBook, parsePage, structure, quranRefs, urls
  ingest/            importer (metadata, TOC, block building) + crawler
  translate/         profiles, prompt building, Anthropic client, JSON parsing
  retrieval/         quran.com, sunnah.com, and the enrichment step
  ui/                library, import wizard, reader, settings
scripts/             verify-parsers.ts
fixtures/            unmodified HTML fetched from shamela.ws
```

`IdbStorageAdapter.ts` is the only file that mentions IndexedDB, and
`platform/http/` is the only place that calls `fetch` against an external host.

## Notes on the Shamela markup

Every selector was written against real fetched HTML, kept in `fixtures/`.
What the site actually gives you:

- **Content lives in** `div.nass[data-page-id][data-page-num]`.
  `data-page-id` is the sequential index in the URL; `data-page-num` is the
  printed page (ص), and is `"0"` on front matter with no printed number.
- **Blocks are `<p>` children**, each opening with an empty `span.anchor` whose
  id (`p1`, `p2`, …) is Shamela's own deep-link target, and closing with an
  `a.btn_tag` copy button. Both are stripped; the anchor id is kept.
- **Inline runs use generated classes `c2`/`c4`/`c5`** which are *not* semantic
  and *not* stable across volumes — a verse citation is `c2` with parentheses in
  volume 1 and `c4` with brackets in volume 3. The parser therefore classifies
  runs by content, not by class number.
- **The page count is nowhere on the landing page.** It comes from the pager at
  the foot of any content page, which links to the last page. Book 9260 has
  **3,784 pages**, not the ~2,500 the spec estimated.
- **Volume boundaries** come from the "ج" dropdown: 1, 587, 1201, 1871, 2559,
  3080 for book 9260.
- **The TOC is complete inline** for book 9260 (357 entries). Other books may
  leave branches collapsed behind `ajax/titlechilds/{book}/{title}`, which the
  importer expands before showing the confirmation screen.
- **Stored HTML is the `div.nass` container only** (~1.7 KB) rather than the full
  page (~44 KB). The rest is navigation chrome identical on all 3,784 pages, and
  keeping it would put ~150 MB per book in IndexedDB. Re-parsing without
  re-fetching still works.

### Qurʾān appears inline, not as its own block

The single biggest thing the markup forced. A verse is almost never a standalone
paragraph — it sits mid-sentence inside a commentary paragraph:

> … كما قال الله تعالى: (وَإِذْ تَأَذَّنَ رَبُّكُمْ …) (إبراهيم: ٧) . وفي قصتهم …

One `type` per block cannot express that, so `Block` carries an added
`spans: InlineSpan[]` field recording inline runs by character offset. `text`
stays completely lossless — offsets index into it and nothing is rewritten —
while the reader can style verses inline, and citations resolve to `14:7` for
retrieval.

## Things you should know

### Khattab's "The Clear Qurʾān" is no longer retrievable

The spec asks for Dr. Mustafa Khattab's translation. It has been **withdrawn
from the public quran.com API**. Checked against the live API:
`/resources/translations` lists 126 resources and none is Khattab; requesting
its old ID returns HTTP 200 with an empty result rather than an error. It is
absent from quranenc.com and the other open mirrors too — it is exclusively
licensed.

The translation is therefore a **setting**, with the dropdown populated live from
the API, defaulting to **Saheeh International**. If Khattab returns, or you
obtain Quran Foundation credentials that include it, it appears in the list with
no code change. Settings explains this where you choose.

The spec's hard rule is kept either way: when retrieval fails, the verse shows
Arabic with an explicit "translation unavailable" marker. A model-generated
rendering of a verse is never substituted.

### sunnah.com needs a key

`api.sunnah.com` returns 403 without one; there is no open public tier, and
Riyāḍ aṣ-Ṣāliḥīn is not on any open mirror. Put a key in Settings when you have
one. Without it, hadith segments show the Arabic with an explicit note that no
verified English translation was retrieved — again, never a model-generated one.

The sharḥ's hadith numbering maps directly: `١/٤١٢ ـ` means hadith 1 of the bāb /
412 of the book, and the parser captures **412**, which is what sunnah.com
indexes by.

### Dependencies beyond the spec's list

Three, all flagged rather than assumed:

- **`@anthropic-ai/sdk`** (runtime) — the spec requires Anthropic API calls but
  did not list a client. Using the official SDK rather than hand-rolled `fetch`.
- **`jsdom`** (dev only) — gives `npm run verify` a DOM so the parsers can be
  run against real HTML in Node. Nothing in `src/` imports it.
- **`sql.js`** (runtime, named by Amendment 12) — reads a QUL SQLite resource
  once at import. It is loaded by dynamic import, so the 40 KB loader and the
  640 KB WASM runtime are fetched the first time someone imports a SQLite file
  and never on a cold start. Both are precached, so that import still works
  offline. Nothing keeps a runtime alive afterwards — see below.

No routing library: `src/app/router.ts` is a ~40-line hash router, which is
enough for four screens and keeps the app working from a file path.

### API keys are kept out of backups

Both keys live in `localStorage` (per the spec's web-phase allowance) and are
deliberately excluded from `AppSettings`, so the backup JSON never carries a
billable key. Under Capacitor they move to encrypted preferences; only
`src/app/secrets.ts` changes.

## The glossary sources

`glossary-sources/retained.json` and `glossary-sources/project.json` hold the two
supplied term lists. They were transcribed by hand rather than decoded: the
markdown arrived as UTF-8 read as Latin-1, and Arabic letters encode as `D8`/`D9`
followed by a byte that is very often an invisible C1 control — those bytes do
not survive being copied, so a mechanical decode loses roughly half of every
Arabic word.

`npm run glossary` merges them (project overrides retained, matched on the
normalized Arabic so `ة/ه` and `ى/ي` variants do not split a term), prints every
override, and writes `glossary-import.json`. Load that with **Settings →
Glossary → Import JSON**, which matches existing terms the same way and updates
rather than duplicating them.

## Tappable verses and ḥadīth

The full Uthmānī muṣḥaf ships with the app (`public/quran/uthmani.json`, 1.33 MB,
built by `node scripts/build-quran-asset.mjs`). At import, every quoted verse is
matched against it locally — **no model call and no network** — and stored as an
`Entity` in its own store. Tapping a marked span opens a sheet with the muṣḥaf
Arabic, the English from the configured source, and a "translate the surrounding
passage" action.

Entities are derived data. **Settings → Verse and ḥadīth detection** re-runs
detection over a book; it rebuilds the markers only and leaves cards, glossary
and caches untouched.

### Detection is driven by content, not delimiters

Delimiter scanning fails on this text in four separate ways, each producing a
silently unmarked verse: the delimiter sets are mixed and sometimes mismatched
(book 9260 uses ASCII parentheses and not one ornate bracket); citations use the
same delimiters as quotations; short phrases are woven in with no delimiters at
all; and a quotation crossing a page break leaves its brackets unbalanced.

So the muṣḥaf is the evidence. Each block's words are matched against an anchor
index — one entry per Qurʾānic word, keyed on folded characters rather than word
shingles, because the muṣḥaf joins `يَٰٓأَيُّهَا` where the sharḥ writes two
words and word shingles would never align. Matches extend greedily in both
directions, need four words minimum, and the longest wins on overlap. Delimiters
are then used only to tidy the edges of a span already proved. A citation needs
no special case: it is a reference, not verse text, so it is simply not in the
corpus.

Switching from delimiter scanning to content matching took detection over the
first 50 pages from **29 candidates / 26 resolved** to **53 found / 53 resolved**
(49 exact), with 5 spanning a page break. Detection costs ~76 ms per 50 pages —
about 0.9 s for volume 1, ~6 s for all 3,784 pages.

### Block-search `normalize` alone does not make the two orthographies meet
Three systematic differences survive it, each enough on its own to make a verse
fail to resolve: the muṣḥaf writes long ā as a dagger alef (`ٱلسَّمَٰوَٰتِ`)
where the sharḥ writes it plene; it spells صلاة/زكاة/حياة with a wāw
(`ٱلصَّلَوٰةِ`); and it joins `يَٰٓأَيُّهَا` where the sharḥ writes two words.
`quranFold` in `src/quran/quranIndex.ts` layers on top of `normalize` to remove
all three. `normalize` itself is untouched and remains the single fold behind
block search — except for one genuine bug it did have: the Ḥafṣ "open" tanwīn
marks live at U+08F0–U+08F2, outside every range the spec listed, so they were
never stripped.

Cross-checked against the edition's own printed citations, parsed independently:
**23 agree, 2 differ**, and both differences are the edition printing fewer
citations than the block quotes — not a mis-resolution.

**Settings → Verse and ḥadīth detection** also lists any bracketed span that
looks like a quotation but matched no āyah. That list is the one worth reading:
it catches detection failures and text corrupted by the Shamela parse at import
time rather than mid-lesson. On the first 50 pages it holds exactly one entry, a
two-word fragment below the four-word threshold.

## Offline operation

A new user with no API key can install the app, download a book once, and
thereafter read, navigate, look up and translate with no connectivity. Network
is needed only to download books, download the on-device model, and use a cloud
provider.

The service worker precaches the whole shell — JS, CSS, the Arabic webfonts, and
the bundled muṣḥaf with its translation, 3.8 MB in 32 entries. Nothing is fetched
from a CDN at runtime; a remote font in particular does not fail loudly, it
falls back to a face that clips harakāt. `navigator.storage.persist()` runs at
startup so Android does not evict an hour of crawling under storage pressure.

**This only works from an installed build over HTTPS.** Service workers do not
register over plain HTTP, so the LAN dev-server address is a development
convenience, not the way to run this on the tablet long-term.

### Khattab, after all

The offline path bundles **Dr. Mustafa Khattab's The Clear Qurʾān** — the
translation originally asked for. It was withdrawn from the quran.com API, which
is why the *online* retrieval path still defaults to Saheeh International, but it
is published as a static export, so the offline path carries the real thing. A
verse renders with its proper English and no network at all.

### The invariant

> A ḥadīth with no offline source must never reach the translation model. Not as
> a fallback, not as a last resort.

This is structural, not remembered. `offline/segmentSelection.ts` cuts the
selection at every entity boundary *before* anything is translated, and returns
two things: finished segments, and a list of plain prose spans. Verses are
resolved from the bundled muṣḥaf; ḥadīth take a verified local translation if
one is cached, and Arabic plus an honest note if not. **Scripture is never added
to the prose list**, and the prose list is the only thing the model receives — so
the guard is the shape of the data, not a conditional someone could forget.

The offline path is also deliberately *not* a `TranslationProvider`. It is not
in the registry and `TranslationProvider.id` is narrowed to the cloud providers,
so no code can treat the three interchangeably and hand the on-device model a
whole selection with scripture in it. The type checker enforced that during this
change rather than after it.

Everything else degrades gracefully — a rough rendering of Ibn ʿUthaymīn's
commentary is just rough, and the badge says so.

### Which ONNX weights actually run

A session failed with `qdq_actions.cc:137 TransposeDQWeightsForMatMulNBits` —
`MatMulNBits` is the 4-bit operator, so a q4 artifact was being executed while
the code requested q8. Nothing logged what was requested or what was fetched, so
there was nothing to check except by guessing. Measured, rather than guessed:

- **Neither repo publishes a `_q8` file.** The suffixes on offer are `(none)`,
  `_fp16`, `_int8`, `_uint8`, `_quantized`, `_q4`, `_q4f16`, `_bnb4`.
  Transformers.js maps the *dtype name* `q8` onto the **`_quantized` file**, so
  `q8` is correct — `int8` and `uint8` name different artifacts.
- `q8` fetches `encoder_model_quantized.onnx` (49.4 MB) and
  `decoder_model_merged_quantized.onnx` (56.4 MB). The advertised download size
  was 75 MB and is now 112 MB, which is what it actually is.
- q4 is *larger* than q8 here — 135 MB + 140 MB — because these Marian exports
  are dominated by a shared embedding that block quantization does not shrink.
  It was never the cheaper option.
- fp32, q8 and q4 all load and translate under **onnxruntime-node**. The q4
  failure is specific to the **WASM backend**, inside graph optimization.

So both the dtype and the device are pinned, and the dtype is given per session
file (`encoder_model`, `decoder_model_merged`) rather than as a bare string —
same result, but the resolution is stated rather than inferred, which is exactly
what was missing. `auto` is avoided deliberately: it resolves per device, so the
desktop and the tablet would silently run different weights.

Settings → Offline translation → **model diagnostics** now shows the active
dtype and the file suffix it maps to, every ONNX URL fetched during a load, and
every ONNX artifact sitting in Cache Storage — flagging any that does not match
the active dtype. A cached artifact never reaches `fetch`, so network logging
alone cannot see a stale file from an earlier build; there is a **Clear cached
weights** action for exactly that, and a dtype picker for trying one without
editing code.

### What the on-device model cannot do

It is a dedicated NMT model (OPUS-MT, ~75 MB; NLLB-200 distilled, ~480 MB) run
through Transformers.js — no native plugin, no Capacitor work. It beats a 1–3B
general LLM at pure translation at a fraction of the size and avoids the
instruction-following failures that make small LLMs unsafe here. No on-device
general LLM is attempted.

It cannot follow the translation profile, apply the glossary by instruction,
emit anything but `prose` segments, recognise poetry, or preserve an isnād
reliably. The glossary is applied by **placeholder substitution** instead —
terms swapped for opaque tokens before translation and restored after, with a
check that the tokens survived and a fallback to untouched text if they did not.

Offline cards carry their own slate badge, never the free tier's green, so one
is never mistaken for a Sonnet card when preparing a lesson. "Retranslate ▾"
upgrades one to a cloud provider when connectivity returns.

## Moving between devices

Block IDs are **derived, not allocated**: `bookId:p{page}:{index}`. Same book,
same page, same position, same ID — on any device, in any order. The earlier
monotonic counter was not reproducible, so a second import of the same book
minted different IDs and stranded every card and mark pointing at the old ones.
That is why the whole ID-reuse-and-matching machinery is gone: with a derived
ID, a re-parse produces the same IDs by construction.

Backups are split accordingly, because one monolithic file is impractical —
9260's stored HTML alone runs to tens of megabytes:

- **Work backup** (`Settings → Work backup`) — cards, explanations, marks,
  notes, glossary, profiles, positions, the gloss cache. Small and
  irreplaceable. It records which books it references by Shamela ID and reports
  any that are missing on restore.
- **Library transfer** (`Settings → Library transfer`) — one file per book,
  `.hashiya.gz`.

The normal path to a new device is: import the books there, then restore the
work backup on top. It binds correctly because the IDs match.

**API keys are never in either file.**

### The transfer format

Re-crawling on the target device is not an option in a production build: the
proxy that works around Shamela's missing CORS headers is a dev-server feature.

The file carries the book metadata, the TOC, the ج/ص mapping and each block's
text. It leaves out four things, three of which are derived and free to rebuild:
`Page.rawHtml` (by far the largest), `Block.normalized`, `Block.contentHash`,
and the entity records. Measured on one page: **74% smaller before gzip**.

It is **NDJSON, not one JSON document** — a whole-file parse would force tens of
thousands of blocks into memory at once, which on a phone is an out-of-memory
risk. Records stream in and insert in batches of 500. `JSON.stringify` emits raw
UTF-8, which matters: Arabic escaped as `\uXXXX` costs six bytes per character
instead of two.

The header carries a format version and the block count, so a truncated
transfer is rejected rather than read as a short book. An import that fails
partway rolls back to no book — a half-imported book looks valid and reads as
though pages were missing.

## Structured output

The model is no longer *asked* for JSON — the shape is enforced. Anthropic gets
a forced tool call (`emit_translation`), Gemini a `responseSchema`; both come
back as parsed data with no fences, preamble, or narration possible. The
JSON-only instruction is stripped from the system prompt in flight on those
paths, since once the shape is enforced it merely invites the model to write the
JSON out *twice*. The profile text on disk is never edited.

**Dig deeper runs as two passes**, because a forced `tool_choice` prevents the
model from calling the search tool at all. Pass 1 searches and reasons in prose
with `tool_choice: auto`; pass 2 turns those notes into segments with the tool
forced and no search. Pass 2 is short in and short out.

Text is read from **every** content block, never `content[0]` — with search
enabled the array holds `server_tool_use` and `web_search_tool_result` blocks
interleaved with several text blocks, which is the most likely reason dig-deeper
failed far more often than plain translation.

Truncation is distinguished from a parse failure: `stop_reason` /
`finishReason` is checked on every response, and a token-limit stop retries once
automatically with the budget doubled (ceiling 32k) before reporting anything.
`max_tokens` also moved to a 4× multiplier with a 2,048 floor — every segment
carries the Arabic *and* the English plus the JSON envelope, so output routinely
exceeds input.

**A paid response is never discarded.** On any failure the card shows what did
come back, in readable form, with the specific reason — truncated, no structured
output, provider error — a Retry button, and the raw text persisted so it
survives navigating away.

## Offline dictionary

Single-word lookup against al-Miṣbāḥ al-Munīr (Shamela **12145**), imported
through the existing pipeline. **No model call and no network**: this is a
lexical lookup, not a translation task.

Dictionaries carry `role: 'dictionary'`, stay out of the reading library, and
live in **Settings → Reference works**.

The root index comes straight from the table of contents. The spec expected to
read roots out of page titles; the book is kinder than that — its TOC leaves
*are* the roots, printed as `(ء ب ب)`, while section headings use square
brackets and are skipped by the same pattern.

Root candidates are generated deterministically in `src/dictionary/roots.ts`:
proclitics and enclitics stripped at every depth (not just the deepest),
trilateral reductions over the augment set, and — the case naive stripping
always fails — weak radicals, where a hollow verb like قال writes its middle
radical as alef. Every candidate is looked up and every hit returned, ranked,
rather than one being picked: the user reads Arabic and can judge which entry
applies better than a heuristic. If the index misses entirely, a normalized
full-text search of the dictionary's own blocks catches inflected forms cited
inside entries. If both miss, that is said plainly — nothing is invented.

One ordering subtlety worth knowing: affixes are stripped on the ordinary
orthography and hamza is folded to ء only at the end. Folding first turns
الصلاة into ءلصلءه, and the definite article — now ءل — stops matching the
proclitic list entirely.

No new gesture: the floating toolbar gains **Dictionary** when the selection is
a single word, and double-tap opens it directly by hooking the browser's own
native word selection.

### Meaning — the English half

Dictionary answers "what does this root mean in Arabic". **Meaning** answers
"what does this word mean here, in English", which is the more common need
mid-session. Neither replaces the other: Dictionary is the offline, scholarly
path; Meaning is the fast, English one, and both render in the same sheet with
Meaning above.

It is a separate, minimal request — deliberately **not** routed through the
translation profile, whose glossary alone would dominate the token cost of a
lookup this small. Structured via forced tool use, a few hundred output tokens,
and cached by normalized word form, so a repeated word is free and works offline
afterwards. Lookups never write to the glossary.

## Explain

"Dig deeper" used to re-translate a passage with web search, overwriting work
the user already had. It is now **Explain**, on a text selection, and it answers
a different question: not what the words say but what the phrase means as a
concept.

It produces its own `ExplanationCard` attached beneath the translation it hangs
from, and never modifies it. **The user's own library is searched first** —
better material, offline, and citable to a ج/ص he can turn to — with web results
below, marked unverified, every claim carrying its link and excerpts kept to a
sentence or two. Two passes, per the structured-output rule: research with
search on, then structure with the tool forced.

## Selection actions

Selection actions live in a **bar pinned to the bottom edge**, not a toolbar
floating over the selection.

On Android the system draws its own action bar (Copy / Share / Select all) next
to the selected text, above the WebView. A floating toolbar competes for exactly
that space and loses — the app's actions end up covered. A bottom bar sits clear
of it, both are visible at once, and the native handles stay usable while the
app's actions remain reachable.

Two consequences follow, and both simplify things:

- **The selection is never cleared**, so its native highlight is what the user
  sees. No pending-selection layer is needed.
- **Anchors are resolved when an action is tapped**, never when the selection is
  made. Nothing is stored in between — no `Range`, no rect — so there is no
  dangling reference across a virtualized scroll, and a range still being
  adjusted with the handles is never read half-finished.

The signal is `selectionchange` on `document`, debounced at 150 ms. It is not
`pointerup` on the reader: on Android the selection handles are native UI drawn
above the WebView, so dragging them delivers no pointer event to the page at
all — a `pointerup` handler fires only on some later, unrelated tap.

Selectability is opt-in. Every non-text surface carries `user-select: none`, so
aiming at a control never starts a selection and never summons the system bar
over the app.

Double-tap on a word skips the bar entirely and opens the dictionary sheet
directly, since the intent there is unambiguous.

## Reading marks

Preparation marks mirroring the practice with a printed copy: **skip** is a
background highlight (pass over this), **read** is an underline (cover this).
They are visual only — nothing hides, collapses, reorders or filters, and there
is deliberately no "session view".

- **Margin tap** (right margin, the start side in RTL) toggles skip on a block;
  tapping an existing band clears it. A long press opens Skip / Read / Clear /
  Add note. The 44px target distinguishes tap from press by hand, cancelling on
  more than 8px of movement, so scrolling through the margin never marks
  anything.
- **The selection toolbar** gains Skip / Read / Clear for span-scope marks.
- Marks **with notes** appear in the card panel as note cards, sharing collapse,
  inline markers and scoping with translation cards. Bare marks do not — a
  prepared volume holds thousands and they would drown the panel.

### The rendering problem

A block can carry six overlapping layers at once: block-type styling, parser
inline runs, entity tinting, a skip mark, a read mark, and the live selection.
Overlapping ranges **cannot** be nested — the markup breaks and so does text
selection across the seams. `annotations.ts` instead collects every boundary any
layer introduces, sorts them, and emits one element per gap carrying the union
of the styles over it. The DOM stays flat, selection works across the whole
block, and a seventh layer is one more field.

Each layer gets its own channel: skip is a warm amber background plus a margin
band, read is an accent underline offset clear of Arabic descenders, entities
are a cool green tint, translated ranges are a border in the *left* margin, and
block type is text style. Skip's real signal is the band, which lets its
background stay faint enough that a skipped passage is still comfortable to read
— which matters, since the user may still be asked about one.

Two subtleties worth knowing:

- **Span mark offsets snap outward to whole words.** Arabic is cursive; a
  boundary inside a word would put its letters in separate elements and risk
  breaking the join.
- **A subdivided entity is never isolated piecewise.** `unicode-bidi: isolate`
  is applied only when a segment covers its entity whole — isolating each
  fragment separately would split one quotation across several isolates and
  change how it resolves, the opposite of the intent.

## The card panel

Three mechanisms keep the panel usable once it holds hundreds of cards, all
implemented in `src/ui/reader/cardLayout.ts` against the shared `CardBase`
anchor fields rather than against `TranslationCard` — so v2's highlights and
notes inherit them:

- **Collapse**, persisted per card. Collapsed cards stay visible as a compact
  row (opening Arabic, ج/ص, provider) rather than disappearing. It is
  presentation only and never touches the cache, the anchor, or the card.
- **Margin markers** at the start of each translated range, in the right
  margin — the start side in RTL. Cards starting in the same block share one
  marker with a count. With the panel open a tap scrolls and expands the card;
  with it closed a tap opens an anchored panel instead, so the layout does not
  reflow mid-sentence.

### Anchored panels do not close when you scroll them

Amendment 3 specified "dismisses on scroll", which is right for a one-line
glance and wrong once the panel holds a paragraph. The first implementation was
also plainly broken: `scroll` does not bubble, so the handler was attached to the
window in capture phase and fired for scrolls *inside* the panel too — reading a
translation closed it. Underneath that sat scroll chaining, where a panel
scrolled to its end hands the rest of the gesture to the reader behind it, which
scrolls and dismisses the panel; constant on a touchscreen.

`AnchoredPanel` fixes both — scrolls originating inside the panel are ignored,
and `overscroll-behavior: contain` stops the chaining — and then changes the
behaviour: the popover follows its anchor as the reader scrolls and closes only
when the anchored text actually leaves the viewport. Scrolling the Arabic to see
what came before a passage while its translation stays open is precisely what
this is for. Long content (a full passage translation, or several cards) opens as
a bottom sheet instead, which can go near-full-height without covering the anchor
and carries an obvious drag affordance.
- **Scoping**, in three tabs — see below.

### Three scopes, defaulting to Visible

Amendment 3 gave the panel two modes and defaulted to the current section. A bāb
still holds too many cards, and — the part that actually hurt — scrolling
*within* a section does not change what the panel shows, so the panel and the
reader drift apart until the panel is answering about a page you left ten
minutes ago.

| Tab | Shows |
|---|---|
| **Visible** (default) | Cards anchored to what is on screen, plus half a screen either side |
| **Section** | Every card in the chapter or bāb, by TOC node |
| **All** | Every card in the book, in position order — the only tab with the filter box |

Three things make Visible usable rather than twitchy:

- **The buffer is half a screen, computed from the visible run** rather than a
  fixed block count — which means something different at 26px than at 44px. A
  card does not vanish the instant its anchor crosses the edge.
- **The scroll signal is debounced** (220ms) before the panel sees it. The live
  range still drives the ج/ص margin and the saved reading position; only the
  panel gets the settled one. This is the fix that stops a flick strobing the
  list.
- **Cards animate in and out.** A card that leaves scope stays mounted at the
  index it held until its exit finishes (`useAnimatedList`), so the list fades
  rather than jumping. Both animations are off under `prefers-reduced-motion`.

Collapse state needs nothing special to survive a scope change: it is a
persisted field on the card, not panel state.

**A marker always opens its card**, including one the active scope filters out —
`scopeContaining` finds the narrowest scope that holds it and the panel switches.
A marker that silently does nothing is a marker the user reasonably concludes is
broken.

### The panel collapses from the browser too

`Ctrl`/`⌘` + `\`, or the header button, or the slim edge tab that the panel
leaves behind when collapsed. The edge tab is the point: a control that
disappears along with the thing it controls is how a collapsed panel becomes a
permanently collapsed one. Both the collapsed state and the divider position are
persisted per device, so reopening restores the width it had.

## Selection actions are a left rail

Amendment 10 moved these to a bar pinned to the bottom edge, to get clear of the
system selection toolbar Android draws above the WebView. That held until Chrome
began rendering its own "search the selected text" suggestion chip near the
bottom of the viewport — also above page content, also on top of the bar. Two
pieces of browser chrome now compete for the bottom edge and the app loses both
times.

`SelectionRail` is a vertical, icons-only rail on the **left**, and left is
right for three reasons that have nothing to do with the chip: the reading
surface is RTL so the left edge is the *trailing* margin and least likely to
hold the text just selected; the right margin already carries mark bands and the
translated-range indicator; and a vertical rail simply is not in the space the
system chip occupies.

- **Its width is reserved in the reader layout**, not floated over the text. The
  Arabic column measures the same with a selection as without one — text that
  reflows the moment you select it is worse than a slightly narrower column, and
  this way it is neither.
- Centred on the selection, clamped so it stays wholly on screen — the case that
  matters is a selection in the first or last line, where centring alone puts
  half the actions out of reach.
- 44px targets, `user-select: none` (without it a tap on the rail alters the very
  selection every action is about to read), and `env(safe-area-inset-left)`.
- Labels come from `title` on a pointer and a long-press flyout on a touchscreen,
  where neither hover nor tooltips exist.
- Meaning and Dictionary appear only for a single-word selection, as before.

Positioning needs the selection's vertical centre, so `peekSelection` now returns
one. That is a *position* read fresh on each debounced `selectionchange`, not a
stored `Range` — anchors are still resolved at action time by `readSelection`, so
Amendment 10's rule is intact. Measuring is best-effort: a virtualized reader can
present a range whose nodes were unmounted, and the rail falls back to centring
on the viewport rather than throwing.

This is built as the primary interaction surface, not as a workaround. A
Capacitor build can override `startActionMode` and suppress the system chip
entirely — at which point the rail stays, because it is better.

Both gutters are absolutely positioned inside the container's padding, and the
container's max width is widened to offset them exactly, so the Arabic column
keeps the same measure it had before markers existed.

## QUL resources and the tabbed verse sheet

Tapping a verse opens a sheet with tabs. Only tabs with data behind them are
shown, the default is Translation, and **every one of them resolves offline with
no model call** — the reference was already proved against the bundled muṣḥaf at
import time, and every QUL resource is keyed by exactly that.

| Tab | Needs | Source |
|---|---|---|
| Translation | nothing — bundled | muṣḥaf + Khattab |
| Tafsīr | a tafsīr import | what the mufassir wrote |
| Similar | an ayah-matching import | QUL's matches, rendered from the muṣḥaf |
| Topics | a topics import | QUL's editorial grouping |
| Surah | a surah-info import | QUL's background text |

Resources are imported from files you download from QUL in a browser
(Settings → QUL resources). **No download URL is constructed.** QUL does not
publish a stable one, and a guessed URL breaks silently the day they reorganise
— which looks like a bug in this app rather than a change at theirs.

### Detection is by content, not by filename

The format is decided from the first bytes (`SQLite format 3\0`), and the kind
from the shape inside: which keys, which columns, which fields. What was
detected is shown — with counts and a real excerpt — before anything is written,
because these files are downloaded by hand from a page offering a dozen of them
and "I imported the wrong one" is the likely mistake. An unrecognised shape is
refused with a message naming what was found; a resource silently short by four
thousand āyāt looks exactly like a complete one.

### Tafsīr grouping is preserved, not flattened

al-Muyassar treats several āyāt as one unit 625 times, and QUL stores that as a
passage on the group's first āyah with the other members pointing at it. Both
forms are kept. Tapping 4:68 follows the pointer to the passage written on 4:66
**and says it covers 4:66–68** — returning that text as if it were about the one
āyah tapped would be a misquotation, not a shortcut.

### No SQL engine stays loaded

SQLite is a transport format here and nothing more. The file is read once at
import, its rows are normalized into the app's own IndexedDB stores, and the
runtime is dropped on the way out of `readSqliteTables`. That is checkable
rather than merely intended: `liveSqlJsRuntimes()` is incremented on creation
and decremented in the `finally` that closes the database. Every lookup
afterwards goes through the single `StorageAdapter` path, like every other
lookup in the app.

### Compile generates, and is fenced accordingly

Off by default. When enabled it adds a **Compiled** tab — an addition, never a
replacement, with the source tabs left individually readable, which is what
makes a compiled paragraph checkable rather than authoritative. The prompt
physically contains only the retrieved material already on screen, the request
carries no tools at all (web search included), and the output is badged as
generated on every render. Cached per āyah and per resource set, so installing
another tafsīr regenerates it instead of leaving a paragraph describing material
it never saw.

## dorar.net: grading, and no English

`fixtures/dorar-search.json` is a real response — a search for
«إنما الأعمال بالنيات», fifteen records — and it contains **zero Latin
characters**. That answers the amendment's question directly: the endpoint
returns Arabic only. The English toggle belongs to the website, not to the API.

So dorar is wired up for what it actually provides, which is something the app
had no source for at all: the narrator, the grading scholar, the source book,
the page or number, and the grade. `english` is never populated from it by any
path, and a ḥadīth with no verified English is still shown in Arabic with an
honest note. **The invariant is untouched: dorar changes what metadata is
available, not who is permitted to generate scripture.**

Three details worth knowing:

- It answers **403 to a plain request** and accepts one that identifies as a
  browser, so the `/dorar` dev proxy sets a User-Agent and Referer exactly as
  the Shamela proxy does. It also answers JSONP rather than CORS headers, which
  the same proxy makes moot.
- Fields are read by the **Arabic label** dorar prints before each one, not by
  class name — the same reasoning as the Shamela parser, where class numbers
  turned out to be unstable. `خلاصة حكم المحدث` contains `المحدث`, so labels are
  matched longest-first or every grade would be read as a scholar's name.
- dorar is a **text search**, so a hit is a narration of the same ḥadīth rather
  than the same wording — the top match here comes back with bracketed editorial
  notes. The book's own matn is what stays on screen; dorar's copy is used only
  if the book gave us nothing.

### Which record — the narrator decides

Text overlap is not enough, and the fixture proves it on this project's own
primary text. A search for «إنما الأعمال بالنيات» returns fifteen records:

| Rank | Narrator | Grader | Grading |
|---|---|---|---|
| 1 | Abū Saʿīd al-Khudrī | Ibn ʿAbd al-Barr | an error in the isnād |
| 2 | ʿUmar ibn al-Khaṭṭāb | an-Nawawī | established, agreed upon as ṣaḥīḥ |

Riyāḍ aṣ-Ṣāliḥīn's ḥadīth is ʿUmar's, and it opens both Ṣaḥīḥs. **Taking the
top hit would attach a defective-narration grading to the strongest ḥadīth in
the collection** — and no scoring rule over the matn can prevent that, because
the difference is not in the text.

So there are three rules, and they are structural:

1. **Never auto-select.** `searchDorar` returns a list; there is no "best hit".
2. **Filter by narrator.** The book states it — «وعن أمير المؤمنين أبي حفص عمر
   بن الخطاب رضي الله عنه قال» — so `narratorIn` reads it out of the passage
   *around* the matn (the isnād precedes it, so the entity's own range does not
   carry it) and `narratorMatches` compares it against dorar's `الراوي`. Nine
   of the fifteen records survive that filter; Abū Saʿīd's four do not.
3. **No match means no grading.** An unmatched grading is worse than an absent
   one — it is a false statement about a ḥadīth the user is about to teach from.

Comparing the two sides needs its own fold, because none of these differences
survive the search `normalize` alone: brackets on one side (`[عمر بن الخطاب]`),
an honorific on the other, the genitive after «عن» against dorar's nominative
(`أبي سعيد` / `أبو سعيد`), `ابن` against `بن`, and a stray U+200F that
JavaScript's `\s` does not match. `normalize` itself is untouched — every block
index in the database was built with it.

Several scholars grading one narration differently is normal, and all of them
are shown, each with its grader and source. Merging or picking a representative
would resolve a scholarly disagreement on the user's behalf; surfacing it lets
him flag it honestly when teaching.

The sheet also carries a **diagnostics disclosure**: the request, the raw reply,
the narrator matched against, every narrator dorar returned, and how many passed
the filter. This is scraped markup behind a JSON envelope and it *will* break
when dorar changes their page — at which point "what came back and what was it
matched against" is the only useful question. Every parse failure degrades to
"no result" rather than throwing.

## Takhrīj comes from a table

«متفق عليه», «رواه البخاري», «رواه الأربعة» — about thirty phrases, each meaning
exactly one thing. `src/lib/takhrij.ts` renders them, and both translation paths
call the same function: the offline path finishes them in `segmentSelection`
before the on-device model is offered anything, and the cloud path overwrites
whatever the model produced in `enrich.ts`.

A table beats a model on every axis that matters here. It is identical offline
and online, it is free, it needs no network, and «متفق عليه» renders the same
way in a lesson prepared in March as in one prepared in September — which
matters, because these lines are read out loud. A line that is only half a
takhrīj is left to the translator; a partial rendering would be worse than none.

## The book catalog

First run offers a **Suggested library**: a short list of recommended works with
their Shamela IDs already looked up, grouped by purpose — *Texts to study*,
*Dictionaries*, *Reference for Explain*. Recommended entries are pre-selected,
everything is optional, it is skippable, and it is reachable afterwards from
Settings → Add from catalog.

**The app ships the list, never the books.** Most of the works involved are
modern and under copyright — Ibn ʿUthaymīn died in 2001 — so putting their text
inside a distributed application is redistribution, while shipping a list of
book IDs is a bibliography. The whole catalog is 4.2 KB for seven works, about
600 bytes each.

That is checked rather than asserted: `npm run verify` scans the built output
for commentary phrasing. Two hits survive and both are meant to be there — the
takhrīj lookup table in the JS bundle, and author names in catalog entries.

### The IDs are read off Shamela, not typed in

`npm run catalog` rebuilds `public/catalog.json` by fetching each book page and
running it through the same parsers the importer uses, so a wrong ID fails when
the catalog is built instead of on someone's first run. It needs the dev server
running, for the `/shamela` proxy.

This caught real drift in the amendment's own estimates: **21812 is 403 pages,
not ~270**, and **12145 is 3,532, not ~2,400**. The editorial fields — role, the
one-line reason, whether it is recommended — are judgements and live in the
script; everything factual comes from the source.

Confirmed IDs, with authors verified:

| ID | Work | Role | Pages |
|---|---|---|---|
| 9260 | شرح رياض الصالحين — Ibn ʿUthaymīn | reading | 3,784 |
| 21812 | شرح الأربعين النووية — Ibn ʿUthaymīn | reading | 403 |
| 147927 | الأربعون النووية مع زيادات ابن رجب | reading | 67 |
| 11244 | شرح الأربعين النووية — Ibn Daqīq al-ʿĪd | reading | 129 |
| 12145 | المصباح المنير — al-Fayyūmī | dictionary | 3,532 |
| 1673 | فتح الباري — Ibn Ḥajar | reference | 7,996 |
| 1711 | المنهاج شرح صحيح مسلم — an-Nawawī | reference | 4,086 |

The catalog is refreshed from `raw.githubusercontent.com` when online and falls
back to the bundled copy otherwise, so the recommended set can be corrected by
editing one file rather than shipping a build. That URL is derived from
`GITHUB_REPOSITORY` at build time, like the Pages base path — and unlike
shamela.ws, raw.githubusercontent.com sends CORS headers, so it works from the
deployed PWA.

### Importing is sequential, and a failure does not end the batch

One book at a time: these are long crawls against someone else's server, and
running them concurrently would multiply the request rate by the number of books
selected, which is the opposite of the courtesy delay the crawler already keeps.
**Smallest first**, whatever order they were selected in, so there is something
readable while the 3,784-page sharḥ is still going. Each row carries its own
progress, its own error and its own retry; a book that fails is stepped over,
and the ones that succeeded stay imported.

The catalog decides the role, so a dictionary lands in Settings → Reference
works with a root index rather than in the reading grid.

### Where importing cannot run, the catalog still appears

| Build | Catalog import |
|---|---|
| Dev server | works — proxy available |
| Deployed PWA | **does not work** — no proxy, and Shamela sends no CORS headers |
| Capacitor APK | will work — native HTTP is not subject to CORS |

In the PWA the screen still shows, with the button disabled and the reason
given. The IDs and the recommendations are most of the value there; the import
happens on a desktop and the books travel by Library transfer. There is no
button that cannot succeed.

## Deploying to GitHub Pages

The point of a stable HTTPS origin is that IndexedDB survives: a LAN dev-server
address changes, and every change is a new origin with a new, empty database.
It also lets the PWA install properly, since service workers do not register
over plain HTTP.

`.github/workflows/deploy.yml` builds on push to `main` and publishes `dist/`
via `upload-pages-artifact` / `deploy-pages`. Enable it once in the repository:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

### The base path is derived, not hard-coded

A project site is served from `https://<owner>.github.io/<repo>/`, so every
asset URL needs that prefix or the page loads and immediately 404s on its own
JavaScript. `vite.config.ts` reads the repo name from `GITHUB_REPOSITORY` —
which Actions always sets — so renaming the repository does not break the
deploy, and `npm run dev` is unaffected because the variable is absent locally.
`BASE_PATH` overrides it for a custom domain.

The same value is threaded through `VitePWA`'s `base` and `scope`, the
manifest's `id`/`scope`/`start_url`, and Workbox's `navigateFallback`. **A
mismatched scope is the quiet failure here**: the service worker registers
successfully and then controls nothing, so the app appears installed and simply
never works offline, with no error to find.

`public/404.html` is a safety net rather than a router. The app uses a hash
router, so deep links already work on Pages with no rewrite rules; the 404 page
only catches a mistyped path under the app's base, and derives that base from
its own location.

### Importing needs a proxy, and there are two of them

shamela.ws sends no CORS headers, so a browser can only reach it through
something that will add them. `npm run dev` runs a server, so Vite forwards
`/shamela/...` from Node where the same-origin policy does not apply. GitHub
Pages is a file host: there is no process there to forward anything, and those
paths do not exist. Worse, the service worker answers navigations with
`index.html`, so a request to a missing proxy path can come back **200 with a
page of HTML**, and the parser then reports that Shamela returned no content.

Hence two supported deployments, and `WebHttpClient` picks between them:

| `PROXY_URL` set? | Where requests go | Importing |
| --- | --- | --- |
| dev server | `/shamela/...`, same origin | works |
| yes | `https://…workers.dev/shamela/...` | works |
| no | refused up front | desktop + Library transfer |

`proxy/worker.js` is the deployed half — a Cloudflare Worker doing exactly what
Vite's proxy does, with the same path prefixes so one client table serves both.
Deploy it and set the `PROXY_URL` repository variable and importing works on the
tablet; see [proxy/README.md](proxy/README.md). It forwards GET only, to an
allowlist of hosts, and never logs.

The `/sunnah` route is **commented out on purpose**: `api.sunnah.com`
authenticates with a header, and the standing rule is that a key goes nowhere
but its own provider's endpoint. Nothing breaks while it is off — an
untranslated hadith renders as Arabic with an explicit note, never a
machine translation. The Anthropic key never touches the Worker at all;
`api.anthropic.com` sends CORS headers and is called directly.

Without a proxy, `WebHttpClient` refuses a proxy-only host with
`ProxyUnavailableError` naming the reason, and the import screen says so before
you type an ID rather than after the crawl fails. Books then reach the phone
through **Library transfer**, which is what that feature was built for.
Everything else — reading, marks, cards, the dictionary, QUL resources,
on-device translation — is local and unaffected either way.

### What is not in this repository

`fixtures/` (real Shamela pages) and `qul/` (QUL resources) are gitignored:
neither is needed to build or run the app, and this repo is public. That is why
CI runs `npm run build` rather than `npm run verify` — verification reads those
files and stays a local gate. Run it before pushing.

## What is deliberately not built

Per the spec's non-goals: highlights, notes, PDF, OCR, external scholarly lookup
beyond the per-card "dig deeper" toggle, multi-user support, document export, and
full-book batch translation.

`TranslationCard` extends a shared `CardBase` carrying the anchor fields, and the
card panel sorts and renders against those rather than against translation
specifics — so v2's `HighlightCard` and `NoteCard` drop into the same list.
