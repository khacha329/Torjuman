# Identify a ḥadīth by its text, and feed its verified English into the translation and the sheet

Status: steps 0b and 1 done (PR #18), the other seven collections registered
(PR #22). Steps 2–7 were approved on 2026-11-20 ("go with the
recommendations"). **This revision (2026-11-22) changes steps 2–5 and adds
steps 4a and T1–T3. Only the parts marked NEW or CHANGED need approval: the
delta, awaiting the owner's approval.**
Base commit: 83ae9d2 (main, after PR #22)   Branch: claude/hadith-text-index
(the 2026-11-20 revision was based on f7c7249, branch claude/hadith-text-matching)

All `file:line` references are at 83ae9d2 unless a section says otherwise.

How to read the markers:
- **[approved]**: as approved on 2026-11-20, unchanged except for line numbers.
- **[CHANGED]**: approved on 2026-11-20 and changed here. The change is
  stated in the section.
- **[NEW]**: not in the approved plan.

## Goal

**[approved]** The owner's words, paraphrased: in a sharḥ such as Ibn
ʿUthaymīn's, a ḥadīth appears in three ways: (1) introduced by «قال النبي ﷺ:» /
«قال رسول الله ﷺ», (2) quoted as «النبي ﷺ…» with no lead-in, (3) as a bare
passage of the ḥadīth woven into the speaker's own sentence. Today none of
these gets verified English unless the number agrees: only whole
`hadith_matn` blocks become ḥadīth entities, an unnumbered one gets reference
`''` and no English, and inline quotations are not detected at all.

- **Primary.** When a translation is made, the model already puts a ḥadīth in
  its own segment (type `hadith`). `enrichSegments` → `enrichHadith`
  (`retrieval/enrich.ts:98`) must find the verified English for that segment
  **by its Arabic text** and use it instead of leaving the segment unenriched.
- **Secondary.** The same ḥadīth become tappable marks in the book text.
- **Invariant, unchanged.** A ḥadīth is never machine-translated. No match, or
  an ambiguous one, means Arabic plus an honest note.

**[NEW] Since PR #22.** All nine books but ad-Dārimī are registered (ten
collections with Riyāḍ and the Forty, 39,475 ḥadīth). Only Riyāḍ and the Forty
have citable numbers. For the other eight the number the model gives, or the
book prints, is at most a hint. If it is more than `NEIGHBOUR_WINDOW` (10)
off, or missing, only the text can find the ḥadīth. So the text index is how
those eight collections get their English. The owner's new requests:

1. Steps 2–4 for all ten collections. The index is sized for ~40,000 ḥadīth
   on the Android tablet: build time, IndexedDB size, memory, when it is
   built, and whether it needs a schema change. (It does not; see "Where the
   index lives".)
2. Make the ḥadīth in a sharḥ of one of the six books (Bukhārī, Muslim,
   Abū Dāwūd, Tirmidhī, Nasāʾī, Ibn Mājah) find their English when tapped.
   The sheet finds the ḥadīth by its text **within that book's collection**,
   with the printed number at most a hint. It never shows model English, and
   it shows no sunnah.com link built from a dataset position.
3. Provider independence: nothing here depends on Claude or Gemini. Enrich
   runs after whichever cloud provider answered, and the on-device path gets
   the same lookup.

Done when:
1. **[CHANGED]** With any of the ten collections imported, a translation of a
   sharḥ passage (by Claude **or Gemini**) whose ḥadīth is introduced, bare or
   woven in comes back with `source: 'hadith-json'` and the dataset's English
   for the segments the index identifies. The reference follows the citable
   rule (below). The rest get the existing honest note.
2. **[NEW]** In a book recognised as a sharḥ of one of the six books,
   tapping a numbered matn opens a sheet with that collection's English when
   the text proves it. Otherwise the sheet shows an honest note that names the
   collection. The same holds on the on-device translator and with no
   network.
3. **[approved]** A measurement over real data (the on-device report, and a PC
   report over the fixtures) says how many are identified, how many are
   ambiguous, and how many marks a page gets, and the owner has read the
   false-positive list.
4. **[approved]** (Secondary step only) the same ḥadīth are marks in the
   reader, and the on-device translator uses them too.
5. **[approved]** No change to any translation cache key, any `requests.json`
   baseline, the `hadiths` store's rows, or `DB_VERSION`.

## Not doing

- **[approved]** No machine translation of a ḥadīth, ever. No English is cut
  or stitched from a hadith-json English to fit a quoted fragment.
- **[approved]** No change to the system prompt or the profile (that would
  invalidate cached cards and move `requests.json`).
- **[approved]** No new dependency, no forced `tool_choice`, no network call
  for the matching. No LLM call anywhere in this work: the matcher is local
  and deterministic.
- **[approved]** No sunnah.com or dorar lookup *for* an inline match (R6).
- **[approved]** Not splitting a model's prose segment (Q4: count first).
- **[approved]** No ḥadīth data bundled or committed. Tests use synthetic text.
- **[NEW]** No number map from dataset positions to standard numbers (Q6 was
  "decide after step 1"; step 1 found the numbers non-citable, and the text
  identifies the ḥadīth without a map).
- **[NEW]** No sunnah.com fetch for a ḥadīth in a sharḥ of the six books.
  Their entity reference stays book-scoped (`<bookId>#<n>`), so the sheet
  never sends a printed number to sunnah.com unconfirmed. This is how they
  behave today.
- **[NEW]** No change to `hadithCollectionFor` (`quran/detectEntities.ts:421`)
  or to `Book.hadithCollection`. Those two mean "this book's numbers *are*
  sunnah.com references", which holds only for Riyāḍ and the Forty.
- **[NEW]** Sharḥs of Mālik and Aḥmad are not recognised in this change (Q16).
  Unnumbered matn blocks stay untappable until step 6 (Q15).
- **[NEW]** Reference works (Fatḥ al-Bārī 1673 and al-Minhāj 1711 come from
  the catalog as `role: 'reference'`) are not made readable in the library
  (`ui/LibraryScreen.tsx:26`). See Q11.

## Current state (at 83ae9d2)

- **[approved, lines updated] What a ḥadīth entity is.** `detectEntities`
  makes one entity per `hadith_matn` block (`quran/detectEntities.ts:293-321`).
  Its reference is `${hadithCollection}:${number}` when the book's collection
  is known, `${bookId}#${n}` when it is not, and `''` with
  `matchQuality: 'unresolved'` for an unnumbered matn (not marked:
  `quran/entityService.ts`, `markableByBlock`). `hadithCollection` comes from
  `book.hadithCollection ?? hadithCollectionFor(book.title)`
  (`entityService.ts:64`, stored at import, `ingest/importer.ts:133-134`).
  `hadithCollectionFor` (`detectEntities.ts:421-433`) returns
  `riyadussalihin`, `nawawi40` or null.
- **[NEW] So a numbered matn in a sharḥ of Bukhārī is already tappable.** Its
  entity is `${bookId}#${n}` with `matchQuality: 'exact'`, label
  `Ḥadīth n` (`:316`). What fails is the lookup. `lookupHadith`
  (`retrieval/HadithSource.ts:102`) calls `findLocalHadith(storage,
  query.reference, …)` (`:114-116`), whose `REFERENCE` regex
  (`hadithJson.ts:501`) needs `slug:number`, so it returns null.
  `parseHadithReference` finds no collection in `shamela-1673#12`, so neither
  sunnah.com nor the import is asked. Only dorar answers (Arabic and grading),
  cached under the book-scoped reference (`:185`). The sheet then shows the
  amber note, and its key prompt names only Riyāḍ and the Forty
  (`ui/reader/HadithSheet.tsx:282`). The hadith-json source note in Settings
  says the same (`HadithSource.ts:82`), which has been stale since PR #22.
- **[NEW] How a sharḥ is recognised today.** By the Shamela category alone:
  `parseBook.ts:89` gives a book in «شروح الحديث» the `hadith-commentary`
  structure profile (the one that types `hadith_matn` blocks,
  `shamela/structure.ts:75-98`). `isCommentaryWork` (`retrieval/sharh.ts:48`)
  uses the same category plus `role === 'reference'` for the commentary bars.
  Only Riyāḍ and the Forty are matched to a collection, by title. No catalog
  id is used anywhere for this. The catalog (`public/catalog.json`) lists 1673
  «فتح الباري بشرح البخاري» and 1711 «المنهاج شرح صحيح مسلم بن الحجاج», both
  `role: 'reference'`. A book imported outside the catalog gets
  `guessRole` → `'reading'` (`importer.ts:35-47`).
- **[NEW] The hadith-json registry** (`retrieval/hadithJson.ts:79-183`): ten
  collections, each with `slug`, `titles`, `arabicTitle`, `displayName`,
  `fileName`, `length`, `citableNumbers` (true only for `riyadussalihin` and
  `nawawi40`). `SUNNAH_COM_SKIPPED = {malik, ahmad}` (`retrieval/sunnah.ts:89`;
  `fetchHadith` returns null for them, `:162`).
- **[NEW] The card path** (`enrich.ts:98-164`): `parseHadithReferences`
  (`sunnah.ts:112`, several references, transliteration folded). Each
  reference is tried on sunnah.com (`:107-110`), then `findLocalHadith` per
  reference (`:116-124`): number ±10, confirmed by `agreement` (4-word
  shingles, `MIN_AGREEMENT` 0.6, `hadithJson.ts:384-394`) or, for a short
  quotation at the exact number, `shortQuoteHolds` (`:429`). The reference
  is renumbered to the dataset only when citable (`:133-135`). Otherwise
  there is a note: `HADITH_IMPORT_ONLY` when every cited collection is
  skipped, `HADITH_UNAVAILABLE` / `HADITH_NEEDS_KEY` otherwise (`:138-152`).
  A segment with no reference never reaches the import.
- **[NEW] Provider independence, as it stands.** `enrichSegments` is called
  once, at `ui/reader/useTranslator.ts:412-421`, after whichever cloud
  provider the profile names returned (the header says "Nothing here names a
  provider", `:33`). Gemini and Anthropic return the same `TranslatedSegment`
  shape. `EnrichDeps` (`enrich.ts:17-24`) carries no provider id.
- **[approved, lines updated] Offline path.** `runOffline`
  (`useTranslator.ts:141-212`) builds `reference → matn` from the entities
  touching the selection (`:160-179`), reads `getHadith` then
  `findLocalHadith` (`:180-188`), and `segmentSelection` emits
  `HADITH_NO_OFFLINE_SOURCE` when nothing is found. A book-scoped reference
  never finds anything here either.
- **[approved] Sheet caching rule.** `lookupHadith` applies imported English
  to what it *returns*, never to what it caches (`HadithSource.ts:110-113`).
  `withLocalEnglish` builds no sunnah.com URL from a non-citable number
  (`:211-216`). `sourceUrl` is not rendered anywhere in the UI today (grep of
  `src/ui`).
- **[NEW] Card reference display.** `TranslationCardView.tsx:500-508` prints
  `segment.reference` as a plain string beside the source badge. It is a
  display string, not a link.
- **[NEW] Storage.** `DB_VERSION = 11` (`platform/storage/idbSchema.ts:57`).
  hadith-json rows are `qulEntries` rows keyed `${resourceId}|${slug}:${n}`.
  Rows are read by key (`getQulEntries`, one read-only transaction,
  `idbReference.ts:120-126`) and deleted by resource
  (`deleteQulResource` → `purgeIndex(byResource)`, `:97`). The whole-tablet
  transfer copies every object store raw (`idbTransfer.ts:24,81`).
  `commitHadithJsonImport` writes rows in 500-row chunks, then the resource
  row, then deletes the old import (`hadithJsonImport.ts:39-82`).

### [NEW] The corpus, measured (2026-11-22, on this PC, Node v22.23.1)

`npm run measure:hadith-corpus` (existing script, plain `letterFold`, cap
counted per (key, ḥadīth)):

| file | ḥadīth | Arabic | English | 4-word positions | over cap 25 | index base64 | collection in IndexedDB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bukhari | 7,277 | 7.73 MB | 3.64 MB | 500,523 | ≥16.7% | 4.24 MB | 15.62 MB |
| muslim | 7,459 | 7.17 | 3.00 | 459,534 | ≥20.1% | 3.73 | 13.90 |
| abudawud | 5,276 | 4.92 | 2.05 | 317,167 | ≥14.3% | 2.76 | 9.73 |
| tirmidhi | 4,053 | 5.40 | 1.48 | 357,149 | ≥19.1% | 2.94 | 9.82 |
| nasai | 5,768 | 4.99 | 1.93 | 323,244 | ≥19.7% | 2.64 | 9.57 |
| ibnmajah | 4,345 | 3.62 | 1.38 | 231,979 | ≥20.6% | 1.87 | 6.87 |
| malik | 1,985 | 1.71 | 1.18 | 111,624 | ≥12.9% | 0.99 | 3.88 |
| ahmed (translated part) | 1,374 | 1.50 | 0.63 | 97,017 | ≥11.4% | 0.87 | 3.01 |
| riyad_assalihin | 1,896 | 1.05 | 0.85 | 98,761 | ≥15.7% | 0.85 | 2.75 |
| nawawi40 | 42 | 0.04 | 0.02 | 2,567 | ≥5.7% | 0.02 | 0.09 |
| **ten collections** | **39,475** | **38.1 MB** | **16.2 MB** | **2,499,565** | | **20.9 MB** | **≈ 75 MB** |

(Dārimī, not registered: 3,406 ḥadīth, 0.00 MB English.) Malik has 126
ḥadīth under 4 words. Every other file has none.

A throwaway script in the session scratchpad (not committed) built the
**planned** index: letter fold, honorifics dropped from the word stream,
FNV-1a over 4-word windows, `(number << 16) | wordPosition` values, LSD radix
sort, cap at 25 distinct ḥadīth per key, base64:

| | positions | kept after cap | raw (typed arrays) | base64 | build (fold + hash + sort + cap + encode) |
| --- | --- | --- | --- | --- | --- |
| bukhari | 444,055 | 399,191 (89.9%) | 3.05 MB | 4.06 MB | 425 ms |
| muslim | 420,800 | 354,869 (84.3%) | 2.71 | 3.61 | 333 ms |
| abudawud | 289,047 | 263,198 | 2.01 | 2.68 | 233 ms |
| tirmidhi | 331,186 | 279,109 | 2.13 | 2.84 | 236 ms |
| nasai | 293,303 | 251,550 | 1.92 | 2.56 | 225 ms |
| ibnmajah | 211,120 | 179,886 | 1.37 | 1.83 | 201 ms |
| malik | 105,606 | 94,816 | 0.72 | 0.96 | 81 ms |
| ahmed | 84,475 | 81,673 | 0.62 | 0.83 | 58 ms |
| riyad | 83,644 | 80,222 | 0.61 | 0.82 | 108 ms |
| nawawi40 | 2,424 | 2,262 | 0.02 | 0.02 | 4 ms |
| **all ten** | **2,265,660** | **1,986,776** | **15.16 MB** | **20.21 MB** | **≈ 1.9 s** |

Folding is about 60% of the build time. Dropping the honorifics removes ~10%
of the positions. Further numbers from the same script:
- Memory: Bukhārī's Arabic strings take 29 MB of heap, and its folded word
  arrays add 16 MB while the build runs. Afterwards only the typed arrays are
  kept: 3.05 MB for Bukhārī, 15.2 MB for all ten.
- Decoding 4.1 MB of base64 (atob plus a byte loop) took 9 ms.
- Query cost: 175,500 binary searches over all ten indexes took 119 ms in
  total. That is ~0.7 µs a lookup, so a 60-word segment costs under 1 ms.

**How identifying an excerpt is** (random excerpts from the second half of a
ḥadīth in the six books, rule "≥ 3 shingle hits and ≥ 60% of the excerpt's
shingles"):

| excerpt | against all ten: one ḥadīth / several / none | against its own collection only: one (all correct) / several / none |
| --- | --- | --- |
| 8 words (2,977) | 57% / 41% / 3% (without the 60% rule) | 79% / 16% / 5% |
| 12 words (2,924) | 70% / 25% / 5% | **86%** / 8% / 6% |
| 20 words (2,645) | 76% / 20% / 3% | 90% / 6% / 3% |

Two things follow. First, across collections "several" is mostly the *same*
ḥadīth in more than one book, which is why families (Design 3.4) are
essential. Second, within one collection "several" is mostly the collection
repeating itself: Bukhārī gives one matn under several numbers and chains.
So scoping a tap to the sharḥ's own collection removes most ambiguity, and
in every scoped single hit the answer was the right ḥadīth. The "none" are
excerpts made only of capped formula.

None of this is a tablet measurement. Step 3 shows the build time in Settings
so the owner can read it on the tablet (M).

## Design

### 1. Fold — [approved]

A new function, not a change to `letterFold`: letter fold, then delete the
honorifics (`صلى الله عليه وسلم`, `عليه الصلاة والسلام`, `رضي الله
عنه|عنها|عنهم|عنهما`) from the folded word stream on both sides. It returns
the kept words with a map back to the original word index. `stripApparatus`
is applied only to a matn block or a `hadith` segment, never to sharḥ prose
(FOUND_ISSUES 74 and 75 apply to it). The index side keeps the isnād.
**[NEW] reason:** in a Bukhārī sharḥ the printed matn often carries the
chain («حدثنا الحميدي قال حدثنا سفيان…»). The chain shingles are what tell
Bukhārī's repetitions of one matn apart, so stripping them from the index
would turn a resolvable tap into an ambiguous one.

### 2. The index — [approved; CHANGED: per collection, lazy]

Each collection gets its own index: every folded 4-word window of every
ḥadīth, key = 32-bit FNV-1a (plain JS, trap 9), value = `(number << 16) |
wordPosition` (every collection is under 65,536 ḥadīth; the longest ḥadīth,
Muslim's, is 1,823 words). The arrays are sorted by key and binary-searched.
A key found in more than `MAX_POSTINGS` (25) distinct ḥadīth is dropped. A
hash hit is a hint, and the word comparison is the proof. Rejected as before:
a `QuranIndex`-style anchor index, and a `Map<string, number[]>` (tens of MB
of objects).

**CHANGED:** the approved text spoke of "the loaded index". It is now one
index per collection, loaded on demand and memoised per collection. A tap in
a Bukhārī sharḥ loads Bukhārī's 3 MB and nothing else. The card path loads
tiers (Design 6). Every collection loaded at once is 15.2 MB.

### 3. Matching — [approved; CHANGED: scope, repetitions, hint]

`findHadithByText(indexes, text, { mode, numberHint? })`, where `indexes` is
the list of collections to search (the **scope**):
1. Fold. Take every consecutive 4-word shingle.
2. Per candidate, take the longest ordered chain with gaps ≤ `MAX_GAP` (6).
3. Accept a chain only if it has ≥ `MIN_RUN_WORDS` (6) matched words, ≥ 3
   distinct shingle hits, and passes the posting cap. Segment mode also needs
   coverage ≥ 0.6. Scan mode needs density ≥ 0.7.
4. **Families.** Candidates whose own Arabic agrees (`agreement` ≥ 0.6 either
   way) are one family. One family means it is *the* ḥadīth. Distinct
   families covering the same words within a margin means **ambiguous**:
   never chosen.
   **CHANGED**, which member of a family is chosen:
   (a) the highest chain coverage of the query, so a printed isnād decides
   among a collection's repetitions;
   (b) then collection priority (Q3: the book's own collection, Bukhārī,
   Muslim, the rest);
   (c) then, within one collection, the member nearest to `numberHint`;
   (d) then the lowest number.
   **NEW, the hint rule:** `numberHint` (the printed or model-given number)
   only orders members that the text has already accepted. It never accepts
   a candidate and never splits two distinct families. One exception, the
   existing proof: a candidate within ±`NEIGHBOUR_WINDOW` of the hint that
   also passes `agreement` today (`chooseCandidate`). That is number plus
   text, the proof the shipped path already uses. So when two families are
   ambiguous and exactly one of them holds that candidate, it is chosen.
   **Since 2026-11-22 only for a hint in the dataset's numbering** (Riyāḍ,
   the Forty): see the owner's answer to the review of 78a5be2.
5. Result: `{ chosen, also[], ambiguous, candidates[], chain, coverageOfEntry,
   repetitions }`. `repetitions` is the number of other members of the
   chosen family in the same collection.

Thresholds are named constants with comments, tuned only by step 5 (Q10).

### 4. A partial quotation — [approved]

The whole ḥadīth's English with «Quoted in part; this is the whole ḥadīth»
(Q5). The segment's Arabic stays the book's words.

### 5. Marks — [approved] (step 6, unchanged)

### 6. [CHANGED] How the card path uses it (`enrichHadith`), for any provider

`EnrichDeps` gains `hadithScope?: string | null`: the book's collection, from
Design 8. `useTranslator` passes it at its one call site (`:412-421`). The
call site is the same for Claude and Gemini, so nothing in this path can tell
the providers apart. Check P runs the new scenario through both canned
providers to prove that.

Order for a `hadith` segment:
1. **Text, tier 1:** the indexes of `hadithScope` plus the collections the
   model's references name (`parseHadithReferences`), every one that is
   imported.
2. **Text, tier 2:** if tier 1 found nothing (not "ambiguous", *nothing*),
   every imported collection. Tiers keep the common case to one or two
   indexes in memory. Q3's priority already prefers the book's own
   collection, so the tiers cannot change which English wins. They only
   change what gets loaded.
3. **No text proof, or nothing imported:** the existing code, unchanged
   (sunnah.com by reference, then `findLocalHadith` by reference, then the
   note).
4. **Ambiguous:** Arabic, `english: ''`, and a note naming the candidates by
   collection (numbers only for citable collections). Never a guess.

**NEW, the reference shown for a text match** (follows `citableNumbers`,
which step 1 settled):
- Citable collection (Riyāḍ, the Forty): `slug:number`, as the existing local
  branch does.
- Non-citable, and the model's reference names a collection in the matched
  family: the model's reference string is kept, as today (`enrich.ts:133-135`).
- Non-citable, no model reference, or one naming another collection: the
  collection's `displayName` with no number ("Ṣaḥīḥ al-Bukhārī"), plus the
  note «Identified by its text; this dataset's numbering is not the standard
  one, so no number is given.» If the model cited another collection, the
  note also says «The model cited X.»

Unchanged from approval: nothing is written to the `hadiths` store. There is
one `recordRetrieval` per match. Text proof beats a recalled reference. A
consequence to state: when a sunnah.com key is set and the text proves a
match, sunnah.com is not called, so the card gets no "Grading:" note. The
sheet still has dorar's gradings. See Q18.

`HADITH_IMPORT_ONLY` is also used when `hadithScope` is non-citable, the
segment has no reference and nothing matched. A key cannot help there.

### 7. The offline path — [approved; CHANGED: scoped lookup]

As approved, plus (step T2): in a book with a non-citable scope, an entity
with a book-scoped reference (`<bookId>#n`) is looked up by text in that
collection, with the entity's own text and `n` as the hint. It goes into the
same `cache` map `segmentSelection` reads (`useTranslator.ts:187-200`). This
covers the matn blocks that already exist. Inline ones still need step 6.

### 8. [NEW] Recognising a sharḥ of one of the six books

A new optional registry field, `sharhTitles: string[]`, on
`HadithJsonCollection`: the title fragments a commentary on that collection
carries. The function `sharhCollectionFor(book: Pick<Book, 'title' |
'category'>): string | null` goes in `retrieval/hadithJson.ts`. It returns a
slug only when:
- `book.category` includes «شروح الحديث» (the same test that gives the book
  its `hadith-commentary` structure, so its matns are typed at all);
- exactly one collection's fragment occurs in the `normalize`d title, so a
  title naming two (e.g. a zawāʾid work) gets none;
- the collection's `citableNumbers` is false. Riyāḍ and the Forty keep their
  existing path.

Starting fragments, from the catalog titles and the usual commentary titles,
to be confirmed by the owner (Q12): Bukhārī «البخاري»; Muslim «صحيح مسلم»,
«مسلم بن الحجاج» (not «مسلم» alone, which is in hundreds of titles);
Abū Dāwūd «أبي داود», «أبى داود»; Tirmidhī «الترمذي»; Nasāʾī «النسائي»,
«المجتبى»; Ibn Mājah «ابن ماجه» (`normalize` folds ة→ه, so «ابن ماجة» is
covered).

The scope a caller uses comes from one helper in a new
`ui/reader/hadithScope.ts`:
`hadithScopeFor(book) = book.hadithCollection ?? hadithCollectionFor(book.title) ?? sharhCollectionFor(book)`.
It lives in `ui/reader` because it needs both `quran/` (for
`hadithCollectionFor`) and `retrieval/`. `retrieval` importing `quran` would
close a cycle (`quran → retrieval` exists, `npm run layers`). Nothing is
stored: no new `Book` field, nothing to go stale, and no re-detect is needed
for books already imported.

**A scope is a filter, never a proof.** A wrongly recognised book searches
one collection, finds nothing, and shows the honest note. It cannot show a
wrong English, because the text must still match.

Rejected: catalog ids. Only two of the plausible commentaries are in the
catalog, and an owner-imported sharḥ (Ibn ʿUthaymīn's on Bukhārī, ʿAwn
al-Maʿbūd, Tuḥfat al-Aḥwadhī) would be missed. An id override list can be
added if a real title is missed (Q12). Also rejected: setting
`hadithCollection` to `bukhari`. That turns every printed number into a
sunnah.com reference (`detectEntities.ts:306-310`), fetched with no text
check, and the cache key of every entity changes.

### 9. [NEW] The sheet for a sharḥ of one of the six books

`HadithQuery` (`HadithSource.ts:28`) gains `scope?: { collection: string;
numberHint?: number }`. `lookupHadith` keeps its order. The local step
becomes:
1. `findLocalHadith` by reference, as today (Riyāḍ and the Forty, number
   first);
2. if that gives null and `scope` is set: `findHadithByText([index of
   scope.collection], query.arabicText, { mode: 'segment', numberHint })`.
   For Riyāḍ and the Forty this is also the rescue for a number that does not
   confirm (Q19).

The result is laid over the returned record by `withLocalEnglish`, never
cached (the rule at `:110-113`). For a non-citable collection,
`withLocalEnglish` already leaves `number` empty and builds no URL
(`:207,214-216`). That stays.

The `HadithSheet` (`:93-101`) gets the scope from `hadithScopeFor(await
storage.getBook(entity.bookId))`. That is one read, inside the effect that
already runs the lookup, so `ReaderSheets` and `ReaderScreen` do not change.
`numberHint` is the `n` of `<bookId>#n`.

What it shows:
- **Matched:** the English, then the attribution line «sunnah.com (via
  hadith-json) · Ṣaḥīḥ al-Bukhārī, identified by its text» (the
  `HADITH_JSON_ATTRIBUTION` line at `:260`, extended). The title stays the
  book's own «Ḥadīth n» (`entity.label`, `:133`). No dataset number and no
  link. A partial match adds «Quoted in part». Repetitions add «The same
  matn appears k more times in this collection.»
- **Collection imported, nothing matched:** the amber note, with the
  key-prompt clause replaced by «No ḥadīth in the imported Ṣaḥīḥ al-Bukhārī
  matched this text.» sunnah.com is not offered, because this book's numbers
  are never sent there.
- **Ambiguous:** the amber note, «This text matches more than one ḥadīth in
  Ṣaḥīḥ al-Bukhārī, so none is shown.» Listing the candidates is step 7.
- **Collection not imported:** «Import bukhari.json (hadith-json) in Settings
  to find this ḥadīth by its text.» Read-only visitors get only the first
  sentence, as `:269-272` already decides.
- **Index being built** (first use of a collection imported before step 3):
  the spinner reads «Building the ḥadīth text index (first use)…».
- **Books with no scope:** today's text, with «for Riyāḍ aṣ-Ṣāliḥīn and
  Nawawī’s Forty» changed to «for the collection this book comments on».
  The `HADITH_SOURCES` note (`HadithSource.ts:82`) is brought up to the ten
  collections. Both are in step T3.

Offline: the index and the English are in IndexedDB, so the match works with
no network. dorar is skipped offline as today (`:122-125`). The sheet shows
English with no grading.

### Where the index lives — [approved; numbers now measured]

The index goes in the QUL resource store as extra rows under the same
hadith-json resource, keyed `idx:<slug>:<part>` (16 parts by the top 4 key
bits). The value is a new `QulEntryValue` variant `HadithIndexPart` (`t:
'hadith-index'`, `v: INDEX_VERSION`, base64 keys and values). Answers to the
owner's sizing questions:

- **Schema change: none.** No store, index or key path changes, so trap 6
  does not apply and `DB_VERSION` stays 11. `QulEntryValue` is a TypeScript
  union. Nothing switches on `t` exhaustively (`qul/service.ts` tests each
  `t` it wants). `entryCount` stays the ḥadīth count. The index keys cannot
  collide with `slug:n`. Check D must come out identical, which proves it.
- **IndexedDB size:** +20.2 MB of base64 for all ten (Bukhārī 4.1 MB), on top
  of ~54 MB of Arabic and English. That is ≈ 75 MB with every collection
  imported. The whole-tablet transfer grows by the same amount (Q17).
- **Memory:** 3.05 MB of typed arrays per Bukhārī-sized collection, and
  15.2 MB for all ten. The build adds ~45 MB of transient heap for Bukhārī
  (strings plus word arrays). On import the parsed file is in memory anyway.
- **Build time:** 0.06–0.43 s per collection, 1.9 s for all ten, on this PC (the radix-sort prototype; the built code takes 2.5–3.1 s, see "Step 2 — built").
  The tablet is unmeasured: Settings shows "built in N s" so the owner reads
  the real number (M).
- **When it is built:** at import, from the entries already in memory,
  written before the resource row (the order rule at
  `hadithJsonImport.ts:31-38`). It is built in chunks of 500 ḥadīth with a
  yield between them (`lib/delay`), so the import screen keeps painting. It
  **self-heals** for collections imported before this change (the owner's
  tablet has some already): on first need the rows are read with
  `getQulEntries` in batches of 500 keys and the index is built and written.
  A part with another `INDEX_VERSION` is rebuilt the same way.
- **Loaded:** lazily, per collection, memoised on `(resource.id,
  importedAt)`. Deleting or re-importing a collection invalidates it, and the
  range delete removes the index with the English (the rule at
  `HadithSource.ts:110-113`). Not in per-book backups (QUL stores are not),
  which is right for derived data.

### Placement — [approved]

Steps 2–4 do it at translation, step 6 at detection, and steps T1–T2 at tap.
**CHANGED:** the approved plan rejected at-tap because it "cannot make
anything tappable". For the six books the matn blocks are already tappable
(Current state), so the lookup at tap is exactly what is missing.

### Layer edges — [CHANGED]

`node scripts/check-layers.mjs` at 83ae9d2: no cycle, no mutual import, "all
rules hold" (11). Edges added: **none at directory level.**
- `retrieval/hadithText.ts` → `lib` (`arabic`, `hash`-style FNV, `delay`),
  `platform/storage` (type) and `types`: all exist.
- `ui/reader/hadithScope.ts` → `quran` and `retrieval`: both exist
  (`ui/reader: quran 5, retrieval 8`).
- Step 6 `quran` → `retrieval`: exists.
- **Rule:** `retrieval` must not import `quran`. That would make the
  `quran ↔ retrieval` cycle `--check` fails on, and it is why the scope
  helper is in `ui/reader`.

`npm run layers -- --check` runs after every step.

## Steps

| # | step | status | files | what changes | checks | risk |
| --- | --- | --- | --- | --- | --- | --- |
| 0a | Inspect the 56 | open (owner) | none | owner reads the device report | M | none |
| 0b | Classify the 56 | done, PR #18 | | | | |
| 1 | Register, measure | done, PRs #18, #22 | | | | |
| 2 | Pure matcher | CHANGED | new `retrieval/hadithText.ts`, new `scripts/verify-hadith-text.ts`, `package.json` | fold, per-collection index, query with scope, families incl. repetitions, hint rule | T B L H | thresholds R1, hint R15 |
| 3 | Persist, load, self-heal | CHANGED | `types/qul.ts`, new `retrieval/hadithTextIndex.ts`, `retrieval/hadithJsonImport.ts`, `ui/settings/HadithJsonResources.tsx` | rows in QUL store; chunked build; per-collection lazy load; Settings status + build time | T B L H D U M | R4, R13, R14 |
| 4a | Recognise the sharḥ's collection | NEW | `retrieval/hadithJson.ts` (`sharhTitles`, `sharhCollectionFor`), new `ui/reader/hadithScope.ts` | the scope function; no caller but H | T B L H | R11 |
| 4b | Card path | CHANGED | `retrieval/enrich.ts`, `ui/reader/useTranslator.ts` (pass `hadithScope`), `scripts/verify-translate.mjs` + `phase5/translate.json` | text tiers before reference; reference display rule | T B L H P Q S R V M | R1, R2, R16 |
| T1 | Sheet: text lookup in the scope | NEW | `retrieval/HadithSource.ts`, `ui/reader/HadithSheet.tsx`, `scripts/verify-markup.mjs` + baseline, `verify-translate.mjs` | scoped text lookup; new sheet states | T B L H P U S R M | R6, R11, R12 |
| T2 | Offline: scoped lookup | NEW | `ui/reader/useTranslator.ts` (`runOffline`), `verify-translate.mjs` | book-scoped refs found by text | T B L P S R M | R5-offline |
| T3 | Copy | NEW | `ui/reader/HadithSheet.tsx`, `retrieval/HadithSource.ts:82` | hint and source note name the ten | T B U | none |
| 5 | Measure on real data | CHANGED | new `scripts/report-hadith-text.ts`, `retrieval/hadithJsonReport.ts`, `HadithJsonResources.tsx` | + text report for scoped books on device | T V M | none |
| 6 | Marks and offline | approved | as approved | | T B L S R U P D H V M | R5 |
| 7 | Sheet candidates, dorar cache | approved (+ scoped candidates) | as approved | | T B L U P M | R6 |

Order: 2 → 3 → 4a → 4b → T1 → T2 → T3 → 5 → (owner) → 6 → 7. Each is one
commit, reviewed by `torjuman-reviewer` before the next. When a check needs
re-baselining, the baseline goes in a second commit of the same step, as
PR #18 and PR #22 did. Steps 4b and T1 are independent once 4a is in. Q14
asks which goes first. None of these is a restructure step, but each commit
still changes one thing.

## Per step

### Step 2 — the pure matcher [CHANGED]

`retrieval/hadithText.ts`: `foldForMatch` (with the word map),
`buildHadithIndex(slug, entries, { onChunk? })` (one collection; it yields
between chunks when given `onChunk`), and `findHadithByText(indexes, text,
options)`. All are pure: no storage, no React. No existing function changes.

Check H (`npm run verify:hadith-text`, `vite build --ssr` like
`verify:requests`, runs anywhere, synthetic corpora written in the file). The
approved cases stay: lead-in, bare, woven; ﷺ against spelled out; a gap; a
prefix; a different order; formula only (must not match); one family across
two collections (priority, `also`); two families sharing a wording
(ambiguous); under the minimum run; a forced hash collision; the word-map
round trip. **New cases:**
- a collection that repeats one matn under three numbers with different
  chains: a query with chain A picks A, and a query without a chain picks the
  one nearest the hint;
- a hint 300 away still orders members but never makes a no-match match;
- two families where one holds a candidate within ±10 of the hint that
  passes `agreement`: that one is chosen, and with the hint moved away the
  result is ambiguous;
- a scope that excludes the right collection gives no match, not a wrong
  one;
- a collection with entries under 4 words (Malik has 126) neither crashes
  nor matches on them.

Checks: T, B, L, H. No reader code.

**Step 2 — built, and what real data changed (2026-11-22).** Measured with a
throwaway script (not committed) that built all ten indexes on this PC and
looked up 100 random 12-word excerpts per collection, once in the excerpt's
own collection and once across all ten. Build: 2.5–3.1 s for all ten, Muslim
the slowest at 0.66 s. Query: 0.2–0.5 ms.

The first build matched **isnād-only excerpts to a different ḥadīth** with the
same chain: 5 of 1,000 across all ten, every one on a chain of narrators
alone. A Muslim sharḥ prints chain-only «ح وحدثنا» blocks, so this would
happen on real taps. Two rules were added beyond Design 3:
- **The posting cap is applied again over the whole scope at query time.** A
  chain under the cap in each file can still be in a hundred ḥadīth between
  them.
- **`MIN_MATN_WORDS` (6): the chain must cover six words past the entry's
  isnād** (`isnadEnd`, a heuristic: a run of transmission words from a chain
  opener, ending at the Prophet's mention right after a link). The isnād
  still counts toward coverage, so it still decides among repetitions.

Afterwards, own collection, excerpts the heuristic says hold matn: 557 one
ḥadīth, 17 ambiguous, 131 none (too few matn words past the chain), 2
different. One of the 2 is a near-identical repetition in Mālik and one a
chain match. Across all ten: 8 counted different, of which 6 are the same
ḥadīth quoted in Riyāḍ or the Forty with «النبي» for «رسول الله» or similar.
The rest are chain matches in two layouts the heuristic misses: a second
chain printed after the matn (Ibn Mājah, Muslim) and an entry opening «قال
أبو داود». These are for step 5 to count on real sharḥ queries; random
excerpts land in chains far more often than a matn block does.

Without the scope cap (MIN_MATN_WORDS kept), across all ten: 17 different
instead of 8, and 119 none instead of 134. The cap is kept. Searching one
collection it changes nothing. These two rules were added after approval and
are put to the owner before step 4b relies on them (review of 87b1ce8).

Result shape, against Design 3.5: the spans (`queryStart…entryEnd`) and
`coverageOfEntry` are on each candidate, not in a separate `chain` field, and
`contenders` lists the best member of each family in an ambiguity.

### Step 3 — persist, load, self-heal [CHANGED]

As approved (`HadithIndexPart`, `encodePart`/`decodePart`, `writeIndex`
called from `commitHadithJsonImport` before the resource row, partial rows
removed on failure). **Changes:**
- `loadHadithIndexes(storage, slugs)`: per collection and memoised. It
  builds from the rows when parts are missing or stale and reports progress
  to a callback.
- The build yields every 500 ḥadīth, and the elapsed time is stored on part
  0 (`builtMs`).
- The resource line in Settings → Ḥadīth English gains «text index: N
  positions, built in X s on this device», or «not built yet — built on first
  use». That is how the owner reads the tablet number.
- The loader takes collections from the stored resources
  (`resource.collection`), not the registry, so check P can seed a synthetic
  collection.

H gains an encode → `JSON.stringify` → parse → decode round trip (the
whole-tablet transfer is NDJSON) and a test that a part with another `v` is
rejected. D must come out **identical** to `phase4/storage.json`, which
proves that no schema or adapter method moved. U changes: the Settings line
is new markup, so the re-baseline goes in a separate commit with the
screenshots in the PR. Gap: D imports no hadith-json file, so the transfer of
a tablet holding the index is a tablet check (M).

**Step 3 — built (2026-11-22), and what the review of e73152a added.**
- U: no capture imported a hadith-json collection, so the new index line
  rendered nowhere. Added `settings--hadith-english--imported` (two synthetic
  resources, one index part 0 with made-up counts). Found while doing it: the
  Ḥadīth English section's own capture (`settings--hadith-english-hadith-json`)
  was never in the manifest since PR #16 added the section; earlier runs
  reported it as "not in the manifest", which the "differs" filter hid. Both
  are baselined (.html only, as before; PNGs differ on this PC throughout).
- "Built on first use" in Settings is true only once a caller loads indexes
  (4b, T1). **The PR is not merged or tagged before 4b is in it.**
- A rebuild that finds fewer rows than `entryCount` throws rather than
  storing a partial index.
- For 4b and T1: a self-heal running while its collection is removed or
  replaced writes its sixteen parts after the purge, as rows with no
  resource, which Remove can then never clear. The caller must re-check the
  resource before writing, or the loader must (fix with the first caller).
- The comparator sort, posting-cap pass and encode run without a yield after
  the last chunk: about 0.5 s on this PC for Bukhārī, unmeasured on the
  tablet (M). The spinner then sits near its last count.
- Settings' build time is the time on the device that built the index; after
  a whole-tablet transfer it is the other device's.

### Step 4a — recognising the sharḥ's collection [NEW]

`sharhTitles` on the six non-citable entries of `HADITH_JSON_COLLECTIONS`
and `sharhCollectionFor`, in `hadithJson.ts`. `hadithScopeFor` goes in
`ui/reader/hadithScope.ts`. H gets title cases built from **titles only**
(metadata already committed in `public/catalog.json`, not book text):
- «فتح الباري بشرح البخاري» with the category gives `bukhari`; the same
  title without the category gives null;
- «المنهاج شرح صحيح مسلم بن الحجاج» gives `muslim`;
- «شرح رياض الصالحين» gives null here (the citable path handles it);
- a title naming two collections gives null;
- a title that merely contains «مسلم» gives null.

Checks: T, B, L, H. No reader behaviour yet (the helper has no caller).

### Step 4b — card path [CHANGED]

`enrichHadith` follows Design 6. `useTranslator` reads the book once per
translation (`storage.getBook(bookId)`) and passes
`hadithScope: hadithScopeFor(book)`. That is one line at `:412-421`, plus the
read.

Check P gets a synthetic collection seeded into the QUL store (rows and a
resource, slug `bukhari`, invented matns), and a synthetic sharḥ titled with
a Bukhārī fragment in «شروح الحديث». The scenario runs **once with the canned
Gemini response and once with the canned Anthropic response**. Each canned
answer has a `hadith` segment (a) with no reference, (b) with «Ṣaḥīḥ
al-Bukhārī 9999» (wildly off), and (c) for an ambiguous wording. It asserts:
- `source: 'hadith-json'` with the English and the reference rule (display
  name, no number) for (a) and (b);
- the ambiguity note for (c);
- the `hadiths` store unchanged;
- the `cacheKey` unchanged by importing the collection;
- no request to sunnah.com when the text proves the match.

Check Q stays byte-identical (no request changes). S and R run because
`useTranslator.ts` is reader code, though only its enrich call changes. V
runs on this PC (the fixtures are junctioned into the worktree; it fails at
once in the cloud container), because `verify-parsers.ts` covers `enrich.ts`
(971 checks at PR #22).

### Step T1 — the sheet looks a ḥadīth up by text in the book's collection [NEW]

`HadithSource.ts`: `HadithQuery.scope`; the scoped text step after
`findLocalHadith`; `withLocalEnglish` takes the text match (its `citable`
flag decides number and URL, as now). `HadithSheet.tsx`: compute the scope,
pass it, and render the states in Design 9.

Callers: `lookupHadith` has one caller (`HadithSheet.tsx:93`), so `scope`
stays optional and other paths are untouched.

Checks:
- U: new captures of the sheet for a synthetic scoped book (matched, no
  match, ambiguous, not imported), re-baselined in a second commit with
  screenshots at 960×600 and 600×960;
- P: the tap scenario (the sheet shows the English, and the `hadiths` row
  written for the dorar answer carries no English: the "never cached" rule);
- S and R (reader code);
- H for the scoped query.

Tablet (M): a tap in a real sharḥ of each imported book, online and in
airplane mode, in Chrome and DuckDuckGo.

### Step T2 — the on-device path finds the same ḥadīth [NEW]

`runOffline`: for entities whose reference is book-scoped in a book with a
non-citable scope, look up by text with the entity's own text (the matn
block; for step 6 entities, the span). The result goes in `cache` with
`source: 'hadith-json'`. P: the on-device scenario on the scoped synthetic
book gets a `hadith` segment with the English and no model call for it.
Checks: T, B, L, P, S, R. Tablet (M): the on-device translator on a real
passage.

**As built (b7583a3, and the review of it).**
- The text search runs for any ḥadīth reference the cache and the number
  path both miss in a book with a collection, the same as the sheet: so
  also a Riyāḍ or Forty number that does not confirm (the Q19 rescue,
  applied to the on-device path as to the tap). Its hint is then in the
  dataset's numbering and may settle a tie.
- **P cannot carry the planned scenario:** `translateProse` loads the model
  even for an empty span list, and P refuses the download, so no on-device
  card completes there. Replaced by H cases that call `lookupByText` the
  way `runOffline` does (hint from the reference, the block's whole text):
  same English as the sheet, a miss, a collection not imported. The hook's
  ordering and its cache map stay verified by reading, and on the tablet.
- Unnumbered matns (no reference) are still skipped on device, as before;
  the sheet searches them. The query is the matn block's whole text: right
  for today's entities, which span their one block; step 6's inline
  entities must pass their span instead.
- M also gains: the first on-device translation in a scoped book may build
  the index (self-heal) with no progress shown on the card.

### Step T3 — the copy [NEW]

The `HadithSheet` key-prompt clause (`:282`) and the `HADITH_SOURCES` note
(`HadithSource.ts:82`) name the ten collections, or "the collection this book
comments on". The text-only change re-baselines U. Checks: T, B, U.

### Step 5 — measure on real data [CHANGED]

As approved, plus: the device report in Settings
(`HadithJsonResources.tsx:93-103`) also lists books recognised by
`sharhCollectionFor`. For them it runs the **text** matcher scoped to their
collection over every numbered matn. It reports:
- matched, ambiguous and none;
- the repetition rate;
- the offset between the printed number and the matched dataset number. That
  makes the drift visible (Bukhārī: up to 286 by the end) and shows whether
  a later number map would be worth it.
- the count of unnumbered matn blocks (which decides Q15 / step 6).

Real text stays on the owner's screen. Checks: T, V (`report:hadith-text` on
this PC), M.

### Steps 6 and 7 — [approved]

Unchanged, except that step 7's candidate list also serves the scoped
ambiguous state from T1, and step 6's scan in a scoped book searches the
scoped collection first (tier 1) and then all.

## Checks

Letters from `docs/refactor/RESTRUCTURE.md` §5, plus **H**
(`npm run verify:hadith-text`, new in step 2, synthetic, runs anywhere) and M
(the tablet). V runs on this PC, where the fixtures are junctioned; in the
cloud container it fails at once on the missing `fixtures/`, as expected.

| Step | T | B | L | S | R | U | Q | P | D | H | V | M |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | ✓ | ✓ | ✓ | | | | | | | ✓ | | |
| 3 | ✓ | ✓ | ✓ | | | re-baseline | | | identical | ✓ | | ✓ |
| 4a | ✓ | ✓ | ✓ | | | | | | | ✓ | | |
| 4b | ✓ | ✓ | ✓ | ✓ | ✓ | | identical | ✓ (+ scenario, both providers) | | ✓ | ✓ | ✓ |
| T1 | ✓ | ✓ | ✓ | ✓ | ✓ | re-baseline | | ✓ (+ scenario) | | ✓ | | ✓ |
| T2 | ✓ | ✓ | ✓ | ✓ | ✓ | | | ✓ (+ scenario) | | | | ✓ |
| T3 | ✓ | ✓ | | | | re-baseline | | | | | | |
| 5 | ✓ | | | | | | | | | | ✓ (report) | ✓ |
| 6, 7 | as approved | | | | | | | | | | | |

`torjuman-reviewer` runs after every step. B: the main chunk should grow
only by the matcher and loader code, and no index data ends up in a bundle.

**Only the tablet can show (M):**
- the index build time on import of `bukhari.json` and `muslim.json` (read
  from the new Settings line), and whether the import screen stays
  responsive during it;
- that self-heal on the first tap after updating (collections already
  imported) finishes behind the spinner;
- that with all ten loaded (≈ 15 MB of arrays) the tab survives in Chrome
  and DuckDuckGo;
- that a whole-tablet transfer with the index (≈ +20 MB) completes, through
  the relay in DuckDuckGo;
- taps in a real sharḥ of each of the six books, online and in airplane
  mode;
- that the matn blocks of those sharḥs are typed `hadith_matn` at all. No
  fixture of 1673 or 1711 exists, so `structure.ts`'s `NARRATOR_OPENING` on
  «حدثنا …» is unverified here;
- a real Claude and a real Gemini translation of each of the three shapes.

## Risks

- **R1 [approved]** A wrong ḥadīth's English under a quotation. Caught by the
  cap, the run, the order and coverage rules, families, H, and step 5's
  reading.
- **R2 [approved]** Formulaic openings. Listed as ambiguous, not chosen.
- **R3 [CHANGED]** Numbering. Settled by step 1: only Riyāḍ and the Forty are
  citable. The display rule (Design 6, 9) never prints a dataset position as
  a citation, and H and P assert it.
- **R4 [approved]** JSON-safety, `INDEX_VERSION`, interrupted builds. H round
  trip, D identical, tablet transfer.
- **R5 [approved]** Marks noise and performance in step 6.
- **R6 [approved]** dorar cache pollution for fragments. T1 caches dorar
  under the book-scoped reference with the book's whole matn block, as today,
  so it adds no fragment. Step 7 handles step 6's fragments.
- **R7, R8, R10 [approved]** Stale cards, imported English inside cards,
  `stripApparatus` on segments.
- **R9 [CHANGED]** Memory: measured as 15.2 MB of arrays for all ten, and
  lazily one or two per use. Tablet check.
- **R11 [NEW]** A book misrecognised as a sharḥ of collection X. The scope is
  a filter, not a proof, so the result is a no-match note, never a wrong
  English. H has the title cases. The owner confirms the fragments (Q12).
- **R12 [NEW]** A repetition chosen instead of the one the book prints
  (different chain, so a different English narrator line). Coverage of a
  printed chain decides first, and the sheet says «appears k more times».
  The matn is the same. Step 5 measures the repetition rate.
- **R13 [NEW]** The build stalls the import screen on the tablet. It is
  chunked with yields, the time is shown, and it is measured on the tablet.
- **R14 [NEW]** IndexedDB growth (≈ +20 MB) and a larger whole-tablet
  transfer. Measured; Q17.
- **R15 [NEW]** A number accepted as proof by accident (the hint rule). H has
  cases for a hint 300 away and for two families plus a hint.
- **R16 [NEW]** Provider dependence creeping in. P runs the scenario with
  both canned providers, and `enrich.ts` reads no provider id (the reviewer
  checks the diff).
- **R17 [NEW]** Matn blocks in a six-book sharḥ not typed `hadith_matn` by
  the parser, so nothing is tappable whatever this change does. That is
  outside this plan, and the tablet shows it. If it happens it goes in
  FOUND_ISSUES with the page number, not the text.

## Questions

Q1–Q10 are answered (below). New questions, Q11–Q19:

**Q11. Which books will you tap in?** Fatḥ al-Bārī (1673) and al-Minhāj
(1711) come from the catalog as reference works, which never open in the
library. So T1 only helps for a sharḥ you read as a book. Do you read one of
those two, or another sharḥ (Ibn ʿUthaymīn on Bukhārī, ʿAwn al-Maʿbūd,
Tuḥfat al-Aḥwadhī…)? Tell me their titles. *Recommend:* build T1 on the
general rule, and add your exact titles to H. Making reference works
readable would be its own change.

**Q12. How a sharḥ is recognised.** Shamela category «شروح الحديث» plus a
title fragment (Design 8), a list of Shamela ids, or a per-book picker in
Settings? *Recommend the category and title rule*, with the fragments in
Design 8 (you confirm or correct them), and an id override only if a real
title is missed. A wrong recognition only yields the honest note (R11).

**Q13. What a text match in a non-citable collection shows as its
reference.** The collection name with no number (with the model's reference
kept when it names the same collection), or the dataset position labelled
«hadith-json position N, not the standard number»? *Recommend the name with
no number*. The position is not something you can cite or look up, and on
sunnah.com it opens a different ḥadīth.

**Q14. Order:** cards (4b) before taps (T1), or taps first? *Recommend 4b
first.* It is the approved primary, and T1 reuses its index loader, tested by
then.

**Q15. Unnumbered matn blocks in those sharḥs.** Leave them untappable until
step 6 (approved path), or make them tappable now with a book-scoped
reference per block? *Recommend leaving them to step 6.* Step 5 counts them
first, and making them tappable changes detection, which needs a re-detect
of every book.

**Q16. Sharḥs of Mālik and Aḥmad** (al-Tamhīd, al-Muntaqā…): recognise them
now? *Recommend not now*, since you asked for the six. Each would be one
`sharhTitles` line later.

**Q17. The index in the whole-tablet transfer** (≈ +20 MB with all ten):
copy it as it is, or leave it out and let the receiving tablet rebuild it?
*Recommend copying it.* Leaving it out means changing the raw-copy transfer
(trap 6's "copies every store raw"), and the receiving tablet would rebuild
on first use anyway.

**Q18. Text proof against sunnah.com when a key is set.** The approved order
uses the imported English when the text proves the ḥadīth and does not call
sunnah.com, so the card loses sunnah.com's "Grading:" note (the sheet still
shows dorar's gradings). Keep that, or also call sunnah.com for the grading
when the model's reference names the matched collection? *Recommend keeping
it.* It saves the key, the English is the same text, and a sunnah.com
answer for a model-recalled number could grade a different ḥadīth.

**Q19. Rescue Riyāḍ's and the Forty's non-confirming numbers by text at
tap time** (T1 tries text in the same collection when the number fails).
Approved Q7 said step 6 rescues them. This rescues them earlier, at the
sheet, with no detection change and `agreement()` untouched. *Recommend
yes*: it is the same function and no extra step, and it covers the 56 in
book 9260 the device report lists.

## Owner's answers

Q1–Q10: the owner answered "go with the recommendations" on 2026-11-20, so
each question is answered as its own recommendation says: Q1 Claude path
(steps 2–4) first, marks decided after step 5; Q2 the QUL resource store; Q3
the book's own collection, then Bukhārī, Muslim, the rest; Q4 count
prose-woven ḥadīth before scanning prose; Q5 the whole English with a "quoted
in part" note; Q6 decide after step 1's measurement; Q7 leave `agreement()`
alone, step 6 rescues cut matns; Q8 a free "re-enrich this card" action, as a
separate change; Q9 Bukhārī and Muslim first (download approved); Q10
thresholds accepted as starting values.

Since then (recorded from the merged PRs, not new answers): Q6 resolved by
step 1, all non-citable except Riyāḍ and the Forty; Q9 overtaken by PR #22,
the other six registered, Dārimī left out; Mālik and Aḥmad never fetched from
sunnah.com (owner's decision, 2026-11-22).

Q11–Q19: the owner answered "go with them" on 2026-11-22, so Q12–Q19 are
answered as their recommendations say: Q12 the category plus title-fragment
rule of Design 8, with an id override only if a real title is missed; Q13 the
collection name with no number, keeping the model's reference when it names
the same collection; Q14 cards (4b) before taps (T1); Q15 unnumbered matn
blocks left to step 6; Q16 no sharḥs of Mālik or Aḥmad now; Q17 the index
copied as it is in the whole-tablet transfer; Q18 no sunnah.com call when the
text proves the ḥadīth; Q19 yes, rescue Riyāḍ's and the Forty's
non-confirming numbers by text at tap time. Q11 (which sharḥs the owner reads
as books) has no titles yet: T1 is built on the general rule, and the owner's
exact titles go into check H when given.

The two acceptance rules added in step 2 (the posting cap across the scope,
and `MIN_MATN_WORDS` past `isnadEnd`): the owner answered "keep both" on
2026-11-22, with the measurements of the "Step 2 — built" paragraph in front
of them. Step 5 measures them on real sharḥ queries.

From the review of e23fe93 (step 4b), the owner answered on 2026-11-22:
- **A text match under a far-off citation.** The model's reference is kept
  only when it names a collection the matched ḥadīth is in with a number
  within ±`NEIGHBOUR_WINDOW` of the dataset's position (the proof the number
  path accepts). Otherwise the card shows the collection's name, the by-text
  note and «The model cited …». So «Ṣaḥīḥ al-Bukhārī 9999» is never shown
  above English found by text. (This settles the conflict between Design 6's
  "kept, as today" and the step 4b bullet.)
- **An ambiguous text match when the model cited a collection that was not
  searched** (not imported, or failed to load) falls through to the old
  reference path, sunnah.com included, instead of ending as "none is shown".
  An ambiguity among collections the citation names still ends the search.

From the review of 78a5be2 (step T1), the owner answered on 2026-11-22:
- **No tie-break by number in the six main books.** The ±`NEIGHBOUR_WINDOW`
  exception (Design 3.4) settles two near-equally matching families only
  when the hint is in the dataset's numbering (`NumberHint.inDatasetNumbering`,
  true for citable collections: Riyāḍ and the Forty). A Bukhārī or Muslim
  number — printed in a sharḥ or given by the model — still orders the copies
  of one ḥadīth but never chooses between two; those stay ambiguous. A Riyāḍ
  or Forty number, printed or given by the model, still may. Applies to the
  card path and the sheet alike.

Recorded, not asked: the tiers are not a pure load optimisation (Design 6
said "cannot change which English wins"). A tier-1 answer can differ from
one pass over all: a fuller copy in an unsearched collection, a rival family
there, and the scope-wide posting cap and candidate cut all depend on what
is searched. That is intended; the comment in `enrich.ts` says so. A storage
error in the text search now falls back to the reference path instead of
failing a paid card.

Step 0a: the 56 unmatched numbers of book 9260, and what each one looked like:
(left empty for the owner; the device report from step 0b gives a reason per
number)

## Step 1 — measured (2026-11-20, `npm run measure:hadith-corpus`) [approved record]

| file | ḥadīth | Arabic | English | 4-word positions | dropped by the cap of 25 | index (base64) | in IndexedDB |
| --- | --- | --- | --- | --- | --- | --- | --- |
| bukhari.json | 7,277 | 7.73 MB | 3.64 MB | 500,523 | 16.7% | 4.24 MB | 15.6 MB |
| muslim.json | 7,459 | 7.17 MB | 3.00 MB | 459,534 | 20.1% | 3.73 MB | 13.9 MB |
| riyad_assalihin.json | 1,896 | 1.05 MB | 0.85 MB | 98,761 | 15.7% | 0.85 MB | 2.75 MB |
| nawawi40.json | 42 | 0.04 MB | 0.02 MB | 2,567 | 5.7% | 0.02 MB | 0.09 MB |

The other six files were measured on 2026-11-22. All ten are in "The corpus,
measured" above.

Numbering (Q6):
- **Bukhārī:** `idInBook` is continuous and in chapter order, and the
  importer's number equals it. It matches the standard at the start but
  drifts to 286 behind by the end (7,277 against 7,563; the closing ḥadīth is
  7277, its earlier occurrences 6167 and 6438 against standard 6406 and 6682).
- **Muslim:** chapter 0 is listed last. Neither `idInBook` nor the importer's
  number is the standard (the five pillars, standard 16, are 110–112).
- **The other six (2026-11-22):** `idInBook` is unique and continuous in
  every file. Ibn Mājah lists chapter 0 last. None was checked against a
  standard numbering. All are registered `citableNumbers: false`. Anchors:
  «إنما الأعمال بالنيات» is Abū Dāwūd 2202 and Ibn Mājah 4231 by the
  importer's number.
