import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { HadithRecord } from '../types';

// Ḥadīth retrieval from sunnah.com.
//
// ---------------------------------------------------------------------------
// Access, as checked against the live service while building this:
//
//   api.sunnah.com/v1/collections               → HTTP 403 without a key
//   api.sunnah.com/v1/collections/…/hadiths/412 → HTTP 403 without a key
//
// There is no open public tier. Keys are issued on request via the contact form
// at sunnah.com; the key goes in Settings next to the Anthropic key.
//
// Riyāḍ aṣ-Ṣāliḥīn is also absent from every open mirror (the jsDelivr
// hadith-api carries Nawawī's Forty, not Riyāḍ aṣ-Ṣāliḥīn), so there is no
// keyless fallback to offer.
//
// Without a key, a hadith segment is shown as Arabic-only with an explicit note
// that no verified English translation was retrieved. A model-generated
// rendering is never substituted — that is the whole point of rule 2 in the
// translation profile.
// ---------------------------------------------------------------------------

const API = 'https://api.sunnah.com/v1';

/**
 * sunnah.com's slug for Riyāḍ aṣ-Ṣāliḥīn. The sharḥ numbers its hadiths with
 * the same running sequence, so the numbers captured at parse time map across
 * directly.
 */
export const RIYAD_COLLECTION = 'riyadussalihin';

/** Recognises the collection a model-supplied reference names. */
const COLLECTION_SLUGS: Record<string, string> = {
  'riyad as-salihin': RIYAD_COLLECTION,
  'riyad us-salihin': RIYAD_COLLECTION,
  'riyadh as-salihin': RIYAD_COLLECTION,
  riyadussalihin: RIYAD_COLLECTION,
  'riyad al-salihin': RIYAD_COLLECTION,
  'riyadh al-salihin': RIYAD_COLLECTION,
  'sahih al-bukhari': 'bukhari',
  'sahih bukhari': 'bukhari',
  'al-bukhari': 'bukhari',
  bukhari: 'bukhari',
  'sahih muslim': 'muslim',
  muslim: 'muslim',
  // Nawawī's Forty: sunnah.com's slug and the hadith-json one are the same.
  nawawi40: 'nawawi40',
  'nawawi 40': 'nawawi40',
  'forty hadith of an-nawawi': 'nawawi40',
  'an-nawawis forty': 'nawawi40',
  'nawawis forty': 'nawawi40',
  'al-arbain an-nawawiyyah': 'nawawi40',
  'arbain nawawi': 'nawawi40',
  'sunan abi dawud': 'abudawud',
  'sunan abu dawud': 'abudawud',
  'abu dawud': 'abudawud',
  'abu dawood': 'abudawud',
  abudawud: 'abudawud',
  'jami at-tirmidhi': 'tirmidhi',
  'jami al-tirmidhi': 'tirmidhi',
  'sunan at-tirmidhi': 'tirmidhi',
  'at-tirmidhi': 'tirmidhi',
  'al-tirmidhi': 'tirmidhi',
  tirmidhi: 'tirmidhi',
  // Keys are as `asciiFold` leaves them, so the apostrophe is already gone.
  'sunan an-nasai': 'nasai',
  'sunan al-nasai': 'nasai',
  'an-nasai': 'nasai',
  'al-nasai': 'nasai',
  nasai: 'nasai',
  'sunan ibn majah': 'ibnmajah',
  'ibn majah': 'ibnmajah',
  ibnmajah: 'ibnmajah',
  // Mālik and Aḥmad: sunnah.com's slugs, and the hadith-json ones.
  'muwatta malik': 'malik',
  'al-muwatta': 'malik',
  muwatta: 'malik',
  malik: 'malik',
  'musnad ahmad': 'ahmad',
  'musnad ahmad ibn hanbal': 'ahmad',
  'musnad imam ahmad': 'ahmad',
  ahmad: 'ahmad',
};

/** Collections recognised in references but never fetched from sunnah.com (see `fetchHadith`). */
export const SUNNAH_COM_SKIPPED: ReadonlySet<string> = new Set(['malik', 'ahmad']);

export interface HadithReference {
  collection: string;
  number: string;
}

/** Turn "Riyad as-Salihin 412" or "riyadussalihin:412" into a lookup. */
export function parseHadithReference(raw: string): HadithReference | null {
  return parseHadithReferences(raw)[0] ?? null;
}

