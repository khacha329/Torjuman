import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { HadithJsonEntry, QulEntry, QulResource } from '../types';
import { letterFold, normalize } from '../lib/arabic';
import { COMMENTARY_CATEGORY, matnShingles, stripApparatus } from './sharh';

// The hadith-json dataset (github.com/AhmedBaset/hadith-json, scraped from
// sunnah.com) as a local ḥadīth source.
//
// ---------------------------------------------------------------------------
// What it supplies, and what it does not
//
// The English — narrator line plus text — and nothing else. The Arabic in the
// file is kept only to prove identity (below); the reader keeps seeing the
// book's own matn. Gradings still come from dorar. The English counts as a
// verified translation (it is sunnah.com's, attributed as such), so showing it
// does not touch the rule that scripture is never machine-translated.
//
// It is personal data the user imports and it is never committed or bundled
// (see .gitignore and docs/RESOURCES.md). The rows live in the QUL resource
// store as kind 'hadith-json'; see types/qul.ts for why.
//
// ---------------------------------------------------------------------------
// Numbers: trust the position, not `idInBook`
//
// The dataset's `idInBook` is not the number a book prints. In the Riyāḍ file
// it is unique over 1–1896 but ordered by *file* position, and the file lists
// «كتاب المقدمات» (chapter id 0, 679 ḥadīth, the real beginning of the book —
// «إنما الأعمال بالنيات» is its first) after chapters 1–19, so `idInBook`
// calls the intentions ḥadīth number 1218. Another export of the same data
// restarts `idInBook` in each chapter. Both are handled by ignoring it: the
// continuous number is the cumulative position over the chapters sorted by
// chapter id, each chapter in `idInBook` order. `idInBook` is kept on the row
// only so the import screen can say how many numbers it disagrees with.
//
// ---------------------------------------------------------------------------
// And not even that, alone
//
// A number is only a candidate. The sharḥ's numbering is its own and has been
// seen to drift from sunnah.com's, and showing the English of a different
// ḥadīth under a matn is far worse than showing none. So the candidate is
// confirmed by comparing the book's matn with the dataset's Arabic, with the
// same four-word shingles the sharḥ lookup uses (`matnShingles`: apparatus
// stripped, letters folded, drawn evenly across the matn). When the number
// misses, the neighbouring numbers are tried by text. When nothing agrees, no
// English is shown and the sheet says so.
// ---------------------------------------------------------------------------

export interface HadithJsonCollection {
  /** The sunnah.com slug; also the prefix of the references the book detects. */
  slug: string;
  /** What the file's own metadata calls it, lower-cased, any of which matches. */
  titles: string[];
  /** Arabic title as the file prints it, matched after folding. */
  arabicTitle: string;
  displayName: string;
  /** The file's name in the dataset's repository (db/by_book/…), as the owner downloads it. */
  fileName: string;
  /** The count the file's metadata claims; a different count is refused. */
  length: number;
  /**
   * Whether the number the importer derives is one the owner would cite.
   *
   * True where it was checked against the book itself (Riyāḍ: the sharḥ's
   * printed numbers match, 412 and 413 included). False where it is only the
   * dataset's own running index: Bukhārī agrees with the standard numbering at
   * the start («إنما الأعمال بالنيات» is 1, «بني الإسلام على خمس» is 8) but the
   * file has 7,277 ḥadīth against the standard 7,563, so by the end it is 286
   * behind: the closing ḥadīth («كلمتان حبيبتان إلى الرحمن», standard 7563) is
   * the file's last row, 7277, and its two earlier occurrences (standard 6406
   * and 6682) are 6167 and 6438;
   * Muslim's matches neither the standard nor sunnah.com's (the five pillars,
   * standard 16, are 110–112 here), and its introduction is listed last like
   * Riyāḍ's. For those, text is the identification and the number must not be
   * printed as a citation. Measured with `npm run measure:hadith-corpus`.
   */
  citableNumbers: boolean;
  /**
   * Title fragments a commentary on this collection carries («فتح الباري بشرح
   * البخاري»), for `sharhCollectionFor`. Only on the six main books whose
   * numbers are not citable: Riyāḍ and the Forty are recognised by
   * `hadithCollectionFor` and keep their number-first path. Mālik and Aḥmad
   * have none yet (owner's answer to Q16).
   */
  sharhTitles?: string[];
}

