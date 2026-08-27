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
  'sahih al-bukhari': 'bukhari',
  bukhari: 'bukhari',
  'sahih muslim': 'muslim',
  muslim: 'muslim',
  'sunan abi dawud': 'abudawud',
  'abu dawud': 'abudawud',
  'jami at-tirmidhi': 'tirmidhi',
  tirmidhi: 'tirmidhi',
  "sunan an-nasa'i": 'nasai',
  nasai: 'nasai',
  'sunan ibn majah': 'ibnmajah',
  'ibn majah': 'ibnmajah',
};

export interface HadithReference {
  collection: string;
  number: string;
}

/** Turn "Riyad as-Salihin 412" or "riyadussalihin:412" into a lookup. */
export function parseHadithReference(raw: string): HadithReference | null {
  const text = raw.trim().toLowerCase();

  const colon = /^([a-z' -]+)\s*[:#]\s*(\d+)$/.exec(text);
  const spaced = /^([a-z' -]+?)\s+(\d+)$/.exec(text);
  const match = colon ?? spaced;
  if (!match) return null;

  const slug = COLLECTION_SLUGS[match[1].trim()];
  return slug ? { collection: slug, number: match[2] } : null;
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
