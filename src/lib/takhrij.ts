import { normalize } from './arabic';

// Takhrīj formulae, rendered from a fixed table rather than from a model.
//
// ---------------------------------------------------------------------------
// Why a table and not a translation
//
// «متفق عليه», «رواه البخاري», «رواه الترمذي وقال حديث حسن صحيح» — these are a
// closed set of about thirty phrases, and they mean exactly one thing each. A
// model asked to translate them will produce a different English wording every
// time it sees one, will occasionally expand «الأربعة» wrongly, and costs a
// token round trip to do it.
//
// A table is better on every axis that matters here: it is identical on the
// offline and the cloud path, it is free, it works with no network, and the
// rendering of «متفق عليه» in a lesson prepared in March is the same as the one
// prepared in September. That consistency is the point — these lines are read
// out loud in a study circle.
//
// This is attribution, not scripture, so it is unrelated to the ḥadīth
// invariant: the matn still never reaches a translation model, and nothing here
// changes that either way.
// ---------------------------------------------------------------------------

export interface TakhrijRendering {
  /** The formula as it was found, unmodified. */
  arabic: string;
  english: string;
}

/**
 * The closed set.
 *
 * Keyed by the block-search `normalize` fold, so a formula written with harakāt
 * matches the same entry as one written without. Written out in full rather
 * than assembled from parts: «رواه الشيخان» is not "reported by" plus "the two
 * shaykhs", it is a phrase with its own conventional rendering.
 */
const TABLE: [arabic: string, english: string][] = [
  // The two Ṣaḥīḥs.
  ['متفق عليه', 'Agreed upon — al-Bukhārī and Muslim both report it'],
  ['رواه الشيخان', 'Reported by the two Shaykhs — al-Bukhārī and Muslim'],
  ['رواه البخاري ومسلم', 'Reported by al-Bukhārī and Muslim'],
  ['أخرجه البخاري ومسلم', 'Recorded by al-Bukhārī and Muslim'],
  ['رواه البخاري', 'Reported by al-Bukhārī'],
  ['أخرجه البخاري', 'Recorded by al-Bukhārī'],
  ['رواه مسلم', 'Reported by Muslim'],
  ['أخرجه مسلم', 'Recorded by Muslim'],

  // The Sunan and the Musnad.
  ['رواه أبو داود', 'Reported by Abū Dāwūd'],
  ['رواه الترمذي', 'Reported by at-Tirmidhī'],
  ['رواه النسائي', 'Reported by an-Nasāʾī'],
  ['رواه ابن ماجه', 'Reported by Ibn Mājah'],
  ['رواه أحمد', 'Reported by Aḥmad'],
  ['رواه مالك', 'Reported by Mālik'],
  ['رواه الدارمي', 'Reported by ad-Dārimī'],
  ['رواه ابن حبان', 'Reported by Ibn Ḥibbān'],
  ['رواه ابن خزيمة', 'Reported by Ibn Khuzaymah'],
  ['رواه الحاكم', 'Reported by al-Ḥākim'],
  ['رواه البيهقي', 'Reported by al-Bayhaqī'],
  ['رواه الطبراني', 'Reported by aṭ-Ṭabarānī'],
  ['رواه الدارقطني', 'Reported by ad-Dāraquṭnī'],
  ['رواه أبو يعلى', 'Reported by Abū Yaʿlā'],

  // Collective formulae. These are the ones a model most often gets wrong,
  // because the expansion is a convention rather than a translation.
  [
    'رواه الأربعة',
    'Reported by the four — Abū Dāwūd, at-Tirmidhī, an-Nasāʾī and Ibn Mājah',
  ],
  [
    'رواه الجماعة',
    'Reported by the group — al-Bukhārī, Muslim, Abū Dāwūd, at-Tirmidhī, an-Nasāʾī and Ibn Mājah',
  ],
  ['رواه الخمسة', 'Reported by the five — the four along with Aḥmad'],

  // Gradings.
  ['حديث صحيح', 'A ṣaḥīḥ (authentic) ḥadīth'],
  ['حديث حسن', 'A ḥasan (sound) ḥadīth'],
  ['حديث حسن صحيح', 'A ḥasan ṣaḥīḥ ḥadīth'],
  ['إسناده صحيح', 'Its chain of transmission is authentic'],
  ['إسناده حسن', 'Its chain of transmission is sound'],
  [
    'وقال حديث حسن صحيح',
    'and he said: a ḥasan ṣaḥīḥ ḥadīth',
  ],

  // Wording notes that travel with a takhrīj.
  ['واللفظ له', 'and the wording is his'],
  ['وهذا لفظ مسلم', 'and this is Muslim’s wording'],
  ['وهذا لفظ البخاري', 'and this is al-Bukhārī’s wording'],
];

const BY_NORMALIZED = new Map(TABLE.map(([arabic, english]) => [normalize(arabic), english]));

/** Trailing and leading punctuation that is not part of the formula. */
const TRIM = /^[\s.،؛:()[\]«»"'-]+|[\s.،؛:()[\]«»"'-]+$/g;

/** Separators between two formulae on one line: «متفق عليه، رواه مسلم». */
const SEPARATORS = /[،؛,]|(?:\s+و(?=رواه|أخرجه|هذا|اللفظ|قال))/;

/**
 * Render a span of Arabic as takhrīj, or return null if it is not one.
 *
 * Returning null is the normal case and is not a failure — it simply means the
 * span is ordinary text and goes down whichever path it would have gone down
 * anyway. Nothing here ever guesses: a phrase that is not in the table is not
 * rendered by this function at all.
 */
export function renderTakhrij(text: string): TakhrijRendering | null {
  const trimmed = text.replace(TRIM, '');
  if (trimmed === '') return null;

  const whole = BY_NORMALIZED.get(normalize(trimmed));
  if (whole) return { arabic: trimmed, english: whole };

  // Two or more formulae on one line. Rendered only if EVERY piece is in the
  // table — a line that is half takhrīj and half commentary is commentary, and
  // handing back a partial rendering of it would be worse than handing back
  // nothing.
  const pieces = trimmed.split(SEPARATORS).filter((piece) => piece !== undefined);
  if (pieces.length < 2) return null;

  const rendered: string[] = [];
  for (const piece of pieces) {
    const cleaned = piece.replace(TRIM, '');
    if (cleaned === '') continue;
    const english = BY_NORMALIZED.get(normalize(cleaned));
    if (!english) return null;
    rendered.push(english);
  }

  if (rendered.length < 2) return null;
  return { arabic: trimmed, english: rendered.join('; ') };
}

/** How many formulae the table holds. Used by the verification script. */
export function takhrijTableSize(): number {
  return BY_NORMALIZED.size;
}