export const HADITH_JSON_COLLECTIONS: HadithJsonCollection[] = [
  {
    slug: 'riyadussalihin',
    titles: ['riyad as-salihin', 'riyad us-salihin'],
    arabicTitle: 'رياض الصالحين',
    displayName: 'Riyāḍ aṣ-Ṣāliḥīn',
    fileName: 'riyad_assalihin.json',
    length: 1896,
    citableNumbers: true,
  },
  {
    slug: 'nawawi40',
    titles: ['the forty hadith of imam nawawi', 'forty hadith of an-nawawi'],
    arabicTitle: 'الأربعون النووية',
    displayName: 'Nawawī’s Forty (with the two extra)',
    fileName: 'nawawi40.json',
    length: 42,
    citableNumbers: true,
  },
  {
    slug: 'bukhari',
    titles: ['sahih al-bukhari'],
    arabicTitle: 'صحيح البخاري',
    displayName: 'Ṣaḥīḥ al-Bukhārī',
    fileName: 'bukhari.json',
    length: 7277,
    citableNumbers: false,
    sharhTitles: ['البخاري'],
  },
  {
    slug: 'muslim',
    titles: ['sahih muslim'],
    arabicTitle: 'صحيح مسلم',
    displayName: 'Ṣaḥīḥ Muslim',
    fileName: 'muslim.json',
    length: 7459,
    citableNumbers: false,
    // Not «مسلم» alone: it is in hundreds of titles that are not about this book.
    sharhTitles: ['صحيح مسلم', 'مسلم بن الحجاج'],
  },
  // The rest of the nine books, measured on 2026-11-22 with
  // `npm run measure:hadith-corpus`. Every file's `idInBook` is unique and
  // continuous; Ibn Mājah lists its chapter 0 last like Riyāḍ and Muslim, the
  // others have none. None has been checked against the standard numbering, so
  // none is citable: Claude's number is a candidate the text must confirm, and
  // the card keeps the reference the model gave. Where the dataset drifts more
  // than NEIGHBOUR_WINDOW from the cited number, only the text index (the plan's
  // steps 2–4) will find it.
  //
  // Left out: ad-Dārimī. The file has 3,406 ḥadīth and no English at all
  // (0.00 MB measured), so it can supply nothing this source exists to supply.
  {
    slug: 'abudawud',
    titles: ['sunan abi dawud'],
    arabicTitle: 'سنن أبي داود',
    displayName: 'Sunan Abī Dāwūd',
    fileName: 'abudawud.json',
    length: 5276,
    citableNumbers: false,
    sharhTitles: ['أبي داود', 'أبى داود'],
  },
  {
    slug: 'tirmidhi',
    titles: ["jami' al-tirmidhi", 'jami al-tirmidhi'],
    arabicTitle: 'جامع الترمذي',
    displayName: 'Jāmiʿ at-Tirmidhī',
    fileName: 'tirmidhi.json',
    length: 4053,
    citableNumbers: false,
    sharhTitles: ['الترمذي'],
  },
  {
    slug: 'nasai',
    titles: ["sunan al-nasa'i", 'sunan an-nasai'],
    arabicTitle: 'سنن النسائي',
    displayName: 'Sunan an-Nasāʾī',
    fileName: 'nasai.json',
    length: 5768,
    citableNumbers: false,
    // «المجتبى» is the Sunan's own title (al-Mujtabā), which its commentaries name.
    sharhTitles: ['النسائي', 'المجتبى'],
  },
  {
    slug: 'ibnmajah',
    titles: ['sunan ibn majah'],
    arabicTitle: 'سنن ابن ماجه',
    displayName: 'Sunan Ibn Mājah',
    fileName: 'ibnmajah.json',
    length: 4345,
    citableNumbers: false,
    // `normalize` folds ة to ه, so «ابن ماجة» is covered too.
    sharhTitles: ['ابن ماجه'],
  },
  {
    slug: 'malik',
    titles: ['muwatta malik'],
    arabicTitle: 'موطأ مالك',
    displayName: 'Muwaṭṭaʾ Mālik',
    fileName: 'malik.json',
    length: 1985,
    citableNumbers: false,
  },
  {
    // Only 1,374 ḥadīth: the part of the Musnad sunnah.com has translated, not
    // the whole of it. Its running index cannot be the Musnad's numbering.
    slug: 'ahmad',
    titles: ['musnad ahmad ibn hanbal'],
    arabicTitle: 'مسند الإمام أحمد بن حنبل',
    displayName: 'Musnad Aḥmad (the translated part)',
    fileName: 'ahmed.json',
    length: 1374,
    citableNumbers: false,
  },
];

