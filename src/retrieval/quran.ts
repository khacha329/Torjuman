import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { QuranVerse } from '../types';
import { recordRetrieval } from '../app/retrievalLog';

// Qurʾān retrieval from the quran.com v4 API.
//
// ---------------------------------------------------------------------------
// A note on Dr. Mustafa Khattab's "The Clear Qurʾān", which the spec asks for.
//
// It is no longer served by the public quran.com API. Checked against the live
// API while building this: /api/v4/resources/translations lists 126 resources
// and none of them is Khattab; requesting the old id 131 returns HTTP 200 with
// an empty translations array rather than an error. The Clear Qurʾān is under
// an exclusive licence and has been withdrawn from the free tier. It is also
// absent from quranenc.com and the other open mirrors.
//
// So the translation is a *setting*, populated live from the API, defaulting to
// Sāḥīh International — the closest freely-licensed equivalent. If Khattab
// returns to the API, or you obtain Quran Foundation credentials that include
// it, it appears in the dropdown and can be selected without a code change.
//
// What is NOT done, per the spec: when retrieval fails, the verse is shown as
// Arabic-only with an explicit "translation unavailable" marker. A
// model-generated rendering of a verse is never substituted.
// ---------------------------------------------------------------------------

const API = 'https://api.quran.com/api/v4';

/** Sāḥīh International. Verified present in the live resource list. */
export const DEFAULT_TRANSLATION_ID = 20;
export const DEFAULT_TRANSLATION_NAME = 'Saheeh International';

export interface TranslationResource {
  id: number;
  name: string;
  authorName: string;
}

/** Populates the translation dropdown in Settings from the live API. */
export async function listEnglishTranslations(
  http: HttpClient,
): Promise<TranslationResource[]> {
  const response = await http.get(`${API}/resources/translations`);
  if (!response.ok) return [];

  const payload = JSON.parse(response.body) as {
    translations?: { id: number; name: string; author_name: string; language_name: string }[];
  };

  return (payload.translations ?? [])
    .filter((entry) => entry.language_name === 'english')
    .map((entry) => ({ id: entry.id, name: entry.name, authorName: entry.author_name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface QuranLookupOptions {
  translationId: number;
  translationName: string;
}

/**
 * Fetch a verse by "surah:ayah", caching it locally so repeat lookups are free
 * and work offline afterwards.
 */
export async function fetchVerse(
  http: HttpClient,
  storage: StorageAdapter,
  reference: string,
  options: QuranLookupOptions,
): Promise<QuranVerse | null> {
  const key = `${reference}@${options.translationId}`;

  // Every exit records. The amendment's requirement is that the three ways this
  // can come back empty are told apart, and the only place that distinction
  // exists is right here — by the time the caller has `null`, it is gone.
  const log = (
    outcome: 'hit' | 'no-match' | 'data-absent' | 'lookup-failed',
    summary: string,
    detail: [string, string][] = [],
  ) =>
    recordRetrieval({
      kind: 'quran',
      outcome,
      query: reference,
      summary,
      detail: [
        ['translation', `${options.translationName} (id ${options.translationId})`],
        ...detail,
      ],
    });

  const cached = await storage.getQuranVerse(key);
  if (cached) {
    log('hit', 'Served from the local cache; no request made.', [
      ['cached at', new Date(cached.fetchedAt).toISOString()],
      ['english', cached.english],
    ]);
    return cached;
  }

  if (!/^\d+:\d+$/.test(reference)) {
    log('lookup-failed', 'Reference is not in sūrah:āyah form, so no request was made.');
    return null;
  }

  const url =
    `${API}/verses/by_key/${reference}` +
    `?translations=${options.translationId}&fields=text_uthmani`;

  let response;
  try {
    response = await http.get(url);
  } catch (caught) {
    // The common case here is the proxy: an unconfigured or origin-rejected
    // Worker fails as a network error, which is indistinguishable from being
    // offline unless the reason is written down.
    log('lookup-failed', 'The request threw before a response arrived.', [
      ['url', url],
      ['error', caught instanceof Error ? caught.message : String(caught)],
      ['online', String(navigator.onLine)],
    ]);
    return null;
  }
  if (!response.ok) {
    log('lookup-failed', `The API answered HTTP ${response.status}.`, [
      ['url', url],
      ['status', String(response.status)],
      ['body', response.body],
    ]);
    return null;
  }

  let payload: {
    verse?: {
      text_uthmani?: string;
      translations?: { text: string }[];
    };
  };
  try {
    payload = JSON.parse(response.body);
  } catch {
    // HTTP 200 with a body that is not JSON is the signature of a static host
    // answering a path it does not have — index.html, status 200. Quoting the
    // body is what makes that recognisable at a glance.
    log('lookup-failed', 'The response was HTTP 200 but not JSON.', [
      ['url', url],
      ['body', response.body],
    ]);
    return null;
  }

  const arabic = payload.verse?.text_uthmani ?? '';
  const english = payload.verse?.translations?.[0]?.text ?? '';

  // A withdrawn translation id comes back as 200 with nothing in it. Treat that
  // as a failed retrieval rather than caching an empty English rendering.
  if (arabic === '' || english === '') {
    log(
      'data-absent',
      english === ''
        ? 'The API answered, but this translation carries no text for this āyah — ' +
            'the usual cause is a translation id that has been withdrawn from the free tier.'
        : 'The API answered with a translation but no Arabic.',
      [
        ['url', url],
        ['arabic returned', arabic === '' ? 'none' : `${arabic.length} characters`],
        ['english returned', english === '' ? 'none' : `${english.length} characters`],
      ],
    );
    return null;
  }

  const verse: QuranVerse = {
    reference: key,
    arabic,
    english: stripHtml(english),
    translationName: options.translationName,
    fetchedAt: Date.now(),
  };
  await storage.putQuranVerse(verse);
  log('hit', 'Retrieved and cached.', [
    ['url', url],
    ['english', verse.english],
  ]);
  return verse;
}

/** quran.com embeds footnote markers as <sup> tags in the translation text. */
function stripHtml(input: string): string {
  return input
    .replace(/<sup[^>]*>.*?<\/sup>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
