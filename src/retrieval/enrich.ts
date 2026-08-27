import type { HttpClient } from '../platform/http/HttpClient';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { TranslatedSegment } from '../types';
import { renderTakhrij } from '../lib/takhrij';
import { fetchVerse, type QuranLookupOptions } from './quran';
import { fetchHadith, parseHadithReference } from './sunnah';

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
  const parsed = segment.reference ? parseHadithReference(segment.reference) : null;

  const record = parsed
    ? await fetchHadith(deps.http, deps.storage, parsed, deps.sunnahApiKey)
    : null;

  if (!record || record.english === '') {
    return {
      ...segment,
      english: '',
      source: undefined,
      note: joinNotes(
        segment.note,
        deps.sunnahApiKey ? HADITH_UNAVAILABLE : HADITH_NEEDS_KEY,
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
