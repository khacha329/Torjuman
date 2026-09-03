import { foldName } from '../retrieval/narrator';

// Arabic personal names, taken apart so a name written one way in the reader
// finds an entry written another way in a biographical dictionary.
//
// ---------------------------------------------------------------------------
// The problem
//
// A TOC entry reads «عمر بن الخطاب بن نفيل القرشي العدوي». The commentary in
// front of the reader says «عمر»، or «ابن الخطاب»، or «أبو حفص»، or «عمر بن
// الخطاب رضي الله عنه». All of those are the same man, and none of them is a
// substring match away from the others once honorifics and word order are in
// play.
//
// So each entry is indexed under several derived keys, and each key carries how
// specific it is. Ranking falls out of that: an exact full-name match is worth
// more than a bare ism, which is worth very little — «عمر» alone matches dozens
// of people, which is exactly why the amendment forbids auto-resolving.
//
// Nothing here generates or guesses. It is string decomposition, and the reader
// is always shown every candidate it produced.
// ---------------------------------------------------------------------------

/** How specific an alias is. Ordered: lower sorts first in results. */
export type AliasKind = 'full' | 'ism-nasab' | 'kunya' | 'nisba' | 'ism';

export const ALIAS_RANK: Record<AliasKind, number> = {
  full: 0,
  'ism-nasab': 1,
  kunya: 2,
  nisba: 3,
  ism: 4,
};

export interface Alias {
  /** Folded, for indexing and comparison. Never displayed. */
  value: string;
  kind: AliasKind;
}

/**
 * Words that introduce a name without being part of it.
 *
 * Kept separate from narrator.ts's TITLES, which is tuned for the isnād
 * formulae in Riyāḍ aṣ-Ṣāliḥīn. A biographical TOC has its own vocabulary —
 * adh-Dhahabī heads entries «الخليفة», «الإمام», «الحافظ», «القاضي» — and those
 * must come off before the ism is read, or every one of them indexes as an ism
 * of «الخليفة».
 *
 * Folded forms: `normalize` has already removed hamza, so أ and ا have merged.
 */
const LEADING_TITLES = [
  'امير المومنين',
  'ام المومنين',
  'الخليفه',
  'الامام',
  'الحافظ',
  'الشيخ',
  'القاضي',
  'الملك',
  'السلطان',
  'العلامه',
  'الصحابي',
  'الفقيه',
  'المحدث',
  'سيدنا',
  'مولانا',
];

/**
 * Headings that are structure, not people.
 *
 * This is what stops «حرف الألف» and «ذكر من اسمه أحمد» from being indexed as
 * biographical entries. It is also the measurement behind the quality gate in
 * buildBiographyIndex: a work whose contents are almost entirely these is a work
 * whose TOC is not a name index, however good a biographical dictionary it may
 * be. Taqrīb at-Tahdhīb is exactly that case — 249 letter headings standing in
 * for some 8,800 narrators listed only in the body.
 */
// The trailing boundary is (?=\s|$) and NOT \b. JavaScript's \b is defined
// against [A-Za-z0-9_], so between an Arabic letter and a space there is no
// word boundary at all and the whole class silently matches nothing — which is
// exactly what happened: every letter heading in Taqrīb passed as a person.
const STRUCTURAL =
  /^(?:حرف|باب|فصل|كتاب|مقدمه|المقدمه|فهرس|الفهرس|فهارس|خاتمه|تتمه|تقديم|المجلد|الجزء|القسم|ذكر من اسمه|ذكر من اسمها|ذكر بقيه|من اسمه|ترجمه المولف)(?=\s|$)/;

/** A trailing parenthetical death date: «(ت ٧٤٨ هـ)» and its variants. */
const DEATH_DATE = /[([][^)\]]*(?:ت\s*\d|هـ|هجري)[^)\]]*[)\]]/g;

/** Arabic-Indic and ASCII digits, plus the entry numbers some works print. */
const LEADING_NUMBER = /^[\s\d٠-٩]+[-–—.)\]]?\s*/;

/**
 * Is this heading a person rather than a structural division?
 *
 * Deliberately permissive: a Companion's name can be a single word («أبان»),
 * so requiring a nasab particle would discard most of al-Iṣāba. The rule is
 * only that it does not open with a structural word and is short enough to be
 * a name rather than a sentence.
 */
