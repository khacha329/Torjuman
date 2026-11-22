import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { HadithRecord, HadithSourceId } from '../types';
import { fetchHadith, parseHadithReference } from './sunnah';
import { searchDorar, type DorarDiagnostics } from './dorar';
import { narratorIn } from './narrator';
import { composeEnglish, findLocalHadith, HADITH_JSON_ATTRIBUTION, hadithJsonCollection } from './hadithJson';
import { loadHadithIndexes, searchHadithText, type IndexProgress } from './hadithTextIndex';
import { QUOTED_IN_PART_BELOW } from './hadithText';
import { recordRetrieval } from '../services/retrievalLog';

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
  /**
   * The hadith-json collection the book's ḥadīth belong to (`hadithScopeFor`),
   * and the number the book prints. When the reference does not find the
   * ḥadīth — a sharḥ of one of the six main books, whose numbers are its own,
   * or a Riyāḍ number that does not confirm (Q19) — it is looked for by its
   * text in this one collection. The number orders what the text found, and
   * can settle two equally matching ḥadīth when one of them lies within
   * ±NEIGHBOUR_WINDOW of it and agrees with the text (`findHadithByText`'s one
   * exception); it never makes a match on its own.
   */
  scope?: { collection: string; numberHint?: number };
}

/** What the text search in the book's collection came to, for the sheet's wording. */
export type TextLookup =
  | { status: 'matched'; collection: string; partial: boolean; repetitions: number }
  | { status: 'no-match' | 'ambiguous' | 'not-imported'; collection: string };