export function hadithJsonCollection(slug: string): HadithJsonCollection | undefined {
  return HADITH_JSON_COLLECTIONS.find((collection) => collection.slug === slug);
}

/**
 * The collection a book comments on, when it is a sharḥ of one of the six main
 * books; null otherwise.
 *
 * A book qualifies by Shamela's own «شروح الحديث» category — tested with
 * `includes`, as `isCommentaryWork` does; the hadith-commentary structure that
 * types its matns is given only to an exact match (parseBook.ts), so a book
 * that merely contains the words passes here and finds nothing — AND
 * exactly one collection's title fragment in its `normalize`d title: a title
 * naming two — a zawāʾid or a comparison — is no one collection's sharḥ. The
 * answer is a scope for the text search, never a proof: a book recognised
 * wrongly searches one collection, finds nothing and says so, because the text
 * must still match (plan, Design 8).
 */
export function sharhCollectionFor(book: { title: string; category: string }): string | null {
  if (!book.category.includes(COMMENTARY_CATEGORY)) return null;
  const title = normalize(book.title);
  const named = HADITH_JSON_COLLECTIONS.filter(
    (collection) =>
      !collection.citableNumbers &&
      collection.sharhTitles?.some((fragment) => title.includes(normalize(fragment))),
  );
  return named.length === 1 ? named[0].slug : null;
}

/** The attribution shown under the English. */
export const HADITH_JSON_ATTRIBUTION = 'sunnah.com (via hadith-json)';

// ------------------------------------------------------------------ reading

export class HadithJsonFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HadithJsonFormatError';
  }
}

export interface HadithJsonDraftEntry {
  key: string;
  value: HadithJsonEntry;
}

export interface HadithJsonReading {
  collection: HadithJsonCollection;
  name: string;
  entries: HadithJsonDraftEntry[];
  /** Facts about what was read, so the user confirms against the real thing. */
  details: string[];
  sample: string;
}

interface RawHadith {
  idInBook: number;
  chapterId: number;
  arabic: string;
  english: { narrator: string; text: string };
}

interface RawBook {
  metadata?: {
    length?: number;
    arabic?: { title?: string };
    english?: { title?: string };
  };
  chapters?: { id: number; english?: string }[];
  hadiths?: unknown;
}

