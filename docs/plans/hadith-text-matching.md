# Identify a ḥadīth by its text, and feed its verified English into the translation

Status: draft — awaiting the owner's approval
Base commit: f7c7249 (main, after PR #16)   Branch: claude/hadith-text-matching

All `file:line` references below are at f7c7249.

## Goal

The owner's words, paraphrased: in a sharḥ such as Ibn ʿUthaymīn's a ḥadīth
appears in three ways: (1) introduced by «قال النبي ﷺ:» / «قال رسول الله ﷺ»,
(2) quoted as «النبي ﷺ…» with no lead-in, (3) as a bare passage of the ḥadīth
woven into the speaker's own sentence. Today none of these is tappable and none
gets verified English: only whole `hadith_matn` blocks become ḥadīth entities,
an unnumbered one gets reference `''` and no English, and inline quotations are
not detected at all.

- **Primary.** When a translation is made with Claude, the model already puts a
  ḥadīth in its own segment (type `hadith`). `enrichSegments` →
  `enrichHadith` (`retrieval/enrich.ts:95`) must find the verified English for
  that segment **by its Arabic text** and use it instead of leaving the segment
  unenriched.
- **Secondary.** The same ḥadīth become tappable marks in the book text.
- **Invariant, unchanged.** A ḥadīth is never machine-translated. No match, or
  an ambiguous one, means Arabic plus an honest note.

Done when:
1. With Bukhārī and Muslim (and Riyāḍ, the Forty) imported, a Claude
   translation of a sharḥ passage whose ḥadīth is introduced, bare, or woven in
   comes back with `source: 'hadith-json'`, the reference, and sunnah.com's
   English for the segments the index identifies, and with the existing
   "No verified English…" note for the rest.
2. A measurement over real data (the on-device report, and a PC report over
   the fixtures) says how many are identified, how many are ambiguous, and
   how many marks a page gets, and the owner has read the false-positive list.
3. (Secondary step only) the same ḥadīth are marks in the reader, and the
   on-device translator uses them too.
4. No change to any translation cache key, any `requests.json` baseline, or
   the `hadiths` store's rows.

## Not doing

- No machine translation of a ḥadīth, ever; no English is cut or stitched from
  a hadith-json English to fit a quoted fragment (there is no word alignment;
  see "A partial quotation").
- No change to the system prompt or the profile (a profile version change
  invalidates every cached card, and a prompt change moves `requests.json`).
  The matching is done after the model answers, from what it echoes.
- No new dependency, no forced `tool_choice`, no network call: the index is
  local and the matching is offline and deterministic, like the muṣḥaf.
- No sunnah.com or dorar lookup *for* an inline match (see Risk R6 for the one
  place dorar can touch it).
- Not splitting a model's **prose** segment to carve a woven-in fragment out of
  it (Q4). The plan measures how often that happens and stops there.
- Not bundling or committing any ḥadīth data. The files stay in the gitignored
  `/hadith-json/` and on the device (`docs/RESOURCES.md:106`).
- Not fixing `enrichHadith` / `lookupHadith` ordering differences (see
  Current state) beyond what the new path needs.

## Current state

- **What a ḥadīth entity is.** `detectEntities` makes one entity per
  `hadith_matn` block, covering the whole block
  (`quran/detectEntities.ts:293-317`). Its reference is
  `${hadithCollection}:${number}` when the book's collection is known (only
  Riyāḍ and the Forty, via `hadithCollectionFor`, `:421`), `${bookId}#${n}`
  when it is not, and `''` with `matchQuality: 'unresolved'` when the matn
  carries no number. `markableByBlock` drops unresolved entities
  (`quran/entityService.ts`, "An affordance that leads nowhere…"), so an
  unnumbered matn is not even tappable. Nothing scans the sharḥ's own prose.
- **How the Qurʾān is done.** `QuranIndex` (`quran/quranIndex.ts:162`) folds the
  corpus, anchors on 8 folded characters at each word start, and
  `detectEntities` runs `scanWindow` over every block with a 40-word lookahead
  into the next, so a verse cut by a page break is one entity. Entities are
  stored and rebuilt (`regenerateEntities`, `ensureEntities`), and stamped
  stale by `book.nameIndexSize` (`types/book.ts:50`).
