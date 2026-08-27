import type { SegmentType, TranslatedSegment } from '../types';

// The model is told to return a bare JSON array. This parses that defensively:
// a stray ```json fence, a sentence of preamble, or a trailing note must not
// lose the user a translation they have already paid for. When it genuinely
// cannot be parsed the raw text is handed back so the card can show it.

const SEGMENT_TYPES: SegmentType[] = ['quran', 'hadith', 'poetry', 'prose'];

export type SegmentParseResult =
  | { ok: true; segments: TranslatedSegment[] }
  | { ok: false; error: string; raw: string };

export function parseSegments(raw: string): SegmentParseResult {
  const candidate = extractArray(raw);
  if (candidate === null) {
    return { ok: false, error: 'No JSON array found in the response.', raw };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid JSON.',
      raw,
    };
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'Response was JSON but not an array.', raw };
  }

  const segments = coerceSegments(parsed);
  if (segments.length === 0) {
    return { ok: false, error: 'The array contained no usable segments.', raw };
  }

  return { ok: true, segments };
}

/**
 * Turn already-parsed data into segments.
 *
 * Used by the schema-enforced paths, where the provider hands back structured
 * data directly and there is no text to parse — and by the text parser once it
 * has produced an array.
 */
export function coerceSegments(value: unknown): TranslatedSegment[] {
  if (!Array.isArray(value)) return [];
  return value.map(coerceSegment).filter((s): s is TranslatedSegment => s !== null);
}

/** Strip markdown fences, then take the outermost bracketed array. */
function extractArray(raw: string): string | null {
  const unfenced = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  const start = unfenced.indexOf('[');
  if (start === -1) return null;

  // Scan for the matching bracket rather than using lastIndexOf, so a trailing
  // sentence after the array does not break the parse.
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < unfenced.length; i++) {
    const ch = unfenced[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '[') depth++;
    else if (ch === ']') {
      depth--;
      if (depth === 0) return unfenced.slice(start, i + 1);
    }
  }

  // Unterminated — the stream may have been cut off. Try closing it.
  if (depth > 0) {
    const repaired = unfenced.slice(start) + ']'.repeat(depth);
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return null;
    }
  }

  return null;
}

function coerceSegment(value: unknown): TranslatedSegment | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const type = SEGMENT_TYPES.includes(record.type as SegmentType)
    ? (record.type as SegmentType)
    : 'prose';

  const arabic = typeof record.arabic === 'string' ? record.arabic : '';
  const english = typeof record.english === 'string' ? record.english : '';
  if (arabic === '' && english === '') return null;

  const uncertainTerms = Array.isArray(record.uncertainTerms)
    ? record.uncertainTerms.filter((term): term is string => typeof term === 'string')
    : undefined;

  return {
    type,
    arabic,
    english,
    source: record.source === 'quran.com' || record.source === 'sunnah.com' ? record.source : 'model',
    reference: typeof record.reference === 'string' ? record.reference : undefined,
    note: typeof record.note === 'string' ? record.note : undefined,
    uncertainTerms: uncertainTerms?.length ? uncertainTerms : undefined,
  };
}
