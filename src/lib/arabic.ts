// Arabic text handling.
//
// The one rule that matters here: display text is never mutated. `normalize`
// produces a *parallel* string used only as a search index. If you ever find
// yourself assigning the result of normalize() to Block.text, stop.

/**
 * Harakāt and Qurʾānic annotation marks.
 *
 * The spec names three ranges: U+064B–U+065F, U+0670, and U+06D6–U+06ED. Two
 * more are added here, found by matching the bundled Uthmānī muṣḥaf against
 * verses as this edition quotes them.
 *
 * U+08D3–U+08FF is the one that actually bites. Ḥafṣ Uthmānī orthography
 * writes the "open" tanwīn used for iqlāb and ikhfāʾ as U+08F0–U+08F2, so
 * سِنَةٌ carries U+08F1 in the muṣḥaf where the sharḥ writes a plain U+064C.
 * Without folding those, a quoted āyah never matches the muṣḥaf and verse
 * resolution silently returns nothing at all.
 *
 * Built from escapes rather than a literal character class: a class made of
 * invisible combining marks cannot be reviewed by eye or edited safely.
 */
const DIACRITICS = new RegExp(
  '[' +
    '\\u0610-\\u061A' + // Arabic signs, incl. small high fatha/damma/kasra
    '\\u064B-\\u065F' + // fathatan through wavy hamza below
    '\\u0670' + // superscript alef
    '\\u06D6-\\u06ED' + // Qur'anic stop marks, small waw/yeh, sajdah
    '\\u08D3-\\u08FF' + // Arabic Extended-A combining marks
    ']',
  'g',
);
const TATWEEL = /ـ/g;

/**
 * Fold a string for search. Applied identically at ingest (to build
 * Block.normalized) and to the user's query, so a query typed without harakāt
 * matches text that has them.
 *
 * Order matters and follows the spec exactly.
 */
/**
 * `normalize`, and then nothing but letters and single spaces.
 *
 * `normalize` keeps punctuation on purpose: block search is a substring search
 * over what a reader typed, and a reader types punctuation. Matching one book's
 * passage against another's is the opposite case — «قال: كنا» in one edition is
 * «قال كنا» in the next, and the doubled brackets a collection uses to mark
 * quoted speech are its own typesetting. Comparing on letters alone is what
 * makes a cross-book match possible at all.
 */
export function letterFold(input: string): string {
  return normalize(input)
    .replace(/[^ء-ي\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalize(input: string): string {
  return input
    .replace(DIACRITICS, '')
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا') // أ إ آ ٱ → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/ؤ/g, 'و') // ؤ → و
    .replace(/ئ/g, 'ي') // ئ → ي
    .replace(/\s+/g, ' ')
    .trim();
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';

/** "٦٨١" → 681. Returns null if the string holds no digits. */
export function parseArabicNumber(input: string): number | null {
  let out = '';
  for (const ch of input) {
    const idx = ARABIC_INDIC.indexOf(ch);
    if (idx >= 0) out += String(idx);
    else if (ch >= '0' && ch <= '9') out += ch;
  }
  return out.length ? Number(out) : null;
}

/** 681 → "٦٨١". Used for the ج/ص margin so the reader stays in Arabic numerals. */
export function toArabicNumerals(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_INDIC[Number(d)]);
}

/** The variants that `normalize` folds together, inverted. */
const VARIANTS: Record<string, string> = {
  ا: 'اأإآٱ',
  ي: 'يىئ',
  ه: 'هة',
  و: 'وؤ',
};

/**
 * The marks a letter may carry in display text, as the body of a character
 * class (`[${DISPLAY_MARK_CLASS}]`, or `[^${DISPLAY_MARK_CLASS}]` for anything
 * else). Exported with `markedPattern` for a rule that counts printed letters,
 * so that a vowelled text is measured as a bare one is: a letter is one
 * character outside the class followed by any marks in it, which can be read
 * only one way, so a failing match does not backtrack over the ways of
 * dividing a run of marks.
 */
export const DISPLAY_MARK_CLASS = '\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u0640';
const MARKS = `[${DISPLAY_MARK_CLASS}]*`;

/**
 * Regular-expression source (for a `u` RegExp) that finds `written` in display
 * text with any marks on its letters: each letter matches as written, followed
 * by whatever marks of `DISPLAY_MARK_CLASS` it carries, and a space is any run
 * of whitespace. Unlike `findInDisplayText`'s pattern it folds no letter
 * variants: a rule that names «أن» keeps meaning «أن», not also the «ان» at the
 * end of «كان».
 *
 * For a rule written in bare letters that must also match printed, vowelled
 * text, so it is never a regex over diacritics: `stripApparatus`
 * (retrieval/sharh.ts) missed «رَوَاهُ» because its patterns were literal bare
 * letters (FOUND_ISSUES 75).
 */
export function markedPattern(written: string): string {
  return [...written].map((char) => (char === ' ' ? '\\s+' : escapeRegex(char) + MARKS)).join('');
}

/**
 * Locate a normalized query inside *display* text, returning offsets into the
 * display string.
 *
 * Search matches against Block.normalized, but the reader has to highlight the
 * match in Block.text, which still carries every harakah. Rather than keeping a
 * position map between the two, this rebuilds the query as a pattern that
 * tolerates the marks and letter variants normalization removed.
 */
export function findInDisplayText(
  text: string,
  normalizedQuery: string,
): [start: number, end: number] | null {
  if (!normalizedQuery) return null;

  const pattern = [...normalizedQuery]
    .map((char) => {
      if (char === ' ') return '\\s+';
      const set = VARIANTS[char];
      const atom = set ? `[${set}]` : escapeRegex(char);
      return atom + MARKS;
    })
    .join('');

  const match = new RegExp(MARKS + pattern, 'u').exec(text);
  return match ? [match.index, match.index + match[0].length] : null;
}

function escapeRegex(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Collapse whitespace without touching any letter or mark. Safe on display text. */
export function tidyWhitespace(input: string): string {
  return input.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}