- **hadith-json (PR #16).** `HadithJsonEntry` rows live in the QUL resource
  store, kind `hadith-json`, keyed `slug:number` (`types/qul.ts`,
  `retrieval/hadithJson.ts`). The number is the cumulative position over the
  chapters sorted by chapter id, **not** `idInBook` (`hadithJson.ts:19-31`,
  `readHadithJson` sorts at `:166`). Two collections are registered
  (`HADITH_JSON_COLLECTIONS`, `:54`); a file whose length differs from the
  registered count is refused (`:152`). Matching is `agreement()` (`:275`):
  `matnShingles` (`sharh.ts:148`, 4-word shingles, at most 10, spread evenly,
  after `stripApparatus`) must hit the candidate's folded Arabic with
  `hits ≥ min(2, tried)` and `hits/tried ≥ 0.6` (`MIN_AGREEMENT`, `:262`).
  `chooseCandidate` (`:302`) tries the printed number, then ±10
  (`NEIGHBOUR_WINDOW`). `findLocalHadith` (`:343`) takes a reference and the
  book's matn and returns English only if that confirmation holds.
- **Claude path.** `translate` in `ui/reader/useTranslator.ts` calls
  `enrichSegments` (`:412`) after the provider returns. `enrichHadith`
  (`enrich.ts:95`): (a) parse the model's `segment.reference`, fetch from
  sunnah.com (needs a key; `fetchHadith` writes the `hadiths` cache); (b) if
  that gave no English, `findLocalHadith(storage, segment.reference, segment.arabic)`
  — which needs a reference; (c) else the honest note. A segment with no
  reference, or a reference in no imported collection, never reaches the
  index. The profile tells the model to put a ḥadīth in a `hadith` segment and
  to supply a reference "if you can" (`translation/profiles.ts:27`); the
  request carries only the numbers of `hadith_matn` blocks
  (`translationSteps.ts:120`). `known.hadith` is computed and unused.
- **Offline path.** `runOffline` (`useTranslator.ts:141-212`) reads, for
  entities touching the selection, `getHadith(reference)` then
  `findLocalHadith(storage, reference, blockText-of-the-entity's-start-block)`,
  and `segmentSelection` emits a `hadith` segment for every ḥadīth entity with
  `HADITH_NO_OFFLINE_SOURCE` when nothing was found
  (`translation/offline/segmentSelection.ts:42,217-229`). It uses only stored
  entities, so an undetected inline ḥadīth stays in the prose the on-device
  model translates — the one place the invariant leaks today.
- **Sheet.** `lookupHadith` (`retrieval/HadithSource.ts:101`) applies imported
  English to what it *returns*, never to what it caches (`:111-114`, written as
  a rule: it would outlive the Settings delete). It does `putHadith(record)` of
  the dorar result under `query.reference` (`:187`).
- **Data measured here** (`hadith-json/`, read-only):

  | file | ḥadīth | Arabic bytes | English bytes | Arabic words | median words | <12 words |
  | --- | --- | --- | --- | --- | --- | --- |
  | `riyad_assalihin.json` | 1,896 | 1,103,232 | 888,915 | 107,586 (incl. isnād) | 41 | 1 |
  | `nawawi40.json` | 42 | 40,795 | 25,500 | 2,760 | 52 | 0 |

  For Riyāḍ, with the same letter fold as `letterFold`: 98,761 four-word
  shingle positions, 68,485 distinct, 6,713 occurring in more than one
  ḥadīth (isnād and formula: «رضي الله عنه قال …»); 11 pairs of ḥadīth have
  identical folded Arabic. The dataset's Arabic keeps the isnād, the
  «صلى الله عليه وسلم» spelled out, ى for ي, and the takhrīj tail «رواه
  البخارى» (`hadiths[5]`). A sharḥ may print the honorific as «ﷺ» (U+FDFA),
  which `letterFold` drops (not in ء–ي) but a spelled-out one is four words —
  see Design, "Fold".

## Design

Five pieces, each independently checkable.

### 1. Fold, and what it must do that `agreement()` does not

A new function (not a change to `matnFold`/`letterFold`, which pin today's
numbers and `npm run verify`): `letterFold`, then delete the honorifics
`صلى الله عليه وسلم` / `عليه الصلاة والسلام` / `رضي الله عنه|عنها|عنهم|عنهما`
from the folded **word stream** on both sides, so «النبي ﷺ» in the book and
«النبي صلى الله عليه وسلم» in the dataset fold to the same two words. Without
it every shingle that straddles an honorific misses, which is exactly the
shingles around «قال النبي ﷺ». The fold returns the kept words with a map back
to original word index (the offsets a mark needs, as `tokenise` does for the
muṣḥaf, `detectEntities.ts:77-120`).

`stripApparatus` (`sharh.ts:119`) is applied **only** to a `hadith_matn` block
and to a `hadith` segment's Arabic, not to sharḥ prose: its `TAKHRIJ` regex
deletes everything after the first «رواه / أخرجه / وفي رواية», which on a
paragraph of commentary deletes the rest of the paragraph. For prose the
lead-in and isnād words simply do not hit; shingle hits are independent, so
«قال النبي ﷺ:» costs nothing and needs no recogniser. (Delimiters are likewise
irrelevant: a hit is a hit with or without «…», ((…)) or no quote at all.) On
the **index** side only the takhrīj tail is removed, not the isnād:
`ISNAD_CLOSER` stops after 160 characters and Bukhārī chains are longer, and
under-stripping the index only adds postings that the cap below removes, while
over-stripping loses matn.

### 2. The index

For each collection, every folded 4-word window of every ḥadīth is a
position: key = 32-bit FNV-1a of the window (a few lines of plain JS beside
`lib/hash.ts`'s plain-JS reasoning, trap 9: no `crypto.subtle`), value =
`(number, wordPosition)` packed in 32 bits (16 + 16; hadith-json collections
are below 65,536 ḥadīth, and a ḥadīth over 65,535 words is clamped — Riyāḍ's
longest is 1,808). Sorted by key into two parallel arrays, binary-searched.
Hash collisions are harmless: every candidate is re-verified on the folded
words before it counts (a hash hit is a hint, the word comparison is the
proof). **Cap:** a key present in more than `MAX_POSTINGS` (start 25)
distinct ḥadīth is dropped, as a stop-word is: «عن أبي هريرة رضي الله عنه قال»
cannot identify anything. Positions rather than a spread sample (as
`matnShingles` uses) because a quotation can start anywhere in a ḥadīth.

Rejected: an anchor-on-characters index like `QuranIndex`. It exists for the
muṣḥaf's joined-word orthography (`quranIndex.ts:147-160`); ḥadīth text is
ordinary words and the book's own shingle method already works on it.
Rejected: a `Map<string, number[]>` of strings — at hundreds of thousands of
positions per collection it is tens of MB of JS objects; two typed arrays are
8 bytes a position.

### 3. Matching: several independent hits, in order, with coverage

`findHadithByText(index, text, options)`:
1. Fold the text; take **every** consecutive 4-word shingle (cost is a binary
   search each; the 10-shingle sampling exists only because each of its
   lookups used to be a database search).
2. For each candidate ḥadīth, collect `(queryWord, datasetWord)` pairs, and
   take the longest chain with datasetWord increasing and gaps at most
   `MAX_GAP` words (start 6): so the quoted words must be in the same order and
   near each other in the ḥadīth, which separates a quotation from a topical
   overlap, and tolerates a cut or elided matn (a gap).
3. Accept a chain only if **all** hold: at least `MIN_RUN_WORDS` matched words
   (start 6: three overlapping shingles; the muṣḥaf floor is 4 words and 11
   characters, `quranIndex.ts:144-147`, but «قال رسول الله ﷺ» and «لا إله
   إلا الله» are far commoner than a verse); at least 3 distinct shingle
   hits; and the posting cap having kept them (formulae are gone). One rule
   differs by use: **segment mode** (a `hadith` segment, or a matn block)
   also requires coverage — chain words / words of the stripped query ≥ 0.6,
   the same bar as `MIN_AGREEMENT`; **scan mode** (a block of sharḥ prose)
   cannot, since most of the block is the speaker's own words, so it requires
   chain density instead — hit shingles / (shingles inside the chain's span)
   ≥ 0.7.
4. **Candidates and families.** The same ḥadīth occurs in Bukhārī, Muslim and
   Riyāḍ with different chains and sometimes different wording. Group the
   chains' ḥadīth into families by `agreement()` between the candidates' own
   Arabic (existing function, ≥ 0.6 either way = same family). One family:
   it is *the* ḥadīth; the member with the highest coverage wins, ties broken
   by a collection priority (Q3), and the others are returned as `also`
   ("also Muslim 1907"). More than one family whose chains cover the same
   quoted words within a small margin: **ambiguous** — returned as a list,
   no English chosen (the wording «من كان يؤمن بالله واليوم الآخر فليقل
   خيرا» opens at least three different ḥadīth). Ambiguous in a card means
   Arabic plus a note naming the candidates; in the sheet it lists each with
   its English so the owner decides.
5. Result: `{ family[], chosen, also[], ambiguous, chain: { queryFrom,
   queryTo (word indices), datasetFrom, datasetTo }, coverageOfEntry }`. The
   last field is how much of the dataset's ḥadīth the quotation covers.

Thresholds are starting values to be tuned by the measurement in step 5, not
asserted: they are named constants, each with a comment saying what was
measured, in the project's style.

### 4. A partial quotation (a cut matn)

Two different things are called that.

- **The book cuts the matn** (a numbered `hadith_matn` block that stops early
  or elides «…»). The chain gap tolerance and the coverage bar handle a gap;
  a prefix is simply a shorter chain. Whether this is what the 56 misses are
  is Step 0.
- **The speaker quotes a passage** (case 3). The chain is shorter than the
  dataset's ḥadīth; `coverageOfEntry` says by how much. There is no
  alignment between hadith-json's Arabic and its English, so the English of
  *the passage* cannot be cut out and must not be guessed. Recommended: the
  card's segment carries the **whole** ḥadīth's English with a note
  «Quoted in part; this is the whole ḥadīth: collection N», and the Arabic of
  the segment stays the book's own quoted words (as today, "the reader keeps
  seeing the book's own matn", `hadithJson.ts:14`). Alternative (Q5): above a
  length (say 150 English words), show Arabic plus a note naming the reference
  and leave the full text to the sheet.

### 5. The matched span as an entity range (secondary)

Scan mode reuses `tokenise`'s word array (`detectEntities.ts:77`): the chain's
`queryFrom/queryTo` index the kept words, which map to original words and so
to `start`/`end` offsets into the block text, harakāt intact; the end then goes
through `extendToDelimiter` (`:408`) so a closing «»)) is included. The lead-in
(«قال النبي ﷺ») is not part of the range: the mark is on the ḥadīth's words.
Crossing a page break works exactly as for verses, with the same 40-word
lookahead window. A hadith entity inside a verse mark, or a verse mark inside a
ḥadīth, nests as today (`segmentSelection.ts:134-150`, FOUND_ISSUES 61/72).

The entity gets `reference = slug:number` (the existing format, so
`findLocalHadith`, `lookupHadith`, the offline path and `segmentSelection` work
unchanged), `matchQuality: 'exact'` when one family and coverage ≥ the bar else
`'partial'`, and one new optional field, `matchedBy?: 'number' | 'text'`
(type only; no schema change), because for a `text` entity the "matn" that
`findLocalHadith` confirms against must be the **span**, not the block: today
`runOffline` passes `blockTexts.get(entity.startBlockId)` (`useTranslator.ts:
164-179`), which for an inline entity is a paragraph of commentary and would
fail the 0.6 bar. A small helper `entityText` already exists in the sheet code
(`ReaderSheets.tsx:255`); the offline lookup uses the same slice.

`hadith_matn` blocks with no number (or whose number does not confirm) are
scanned in segment mode over the whole block, which replaces `''` with a
text-proven reference and makes them tappable: the "unnumbered ones get
reference ''" gap.

### Where the index lives: the QUL resource store, not a new store

Recommended: **no new store.** Extend `QulEntryValue` with a
`HadithIndexPart` variant (`t: 'hadith-index'`, plus `v: INDEX_VERSION`) and
write the index as extra rows under the **same** `hadith-json` resource,
keyed `idx:<slug>:<part>`. Reasons:

1. The rows are read by key and by whole resource, exactly what
   `qulEntries` is for; deleting the resource is one range delete
   (`deleteQulResource`), so the derived index cannot outlive the English it
   was built from — the rule `HadithSource.ts:111-114` already states.
2. Trap 6: a new store needs `DB_VERSION` 11→12, a `Schema` type and `STORES`
   entry, `StorageAdapter` methods plus `ShareStorageAdapter`, check D's
   `TODAY`/`OLD_DATABASES`/re-baseline, and the whole-tablet transfer then
   *refuses* a tablet on a different version. All of that for data that is
   only ever read by key.
3. Zero migration: `QulEntryValue` is a TypeScript union, not a store shape.
   No reader switches exhaustively on `t` (checked: `qul/service.ts` tests
   each `t` it wants), so adding a variant needs no existing code to change.
4. The whole-tablet transfer copies stores raw as NDJSON
   (`library/deviceTransfer.ts`), so the rows must be **JSON-safe**: a
   `Uint32Array` would not survive it. Each part is stored as a base64 string
   of the two packed arrays and decoded to typed arrays on load. The per-book
   backup excludes the QUL stores (it does not touch them), so the index is
   not in backups, correctly: it is derived.

The index carries `INDEX_VERSION`; a part with another version is rebuilt. It is
built at hadith-json import (the import already touches every row,
`hadithJsonImport.ts:39`) and **self-heals** when absent (collections imported
before this change: Riyāḍ and the Forty are already on the tablet), as
`ensureEntities` does for a book — a first use builds and writes it, behind a
progress line.

In memory, per session, lazily: `loadHadithIndex(storage)` memoised on the
resource ids and `importedAt` values (like `loadQuranIndex`), so importing or
deleting a collection invalidates it. Split into 16 rows per collection by
the key's top 4 bits so a collection is never one multi-MB value.

### Size, measured and estimated

Measured (above): Riyāḍ has 98,761 positions. At 8 bytes a position that is
0.8 MB raw, ~1.05 MB as base64, beside 1.1 MB Arabic and 0.9 MB English: about
3 MB in IndexedDB for the whole collection, and 0.8 MB in memory when loaded.

Estimated, **not measured** — only two files are on this machine. At Riyāḍ's
57 words and 10.25 bytes of Arabic per word, a collection of N ḥadīth costs
about N × 580 bytes of Arabic, N × 470 bytes of English and N × 460 bytes of
index (base64 included). If Bukhārī, Muslim and the other four of the six
canonical books together hold on the order of 30,000 ḥadīth (to be confirmed
from the downloaded files, which is what Step 1 does), that is on the order of
17 MB Arabic + 14 MB English + 14 MB index ≈ 45 MB in IndexedDB, and about 12 MB
of typed arrays if every collection is loaded at once. Chains in Bukhārī and
Muslim are long, so the real words-per-ḥadīth could be higher; the index
could be halved by indexing a stripped matn instead, at the cost described in
"Fold". **What must be downloaded:** from `github.com/AhmedBaset/hadith-json`
the per-collection files for the collections wanted (Bukhārī, Muslim, and by
choice Abū Dāwūd, Tirmidhī, Nasāʾī, Ibn Mājah; my recollection is that the
repository holds the nine books plus a few small ones, but the owner must
check the actual file names and each file's `metadata.length`). Each new file
needs a `HADITH_JSON_COLLECTIONS` entry (slug = the sunnah.com slug, titles as
the file's `metadata`, Arabic title, exact length) — the importer refuses a
file whose count differs (`hadithJson.ts:152`), and an unregistered title
(`detectCollection`, `:113`).

**`idInBook` must be checked per file.** It was wrong in the Riyāḍ file
(unique but in *file* order, with «كتاب المقدمات» last) and restarts per
chapter in another export. The importer already ignores it and reports how many
numbers it disagrees with (`details`, `:179`); for the ḥadīth-text matcher the
consequence is smaller than for number-based matching (the text, not the
number, identifies the ḥadīth) but the **reference printed to the owner** is
that cumulative number and must be the number sunnah.com uses. For Bukhārī and
Muslim sunnah.com has two numbering systems (book-internal and the
standard/Fuʾād ʿAbd al-Bāqī number); the dataset's chapter/`idInBook` order may
match neither. So per file Step 1 records: chapter count, whether
`idInBook` is unique, continuous, per-chapter or file-order, and whether the
cumulative number equals a number printed in the file's own English text or a
known anchor (e.g. «إنما الأعمال بالنيات» is Bukhārī 1 and Muslim 1907 in the
standard numbering). If the cumulative number is not the number the owner would
cite, Q6.

### Placement: at translation, at detection, or at tap

| | at translation | at detection | at tap |
| --- | --- | --- | --- |
| input | the segment's Arabic, already isolated by the model | every block of the book | a tapped selection |
| index in memory | on first translation of the session | during `regenerateEntities` (one-off per book) | on first tap |
| gives | verified English in the card (the primary requirement) | marks, and the on-device path for free | nothing to tap unless something is already marked |
| cost / risk | one lookup per hadith segment; precision high (the model has done the segmenting) | tens of thousands of blocks × ~60 binary searches; false marks in the text; stale when a collection is imported later | no marks, so it is not the secondary requirement |

Recommended: **at translation first** (steps 2–4: the whole primary
requirement, small, no stored state to go stale), **at detection second**
(step 6: the secondary requirement, behind the owner reading the false-positive
list from step 5). At-tap is rejected: it cannot make anything tappable. The
detection step adds an optional `hadithIndexSize?: number` to `Book` (same
pattern as `nameIndexSize`, `entityService.ts:102`; optional, so no schema
change) so importing a collection after a book re-detects it once, as
finishing a biographical import does.

### How the Claude path uses it (`enrichHadith`)

New order, for a `hadith` segment, in `retrieval/enrich.ts`:

1. `findHadithByText(loadedIndex, segment.arabic, segment mode)`. Text proof
   beats a model-recalled reference, as `enrichSegments` already says for
   verses ("A locally matched reference beats a model-supplied one",
   `enrich.ts:43-45`). Today the model's reference goes to sunnah.com
   *unconfirmed* (`fetchHadith(parsed)` then `record.english`); a wrong
   recalled number would return another ḥadīth's English. If the text proves a
   single family, the chosen member's English (`composeEnglish`) becomes
   `english`; `source: 'hadith-json'`; `reference: slug:number`; the segment's
   `arabic` stays as the model echoed it (the book's words); a note is added
   when partial («Quoted in part…») or when `also` exists («Also in: …»).
2. No text proof, or no index imported: the existing code, unchanged (sunnah.com
   by reference, then `findLocalHadith` by reference, then the note).
3. Ambiguous: Arabic, `english: ''`, `source: undefined`, and a note naming the
   candidates. Never a guess.

`segment.arabic` is the model's echo of the source, so it may carry the
lead-in («قال النبي ﷺ»), the isnād, the takhrīj line, or be a little shorter
or longer than the book's words; the fold and the chain/coverage rule absorb
this (lead-in and chain words miss, the matn hits). `stripApparatus` is applied
to a segment first, as it is to a matn. `EnrichDeps` already carries `storage`;
the loaded index is obtained inside, so no call site changes, and
`knownQuranRefs`-style plumbing is not needed. Rejected: consuming
`known.hadith` references "in order" like `known.quran` — it breaks as soon as
the model splits or merges segments differently from the detector, and for a
woven-in fragment there is no entity to consume until step 6.

Nothing is written to the `hadiths` store on this path, as on the existing
local branch (`enrich.ts:105-118` does not call `putHadith`); the English lives
only in the card, which is what the existing hadith-json path already does.
Retrieval log: one `recordRetrieval` (`services/retrievalLog`, kind
`hadith`) per match: outcome hit / ambiguous / no-match with the chain length
and coverage, so a wrong match can be diagnosed from the activity log.

If the model leaves a woven-in fragment in a `prose` segment, nothing here sees
it and the model's own English stands for those words (Q4).

### The offline path

`runOffline` cuts the selection into pieces from entities before the model
sees anything, so the invariant there depends on detection. With step 6's
stored entities it works with no new offline code except the span fix in the
`references` map (above). Without step 6 the on-device model translates inline
ḥadīth as prose, so **the offline invariant is only met by step 6**; if the
owner stops after step 4 that must be said in the PR. An alternative —
detect transiently on the selected blocks inside `runOffline` and pass the
extra entities to `segmentSelection` — is possible with the same matcher but
duplicates what step 6 stores, so not recommended.

### Layer edges

`node scripts/check-layers.mjs` at f7c7249: no cycle, no mutual import, "all
rules hold" (11 rules). Edges the change adds: **none new at directory level.**
`retrieval` → `lib`, `platform/storage` (type), `types`, `services` exist.
`quran` → `retrieval` exists (step 6: the scan lives in `quran/detectEntities`
and imports the pure matcher from `retrieval/`, as it already imports from it).
`ui/reader` → `retrieval` exists. The folding helpers live in `retrieval/`
(or `lib/` if shared; `lib` imports only `types`, allowed). `translation` must
not import `retrieval` (it does not, and nothing here makes it). Rerun
`npm run layers -- --check` after every step.

## Steps

| # | step | files | what changes | checks | risk |
| --- | --- | --- | --- | --- | --- |
| 0a | Inspect the 56 | none (owner, device) | device match report lists them | M | none |
| 0b | Classify the 56 | `retrieval/hadithJsonReport.ts`, `ui/settings/HadithJsonResources.tsx` (display), `scripts/hadithMatch.ts` | each miss gets a reason and numbers; report only | T, B, L, V, M | low: report-only |
| 1 | Download, register, measure | `retrieval/hadithJson.ts` (`HADITH_JSON_COLLECTIONS` entries), new `scripts/measure-hadith-corpus.ts` | the other collections registered; per-file `idInBook` and size facts | T, V (owner) | numbering (R3) |
| 2 | The pure matcher | new `retrieval/hadithText.ts`; new `scripts/verify-hadith-text.ts`; `package.json` script | fold, index build, query, families | T, B, L, new H | thresholds (R1) |
| 3 | Persist, load, self-heal | `types/qul.ts`, `retrieval/hadithTextIndex.ts`, `retrieval/hadithJsonImport.ts`, `ui/settings/HadithJsonResources.tsx` | index rows in QUL store, built at import and on demand | T, B, L, D, H, M | storage/JSON-safety (R4) |
| 4 | Claude path | `retrieval/enrich.ts`, `scripts/verify-translate.mjs` | text proof before the model's reference | T, B, L, Q, P, H, M | wrong English (R1, R2) |
| 5 | Measure on real data | new `scripts/report-hadith-text.ts` + `package.json`; device report in `hadithJsonReport.ts` | rates, ambiguity, marks per page, false-positive list | V/owner, M | none (report) |
| 6 | Marks and offline | `types/entities.ts`, `types/book.ts`, `quran/detectEntities.ts`, `quran/entityService.ts`, `ui/reader/useTranslator.ts` | inline and unnumbered ḥadīth entities; span-based confirmation | T, B, L, S, R, U, P, D, H, M | false marks, reader perf (R5) |
| 7 | Sheet: candidates and the dorar cache | `retrieval/HadithSource.ts`, `ui/reader/HadithSheet.tsx` | list `also`/ambiguous; keep dorar from caching a fragment | T, B, L, U, P, M | R6 |

Steps 2–4 are the primary requirement; 5 gates 6; 6–7 are the secondary. Each
is one commit (or two when it has a data commit and a code commit), reviewed
by `torjuman-reviewer` before the next starts. None of these steps is a
restructure step; the "structure only" rule does not apply, but each commit
changes one thing.

## Per step

### Step 0 — the 56 unmatched numbers from book 9260 (96.6% matched)

56 of about 1,650 numbered matns did not confirm (the owner's report; 1 − 0.966
of ~1,650). The guess is that they are cut matns. Cut is plausible but not
the obvious failure of this matcher: `matnShingles` draws its shingles from
**the book's** text, so a book matn that is a clean prefix or suffix of the
dataset's still agrees (all its shingles are present). What does fail:

- a **gap** inside the book's matn (elision «…» or a skipped passage): shingles
  that straddle it miss; with ≥ 40% of ten shingles over the gap the 0.6 bar
  fails;
- a matn under 4 words after stripping (`tried = 0`, never confirmable);
- **over-stripping** by `stripApparatus` (`TAKHRIJ` deletes from the first
  «رواه / أخرجه / وفي رواية» to the end of the block, so a matn that contains
  such a phrase loses its tail; `ISNAD_CLOSER` can eat the start);
- a different **riwāya** or wording from sunnah.com's text for the same
  ḥadīth, or a ḥadīth that is in the book and in the dataset under a
  different **number** by more than the ±10 window (numbering drift);
- a block mis-typed as `hadith_matn`, or a matn split across blocks by the
  parser (page break) so one number has half a text;
- the dataset having a different Arabic for it (a typo, a variant), or a
  ḥadīth with no dataset counterpart.

How to inspect (no code needed for 0a): on the tablet, Settings → Ḥadīth
English → the match report for book 9260 lists each unmatched number and the
opening words (`hadithJsonReport.ts:60`, `firstWords`). The owner records the
56 **numbers** (not the book's text) in "Owner's answers" below; for each, open
the book at that number (block search by its first words), and read three
things: is the block the whole matn, does it carry «…» or a visible gap, and
does the next block continue it. Do that for 5–10 first; the pattern usually
shows.

0b makes this mechanical so the owner does not read 56 by eye. The device
report's `UnmatchedHadith` gains, per number: words in the matn after
`stripApparatus` and before (over-stripping shows as a large drop); own-number
hits/tried and the best contiguous run in words against the dataset's
ḥadīth at that number; the best agreeing dataset number over the **whole**
collection and its offset (the existing PC report already does this,
`scripts/hadithMatch.ts:111-126`; on the device it is 56 × 1,896 `agreement`
calls, trivial); and one reason chosen in this order: *too short*,
*over-stripped* (agrees once the apparatus is not stripped), *drifted by k*
(agrees elsewhere), *partial run* (own number agrees 1–59%: cut or elided),
*different wording* (hits 0 on own number and nothing anywhere). The PC
fixtures hold only ~50 pages of 9260 (`fixtures/nass-9260-1-50.json` plus a few
page files), so the 56 cannot be reproduced there: the device is the only
place with the whole book. The result decides two things: whether step 2's
gap tolerance and run rule are enough, and whether `agreement()` itself should
get the same fixes (a separate change, Q7).

### Step 1 — download, register, measure

Owner downloads the wanted files into `/hadith-json/` (gitignored; confirm
`.gitignore` still has the leading slash form). I add one
`HADITH_JSON_COLLECTIONS` entry per file from its own `metadata` (exact
`length`, English and Arabic titles), and `scripts/measure-hadith-corpus.ts`
(PC only, like `report:hadith-json`, no fixtures needed) prints per file:
ḥadīth, chapters, Arabic bytes, words, median, distinct and shared shingles,
what share the posting cap drops, `idInBook` behaviour (unique / continuous /
per chapter / file order), the cumulative-number anchors above, and the
estimated index bytes. That turns the estimates in "Size" into measurements
before any storage work. Checks: T; the script runs on the owner's PC.

### Step 2 — the pure matcher

`retrieval/hadithText.ts`: `foldForMatch` (with the word-index map),
`buildHadithIndex(entries)` (sorted typed arrays, cap), `findHadithByText`
(chain, families, ambiguity), all pure, no storage, no React. No existing
function changes. `scripts/verify-hadith-text.ts` (check H, runs anywhere,
`vite build --ssr`, as `verify:requests` does) uses **synthetic** corpora
written in the file (invented matns of the right shape, no real ḥadīth text
beyond what the repo already carries): lead-in, bare, woven; honorific as ﷺ vs
spelled out; a gap; a prefix; a different order; formulaic opening only (must
not match); two collections with one family (picks by priority, lists `also`);
two distinct ḥadīth sharing a wording (ambiguous); under the minimum run;
hash-collision injection (a forced equal hash with different words must not
match); word-index map round-trip. Callers: none yet.

### Step 3 — persist, load, self-heal

`types/qul.ts`: add `HadithIndexPart` to `QulEntryValue`. `hadithTextIndex.ts`:
`encodePart`/`decodePart` (base64 of the packed arrays), `writeIndex(storage,
resource, entries)` called from `commitHadithJsonImport` **before** the resource
row is written (the existing order rule, `hadithJsonImport.ts:33-36`),
in 500-row chunks as there, and removed with the partial rows on failure;
`loadHadithIndex(storage)` (memoised; builds from the stored `arabic` rows if
parts are missing or `v` differs, then writes them). Settings: the resource
line gains "index built, N positions" or "building…". `entryCount` stays the
ḥadīth count (the report and `findLocalHadith` read `1..entryCount`). Callers
to update: `commitHadithJsonImport` only. No `StorageAdapter` method is
added, so `ShareStorageAdapter` and check D's method lists do not change; D
must come out **identical** to `phase4/storage.json` — that is the proof that
no schema moved. Gap: D does not import a hadith-json file today (grep: no
`hadith-json` in `verify-storage*`); the owner should confirm on the tablet
that a whole-tablet transfer of a device holding the index works (R4).

### Step 4 — Claude path

`enrich.ts` `enrichHadith` as in Design; `loadHadithIndex` called once per
`enrichSegments` run, not per segment. `verify-translate.mjs` (check P) gets a
scenario: the canned Anthropic response has a `hadith` segment with **no
reference** whose Arabic is an echo of a synthetic matn, with a synthetic
collection seeded into the QUL store through the page (the collection registry
is closed, so the seed writes rows directly with `putQulEntries` and a resource
with a test slug, and `HADITH_JSON_COLLECTIONS` is bypassed by the index loader
taking its resources from the store — a design constraint on step 3: the loader
reads `resource.collection`, not the registry). Asserts: the card's segment has
`source: 'hadith-json'`, the reference, the English; the **`hadiths` store has
the same rows as before** (this is the "never written to the cache" check); an
ambiguous case shows the note; no index shows the existing note unchanged.
Check Q must stay byte-identical (no request changes). Also assert that a
card's `cacheKey` is unchanged by importing a collection (it never reads the
index).

### Step 5 — measure on real data (the gate for step 6)

`npm run report:hadith-text` (PC): for the 9260 fixture pages, run scan mode
over every non-matn block and print: blocks with a hit, marks per page,
chain-length histogram, ambiguous count, every hit with the block's first
words, the matched words and the candidate (as the existing report prints "every
ḥadīth read" rather than a percentage on trust). It also runs segment mode
over each fixture matn against the Riyāḍ file and against the *other*
collections (does the same matn find its Bukhārī/Muslim twin as `also`?). The
on-device report (same module, in `hadithJsonReport.ts`) does the whole book.
The fixtures are ~50 pages, so the owner's read of the device report decides.
The owner reads the list for **false positives** (a mark on words that are not
a ḥadīth) and **misses** he can see by eye, and tells me; thresholds change in
a separate commit if needed. Output text from a real book stays on the
owner's screen and out of the repository and the PR (Never list).

### Step 6 — entities (secondary)

`detectEntities`: after the verse scan of a block, scan mode over the same
`words` (skipping words already inside a quran candidate's range); for a
`hadith_matn` block without a confirmed number, segment mode over the block.
Entity fields as in Design. `regenerateEntities` loads the index once and stamps
`hadithIndexSize`; `ensureEntities` treats a different size as stale.
`useTranslator.runOffline`'s `references` map uses the span for `matchedBy:
'text'`. Callers to update: `DetectionDeps` gains `hadithIndex?`
(optional: the verify scripts and the share target do not have one);
`entityService` (two call sites); nothing renders differently (a `hadith`
entity already has a mark style; `markableByBlock` already filters
unresolved). Checks: S and R (the reader's scroll and marks are exactly where
a new entity type with many short ranges per block can break offsets,
`TYPE_CHROME` is not affected but the marks' DOM is); U (markup baseline:
synthetic books have no ḥadīth index so U should be byte-identical — if it is
not, that is the finding); P (offline card with an inline ḥadīth gets a
`hadith` segment and no model call for it); D (unchanged); V by the owner
(`detectEntities` is in V's scope).

### Step 7 — sheet

`HadithSheet` lists `also` and, for an ambiguous mark, the candidates, each with
its English labelled "sunnah.com (via hadith-json)". `lookupHadith` is
given the text-proven reference; for a `text` entity it must not
`putHadith` a dorar record built from a fragment (R6): pass the chosen
ḥadīth's own Arabic as `arabicText` to dorar, or skip the `putHadith` for
partial matches. Checks: T, B, L, U (the sheet is a shared screen), P, M.

## Checks

Letters are those of `docs/refactor/RESTRUCTURE.md` §5; **H** is new
(`npm run verify:hadith-text`, step 2, synthetic, anywhere).

| Step | T | B | L | S | R | U | Q | P | D | H | V | M |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0b | here | here | here | | | | | | | | owner | owner |
| 1 | here | | | | | | | | | | owner (script) | |
| 2 | here | here | here | | | | | | | here | | |
| 3 | here | here | here | | | | | | here (unchanged) | here | | owner |
| 4 | here | here | here | | | | here (unchanged) | here | | here | | owner |
| 5 | here | | | | | | | | | | owner (report) | owner (device) |
| 6 | here | here | here | here | here | here | | here | here | here | owner | owner |
| 7 | here | here | here | | | here | | here | | | | owner |

Also: `torjuman-reviewer` after every step (X). `npm run verify` (V) is the
owner's PC only and covers `retrieval/` and `quran/`; it fails at once here on
the missing `fixtures/`, as expected, and must be run by the owner at steps 0b,
1, 5, 6. Notes: B at steps 2–4 should grow the main chunk by the matcher and
index code only (small; no dependency); the index data is not in any bundle.

**Only the tablet can show (M):** the index build time and memory with a large
collection on the real device (the first translation after importing Bukhārī is
the likely stall: a progress line and chunked writes are in step 3, but the
number is the owner's to read); that detection over a six-volume book does not
make the first open slow (step 6); touch behaviour on a short mark inside a
sentence, which is much smaller than a whole-block ḥadīth mark; a Claude
translation of a real passage from each of the three shapes; a whole-tablet
transfer after the index exists, between two tablets on the same version; and
Chrome vs DuckDuckGo for the Settings import of a large file (the import reads
the file as text, `hadithJsonImport.ts:19`; a 20 MB JSON parse in a WebView is
unmeasured).

## Risks

- **R1. A wrong ḥadīth's English under a quotation** — worse than none
  (`hadithJson.ts:36-39`). Caught by: the posting cap, the minimum run, the
  chain order rule, ambiguity listing, never choosing among distinct
  families; step 2's synthetic cases; step 5's false-positive reading by the
  owner. Thresholds are constants with comments, changed only after step 5.
- **R2. A formulaic wording matching a different ḥadīth than the one meant**,
  e.g. a different ḥadīth with the same opening. Mitigated by coverage (segment
  mode) and by ambiguity; not eliminable for a 6-word quotation that really is
  in several ḥadīth, which is why it is listed rather than chosen.
- **R3. Reference numbering.** A text match is right about *which* ḥadīth, but
  the number shown (`slug:N`) is the cumulative position, which for Bukhārī
  and Muslim may not equal the number the owner cites. Caught in step 1; Q6.
- **R4. The index in the QUL store.** JSON-safety for the whole-tablet transfer
  (a typed array would corrupt silently: the file is NDJSON), staleness when
  the algorithm changes (`INDEX_VERSION`), and an interrupted build (rows
  first, resource row last). Not caught by D, which has no hadith-json
  scenario; step 3 adds a harness-level round trip (encode → JSON → decode)
  to H, and the transfer is a tablet check.
- **R5. Reader performance and marks noise** (step 6): many short ranges per
  block, and a page that reads as a wall of marks. Caught by R/S, and by step
  5's marks-per-page figure *before* step 6 starts. Detection time for a
  large book is measured in step 5.
- **R6. dorar cache pollution.** `lookupHadith` caches the dorar record under
  the reference with `arabic: record?.arabic || query.arabicText`
  (`HadithSource.ts:177,187`); for a fragment that stores the fragment as the
  ḥadīth's Arabic under a real reference. Addressed in step 7, so step 6 must
  not ship without it (marks that open the sheet reach this code).
- **R7. A stale card.** A card made before an index existed keeps its
  "no verified English" note; the cache key does not (and must not) include
  the index. Retranslating (a paid call on Claude) refreshes it. Q8 offers a
  free "re-enrich" later.
- **R8. Imported English inside cards.** Cards (with the English) are in
  backups; deleting the collection in Settings does not remove it from a card.
  This is how the existing hadith-json path already behaves; stating it so the
  owner decides if it matters (the data is the owner's own and private).
- **R9. Memory** with every large collection loaded on the tablet (~12 MB
  typed arrays, estimated). Loaded lazily; measured in step 1 and on the
  tablet.
- **R10. `stripApparatus` on segments.** A segment whose Arabic contains
  «رواه» mid-text is cut there. Acceptable for a ḥadīth segment (the profile
  keeps the takhrīj), and the coverage bar still applies; noted because step
  0 may show it already hurting numbered matns.

## Questions

**Q1. Order and scope.** Do steps 2–4 (the Claude path, the primary
requirement) first and decide step 6 only after step 5's report?
*Recommend yes.* It delivers what the owner asked first, with no stored state,
and the false-positive risk of marks is read from data before committing to it.

**Q2. Where the index lives.** QUL resource store (extra rows under the same
resource, JSON-safe, no schema change) or a new `DB_VERSION` 12 store?
*Recommend the QUL store*: no migration, no check D re-baseline, no transfer
version coupling, and deleting the collection deletes the index.

**Q3. Collection priority** when one ḥadīth is in several imported collections
and the wording agrees: which English wins? *Recommend: the book's own
collection first (Riyāḍ for a sharḥ of Riyāḍ), then Bukhārī, Muslim, then the
rest*, with the others listed as "also", editable later.

**Q4. A ḥadīth woven into a `prose` segment** (the model did not give it its
own segment). Do nothing now and count how often it happens in step 5, or scan
prose segments and attach "official translation of the quoted words:" as a note
under the prose? *Recommend count first*: attaching text to prose changes the
card's meaning and is a different feature; step 6 on-device detection covers
the offline case regardless.

**Q5. A partial quotation's English.** Whole ḥadīth English with a "quoted in
part" note, or Arabic plus a reference note above a length? *Recommend the
whole English for any length at first*, with the note; the card is for study and
the sheet can still say which words were quoted.

**Q6. Numbering.** If the cumulative number for Bukhārī or Muslim is not the
number the owner cites (sunnah.com has two schemes), show the number anyway,
show the text-proven position with a "dataset position" label, or add a
per-collection number map? *Recommend: decide after step 1's measurement*; do
not build a map unless it is wrong.

**Q7. Fix `agreement()` for the cut/over-stripped numbered matns** found in
step 0 (a separate change, using the same gap-tolerant chain) or leave the
number-first path as is and let text matching rescue them via step 6's matn
block scan? *Recommend: let step 6 rescue them* — a numbered matn that fails
the number check falls to a text-proven reference — and leave `agreement()`
alone, since it is pinned by `verify`.

**Q8.** A later free "Re-enrich this card" action (re-run `enrichSegments` on
the stored segments, no model call) so an index imported after a card was made
fixes it without a paid retranslate? *Recommend: yes, but a separate small
change*, not in this plan.

**Q9. Which collections to download.** Bukhārī and Muslim only, or the six
canonical books? *Recommend Bukhārī and Muslim first*: Ibn ʿUthaymīn quotes
them most, the index and memory cost stays near 15 MB, and step 1's numbers
decide the rest.

**Q10. Thresholds** (4-word shingles, run ≥ 6 words, ≥ 3 hits, cap 25
postings, gap 6, coverage 0.6, density 0.7): accept as starting values to be
tuned by step 5, rather than agreeing numbers now? *Recommend yes.*

## Owner's answers

Q1–Q10: the owner answered "go with the recommendations" on 2026-11-20, so each
question is answered as its own recommendation says: Q1 Claude path (steps 2–4)
first, marks decided after step 5; Q2 the QUL resource store; Q3 the book's own
collection, then Bukhārī, Muslim, the rest; Q4 count prose-woven ḥadīth before
scanning prose; Q5 the whole English with a "quoted in part" note; Q6 decide
after step 1's measurement; Q7 leave `agreement()` alone, step 6 rescues cut
matns; Q8 a free "re-enrich this card" action, as a separate change; Q9
Bukhārī and Muslim first (download approved); Q10 thresholds accepted as
starting values.

Step 0a: the 56 unmatched numbers of book 9260, and what each one looked like:
(left empty for the owner; the device report from step 0b gives a reason per
number)

## Step 1 — measured (2026-11-20, `npm run measure:hadith-corpus`)

| file | ḥadīth | Arabic | English | 4-word positions | dropped by the cap of 25 | index (base64) | in IndexedDB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bukhari.json | 7,277 | 7.73 MB | 3.64 MB | 500,523 | 16.7% | 4.24 MB | 15.6 MB |
| muslim.json | 7,459 | 7.17 MB | 3.00 MB | 459,534 | 20.1% | 3.73 MB | 13.9 MB |
| riyad_assalihin.json | 1,896 | 1.05 MB | 0.85 MB | 98,761 | 15.7% | 0.85 MB | 2.75 MB |
| nawawi40.json | 42 | 0.04 MB | 0.02 MB | 2,567 | 5.7% | 0.02 MB | 0.09 MB |

At about 2 KB a ḥadīth, the six canonical books would be nearer 70 MB than
the 45 MB estimated above.

Numbering (Q6):
- **Bukhārī:** `idInBook` is continuous and in chapter order, and the
  importer's number equals it. It matches the standard at the start
  («إنما الأعمال بالنيات» 1, «بني الإسلام على خمس» 8) but drifts: 7,277 ḥadīth
  against the standard 7,563, and «كلمتان خفيفتان» lands at 6,167 and 6,438
  where the standard has 6,406 and 6,682.
- **Muslim:** chapter 0 (the introduction) is listed last, as in Riyāḍ. Neither
  `idInBook` nor the importer's number is the standard one («بني الإسلام على
  خمس», standard 16, is 110–112 by the importer and 19–21 by `idInBook`).
- So both are registered with `citableNumbers: false`: text identifies the
  ḥadīth, and the number must not be shown as a citation. Riyāḍ and the Forty
  keep `citableNumbers: true`.