function isRawHadith(value: unknown): value is RawHadith {
  if (value === null || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  const english = row.english as Record<string, unknown> | null | undefined;
  return (
    typeof row.idInBook === 'number' &&
    typeof row.chapterId === 'number' &&
    typeof row.arabic === 'string' &&
    english !== null &&
    typeof english === 'object' &&
    typeof english.narrator === 'string' &&
    typeof english.text === 'string'
  );
}

function detectCollection(book: RawBook, fileName: string): HadithJsonCollection {
  const english = (book.metadata?.english?.title ?? '').toLowerCase().trim();
  const arabic = letterFold(book.metadata?.arabic?.title ?? '');
  const found = HADITH_JSON_COLLECTIONS.find(
    (collection) =>
      collection.titles.includes(english) || arabic === letterFold(collection.arabicTitle),
  );
  if (found) return found;

  const named = [english, book.metadata?.arabic?.title, fileName].filter(Boolean).join(' / ');
  throw new HadithJsonFormatError(
    `This looks like a hadith-json file, but not one of the collections supported so far ` +
      `(${HADITH_JSON_COLLECTIONS.map((collection) => collection.displayName).join(', ')}). ` +
      `It calls itself: ${named || '(no title)'}.`,
  );
}

/**
 * Read one hadith-json file. Nothing is written; a file that is not what it
 * claims to be is refused with the reason, because a collection that is silently
 * short looks exactly like a complete one.
 */
export function readHadithJson(root: unknown, fileName: string): HadithJsonReading {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    throw new HadithJsonFormatError(
      'That file is JSON, but not a hadith-json book. Expected an object with "metadata", "chapters" and "hadiths".',
    );
  }
  const book = root as RawBook;
  if (!Array.isArray(book.hadiths) || !book.metadata) {
    throw new HadithJsonFormatError(
      'That file is JSON, but not a hadith-json book. Expected an object with "metadata", "chapters" and "hadiths".',
    );
  }

  const collection = detectCollection(book, fileName);
  const rows = book.hadiths as unknown[];
  const bad = rows.findIndex((row) => !isRawHadith(row));
  if (bad !== -1) {
    throw new HadithJsonFormatError(
      `Hadith ${bad + 1} of ${rows.length} is missing a field (idInBook, chapterId, arabic, english.narrator or english.text).`,
    );
  }
  const hadiths = rows as RawHadith[];

  if (hadiths.length !== collection.length) {
    throw new HadithJsonFormatError(
      `${collection.displayName} has ${collection.length} ḥadīth in this dataset; the file has ${hadiths.length}. ` +
        'Importing a partial collection would make the numbers after the gap point at the wrong ḥadīth, so it is refused.',
    );
  }

  const chapterNames = new Map((book.chapters ?? []).map((chapter) => [chapter.id, chapter.english ?? '']));

  // Chapter id, then idInBook within it. See the header for why not idInBook.
  const ordered = [...hadiths].sort(
    (a, b) => a.chapterId - b.chapterId || a.idInBook - b.idInBook,
  );

  const entries: HadithJsonDraftEntry[] = ordered.map((hadith, index) => {
    const number = index + 1;
    return {
      key: `${collection.slug}:${number}`,
      value: {
        t: 'hadith-json',
        number,
        idInBook: hadith.idInBook,
        chapterId: hadith.chapterId,
        chapterEnglish: chapterNames.get(hadith.chapterId) ?? '',
        narrator: hadith.english.narrator,
        text: hadith.english.text,
        arabic: hadith.arabic,
      },
    };
  });

  const disagree = entries.filter((entry) => entry.value.idInBook !== entry.value.number).length;
  const chapters = new Set(hadiths.map((hadith) => hadith.chapterId)).size;
  const empty = entries.filter((entry) => composeEnglish(entry.value) === '').length;

  const details = [
    `${entries.length} ḥadīth in ${chapters} chapter${chapters === 1 ? '' : 's'}, numbered 1–${entries.length} in book order`,
    disagree === 0
      ? 'The file’s own idInBook agrees with that numbering throughout.'
      : `The file’s own idInBook disagrees with that numbering for ${disagree} of them — expected for this dataset, and the reason it is not used.`,
  ];
  if (empty > 0) details.push(`${empty} have no English text and will show none.`);

  const first = entries[0].value;
  return {
    collection,
    name: `${collection.displayName} — hadith-json`,
    entries,
    details,
    sample: `${first.number}. ${composeEnglish(first)}`.slice(0, 240),
  };
}

// ------------------------------------------------------------------ English

/** Narrator line and text as one passage, with the dataset's stray whitespace and dots tidied. */
export function composeEnglish(entry: Pick<HadithJsonEntry, 'narrator' | 'text'>): string {
  const tidy = (input: string) =>
    input
      .replace(/\s+/g, ' ')
      .replace(/\s+\.+$/, '')
      .trim();
  return [tidy(entry.narrator), tidy(entry.text)].filter(Boolean).join(' ');
}

// ----------------------------------------------------------------- matching

/**
 * The leading number as a book prints it: «٤-» or «١/٤١٢ ـ». `stripApparatus`
 * knows only the first form, and the second would otherwise put digits into a
 * shingle that the dataset's Arabic cannot contain.
 */