/**
 * Every collection-and-number a model-supplied reference names, in its order.
 *
 * The model writes the reference the way a book's takhrīj does, not the way the
 * schema hopes: the owner's first Bukhārī test came back as "Ṣaḥīḥ al-Bukhārī 1;
 * Ṣaḥīḥ Muslim 1907". The old single-reference parser matched `[a-z' -]` only,
 * so the macrons, the dots under Ṣ and Ḥ, and the second citation each made it
 * return null, and with it both the sunnah.com and the hadith-json lookups were
 * never tried. So: split on the separators a citation list uses, fold the
 * transliteration to plain ASCII, and accept "no." or "#" before the number.
 */
export function parseHadithReferences(raw: string): HadithReference[] {
  const out: HadithReference[] = [];
  // A comma or slash before a digit is part of the number, never a separator:
  // "Bukhārī 6,406" or a volume/page «1/412» split there would become ḥadīth 6
  // or 1, and sunnah.com's English is shown without any check of the text
  // (review of 87f2a5e). Such a reference parses to nothing, as it always did.
  for (const part of raw.split(/[;؛،]|,(?!\s*\d)|\/(?!\s*\d)|\band\b/u)) {
    const text = asciiFold(part);
    const match = /^([a-z0-9' -]+?)\s*(?:[:#]|\bno\.?|\bnumber\b|\bhadith\b)?\s*(\d+)$/.exec(text);
    if (!match) continue;
    const slug = COLLECTION_SLUGS[match[1].replace(/\s+/g, ' ').trim()];
    if (slug && !out.some((ref) => ref.collection === slug && ref.number === match[2])) {
      out.push({ collection: slug, number: match[2] });
    }
  }
  return out;
}

/**
 * "Ṣaḥīḥ al-Bukhārī" → "sahih al-bukhari". Combining marks go with NFD; the ʿayn
 * and hamza signs (ʿ ʾ ʼ ‘ ’ ') are dropped, so "Nasāʾī" and "Nasa'i" fold alike,
 * and the typographic hyphens (non-breaking, en, em) become "-".
 */
function asciiFold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ʿʾʼ‘’'`]/g, '')
    .replace(/[‐‑‒–—]/g, '-')
    .toLowerCase()
    .trim();
}

export async function fetchHadith(
  http: HttpClient,
  storage: StorageAdapter,
  reference: HadithReference,
  apiKey: string,
): Promise<HadithRecord | null> {
  const key = `${reference.collection}:${reference.number}`;

  const cached = await storage.getHadith(key);
  if (cached) return cached;

  // Never asked of sunnah.com: its English is shown with no check against
  // the matn, and these two are cited by edition numbers that differ most
  // from sunnah.com's (the Muwaṭṭaʾ by recension, the Musnad by edition), so a
  // number the model gives could open a different ḥadīth. The imported
  // hadith-json files serve them instead, confirmed by text. The owner's
  // decision, 2026-11-22.
  if (SUNNAH_COM_SKIPPED.has(reference.collection)) return null;

  // Cached lookups still work offline; a live lookup needs the key.
  if (!apiKey) return null;

  let response;
  try {
    response = await http.get(
      `${API}/collections/${reference.collection}/hadiths/${reference.number}`,
      { headers: { 'X-API-Key': apiKey } },
    );
  } catch {
    return null;
  }
  if (!response.ok) return null;

  let payload: SunnahPayload;
  try {
    payload = JSON.parse(response.body) as SunnahPayload;
  } catch {
    return null;
  }

  const english = payload.hadith?.find((entry) => entry.lang === 'en');
  const arabic = payload.hadith?.find((entry) => entry.lang === 'ar');
  if (!english && !arabic) return null;

  const record: HadithRecord = {
    reference: key,
    collection: reference.collection,
    number: reference.number,
    arabic: stripHtml(arabic?.body ?? ''),
    english: stripHtml(english?.body ?? ''),
    grade: english?.grades?.[0]?.grade ?? null,
    sourceUrl: `https://sunnah.com/${reference.collection}:${reference.number}`,
    fetchedAt: Date.now(),
  };

  if (record.english === '' && record.arabic === '') return null;

  await storage.putHadith(record);
  return record;
}

interface SunnahPayload {
  hadith?: {
    lang?: string;
    body?: string;
    grades?: { grade?: string }[];
  }[];
}

function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}
