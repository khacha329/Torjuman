import { normalize } from '../lib/arabic';

// Who narrated it — the field that decides which dorar record belongs to the
// ḥadīth on screen.
//
// ---------------------------------------------------------------------------
// Why this exists
//
// dorar is a full-text search. A query on a ḥadīth's wording returns every
// narration containing that wording, ranked by text match — not by authenticity
// and not by relevance to the narration in the book being read. The captured
// fixture proves the danger on this project's own primary text: the top hit for
// «إنما الأعمال بالنيات» is Abū Saʿīd al-Khudrī's narration, graded by Ibn ʿAbd
// al-Barr as *an error in the isnād*. The ḥadīth in Riyāḍ aṣ-Ṣāliḥīn is ʿUmar's,
// and it opens both Ṣaḥīḥs.
//
// Taking the top result would therefore attach a defective-narration grading to
// the strongest ḥadīth in the collection. The narrator is what tells them apart,
// and the book states it — so it is matched here before any grading is accepted.
//
// The two sides are written differently and neither can be normalized into the
// other by the search fold alone:
//
//   book:   «وعن أمير المؤمنين أبي حفص عمر بن الخطاب رضي الله عنه قال»
//   dorar:  «[عمر بن الخطاب]»
//
// Brackets on one side, an honorific on the other, and the name itself is in
// the genitive after «عن» (أبي) where dorar gives the nominative (أبو). Each of
// those is folded away below.
// ---------------------------------------------------------------------------

/**
 * Bidi controls and zero-width joiners.
 *
 * The fixture carries a stray U+200F right-to-left mark after «أنس بن مالك»,
 * which `normalize` leaves alone — JavaScript's `\s` does not match it — so a
 * name comparison would silently fail on that one record. Built from escapes
 * rather than literals for the same reason as the diacritics class in
 * lib/arabic.ts: a character class of invisible characters cannot be reviewed.
 */
const INVISIBLE = new RegExp(
  '[' +
    '\\u200B-\\u200F' + // ZWSP, ZWNJ, ZWJ, LRM, RLM
    '\\u202A-\\u202E' + // embedding and override
    '\\u2066-\\u2069' + // isolates
    '\\uFEFF' + // BOM as a zero-width no-break space
    ']',
  'g',
);

/** Honorifics that appear on one side and not the other. */
const HONORIFICS =
  /\s*(?:رضي\s+الله\s+عنه(?:ما|م|ا)?|رحمه\s+الله|صلي\s+الله\s+عليه\s+وسلم|عليه\s+السلام)\s*/g;

/**
 * Fold a personal name for comparison.
 *
 * Built on the search `normalize` rather than replacing it — that fold is what
 * every block index in the database was built with and is not safe to change —
 * with the name-specific differences handled on top.
 */
export function foldName(input: string): string {
  const stripped = input.replace(INVISIBLE, '').replace(NAME_PUNCTUATION, ' ');

  return normalize(stripped)
    .replace(HONORIFICS, ' ')
    // أبو / أبي / أبا are one name in three cases. After `normalize` the hamza
    // is already gone, so all three arrive as ابو / ابي / ابا.
    .replace(/(^|\s)اب[ويا](?=\s)/g, '$1ابو')
    // ابن and بن are the same word, written both ways depending on position.
    .replace(/(^|\s)ابن(?=\s)/g, '$1بن')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether two names refer to the same narrator.
 *
 * Contained-name matching, because the book may give a short form where dorar
 * gives the full one or the reverse — «عمر» against «عمر بن الخطاب». Token
 * boundaries are respected so «عمر» does not match inside «عمرو».
 */
export function narratorMatches(bookName: string, dorarName: string): boolean {
  const book = foldName(bookName);
  const dorar = foldName(dorarName);
  if (book.length < 3 || dorar.length < 3) return false;
  if (book === dorar) return true;
  return ` ${book} `.includes(` ${dorar} `) || ` ${dorar} `.includes(` ${book} `);
}

/**
 * The isnād formulae this text uses to name its narrator.
 *
 * `عن` alone is far too common to anchor on — it is also the ordinary
 * preposition — so the anchor is the honorific or the reporting verb that
 * closes the formula, and the name is read backwards from there to the nearest
 * `عن`. That is the shape the collection actually prints:
 *
 *   وعن أبي هريرة رضي الله عنه قال …
 *   عن أمير المؤمنين أبي حفص عمر بن الخطاب رضي الله عنه قال …
 *   وعن ابن عمر رضي الله عنهما أن رسول الله …
 */
const CLOSERS = [
  /رضي\s+الله\s+عنه(?:ما|م|ا)?/,
  /\bقال\s*[:؛]/,
  /\bأنه?\s+قال/,
  /\bعن\s+النبي/,
];

/**
 * Titles that introduce the name and are not part of it.
 *
 * «أم المؤمنين» is here because the collection uses it constantly — «وعن أم
 * المؤمنين أم عبد الله عائشة رضي الله عنها» — and dorar gives the bare name.
 */
const TITLES =
  /^(?:أمير\s+المؤمنين|أم\s+المؤمنين|الإمام|الشيخ|سيدنا|مولانا|الصحابي)\s+/;

/**
 * Punctuation that sits between the name and the honorific.
 *
 * The book prints «وعن عائشة ـ رضي الله عنها» and «كعب بن مالك - رضي الله عنه»
 * with a dash, in several forms. None of it is part of the name.
 */
const NAME_PUNCTUATION = /[،,.:؛\-–—ـ()[\]«»"']/g;

/**
 * Read the narrator out of a passage of the book.
 *
 * Returns null when no isnād formula is present, which is the correct answer
 * for a bare matn — and, since an unmatched grading is worse than an absent
 * one, a null here means no dorar grading is shown at all.
 */
export function narratorIn(text: string): string | null {
  for (const closer of CLOSERS) {
    const pattern = new RegExp(closer.source, 'g');
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(text)) !== null) {
      const before = text.slice(0, match.index);
      // The last «عن» before the closer opens the name.
      const start = lastIsnadAnchor(before);
      if (start === -1) continue;

      const name = before
        .slice(start)
        .replace(TITLES, '')
        .replace(NAME_PUNCTUATION, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // A name is a few words. Anything longer means the anchor was the
      // preposition rather than an isnād, and guessing from it would be worse
      // than returning nothing.
      const words = name.split(' ').filter((word) => word !== '');
      if (words.length >= 1 && words.length <= 8 && name.length >= 3) return name;
    }
  }

  return null;
}

/** Index just past the last «عن» / «وعن» / «حدثنا … عن» in a run of text. */
function lastIsnadAnchor(before: string): number {
  const anchor = /(?:^|\s)و?عن\s+/g;
  let found = -1;
  let match: RegExpExecArray | null;
  while ((match = anchor.exec(before)) !== null) {
    found = match.index + match[0].length;
  }
  return found;
}
