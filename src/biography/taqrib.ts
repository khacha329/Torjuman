import type { Block } from '../types';
import { foldName } from '../retrieval/narrator';
import { emptyProfile, type NarratorProfile } from './narratorProfile';

// Reading Taqrīb at-Tahdhīb's entries out of the book's own body.
//
// ---------------------------------------------------------------------------
// Why the body and not the contents
//
// Every other biographical work in this app is indexed from its table of
// contents, because those works list one contents line per person. Taqrīb does
// not: its contents are 249 letter headings — «حرف الألف», «ذكر من اسمه أحمد» —
// standing in for roughly 8,800 narrators who appear only in the body. The
// index builder refuses it for exactly that reason, and correctly.
//
// The body, though, is the most regular text in the library. Measured across
// six real pages fetched from the live book:
//
//   118 paragraphs        87 numbered entries, 31 cross-references, 0 other
//   Ibn Ḥajar's verdict   84/87   96.6%
//   ṭabaqa                76/87   87.4%
//   kunya                 39/87   44.8%
//   death clause          25/87   28.7%
//
// One entry per paragraph, opening with the work's own sequential number. The
// remaining 31 paragraphs open with «[]» and are cross-references — «X، see
// under Y» — which are pointers, not people, and are skipped.
//
// ---------------------------------------------------------------------------
// Closed vocabularies, not heuristics
//
// The first attempt at the verdict took the word immediately before the ṭabaqa,
// which is where it usually sits. Measured, that yields «حبان» (from ذكره ابن
// حبان في الثقات), «أخطأ», «بالإرجاء» — junk, roughly a fifth of the time, and
// junk that looks like a grading. Ibn Ḥajar's gradings are a closed set he uses
// deliberately and consistently, so they are matched as a set, longest form
// first. The same for the ṭabaqāt, which are twelve ordinals: matching «من ال…»
// generically pulled in «الكوفي», matching the twelve pulls in nothing false.
//
// Where a field is not found it stays null. Ibn Ḥajar is frequently silent
// about a man's birth or his city, and silence is the correct output.
// ---------------------------------------------------------------------------

/** The twelve ṭabaqāt, as Ibn Ḥajar names them. */
const TABAQAT = [
  'الأولى', 'الثانية عشرة', 'الحادية عشرة', 'الثانية', 'الثالثة', 'الرابعة',
  'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة',
];

// Longest first: «الثانية عشرة» must win over «الثانية».
const TABAQA = new RegExp(
  `من\\s+(${[...TABAQAT].sort((a, b) => b.length - a.length).join('|')})(?![\\u0621-\\u064a])`,
);

/**
 * Ibn Ḥajar's grading vocabulary, longest first.
 *
 * Ordered so «ثقة حافظ» matches ahead of «ثقة» and «مجهول الحال» ahead of
 * «مجهول» — the qualified form is a different judgement, not decoration.
 */
const VERDICTS = [
  'ثقة ثبت', 'ثقة حافظ', 'ثقة فقيه', 'ثقة عابد', 'ثقة حجة',
  'صدوق يهم', 'صدوق يخطئ', 'صدوق يخطىء', 'صدوق له أوهام',
  'مجهول الحال', 'مجهول العين', 'متهم بالكذب', 'لين الحديث', 'ضعيف الحديث',
  'لا بأس به', 'له صحبة', 'متروك', 'مقبول', 'مستور', 'مجهول', 'ضعيف',
  'صدوق', 'كذاب', 'وضاع', 'صحابي', 'ثقة', 'لين',
];

const ARABIC_LETTER = '\\u0621-\\u064a';
const VERDICT = new RegExp(
  `(?<![${ARABIC_LETTER}])(${VERDICTS.join('|')})(?![${ARABIC_LETTER}])`,
);

/** «مات سنة …», and its «بعد / قبل / في» variants, to the end of the clause. */
const DEATH = /مات\s+(?:سنة|بعد|قبل|في)[^،.]*/;

/** A kunya, in any of its three cases — foldName is not involved here. */
const KUNYA = new RegExp(`(?<![${ARABIC_LETTER}])(أب[ويا]|أم)\\s+(\\S+)`);

/** The entry's own number, at the head of the paragraph. */
const ENTRY_NUMBER = /^\s*([0-9٠-٩]+)\s*[-–—]\s*/;