const BOOK_NUMBER = /^\s*[٠-٩0-9]+\s*(?:\/\s*[٠-٩0-9]+\s*)?[-ـ–—]\s*/u;

/** Neighbouring numbers tried by text when the numbered one does not agree. */
export const NEIGHBOUR_WINDOW = 10;

/** Fraction of the book's shingles the candidate must contain. */
export const MIN_AGREEMENT = 0.6;

export interface Agreement {
  hits: number;
  tried: number;
}

/**
 * How many of the book matn's shingles occur in the dataset's Arabic.
 *
 * `tried` is 0 when the matn is under four words once the apparatus is stripped;
 * such a matn does not agree by shingles. `chooseCandidate` may still confirm
 * it at the cited number by the narrower `shortQuoteHolds`.
 */
export function agreement(bookMatn: string, datasetArabic: string): Agreement {
  const shingles = matnShingles(bookMatn.replace(BOOK_NUMBER, ''));
  if (shingles.length === 0) return { hits: 0, tried: 0 };
  const haystack = ` ${letterFold(datasetArabic)} `;
  const hits = shingles.filter((shingle) => haystack.includes(` ${shingle} `)).length;
  return { hits, tried: shingles.length };
}

export function agrees(result: Agreement): boolean {
  return result.tried > 0 && result.hits >= Math.min(2, result.tried) && result.hits / result.tried >= MIN_AGREEMENT;
}

/**
 * Fewest words a quotation too short to shingle may have and still be checked.
 * Three, not two (review of 87f2a5e): a two-word phrase of middling frequency
 * sits by chance in one ḥadīth and none of its twenty neighbours often enough
 * to matter where the cited number is itself uncertain (Muslim, late Bukhārī).
 */
export const SHORT_QUOTE_WORDS = 3;

/**
 * Most words the quotation may have BEFORE stripping. The rule tests what
 * `stripApparatus` leaves, and the stripper is not word-anchored (FOUND_ISSUES
 * 74): a long matn cut to three words by a mid-word «ورواه» would otherwise be
 * accepted on that residue while the real text was never compared. A short
 * quotation with a lead-in the stripper removes («عن النبي ﷺ قال: …») stays under
 * this; a cut-down long matn does not.
 */
export const SHORT_QUOTE_MAX_RAW_WORDS = 12;

/**
 * A quotation too short for four-word shingles, confirmed another way.
 *
 * A sharḥ — and the model, when it boxes one — often quotes only a ḥadīth's
 * opening: «إنما الأعمال بالنيات» is three words, so `agreement` tries no
 * shingle and the owner's first Bukhārī test was refused although the dataset's
 * ḥadīth 1 says exactly that. The rule: the quotation, stripped of apparatus as
 * `matnShingles` strips it and folded, occurs in the numbered candidate as
 * consecutive words, AND in none of the neighbours
 * within the window. The second half is what keeps a formula out: «قال رسول
 * الله» or «صلى الله عليه» is in nearly every ḥadīth around any number, so it
 * proves nothing and is refused; a phrase found only at the cited number is
 * that ḥadīth. Only the cited number is accepted this way, never a neighbour —
 * with so few words, the number has to carry half the proof.
 */
function shortQuoteHolds(
  bookMatn: string,
  candidate: HadithJsonEntry,
  number: number,
  byNumber: (n: number) => HadithJsonEntry | undefined,
): boolean {
  const unnumbered = bookMatn.replace(BOOK_NUMBER, '');
  const raw = letterFold(unnumbered).split(' ').filter(Boolean);
  if (raw.length > SHORT_QUOTE_MAX_RAW_WORDS) return false;
  const words = letterFold(stripApparatus(unnumbered)).split(' ').filter(Boolean);
  if (words.length < SHORT_QUOTE_WORDS) return false;
  const phrase = ` ${words.join(' ')} `;
  const holds = (entry: HadithJsonEntry) => ` ${letterFold(entry.arabic)} `.includes(phrase);
  if (!holds(candidate)) return false;
  for (let offset = -NEIGHBOUR_WINDOW; offset <= NEIGHBOUR_WINDOW; offset++) {
    const neighbour = offset === 0 ? undefined : byNumber(number + offset);
    if (neighbour && holds(neighbour)) return false;
  }
  return true;
}