export function looksLikePerson(title: string): boolean {
  const folded = foldName(title.replace(DEATH_DATE, ' ').replace(LEADING_NUMBER, ''));
  if (folded.length < 2) return false;
  if (STRUCTURAL.test(folded)) return false;
  // Chapter headings that are not in the list above are almost always long or
  // verbal; personal names in these works run to a dozen words at the outside.
  return folded.split(' ').length <= 14;
}

/** Strip a leading title, returning the tokens that remain. */
function withoutTitle(tokens: string[]): string[] {
  for (const title of LEADING_TITLES) {
    const parts = title.split(' ');
    if (parts.every((part, index) => tokens[index] === part)) {
      return tokens.slice(parts.length);
    }
  }
  return tokens;
}

/**
 * Every form under which an entry should be findable.
 *
 * Returned folded and de-duplicated, most specific first. An empty array means
 * nothing usable could be read, and the caller should not index the entry.
 */
export function deriveAliases(name: string): Alias[] {
  const cleaned = name.replace(DEATH_DATE, ' ').replace(LEADING_NUMBER, '');
  const full = foldName(cleaned);
  if (full.length < 2) return [];

  const aliases: Alias[] = [{ value: full, kind: 'full' }];

  const tokens = withoutTitle(full.split(' ').filter(Boolean));
  if (tokens.length === 0) return aliases;

  // Kunya: «أبو حفص», «أم المؤمنين» — foldName has already normalised أبي/أبا
  // to أبو, so all three inflections arrive here as one.
  let kunya: string | null = null;
  for (let index = 0; index < tokens.length - 1; index++) {
    if (tokens[index] === 'ابو' || tokens[index] === 'ام') {
      kunya = `${tokens[index]} ${tokens[index + 1]}`;
      break;
    }
  }
  if (kunya) aliases.push({ value: kunya, kind: 'kunya' });

  // The ism is the first token that is not part of the kunya. «أبو حفص عمر بن
  // الخطاب» must yield عمر, not أبو.
  const kunyaTokens = kunya ? kunya.split(' ') : [];
  const start = kunyaTokens.length > 0 && tokens[0] === kunyaTokens[0] ? kunyaTokens.length : 0;
  const ism = tokens[start];

  if (ism && ism !== 'بن') {
    // ism + nasab: «عمر بن الخطاب». The single most useful key — specific
    // enough to identify, short enough that the commentary actually writes it.
    //
    // The father's name is not always one token. «عبد» and «أبو» are construct
    // heads that bind the word after them into a single name, and taking one
    // token past «بن» cuts them in half:
    //
    //   علي بن أبي طالب      →  «علي بن ابو»      a name nobody has written
    //   عمر بن عبد العزيز    →  «عمر بن عبد»      likewise
    //
    // Both are among the most frequently cited names in the corpus, so the
    // truncated form is not an edge case. It also shows: this alias is what the
    // inline name layer marks, and a short match colours «عمر بن عبد» while
    // leaving «العزيز» plain, which reads as a rendering bug.
    if (tokens[start + 1] === 'بن' && tokens[start + 2]) {
      const head = tokens[start + 2];
      const compound = (head === 'عبد' || head === 'ابو' || head === 'ام') && tokens[start + 3];
      const father = compound ? `${head} ${tokens[start + 3]}` : head;
      aliases.push({ value: `${ism} بن ${father}`, kind: 'ism-nasab' });
    }
    // Bare ism last, and ranked last. «عمر» is dozens of people.
    aliases.push({ value: ism, kind: 'ism' });
  }

  // Nisba or laqab: the last «ال…ي» token. «القرشي», «الذهبي», «العسقلاني».
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index];
    if (token.length >= 5 && token.startsWith('ال') && token.endsWith('ي')) {
      aliases.push({ value: token, kind: 'nisba' });
      break;
    }
  }

  // First occurrence wins, so the most specific kind is kept for a value that
  // could be read two ways (a one-word name is both `full` and `ism`).
  const seen = new Set<string>();
  return aliases.filter((alias) => {
    if (seen.has(alias.value)) return false;
    seen.add(alias.value);
    return true;
  });
}

/**
 * Fold a reader's selection the same way, ready to match against the index.
 *
 * The selection carries whatever punctuation and honorifics surrounded it in
 * the text — «عمر بن الخطاب رضي الله عنه» — and foldName removes those.
 */
export function foldQuery(selection: string): string {
  return foldName(selection.replace(DEATH_DATE, ' ').replace(LEADING_NUMBER, ''));
}