/**
 * Where the name stops and Ibn Ḥajar's apparatus begins.
 *
 * He follows a name with orthographic vowelling notes — «بكسر المهملة وتخفيف
 * الموحدة» — which are instructions for pronouncing it, not part of it. They
 * open with a small set of particles, and cutting there gives a usable name
 * without trying to parse the notes themselves.
 */
const NOTE_START = new RegExp(
  `(?<![${ARABIC_LETTER}])(بكسر|بفتح|بضم|بسكون|بمهملة|بمعجمة|بموحدة|بمثناة|بتحتانية|` +
    `بفوقية|مصغر|مكبر|بالتصغير|بالتشديد|بالتخفيف|بجيم|بحاء|بخاء)(?![${ARABIC_LETTER}])`,
);

/** A nisba: «الـ…ي». What a man is generally known by, and often where he lived. */
const NISBA = new RegExp(`(?<![${ARABIC_LETTER}])(ال[${ARABIC_LETTER}]{2,}ي)(?![${ARABIC_LETTER}])`, 'g');

export const TAQRIB_WORK = 'تقريب التهذيب';

/** A pointer to another entry rather than a person. */
export function isCrossReference(text: string): boolean {
  return /^\s*\[\s*\]/.test(text.trim());
}

/** Whether this paragraph opens a numbered entry. */
export function isTaqribEntry(text: string): boolean {
  return !isCrossReference(text) && ENTRY_NUMBER.test(text);
}

export interface TaqribEntry {
  entryNumber: string;
  /** The name, cut before the vowelling notes. */
  name: string;
  profile: NarratorProfile;
}

/**
 * Parse one entry paragraph into fields.
 *
 * Returns null for anything that is not a numbered entry — a cross-reference, a
 * heading, a stray line — rather than producing a profile with a name and
 * nothing in it.
 */
export function parseTaqribEntry(text: string): TaqribEntry | null {
  const numbered = ENTRY_NUMBER.exec(text);
  if (!numbered || isCrossReference(text)) return null;

  const entryNumber = numbered[1];
  const body = text.slice(numbered[0].length).trim();
  if (body === '') return null;

  const tabaqa = TABAQA.exec(body);
  const death = DEATH.exec(body);

  // The verdict is looked for BEFORE the ṭabaqa, which is where Ibn Ḥajar puts
  // it. Searching the whole entry would pick up a grading he is quoting from
  // someone else in order to disagree with it.
  const head = tabaqa ? body.slice(0, tabaqa.index) : body;
  const verdict = VERDICT.exec(head);

  // The name runs to the first of: a vowelling note, the verdict, the ṭabaqa.
  const cuts = [NOTE_START.exec(body)?.index, verdict?.index, tabaqa?.index]
    .filter((at): at is number => typeof at === 'number' && at > 0);
  const name = (cuts.length > 0 ? body.slice(0, Math.min(...cuts)) : body).trim();

  const kunya = KUNYA.exec(body);
  const nisbas = [...body.matchAll(NISBA)].map((match) => match[1]);

  const profile = emptyProfile(foldName(name), name);
  const from = (value: string) => ({ value, source: 'taqrib' as const });

  if (kunya) profile.kunya = from(`${kunya[1]} ${kunya[2]}`);
  if (tabaqa) profile.generation = from(tabaqa[1]);
  if (death) profile.death = from(death[0].trim());
  if (verdict) profile.ibnHajar = from(verdict[1]);
  // The nisba is what a man is known by. The last one is normally the most
  // specific — «البلخي» after «العامري» — and is the useful label.
  if (nisbas.length > 0) profile.knownAs = from(nisbas[nisbas.length - 1]);

  // The entry entire, verbatim, under المصادر. Everything above is a reading of
  // this paragraph, and the reader must be able to check the reading.
  profile.sources.push({ work: TAQRIB_WORK, text, source: 'taqrib' });
  if (verdict) {
    profile.statements.push({
      work: TAQRIB_WORK,
      verdict: verdict[1],
      source: 'taqrib',
    });
  }
  profile.namings.push(foldName(name));

  return { entryNumber, name, profile };
}

/** Every entry in a book's blocks, in order. */
export function parseTaqribBlocks(blocks: Block[]): TaqribEntry[] {
  const entries: TaqribEntry[] = [];
  for (const block of blocks) {
    const entry = parseTaqribEntry(block.text);
    if (entry) entries.push(entry);
  }
  return entries;
}

/** Whether a book looks like Taqrīb — the work this parser was written for. */
export function isTaqrib(title: string): boolean {
  const folded = foldName(title);
  return folded.includes('تقريب') && folded.includes('تهذيب');
}