export interface HadithMatch {
  entry: HadithJsonEntry;
  /** matched number minus the book's number; 0 when the number itself held. */
  offset: number;
  agreement: Agreement;
  /**
   * Confirmed by `shortQuoteHolds`, not by shingles. `agreement` is then a
   * placeholder 1/1, so a report should say "short quotation", not a score.
   */
  shortQuote?: true;
}

/**
 * Pick the dataset's ḥadīth for a book's matn.
 *
 * The numbered candidate wins whenever it agrees. Otherwise the best-agreeing
 * neighbour does, nearest first on a tie. `byNumber` is a lookup, not the whole
 * list, so the caller decides whether that is a Map or a handful of IndexedDB
 * reads.
 */
export function chooseCandidate(
  number: number,
  bookMatn: string,
  byNumber: (n: number) => HadithJsonEntry | undefined,
): HadithMatch | null {
  const exact = byNumber(number);
  if (exact) {
    const result = agreement(bookMatn, exact.arabic);
    if (agrees(result)) return { entry: exact, offset: 0, agreement: result };
    if (result.tried === 0 && shortQuoteHolds(bookMatn, exact, number, byNumber)) {
      return { entry: exact, offset: 0, agreement: { hits: 1, tried: 1 }, shortQuote: true };
    }
  }

  let best: HadithMatch | null = null;
  for (let distance = 1; distance <= NEIGHBOUR_WINDOW; distance++) {
    for (const offset of [distance, -distance]) {
      const entry = byNumber(number + offset);
      if (!entry) continue;
      const result = agreement(bookMatn, entry.arabic);
      if (!agrees(result)) continue;
      if (!best || result.hits / result.tried > best.agreement.hits / best.agreement.tried) {
        best = { entry, offset, agreement: result };
      }
    }
  }
  return best;
}

// ------------------------------------------------------------------- lookup

const REFERENCE = /^([a-z0-9]+):(\d+)$/;

export interface LocalHadith extends HadithMatch {
  collection: string;
  /**
   * Whether `entry.number` may be shown as a citation or used in a sunnah.com
   * link. False for every collection but Riyāḍ and the Forty (see
   * `citableNumbers`): their English is
   * still text-confirmed and shown, but the number stays whatever the book or
   * the model said it was.
   */
  citable: boolean;
  resource: QulResource;
  english: string;
}

/**
 * The imported English for a reference such as "riyadussalihin:412", confirmed
 * against the book's matn. Null when no collection is imported, the reference is
 * not in one, or nothing in reach agrees with the text — all normal answers.
 */
export async function findLocalHadith(
  storage: StorageAdapter,
  reference: string,
  bookMatn: string,
): Promise<LocalHadith | null> {
  const parsed = REFERENCE.exec(reference);
  if (!parsed || !hadithJsonCollection(parsed[1])) return null;
  const slug = parsed[1];
  const number = Number(parsed[2]);

  const resources = await storage.listQulResources();
  const resource = resources.find((r) => r.kind === 'hadith-json' && r.collection === slug);
  if (!resource) return null;

  const keys: string[] = [];
  for (let n = Math.max(1, number - NEIGHBOUR_WINDOW); n <= number + NEIGHBOUR_WINDOW; n++) {
    keys.push(`${slug}:${n}`);
  }
  const rows: QulEntry[] = await storage.getQulEntries(resource.id, keys);
  const entries = new Map<number, HadithJsonEntry>();
  for (const row of rows) {
    if (row.value.t === 'hadith-json') entries.set(row.value.number, row.value);
  }

  const match = chooseCandidate(number, bookMatn, (n) => entries.get(n));
  if (!match) return null;
  const english = composeEnglish(match.entry);
  if (english === '') return null;
  const citable = hadithJsonCollection(slug)?.citableNumbers ?? false;
  return { ...match, collection: slug, citable, resource, english };
}