export interface HadithLookupResult {
  record: HadithRecord | null;
  /** Present whenever dorar was consulted. Feeds the diagnostics view. */
  diagnostics: DorarDiagnostics | null;
  /**
   * Present when the query carried a scope and Arabic and the reference found
   * nothing. `matched` only when the English returned is that match's: a
   * sunnah.com English that wins over it (cached, or the preferred source)
   * leaves no `text`, so nothing claims the text identified it (review of
   * 78a5be2).
   */
  text?: TextLookup;
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
  {
    id: 'hadith-json',
    displayName: 'hadith-json (local)',
    providesEnglish: true,
    needsKey: false,
    note: `English from files you import in Settings — Riyāḍ aṣ-Ṣāliḥīn and Nawawī’s Forty, attributed “${HADITH_JSON_ATTRIBUTION}”. Works offline, needs no key, and is always tried first once imported; choosing it here only stops the sunnah.com key being spent on a ḥadīth it already covers.`,
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
  options: HadithSourceOptions & {
    preferred: HadithSourceId;
    online: boolean;
    /** Progress of a first-use index build (self-heal), for the spinner. */
    onIndexProgress?: (progress: IndexProgress) => void;
  },
): Promise<HadithLookupResult> {
  const cached = query.reference ? await storage.getHadith(query.reference) : undefined;

  // The imported dataset, if any, confirmed against the book's own matn. It is
  // applied to what is RETURNED and never to what is cached: the cache is read
  // by backups and shared chapters, and this text is the user's private import,
  // deletable in Settings. Writing it into `hadiths` would outlive that delete.
  const byReference = query.reference
    ? await findLocalHadith(storage, query.reference, query.arabicText)
    : null;
  let local: LocalEnglish | null = byReference
    ? {
        english: byReference.english,
        collection: byReference.collection,
        citable: byReference.citable,
        number: byReference.entry.number,
      }
    : null;
  let text: TextLookup | undefined;
  if (!local && query.scope && query.arabicText.trim() !== '') {
    const found = await lookupByText(storage, query.scope, query.arabicText, options.onIndexProgress);
    local = found.local;
    text = found.text;
  }
  const finish = (record: HadithRecord | null): HadithRecord | null =>
    withLocalEnglish(record, local, query);
  // The answer, with `text` dropped when a matched text's English is not the
  // English returned (an English already on the record wins in withLocalEnglish).
  const done = (record: HadithRecord | null, diagnostics: DorarDiagnostics | null): HadithLookupResult => {
    const finished = finish(record);
    const shown = text?.status === 'matched' && finished?.sourceId !== 'hadith-json' ? undefined : text;
    return { record: finished, diagnostics, text: shown };
  };

  // A cached record that already carries its gradings is finished. One without
  // them is worth topping up once there is a network again.
  if (cached?.gradings || (cached && !options.online)) {
    return done(cached, null);
  }
  if (!options.online) return done(cached ?? null, null);

  const parsed = query.reference ? parseHadithReference(query.reference) : null;

  let record: HadithRecord | null = cached ?? null;

  // A key is not spent on a ḥadīth the imported dataset already answers, unless
  // sunnah.com was chosen as the preferred source.
  const wantSunnah = options.preferred === 'sunnah' || Boolean(options.sunnahApiKey);
  if (
    !record?.english &&
    wantSunnah &&
    parsed &&
    options.sunnahApiKey &&
    (!local || options.preferred === 'sunnah')
  ) {
    record = (await fetchHadith(http, storage, parsed, options.sunnahApiKey)) ?? record;
  }

  // dorar is consulted for what it is for: grading and takhrīj. It is never
  // consulted for English, and cannot supply any — see the header.
  if (query.arabicText.trim() === '') {
    return done(record, null);
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

  return done(record, diagnostics);
}

/** The English laid over a record, from either the reference or the text. */
interface LocalEnglish {
  english: string;
  collection: string;
  citable: boolean;
  /** The dataset's position: shown or linked only where `citable`. */
  number: number;
}

/**
 * The book's matn looked for by its text in the book's one collection.
 *
 * Errors are an answer, not a failure of the sheet: a collection whose index
 * cannot be built, or a read that throws, reads as no match, and the reason
 * goes to the retrieval log (Settings → Retrieval) as the card path's does.
 * Nothing is cached (the rule at the top of `lookupHadith`).
 */
async function lookupByText(
  storage: StorageAdapter,
  scope: NonNullable<HadithQuery['scope']>,
  arabicText: string,
  onProgress?: (progress: IndexProgress) => void,
): Promise<{ local: LocalEnglish | null; text: TextLookup }> {
  const collection = scope.collection;
  try {
    const imported = (await storage.listQulResources()).some(
      (resource) => resource.kind === 'hadith-json' && resource.collection === collection,
    );
    if (!imported) return { local: null, text: { status: 'not-imported', collection } };
    const loaded = await loadHadithIndexes(storage, [collection], onProgress, (_, error) =>
      recordFailure(collection, error),
    );
    if (loaded.length === 0) return { local: null, text: { status: 'no-match', collection } };
    const result = await searchHadithText(storage, loaded, arabicText, {
      mode: 'segment',
      hints: scope.numberHint !== undefined ? [{ collection, number: scope.numberHint }] : [],
    });
    if (result.ambiguous) return { local: null, text: { status: 'ambiguous', collection } };
    const chosen = result.chosen;
    const entry = chosen ? result.entries.get(`${chosen.collection}:${chosen.number}`) : undefined;
    const english = entry ? composeEnglish(entry) : '';
    if (!chosen || english === '') return { local: null, text: { status: 'no-match', collection } };
    return {
      local: {
        english,
        collection,
        citable: hadithJsonCollection(collection)?.citableNumbers ?? false,
        number: chosen.number,
      },
      text: {
        status: 'matched',
        collection,
        partial: chosen.coverageOfMatn < QUOTED_IN_PART_BELOW,
        repetitions: result.repetitions,
      },
    };
  } catch (error) {
    recordFailure(collection, error);
    return { local: null, text: { status: 'no-match', collection } };
  }
}

function recordFailure(collection: string, error: unknown): void {
  recordRetrieval({
    kind: 'hadith',
    outcome: 'lookup-failed',
    query: `text search in ${collection}`,
    summary: 'The text search could not run; the sheet says nothing matched.',
    detail: [['error', error instanceof Error ? error.message : String(error)]],
  });
}

/**
 * Lay the imported English over a record, unless a verified English is already
 * there (sunnah.com's own, fetched with a key, wins over a scrape of it).
 *
 * The Arabic is never touched: the reader keeps the book's matn, and the
 * dataset's Arabic exists only to have confirmed the match.
 */
function withLocalEnglish(
  record: HadithRecord | null,
  local: LocalEnglish | null,
  query: HadithQuery,
): HadithRecord | null {
  if (!local || record?.english) return record;
  const parsed = query.reference ? parseHadithReference(query.reference) : null;
  return {
    reference: record?.reference ?? query.reference,
    collection: record?.collection ?? parsed?.collection ?? local.collection,
    number: record?.number ?? parsed?.number ?? (local.citable ? String(local.number) : ''),
    arabic: record?.arabic ?? '',
    english: local.english,
    grade: record?.grade ?? null,
    // No link built from a number that is only the dataset's own position: on
    // sunnah.com it would open a different ḥadīth (any collection whose
    // `citableNumbers` is false).
    sourceUrl: local.citable
      ? `https://sunnah.com/${local.collection}:${local.number}`
      : (record?.sourceUrl ?? null),
    fetchedAt: record?.fetchedAt ?? Date.now(),
    sourceId: 'hadith-json',
    gradings: record?.gradings,
    narrator: record?.narrator,
  };
}
