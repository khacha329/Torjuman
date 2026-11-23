# Find a ḥadīth from a short quotation, and say truthfully why one was not found

Status: approved by the owner on 2026-11-23 ("go with them")
Base commit: 1496432 (main, PR #25 merged)   Branch: claude/hadith-short-quote

All `file:line` references are at 1496432. The model for this plan's format
is `docs/plans/hadith-text-matching.md`; its Design 3 (matching), Design 6
(the card path) and the owner's answers of 2026-11-22 and 2026-11-23 are the
decisions this plan builds on.

## Goal

The owner's case, on the tablet. Gemini Flash Lite translated a passage of a
sharḥ of the Forty (ḥadīth 4, Ibn Masʿūd). One `hadith` segment was the
three-word quotation «إنما الأعمال بالخواتيم», with the model's reference
Bukhārī 6607, taken from the book's footnote. The card showed no English and
the note HADITH_NEEDS_KEY ("sunnah.com requires an API key…"), although
Bukhārī is imported. The same passage's Muslim quotation was matched by text
correctly; that path is left alone.

The owner asked for two things:

1. **Short-quote search.** When a quotation is too short for the text search,
   search the cited collection (perhaps the scope) for entries that contain
   the exact phrase after `lib/arabic.ts` normalisation, and accept only when
   exactly one ḥadīth (family) contains it.
2. **A truthful note** when the cited or scoped collection is imported but
   nothing matched: say the quotation was too short, or that the number does
   not match the file, instead of HADITH_NEEDS_KEY or HADITH_UNAVAILABLE. Keep
   the sunnah.com key note where a key could actually help.

**Done when:**
- the owner's case, retranslated, shows Bukhārī's English under «Ṣaḥīḥ
  al-Bukhārī» (no number: 241 from the cited one), with notes saying it was
  identified by a short quotation and that the model cited Bukhārī 6607;
- a short phrase that occurs in more than one ḥadīth family of the cited
  collection, or in more than 25 ḥadīth, or nowhere near the cited number, is
  refused, and the card says which of those it was;
- a card whose cited collection is imported never blames the missing
  sunnah.com key alone; the key is still mentioned where sunnah.com would be
  asked for that number;
- a tap and an on-device translation of the same short quotation find the
  same ḥadīth as the card (the owner's Q19 decision: they keep agreeing);
- checks H, P, V and the others named below pass, and the owner has seen the
  owner's case on the tablet.

## Not doing

- The long-quote path: `findHadithByText` and its constants
  (`hadithText.ts:85-134`), `agreement`/`agrees`, `chooseCandidate`'s ±10
  rule, and the existing `shortQuoteHolds` at the exact number
  (`hadithJson.ts:471`) are unchanged (Q9).
- No new stored index, no `INDEX_VERSION` bump, no new store, no
  `DB_VERSION` change: the search reads the ḥadīth rows that are already
  stored (Design 4).
- No acceptance from the scope alone, without a cited number (measured:
  Design 2, Q2).
- No drift window for Muslim or the six books whose drift was never measured;
  they keep ±10 (Q1, Q13).
- Quotations of six or more words that the text search refuses for
  `MIN_MATN_WORDS` (a chain-heavy short matn) are not rescued here.
- No "re-enrich this card" action (still the separate change of the old Q8).
  Cards already made keep their old notes until retranslated (Q12).
- No marks (the old plan's step 6), no change to the translation cache key
  (trap 5: enrichment runs after the model; the key's inputs are untouched),
  nothing written to the `hadiths` store.

## Current state (at 1496432)

**Why the owner's card has no English** (measured on this PC, Node v22.23.1,
with the real `hadith-json/` files; only counts below):

1. `enrichHadith` (`retrieval/enrich.ts:131`) tries the text first:
   `enrichHadithByText` (`:270`) → `searchHadithText`
   (`hadithTextIndex.ts:377`) → `findHadithByText` → `matchPass`
   (`hadithText.ts:697`), which returns nothing for a query under
   `MIN_RUN_WORDS` 6 (`:85`, `:703`); its index windows are four words
   (`SHINGLE_WORDS`, `:69`), and a chain needs `MIN_MATN_WORDS` 6 past the
   isnād (`:105`). Three words cannot pass.
2. sunnah.com (`enrich.ts:162-165`): no key, so `fetchHadith` returns null
   (`sunnah.ts:165`).
3. The number path: `findLocalHadith(storage, 'bukhari:6607', arabic)`
   (`enrich.ts:172-179`, `hadithJson.ts:564`) reads 6597–6617 and calls
   `chooseCandidate` (`:512`). At 6607 `agreement` tries no shingle (three
   words), and `shortQuoteHolds` (`:471`) checks only 6607 itself. The only
   entry with the phrase is dataset number 6366 (array index 6365, idInBook
   6366): **241 behind the cited number**, far outside `NEIGHBOUR_WINDOW` 10
   (`:409`).
4. **And even at 6366 the phrase does not match as typed.** The dataset's
   copy has a conjunction fused to the first word («و» + «إنما»). As a strict
   word-bounded phrase, the folded quotation is in **0** Bukhārī entries;
   allowing «و» or «ف» on the first word only, it is in **1** (6366), one
   family, in the matn (the phrase ends at word 137 of 138; the isnād ends at
   word 32), 20 letters. It is in no other collection. So the search must
   tolerate that one proclitic (Design 1).
5. The note (`enrich.ts:193-211`): references exist, Bukhārī is not in
   `SUNNAH_COM_SKIPPED` (`sunnah.ts:89`), no key, so HADITH_NEEDS_KEY
   (`:49`). Nothing on that path knows that Bukhārī was imported and
   searched.

**The extension points.**
- `enrich.ts`: `enrichHadith` (`:131`), the reference path and note
  (`:161-212`), `enrichHadithByText`'s labelling (`:340-395`), the note
  constants (`:43-69`).
- `HadithSource.ts`: `lookupHadith`'s `findLocalHadith` for the entity's
  reference (`:147-149`), `lookupByText` for the book's scope with the
  printed number as `numberHint` (`:261-313`), `TextLookup` (`:59-61`).
- `ui/reader/useTranslator.ts:192-206`: the on-device path, the same two
  calls (`findLocalHadith`, then `lookupByText`).
- `ui/reader/HadithSheet.tsx:159-162` (`scopedMiss`) and `:323-347` (the
  sheet's copy for a scoped miss).
- `hadithJson.ts:48-85`: the collection registry (`HadithJsonCollection`),
  where a per-collection window belongs.
- `hadithTextIndex.ts:202-232`: `readEntries`, the batched read of every row
  of a collection (500 per transaction) the self-heal already uses.
- Checks: `scripts/verify-hadith-text.ts` (H: synthetic corpus, storage fake,
  `lookupByText` cases), `scripts/verify-translate.mjs:229-267` and
  `:1125-1190` (P: the synthetic Bukhārī sharḥ scenarios),
  `scripts/verify-parsers.ts:5955-5963` (V: the card notes, including "a
  Bukhārī miss still asks for the key" with nothing imported).

**Layers today** (`node scripts/check-layers.mjs` at 1496432): no cycle, all
eleven rules hold.

### The corpus, measured (2026-11-23, this PC, Node v22.23.1)

Scratch scripts outside the repository, reading the real files through
`readHadithJson` and `foldForMatch`/`isnadEnd`; no text kept. A phrase is a
run of k consecutive folded words; "contains" is word-bounded; a family is
the union of entries whose Arabic `agrees` (the definition `findHadithByText`
uses). "More than 25" mirrors `MAX_POSTINGS`.

**M1. How often a k-word phrase from a real matn is unique in its own
collection** (random position past `isnadEnd`, ~300 samples per row; one
family / samples):

| collection | 2 words | 3 | 4 | 5 |
| --- | --- | --- | --- | --- |
| Bukhārī | 107/297 | 179/297 | 205/289 | 208/286 |
| Muslim | 100/294 | 174/296 | 222/283 | 226/280 |
| Riyāḍ | 159/300 | 230/300 | 269/300 | 275/299 |
| Abū Dāwūd | 153/296 | 230/294 | 264/291 | 268/280 |
| Tirmidhī | 111/300 | 160/299 | 195/296 | 230/293 |
| Nasāʾī | 129/298 | 180/293 | 195/289 | 231/282 |
| Ibn Mājah | 165/297 | 238/293 | 253/285 | 247/268 |
| Mālik | 130/274 | 204/268 | 248/270 | 245/261 |
| Aḥmad | 126/300 | 185/300 | 232/289 | 245/290 |

Counting entries instead of families, Bukhārī's are 91, 156, 180, 180: its
repetitions are why the family is the unit. The matn's opening words (how a
sharḥ often quotes) behave the same: Bukhārī 3/4/5 words 162/196/212 of ~290.

**M2. How often a unique hit is the wrong ḥadīth — with no number.** A phrase
drawn from a matn of *another* collection and searched in the target: when
exactly one family contains it, is that family the source ḥadīth (right) or
not (wrong)? ~1,000 samples per row.

| target | 2 words right/wrong | 3 | 4 | 5 | 6 |
| --- | --- | --- | --- | --- | --- |
| Bukhārī | 29/102 | 30/95 | 37/72 | 45/42 | 64/60 † |
| Muslim | 48/128 | 78/106 | 80/90 | 97/69 | 111/73 † |
| Abū Dāwūd | 24/108 | 17/137 | 45/86 | 28/65 | |

† second run, with the proclitic allowed, ~1,400 samples.

**Uniqueness alone is wrong as often as it is right, up to six words.** A
unique short phrase usually proves only that the dataset has *some* ḥadīth
with those words. So the cited number must carry half the proof, as
`shortQuoteHolds` already assumes for the exact number.

**M3. With a cited number** (Bukhārī). Rule R1: exactly one family in the
*whole* collection contains the phrase (≤ 25 entries), and a member of it lies
in the window around the cited number. Rule R2: exactly one family among the
entries *in the window* (cheaper: no full read). Wrong accepts are phrases
from another collection whose hit is not their family, with a uniformly random
citation (a pessimistic model of a wrong citation), ~2,900 samples per row.
Recall is a Bukhārī phrase cited at a modelled standard number (dataset
number + 286 × n / 7277: a straight line through the measured anchors, my
model, not a measurement), ~390–590 samples per row.

| rule, window | 3 words wrong | 4 | 5 | 3 words recall | 4 | 5 |
| --- | --- | --- | --- | --- | --- | --- |
| R1, ±10 | 1 | 0 | 0–3 | 5–8 of ~393 | 10–14 of ~388 | 10–15 of ~385 |
| R1, ±300 | 21–25 | 11–20 | 18 | ~220 of ~393 | ~270 of ~388 | ~300 of ~385 |
| R1, [n−300, n+10] | 12–18 | 7–15 | 1–13 | same as ±300 | | |
| R1, [n−300, n+10], phrase in the matn | 8 | 10 | 4 | 333 of 583 | 427 of 587 | 456 of 571 |
| … and ≥ 12 letters | **1** | 10 | 4 | **186 of 583** | 408 of 587 | 456 of 571 |
| R2, [n−300, n+10] | 70–82 | 30–47 | 23–30 | ~290–326 of ~393 | ~340 | ~360 |

(Ranges are two runs with and without the proclitic; the differences between
them are within sampling noise.) Readings: ±10 finds almost nothing past the
start of Bukhārī, which is the owner's case; R2 is five times worse than R1;
the matn-only rule halves R1's 3-word errors; a 12-letter floor removes most
of the rest at 3 words and changes little at 4–5.

**M4. The phrases the owner named.**
- «إنما الأعمال بالنيات» (3 folded words, 18 letters): 1 entry each in
  Bukhārī, Riyāḍ, the Forty, Abū Dāwūd, Ibn Mājah, 0 elsewhere — every hit the
  intentions ḥadīth. Unique, and right: under R1 it matches Bukhārī only when
  cited near Bukhārī 1, and is refused under «Bukhārī 6607». The rule refuses
  it where it would be wrong, not everywhere.
- «صلى الله عليه وسلم»: `foldForMatch` deletes the honorific
  (`hadithText.ts:152-186`), leaving 0 words: refused before any search. (A
  guard is needed: Mālik has 125 rows with no Arabic words at all, and an
  empty phrase "matches" all 125.)
- «قال رسول الله»: Bukhārī 490 entries, Muslim 961, Ibn Mājah 1,068: over 25,
  refused as a formula.

**M5. Cost.** Bukhārī: 7,277 rows, 4.31 M characters of Arabic, 2.28 M once
folded (≈ 4.6 MB as JS strings). Folding all of Bukhārī from rows in memory:
302 ms (Muslim 258 ms; all ten files parsed and folded: 2.6 s). One phrase
scanned over folded Bukhārī: 5.8 ms. The IndexedDB read of 7,277 rows cannot
be measured here (no browser on this path); it is the read the index
self-heal already does (`readEntries`, 15 transactions). The window
[n−300, n+10] is 311 rows in one `getQulEntries`, against 21 today.

## Design

### 1. The phrase

`shortQuotePhrase(text)`: the same preparation `shortQuoteHolds` uses
(`BOOK_NUMBER` stripped, `stripApparatus`), then `foldForMatch` (letters
folded through `lib/arabic.ts`, honorifics deleted) — not an ad-hoc regex.
It qualifies when:
- the raw text has at most `SHORT_QUOTE_MAX_RAW_WORDS` (12) words (the guard
  of FOUND_ISSUES 74, reused), and
- the folded phrase has 3–5 words (`SHORT_QUOTE_WORDS` 3 up to
  `MIN_RUN_WORDS − 1`: the text search owns six and more), and
- it has at least 12 letters (M3: the 3-word row), and is non-empty (M4).

A dataset entry contains the phrase when its folded words contain it
word-bounded, the first word optionally carrying one «و» or «ف» in the
entry (Current state, item 4: the owner's case needs it). The phrase must start at or
past the entry's `isnadEnd` (M3: matn-only). Nothing else is fuzzy.

### 2. A cited number is required, with a per-collection window

The search runs only for a collection that is imported and cited — by the
model's reference on a card, by the entity's reference or the book's printed
number (`numberHint`) on a tap and on device. M2 is the reason: without a
number a unique short phrase is the wrong ḥadīth more often than not.

The window is where the dataset's number may lie relative to the cited one,
a new optional registry field (`hadithJson.ts:48-85`):

```ts
/** Where a cited number may land in this dataset, for a short quotation. */
citedNumberWindow?: { behind: number; ahead: number };
```

- Bukhārī: `{ behind: 300, ahead: NEIGHBOUR_WINDOW }`. The measured anchors
  (`hadithJson.ts:62-73`, README "Ḥadīth English from hadith-json") have the
  dataset behind the standard by 0 at the start, 239 at 6406, 241 at 6607 (the
  owner's case), 244 at 6682, 286 at the end; never ahead. 300 covers 286
  with margin; ahead 10 covers small local disorder.
- Every other collection: absent, meaning ±`NEIGHBOUR_WINDOW`, as today. Riyāḍ
  and the Forty are citable (drift 0); Muslim's numbering is unrelated to the
  standard, and the other six were never measured (Q1, Q13).

This uses a Bukhārī number as part of a proof, which the owner's 2026-11-22
answer ("no tie-break by number in the six main books") did not ask about:
that answer stops a number *choosing between* two families. Here the text
must already have found exactly one family in the whole collection; the
number only refuses a lone family that lies far from the citation. It never
picks one of two. Q3 asks the owner to confirm the reading.

### 3. Acceptance: one family in the whole collection

Accept when all of these hold (rule R1 of M3):
1. 1 to 25 entries of the cited collection contain the phrase (over 25 is a
   formula: `MAX_POSTINGS`'s reasoning, `hadithText.ts:71-79`);
2. they form exactly one family (union by `agrees(agreement(a, b)) ||
   agrees(agreement(b, a))`, the `sameFamily` test of `hadithText.ts:653`);
3. a member of that family lies in the window of Design 2.

The member nearest the cited number is chosen (then the lowest number), as
the text search orders repetitions. Two or more families: ambiguous, refused,
and said so. Rejected: R2, uniqueness inside the window only — it would need
no full read (Design 4), but M3 measured it five times worse.

### 4. The read: the window first, then the whole collection only if needed

`findShortQuote(storage, collection, cited, text)` in a new
`retrieval/hadithShortQuote.ts`:
1. phrase not qualifying → `{ status: 'too-short' | 'too-long' }` with no
   read;
2. read the window's rows in one `getQulEntries` (311 for Bukhārī, 21
   elsewhere); no entry in it contains the phrase → `{ status: 'none-near' }`.
   Most misses end here, at the cost of today's read times 15;
3. otherwise read every row of the collection in batches of 500 (the
   `readEntries` pattern, `hadithTextIndex.ts:202`), yielding between batches
   (`delay(0)`), folding each row and keeping only those that contain the
   phrase. Then Design 3. Results: `matched` (entry, family, distance from
   the cited number), `ambiguous`, `common` (> 25), `none-near`.

The full read happens only when the window holds a candidate: in the owner's
case once per card. No memo of the folded collection to begin with
(≈ 4.6 MB for Bukhārī); if the tablet shows the read is slow, a session memo
keyed like the index memo (`hadithTextIndex.ts:244`) is the follow-up (Q8).

Rejected: the stored four-word index. A three-word phrase has no four-word
window, so the index cannot name its candidates; for four and five words it
could, but a second path for those alone is not worth its code while the
three-word case needs the scan anyway. Rejected also: a new stored index of
three-word windows or of words — an `INDEX_VERSION` bump, a rebuild on every
tablet and more storage, for a rare path.

### 5. Where it runs

The same `findShortQuote` in all three paths, so they agree (Q19):
- **Card** (`enrich.ts:131`): after the text search finds nothing and before
  sunnah.com, for each cited reference whose collection is imported, in the
  model's order; the first `matched` wins. Before sunnah.com because it is a
  text proof, and Design 6 and the owner's Q18 put a text proof ahead of a
  recalled reference and do not spend the key on what the import answers
  (Q5). An ambiguity in what was searched ends the search as the text path's
  does (`enrich.ts:317-332`); an ambiguity while the model also cited a
  collection that is not imported falls through to the old path
  (`enrich.ts:313`), as the owner decided for the text search.
- **Tap** (`HadithSource.ts`): in `lookupHadith`, after `findLocalHadith` for
  the entity's reference returns null (`:147-149`), for a collection
  reference (`riyadussalihin:n`, `nawawi40:n`); and in `lookupByText` after
  the text search finds nothing and is not ambiguous, when the scope has a
  `numberHint` (a sharḥ's book-scoped reference). `TextLookup` gains
  `short?: true` on `matched` and a `too-short` status.
- **On device** (`useTranslator.ts:192-206`): after `findLocalHadith`, the
  same call for the entity's collection reference; `lookupByText` carries the
  scoped case already.

Errors: a read that throws is caught and logged like the text search's
(`enrich.ts:148-158`, `HadithSource.ts:309-312`) and reads as no match.

### 6. How a match is labelled

As a text match is today (`enrich.ts:340-371`):
- Riyāḍ or the Forty: the matched number.
- Another collection, a family member within ±`NEIGHBOUR_WINDOW` of the cited
  number: the model's reference stands.
- Otherwise the collection's name, «The model cited …», and the by-text note.

Plus a short-quote note, which replaces HADITH_BY_TEXT's first clause for
this case so the card does not say "identified" twice:

> Identified by a short quotation: these words occur in only one ḥadīth of
> Ṣaḥīḥ al-Bukhārī, near the cited number. This dataset’s numbering is not
> the standard one, so no number is given.

and HADITH_QUOTED_IN_PART ("Quoted in part; this is the whole ḥadīth."),
which a three-word quotation always is. The owner's card would read
«Ṣaḥīḥ al-Bukhārī», the English, and: the short-quote note, «The model cited
Bukhārī 6607.», «Quoted in part…». The retrieval log gets a `hit` with the
phrase's word count, the matched position, the distance from the cited
number, the rows read and the milliseconds (so the tablet's cost is visible
in Settings → Retrieval). The sheet adds "· identified by a short quotation"
where it now says "identified by its text" (`HadithSheet.tsx:309-311`). Copy
in Q7.

### 7. The truthful note

In `enrichHadith`'s no-English branch (`enrich.ts:193-211`), before today's
choice, the first that applies:

| case | note (draft) |
| --- | --- |
| short search ambiguous | These few words occur in more than one ḥadīth of the imported X, so none is shown. |
| short search `common` | These words are too common in the imported X to identify one ḥadīth. |
| cited/scoped X imported, phrase under 3 words or 12 letters | The quotation is too short to identify by its text in the imported X. |
| short search `none-near` | No ḥadīth of the imported X near number N contains these words; the file's numbering may differ from the book's. |
| long quotation, X imported, no text match and N in the file | No ḥadīth in the imported X matched this text, and its ḥadīth at number N and the ten either side is a different one. |
| long quotation, X imported, N past the file's length | No ḥadīth in the imported X matched this text, and the file has no ḥadīth numbered N. |

Each ends with the invariant sentence ("A model-generated translation is
deliberately not substituted."). The sunnah.com key clause is appended only
where a key would make a request: no key is set, the reference's collection
is not in `SUNNAH_COM_SKIPPED`, and a reference was parsed — "With a
sunnah.com key (Settings), the cited number would also be looked up there."
(Q6). When no collection the card cites or the book is scoped to is
imported, today's notes are unchanged (V's "a Bukhārī miss still asks for the
key" with nothing imported stays as it is). `X` is the display name, `N` the
cited number as the model gave it.

This needs `enrichHadith` to keep what the earlier steps learned (which
collections were imported and searched, the short search's result), instead
of re-reading: `enrichHadithByText` returns its `imported` set alongside its
answer, and the short search's result is held in a local.

The sheet's scoped miss (`HadithSheet.tsx:323-347`) gets the too-short and
none-near sentences for its own case (Q11).

### Layer edges

`retrieval/hadithShortQuote.ts` imports `retrieval/hadithJson`,
`retrieval/hadithText`, `retrieval/sharh`, `lib/delay`, `services/
retrievalLog` (only if the log call lives there; Design 5 keeps it in the
callers), and types from `platform/storage` and `types`. `enrich.ts` and
`HadithSource.ts` import it; `ui/reader/useTranslator.ts` imports it.
Every directory edge exists today (`retrieval → lib, platform/storage,
services, types`; `ui/reader → retrieval`). No file cycle: none of
`hadithJson`, `hadithText`, `sharh` imports the new file (it is why the
search is not inside `findLocalHadith`: `hadithJson.ts` importing it would
close a cycle with its `agreement` import). No rule in `layers.json` is
touched.

## Steps

| step | files | what changes | checks | risk |
| --- | --- | --- | --- | --- |
| 1 | `retrieval/hadithShortQuote.ts` (new), `retrieval/hadithJson.ts` (registry field), `scripts/verify-hadith-text.ts` | the pure phrase rule and acceptance; Bukhārī's window | T B L H | low: nothing calls it yet |
| 2 | `hadithShortQuote.ts`, `verify-hadith-text.ts` | `findShortQuote` over storage: window first, then the batched full read | T B L H | low: nothing calls it yet |
| 3 | `retrieval/enrich.ts`, `verify-hadith-text.ts`, `scripts/verify-translate.mjs`, `docs/refactor/phase5/translate.json` | the card path calls it before sunnah.com; labelling, log | T B L H Q P(+2 scenarios) V | medium: wrong English on a card |
| 4 | `enrich.ts`, `scripts/verify-parsers.ts`, `verify-translate.mjs`, `translate.json` | the truthful notes | T B L H P(+1 scenario) V U | low: copy only |
| 5 | `retrieval/HadithSource.ts`, `ui/reader/useTranslator.ts`, `ui/reader/HadithSheet.tsx`, `verify-hadith-text.ts`, `verify-translate.mjs`, `translate.json`, `docs/refactor/phase2/markup.sha256` | taps and on device; the sheet's copy | T B L H P(+1 scenario) S R U | medium: the reader |
| 6 | `scripts/measure-short-quote.ts` (new, Q10), `package.json` (one script), `README.md`, this plan | the measurement as a script; the design record | T B L; V and the report on the owner's PC; M | none |

## Per step

### Step 1 — the pure rule

- New `retrieval/hadithShortQuote.ts`: `SHORT_QUOTE_MIN_LETTERS` (12),
  `SHORT_QUOTE_MAX_WORDS` (`MIN_RUN_WORDS − 1`), `shortQuotePhrase(text)` →
  `{ words, letters } | { refused: 'too-short' | 'too-long' | 'empty' }`;
  `containsShortQuote(entryArabic, phrase)` (the proclitic, word bounds,
  past `isnadEnd`); `chooseShortQuote(phrase, hits, cited, window)` → the
  result union of Design 4. Reuses `SHORT_QUOTE_WORDS` and
  `SHORT_QUOTE_MAX_RAW_WORDS` from `hadithJson.ts:444,454` and `MAX_POSTINGS`
  from `hadithText.ts:79`; `BOOK_NUMBER` (`hadithJson.ts:406`) is exported
  for it (a one-word change).
- `hadithJson.ts`: `citedNumberWindow` on the interface and on Bukhārī's
  entry, with a comment giving the anchors; a `citedWindowFor(slug)` helper.
- Check H, new synthetic cases (made-up words, as the file's header
  requires): a 3-word phrase in one entry 240 behind the cited number →
  matched; the same 400 behind → none-near; the same 20 ahead → none-near;
  in two unrelated entries → ambiguous; in two copies of one matn → matched,
  the nearer; in 26 entries → common; only in an entry's isnād → no;
  2 words → too-short; 3 words under 12 letters → too-short; the
  honorific alone → empty; the proclitic on the entry's first word →
  matched, on a middle word → no; a collection with no window → ±10 only.
- Callers to update: none.

**As built (e305547, and the review of it).** `containsShortQuote` takes a
`FoldedEntry` (from a new `foldEntry`) so a scan folds each row once;
`chooseShortQuote(hits, cited, window)` drops the unused phrase argument.
Bukhārī's `ahead` is the literal 10: the registry is built before
`NEIGHBOUR_WINDOW` is declared. H also pins the window's edges (300 and 10
inside, 301 and 11 outside) and the raw-word guard on its own (a long text
the takhrīj stripper cuts to three words).

### Step 2 — the read

- `findShortQuote(storage, collection, cited, text, onProgress?)`: resource
  lookup as `findLocalHadith` does (`hadithJson.ts:573-576`); the window read;
  the batched full read only on a window candidate; returns the result plus
  `{ rowsRead, ms }` for the log.
- Check H: the existing storage fake, with a counter of rows read: no
  candidate in the window → only the window read; a candidate → the whole
  collection read once; a throwing read → the error surfaces to the caller
  (callers catch). A collection not imported → `not-imported`, no read.
- Gap: the tablet's time for the full read (M).

**As built.** No `onProgress`: nothing would show it (the card has no
progress line, and a tap reads at most one collection), so it is left out
until the tablet's `ms` says the read is slow. A cited number far enough past
the file's end that its window is empty (for Bukhārī, more than 300 past)
reads nothing and is `none-near`; one closer reads the tail of the window
and may match. In step 3 (review of 14be66d) the full read refuses a
shortfall of rows, as `readEntries` does, since a lost row could hide a
second family.

### Step 3 — the card

- `enrich.ts`: a block after `if (byText) return byText;` (`:159`), before the
  sunnah.com loop (`:161`): for each reference whose collection is imported,
  `findShortQuote`; on `matched`, the segment with the English, the reference
  by Design 6, the notes and a `hit` log; on `ambiguous`, the rule of
  Design 5 (end with the note, or fall through when an unsearched collection
  was cited). New constant `HADITH_SHORT_QUOTE` beside `HADITH_BY_TEXT`
  (`:55`).
- Check P: two scenarios in the sharḥ group (`verify-translate.mjs:1165-1170`),
  both providers, using phrases already in `SYNTHETIC_COLLECTION` so the
  existing rows, the self-healed index and every existing scenario stay
  byte-identical: a 3-word phrase unique to one synthetic entry cited far
  ahead of it within 300 → its English, «Ṣaḥīḥ al-Bukhārī», the short-quote
  and «The model cited …» notes; a 3-word phrase shared by entries 3 and 5
  (`SYNTHETIC_SHARED`'s words) → refused, the ambiguity note. Re-record
  `translate.json` and show in the PR that the diff adds only these
  scenarios.
- Check H: `enrichSegments` cases over the storage fake, the owner's shape in
  synthetic words. Check Q: identical (no new request; the sunnah.com request
  is *not* made when the short quote matched — Q pins the request lists of the
  provider call sites, so confirm it is identical, not changed). Check V:
  `verify-parsers.ts:5955-5963` passes unchanged.

### Step 4 — the notes

- `enrich.ts:193-211`: the table of Design 7, with constants (or small
  functions taking `X` and `N`) beside the others, and the key clause.
  `enrichHadithByText` returns `{ segment, imported }` so the branch knows
  what was imported.
- Check V: the existing key-note cases unchanged; new cases with an imported
  synthetic collection: too short, none-near, number in range, number past
  the end, key set (no key clause), Mālik cited (no key clause).
- Check P: one scenario, a long matn not in the synthetic collection cited
  «Ṣaḥīḥ al-Bukhārī 3» → the "different one" note with the key clause (no key
  in the sharḥ group? if the group sets one, without it). Existing scenarios
  identical; any that changes is named in the PR with its reason.
- Check U: run it; card notes are not in U's captured states as far as
  reading shows, so it should be identical. If a capture changes, re-baseline
  that file only and name it.

### Step 5 — taps and on device

- `HadithSource.ts`: in `lookupHadith`, a short search for a collection
  reference when `findLocalHadith` returns null; in `lookupByText`, after a
  non-ambiguous miss with a `numberHint`. `TextLookup` (`:59-61`): `short`
  on matched, `too-short` status.
- `useTranslator.ts:197`: after `findLocalHadith`, `findShortQuote` for a
  collection reference (`/^([a-z0-9]+):(\d+)$/`); the scoped case is already
  `lookupByText`.
- `HadithSheet.tsx`: "identified by a short quotation" (`:309-311`); the
  scoped miss's too-short sentence (`:329-334`).
- Check H: `lookupByText` cases (the file already has them); check P: a tap
  on a synthetic short matn? The synthetic book's matn blocks are long, so
  this needs a new short `hadith_matn` block — which moves every block after
  it and changes existing scenarios. Instead H covers `lookupByText` and
  `lookupHadith`, and P's existing tap scenario must stay identical. Check U:
  re-baseline the sheet's states if the copy is in them; S and R: the reader
  is touched (`useTranslator`, `HadithSheet`), so both run.
- Gap: the on-device path cannot be run here (the model is not in the
  container); it is checked by reading and by H on the shared function.
  The tablet (M) shows it.

### Step 6 — measure and record

- `scripts/measure-short-quote.ts` and `npm run measure:short-quote`: M1–M5 as
  a reproducible script, printing counts only, reading the gitignored
  `hadith-json/` and refusing to run without it (as
  `measure-hadith-corpus.ts` does). Q10.
- README "Ḥadīth English from hadith-json, found by text" (`README.md:168`):
  a paragraph on short quotations: the number required, Bukhārī's window, one
  family, the notes.
- This plan: a "measured" record from the script.
- The owner: `npm run verify` (V), the script, and the tablet (M).

## Checks

Letters from `docs/refactor/RESTRUCTURE.md` §5, plus **H**
(`npm run verify:hadith-text`, synthetic, runs anywhere) and M (the tablet).
V runs on the owner's PC (fixtures junctioned); in the cloud container it
fails at once on the missing `fixtures/`, as expected.

| Step | T | B | L | S | R | U | Q | P | H | V | M |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | ✓ | ✓ | ✓ | | | | | | ✓ | | |
| 2 | ✓ | ✓ | ✓ | | | | | | ✓ | | |
| 3 | ✓ | ✓ | ✓ | | | | identical | ✓ (+2) | ✓ | ✓ | ✓ |
| 4 | ✓ | ✓ | ✓ | | | identical | | ✓ (+1) | ✓ | ✓ | |
| 5 | ✓ | ✓ | ✓ | ✓ | ✓ | re-baseline if copy shown | | identical | ✓ | | ✓ |
| 6 | ✓ | ✓ | ✓ | | | | | | | ✓ (+ report) | ✓ |

`torjuman-reviewer` after every step. B: the main chunk grows only by the new
module (a few KB); no data in a bundle. D (`verify:storage`) is not needed:
no schema, no new rows, no storage method changes; run it once in step 2 to
show it identical if the reviewer asks.

**Only the owner can run:** V (`npm run verify`) and the measurement script
(both need the gitignored data), on the owner's PC.

**Only the tablet can show (M):**
- the owner's card, retranslated (a paid Gemini call: Q12), with the English
  and the notes of Design 6;
- the time of a full Bukhārī read on a short-quote candidate (from the
  retrieval log's `ms`), and that the card's spinner does not freeze while it
  runs (batches yield);
- a tap and an on-device translation in a Forty or Riyāḍ sharḥ with a short
  quotation, agreeing with the card;
- the notes' wording at 960×600 and 600×960.

## Risks

- **R1. Wrong English under a wrong citation.** M3: about 1 in 2,900
  wrong-cited 3-word quotations, 1 in 300 at 4 words, 1 in 700 at 5 under the
  chosen rule. Caught by: H's adversarial cases (shared phrases, isnād-only
  hits, far numbers); the retrieval log's distance; the owner's review of the
  first real matches. Mitigation if needed: the 12-letter floor raised for 4
  words, or R1's window narrowed.
- **R2. The drift is not what the anchors suggest** (not monotone, or over
  300 somewhere in the middle). Effect: misses, never wrong English (the
  family must still be unique in the whole collection). Caught by: the log's
  distance on real matches; the `none-near` note.
- **R3. The full read is slow or heavy on the tablet.** Caught by M and the
  logged `ms`. Mitigation: it runs only on a window candidate; batches yield;
  a session memo is the follow-up (Q8).
- **R4. The proclitic rule admits a different word.** Only on the first word,
  only «و»/«ف» added on the entry's side. H pins that a middle word does not
  take it; the whole-collection family rule still applies.
- **R5. Families split by `agrees` on short or variant copies**, so one
  ḥadīth looks like two: refused as ambiguous. Safe (no English), and the
  note says why; counted in the log.
- **R6. The notes regress the key prompt where a key helps.** V's existing
  case pins the no-import case; H/V's new cases pin the key clause.
- **R7. A re-recorded P baseline hides a change.** The PR shows the
  `translate.json` diff adds only named scenarios.
- **R8. Paths disagree** (card, tap, on device). One function; H covers
  `enrichSegments`, `lookupHadith` and `lookupByText`; the on-device call is
  checked by reading (step 5's gap) and on the tablet.
- **R9. The 125 Mālik rows with no Arabic** match an empty phrase. The
  `empty` refusal in step 1, pinned by H.

## Questions

**Q1. The window.** Bukhārī `[n−300, n+10]`, every other collection
±`NEIGHBOUR_WINDOW` as today? *Recommend yes.* It is what the measured
anchors support; widening the others needs a drift measurement first.

**Q2. A cited number required.** No acceptance from the book's scope alone?
*Recommend yes.* M2: with no number, a unique short phrase is the wrong
ḥadīth more often than the right one (Bukhārī 3 words: 30 right, 95 wrong).

**Q3. A Bukhārī number as half the proof.** The 2026-11-22 answer forbids a
six-book number from choosing between two families. Here the text finds one
family in the whole collection and the number only refuses it when it is far
off. Is that consistent with your answer? *Recommend yes*: the number never
picks between candidates, it only adds a refusal.

**Q4. The thresholds:** 3–5 folded words, at least 12 letters, the phrase in
the matn (past `isnadEnd`), at most 25 entries, one family, «و»/«ف» allowed
on the first word. *Recommend accepting them as starting values*, revisited
with the retrieval log after real use. The owner's phrase passes every one.

**Q5. Before sunnah.com on the card.** The short search runs before the
sunnah.com fetch, so with a key set the key is not spent when the import
answers. *Recommend yes* (Design 6 and Q18 of the earlier plan). The other
order would show sunnah.com's English for the cited number unchecked by text
when a key is set.

**Q6. The key clause.** Keep one sentence about the key where sunnah.com
would be asked for the cited number (no key set, collection not Mālik or
Aḥmad), after the import's own reason? *Recommend yes*: in the owner's case a
key would have fetched Bukhārī 6607 by number, so saying nothing would also
be untrue; but it is no longer the only reason given.

**Q7. The card's wording** (Design 6): the short-quote note replacing the
by-text note's first clause, plus «The model cited …» and «Quoted in part…».
*Recommend the draft as written*; change any word you like.

**Q8. No memo of the folded collection to start.** *Recommend no memo*,
measured on the tablet first: the full read happens only on a window
candidate, and a memo costs ≈ 4.6 MB for Bukhārī for the session.

**Q9. Leave `shortQuoteHolds` as it is.** It still accepts a phrase at the
exact cited number when no neighbour within ±10 has it, without the
whole-collection check or the proclitic. *Recommend leaving it* (the owner
asked that the existing paths stay); the new search runs only when it fails.
Tightening it to the new rule would be a separate, measured change.

**Q10. Commit the measurement script** (`scripts/measure-short-quote.ts`,
counts only, reads the gitignored data, refuses without it)? *Recommend
yes*, as `measure-hadith-corpus.ts` is, so the numbers can be re-run.

**Q11. The sheet's copy** for a too-short or none-near scoped miss, and
"identified by a short quotation". *Recommend yes*, in step 5, with U
re-baselined for exactly those states.

**Q12. The owner's existing card** keeps its note until retranslated (a paid
call). *Recommend retranslating that one card* after step 3; the free
"re-enrich" action stays the separate change it was.

**Q13. Muslim and the six unmeasured books.** Their short quotations stay at
±10, which in practice finds them only at the start of the book. *Recommend
leaving them* until a sharḥ with printed numbers gives a drift measurement
(the match report, `scripts/hadithMatch.ts`, prints offsets per ḥadīth on
the owner's PC).

## Owner's answers


Q1–Q13: the owner answered "go with them" on 2026-11-23, so each is answered
as its recommendation says: Q1 Bukhārī `[n−300, n+10]`, every other
collection ±`NEIGHBOUR_WINDOW`; Q2 a cited number is required; Q3 yes, a
Bukhārī number may refuse a lone family far from it but never chooses between
two; Q4 the thresholds as starting values; Q5 the short search runs before
sunnah.com on the card; Q6 one key sentence where sunnah.com would be asked;
Q7 the drafted card wording; Q8 no memo of the folded collection until the
tablet's timing is read; Q9 `shortQuoteHolds` unchanged; Q10 the measurement
script is committed (counts only); Q11 the new sheet copy, with U
re-baselined for those states in step 5; Q12 the owner retranslates the one
existing card; Q13 Muslim and the six unmeasured books stay at ±10.
