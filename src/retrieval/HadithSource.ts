import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { HadithRecord, HadithSourceId } from '../types';
import { fetchHadith, parseHadithReference } from './sunnah';
import { searchDorar, type DorarDiagnostics } from './dorar';
import { narratorIn } from './narrator';

// The seam between the app and whichever service knows about a ḥadīth.
//
// ---------------------------------------------------------------------------
// Two sources, and they are not interchangeable
//
// sunnah.com answers by reference — "riyadussalihin:412" — and carries a
// verified English translation. dorar.net answers by text search and carries
// something sunnah.com's API does not expose at all: the narrator, the scholar
// who graded it, where the grading was printed, and the grade itself.
//
// dorar returns Arabic only. That was checked rather than assumed, and the
// consequence is written into the shape of this file: `providesEnglish` is a
// property of the source, DorarSource sets it false, and `english` is never
// populated from a source that does not provide it. A ḥadīth with no verified
// English is still shown as Arabic plus an honest note — the invariant is
// untouched, because dorar changes what metadata is available, not who is
// permitted to generate scripture.
// ---------------------------------------------------------------------------

export interface HadithQuery {
  /** "riyadussalihin:412", when the book's numbering maps to a collection. */
  reference: string;
  /** The matn as it stands in the book. dorar searches by text, not by number. */
  arabicText: string;
  /**
   * The passage around the matn, where the isnād formula lives.
   *
   * The narrator is what decides which dorar records belong to this narration,
   * and «وعن أبي هريرة رضي الله عنه قال» sits *before* the matn — so the entity
   * range alone is usually not enough to read it from.
   */
  contextText?: string;
}

export interface HadithLookupResult {
  record: HadithRecord | null;
  /** Present whenever dorar was consulted. Feeds the diagnostics view. */
  diagnostics: DorarDiagnostics | null;
}

export interface HadithSourceOptions {
  sunnahApiKey: string;
}

export interface HadithSourceDescriptor {
  id: HadithSourceId;
  displayName: string;
  /** Whether this source can supply a verified English translation. */
  providesEnglish: boolean;
  needsKey: boolean;
  note: string;
}

export const HADITH_SOURCES: HadithSourceDescriptor[] = [
  {
    id: 'sunnah',
    displayName: 'sunnah.com',
    providesEnglish: true,
    needsKey: true,
    note: 'The only source here that carries a verified English translation. Needs a key, issued on request.',
  },
  {
    id: 'dorar',
    displayName: 'dorar.net',
    providesEnglish: false,
    needsKey: false,
    note: 'Arabic only — no English. Gives the narrator, the grading scholar and the grade, which sunnah.com’s API does not expose.',
  },
];

export function hadithSourceFor(id: HadithSourceId): HadithSourceDescriptor {
  return HADITH_SOURCES.find((source) => source.id === id) ?? HADITH_SOURCES[0];
}

/**
 * Look a ḥadīth up, merging what each source is actually good for.
 *
 * Order is not a preference between equals. sunnah.com is tried first whenever
 * its key is present because it is the only path to a verified translation, and
 * dorar is then consulted for the grading and takhrīj that sunnah.com does not
 * return — so a ḥadīth with a key present ends up with both, and one without a
 * key ends up with Arabic, a grade, and no English.
 *
 * Every response is cached permanently by reference: a ḥadīth looked up once
 * over the network is available on the tablet with no network thereafter.
 */
export async function lookupHadith(
  http: HttpClient,
  storage: StorageAdapter,
  query: HadithQuery,
  options: HadithSourceOptions & { preferred: HadithSourceId; online: boolean },
): Promise<HadithLookupResult> {
  const cached = query.reference ? await storage.getHadith(query.reference) : undefined;

  // A cached record that already carries its gradings is finished. One without
  // them is worth topping up once there is a network again.
  if (cached?.gradings || (cached && !options.online)) {
    return { record: cached, diagnostics: null };
  }
  if (!options.online) return { record: cached ?? null, diagnostics: null };

  const parsed = query.reference ? parseHadithReference(query.reference) : null;

  let record: HadithRecord | null = cached ?? null;

  const wantSunnah = options.preferred === 'sunnah' || Boolean(options.sunnahApiKey);
  if (!record?.english && wantSunnah && parsed && options.sunnahApiKey) {
    record = (await fetchHadith(http, storage, parsed, options.sunnahApiKey)) ?? record;
  }

  // dorar is consulted for what it is for: grading and takhrīj. It is never
  // consulted for English, and cannot supply any — see the header.
  if (query.arabicText.trim() === '') {
    return { record, diagnostics: null };
  }

  // The narrator comes from the surrounding passage where possible: the isnād
  // formula sits before the matn, so the entity range alone usually does not
  // carry it.
  const narrator =
    narratorIn(query.contextText ?? '') ?? narratorIn(query.arabicText) ?? null;

  const { hits, diagnostics } = await searchDorar(http, {
    arabicText: query.arabicText,
    narrator,
  });

  // An empty list is still an answer, and it is recorded as one: without it a
  // ḥadīth whose narrator matched nothing would be re-queried on every tap.
  record = {
    reference: query.reference || `dorar:${diagnostics.query.slice(0, 40)}`,
    collection: record?.collection ?? parsed?.collection ?? 'dorar',
    number: record?.number ?? parsed?.number ?? '',
    // The book's own matn wins over dorar's copy, and this is not a preference.
    // dorar is a text search, so a hit is a *narration* of the same ḥadīth
    // rather than the same wording — the top hit for «إنما الأعمال بالنيات»
    // comes back with bracketed editorial notes. Showing that in place of what
    // the reader has in front of them would rewrite the text of the book.
    arabic: record?.arabic || query.arabicText,
    // Deliberately not touched. dorar has no English to give.
    english: record?.english ?? '',
    // No single representative grade: with several gradings there is no such
    // thing, and with none there is nothing to report.
    grade: hits.length === 1 ? (hits[0].attribution.grade ?? null) : (record?.grade ?? null),
    sourceUrl: record?.sourceUrl ?? 'https://dorar.net/hadith',
    fetchedAt: Date.now(),
    sourceId: record?.english ? 'sunnah' : 'dorar',
    gradings: hits.map((hit) => hit.attribution),
    narrator,
  };

  if (record.reference) await storage.putHadith(record);

  return { record, diagnostics };
}
