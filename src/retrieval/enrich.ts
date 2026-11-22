import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { HadithRecord, TranslatedSegment } from '../types';
import { renderTakhrij } from '../lib/takhrij';
import { fetchVerse, type QuranLookupOptions } from './quran';
import { fetchHadith, parseHadithReferences, SUNNAH_COM_SKIPPED } from './sunnah';
import { findLocalHadith, type LocalHadith } from './hadithJson';

// Replaces the model's placeholder for scripture with the authoritative text.
//
// The profile forbids the model from translating a verse or a matn itself; it
// only identifies them and supplies a reference. This is the step that turns
// that reference into real text. When retrieval fails the Arabic is kept and
// the segment is explicitly marked as unavailable — never filled in by the
// model.

export interface EnrichDeps {
  http: HttpClient;
  storage: StorageAdapter;
  quran: QuranLookupOptions;
  sunnahApiKey: string;
  /** Verse references detected locally in the selected passage, in order. */
  knownQuranRefs?: string[];
}

export const QURAN_UNAVAILABLE =
  'Translation unavailable — the verse could not be retrieved, so no English rendering is shown. A model-generated translation is deliberately not substituted.';

export const HADITH_UNAVAILABLE =
  'No verified English translation was retrieved from sunnah.com, so none is shown. A model-generated translation is deliberately not substituted.';

export const HADITH_NEEDS_KEY =
  'No verified English translation was retrieved: sunnah.com requires an API key, which is not set in Settings. A model-generated translation is deliberately not substituted.';

export const HADITH_IMPORT_ONLY =
  'No verified English translation was found: for this collection the English comes only from the imported hadith-json file (Settings), and no imported ḥadīth matched this text. A model-generated translation is deliberately not substituted.';

export async function enrichSegments(
  segments: TranslatedSegment[],
  deps: EnrichDeps,
): Promise<TranslatedSegment[]> {
  const enriched: TranslatedSegment[] = [];

  // References resolved locally against the bundled muṣḥaf, consumed in order.
  // A locally matched reference beats a model-supplied one: one was proved
  // against the Qurʾān text, the other was recalled.
  const known = [...(deps.knownQuranRefs ?? [])];

  for (const segment of segments) {
    if (segment.type === 'quran') {
      const local = known.shift();
      enriched.push(
        await enrichQuran(local ? { ...segment, reference: local } : segment, deps),
      );
    } else if (segment.type === 'hadith') {
      enriched.push(await enrichHadith(segment, deps));
    } else {
      // A takhrīj formula is overwritten with the table's rendering even though
      // the model already produced one. That is the point of the table: the
      // same thirty phrases come out identically on this path and on the
      // offline one, in the wording the user will read aloud.
      enriched.push(applyTakhrijTable({ ...segment, source: 'model' }));
    }
  }

  return enriched;
}

async function enrichQuran(
  segment: TranslatedSegment,
  deps: EnrichDeps,
): Promise<TranslatedSegment> {
  const reference = segment.reference?.trim() ?? '';
  const verse = reference
    ? await fetchVerse(deps.http, deps.storage, reference, deps.quran)
    : null;

  if (!verse) {
    return {
      ...segment,
      // Keep whatever Arabic the model echoed from the source text.
      english: '',
      source: undefined,
      note: joinNotes(segment.note, QURAN_UNAVAILABLE),
    };
  }

  return {
    ...segment,
    arabic: verse.arabic,
    english: verse.english,
    source: 'quran.com',
    reference,
    note: joinNotes(segment.note, `English: ${verse.translationName}.`),
  };
}

async function enrichHadith(
  segment: TranslatedSegment,
  deps: EnrichDeps,
): Promise<TranslatedSegment> {
  // A takhrīj often names more than one collection ("Bukhārī 1; Muslim 1907").
  // Each is tried in the model's order; the first that yields English wins.
  const references = segment.reference ? parseHadithReferences(segment.reference) : [];

  let record: HadithRecord | null = null;
  for (const reference of references) {
    record = await fetchHadith(deps.http, deps.storage, reference, deps.sunnahApiKey);
    if (record && record.english !== '') break;
  }

  if (!record || record.english === '') {
    // The imported hadith-json collections, when there are any. The reference
    // is the model's and so is only a candidate; `findLocalHadith` confirms it
    // against the Arabic the segment carries before any English is returned.
    let local: LocalHadith | null = null;
    for (const reference of references) {
      local = await findLocalHadith(
        deps.storage,
        `${reference.collection}:${reference.number}`,
        segment.arabic,
      );
      if (local) break;
    }
    if (local) {
      return {
        ...segment,
        english: local.english,
        source: 'hadith-json',
        // Renumbered to the dataset only where its numbers are citable; for
        // every collection but Riyāḍ and the Forty, the dataset's position is
        // not (or not proven to be) the standard number.
        reference: local.citable
          ? `${local.collection}:${local.entry.number}`
          : segment.reference,
      };
    }
    return {
      ...segment,
      english: '',
      source: undefined,
      note: joinNotes(
        segment.note,
        // A sunnah.com key cannot help where every cited collection is one
        // sunnah.com is never asked for (Mālik, Aḥmad); say where it comes from.
        references.length > 0 && references.every((ref) => SUNNAH_COM_SKIPPED.has(ref.collection))
          ? HADITH_IMPORT_ONLY
          : deps.sunnahApiKey
            ? HADITH_UNAVAILABLE
            : HADITH_NEEDS_KEY,
      ),
    };
  }

  return {
    ...segment,
    // Prefer sunnah.com's Arabic when it has it; otherwise keep the source's.
    arabic: record.arabic || segment.arabic,
    english: record.english,
    source: 'sunnah.com',
    reference: `${record.collection}:${record.number}`,
    note: joinNotes(segment.note, record.grade ? `Grading: ${record.grade}.` : undefined),
  };
}

/**
 * Replace a takhrīj segment's English with the table's rendering.
 *
 * Returns the segment unchanged when it is not a takhrīj, which is the ordinary
 * case. Exported so both translation paths use the same function rather than
 * two implementations that could drift.
 */
export function applyTakhrijTable(segment: TranslatedSegment): TranslatedSegment {
  const rendered = renderTakhrij(segment.arabic);
  if (!rendered) return segment;
  return { ...segment, english: rendered.english, source: 'takhrij-table' };
}

function joinNotes(...parts: (string | undefined)[]): string | undefined {
  const kept = parts.filter((part): part is string => Boolean(part && part.trim()));
  return kept.length ? kept.join(' ') : undefined;
}
