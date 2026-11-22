import { letterFold } from '../lib/arabic';
import { stripApparatus } from './sharh';

// Why a ḥadīth segment's verified English was not found, when the reason is
// in the segment itself: it holds commentary after the quotation.
//
// From a real Gemini Flash-Lite card (see the comment at the top of
// translation/sourceUnits.ts). Its ḥadīth segment was the quotation plus the commentary words after it,
// and the hadith-json match, which wants every word of a short quotation
// inside the stored ḥadīth, found nothing for it. (A sunnah.com lookup goes by
// the reference number and never reads the Arabic, so the overrun can only
// explain the imported collection's miss.) Cutting the pieces better makes
// this rare; when it still happens, the unavailable note says so.
//
// It lives here, not with the translation checks, because only the lookup
// knows whether it matters: a ḥadīth that was found anyway needs no note, and
// a note saying "a verified translation may not be found" beside one that was
// found would contradict the card (review of 099a676).

/**
 * Marks a quotation ends with. Kept in step by hand with CLOSERS in
 * translation/sourceUnits.ts, which this layer does not import.
 */
const QUOTATION_CLOSERS = '﴾»”)';

/**
 * What may follow a matn's closing mark and still be part of how it is
 * quoted, compared on the folded text (so a voweled رَوَاهُ مُسْلِمٌ matches):
 * a takhrīj, a grading, a closing formula. Each is a word or phrase the tail
 * starts with. Taken from typical Shamela typesetting, not measured against
 * a corpus, so a tail it does not know is still reported.
 */
const QUOTED_TAIL_STARTS = [
  'رواه',
  'اخرجه',
  'متفق عليه',
  'في روايه',
  'قال الترمذي',
  'قال ابو عيسي',
  'قال الحاكم',
  'قال الالباني',
  'حديث حسن',
  'حديث صحيح',
  'حديث ضعيف',
  'حسن صحيح',
  'اسناده',
  'صححه',
  'حسنه',
  'ضعفه',
  'الحديث',
  'الايه',
  'الي اخر الايه',
  'او كما قال',
  'قالها',
];

function isQuotedTail(folded: string): boolean {
  const tail = folded.replace(/^و/, '');
  return QUOTED_TAIL_STARTS.some((start) => tail === start || tail.startsWith(`${start} `));
}

/**
 * The words after a ḥadīth segment's quotation that are not part of it, as
 * the book spells them (at most six, with … when there were more), or null
 * when there are none or the quotation cannot be found.
 *
 * Only what follows the last closing mark is looked at. A lead-in such as
 * «قال:» before a matn is how a ḥadīth is normally quoted. A segment with no
 * quotation marks — a matn block printed without them — is not checked, since
 * nothing in it says where the quotation ends. A citation in [ ] after the
 * closer is ignored. A parenthesis inside the commentary hides the words
 * before it, since its ) becomes the last closer; a miss, not a false alarm.
 */
export function hadithQuotationOverrun(arabic: string): string | null {
  let last = -1;
  for (const mark of QUOTATION_CLOSERS) last = Math.max(last, arabic.lastIndexOf(mark));
  if ((arabic.match(/"/g) ?? []).length >= 2) last = Math.max(last, arabic.lastIndexOf('"'));
  if (last === -1) return null;
  const rest = arabic.slice(last + 1).replace(/\[[^\]]*\]/g, ' ');
  const folded = letterFold(stripApparatus(rest));
  if (folded === '' || isQuotedTail(folded)) return null;
  const words = rest
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .split(/\s+/);
  return words.length > 6 ? `${words.slice(0, 6).join(' ')}…` : words.join(' ');
}

/** Added to the unavailable note when the segment ran on past its quotation. */
export function quotationOverrunNote(words: string): string {
  return (
    `This segment also holds words after the quotation («${words}»), which belong to ` +
    'the commentary; that may be why the imported ḥadīth collection did not match it.'
  );
}
