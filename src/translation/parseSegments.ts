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
export function coerceSegments(
  value: unknown,
  arabicFor?: (record: Record<string, unknown>) => string | null,
): TranslatedSegment[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => coerceSegment(item, arabicFor))
    .filter((s): s is TranslatedSegment => s !== null);
}

/**
 * Every complete segment object of a JSON array, even when the array itself
 * was cut off.
 *
 * A reply that stops part-way — the connection ends, the model stops for a
 * reason of its own — can still hold three whole segments before the fourth
 * breaks off mid-string. `parseSegments` repairs only an array that needs
 * nothing but closing brackets, so that reply came out as "No JSON array
 * found" and the three segments were lost with it. This walks the array's
 * top level instead and keeps each object that closed, stopping at the first
 * that did not. `closed` says whether the array's own `]` arrived. Null when
 * there is no `[` at all.
 */
export function parseSegmentRecords(
  raw: string,
): { records: Record<string, unknown>[]; closed: boolean } | null {
  const unfenced = unfence(raw);
  const open = unfenced.indexOf('[');
  if (open === -1) return null;

  const records: Record<string, unknown>[] = [];
  let at = open + 1;
  while (at < unfenced.length) {
    const ch = unfenced[at];
    if (/\s|,/.test(ch)) {
      at++;
      continue;
    }
    if (ch === ']') return { records, closed: true };
    if (ch !== '{') break;
    const object = extractBalanced(unfenced, at, '{', '}', false);
    if (object === null) break;
    try {
      const parsed: unknown = JSON.parse(object);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        records.push(parsed as Record<string, unknown>);
      }
    } catch {
      break;
    }
    at += object.length;
  }
  return { records, closed: false };
}

/**
 * A JSON object written into a reply's text, for the paths that expected a
 * tool call and did not get one.
 *
 * With tool_choice auto the model can answer in text instead of calling the
 * tool, and when it does it usually writes the tool's arguments out as JSON —
 * fenced, after a sentence of preamble, or both. Every `{` is tried in turn, so
 * a stray brace in the preamble does not hide the object after it. Null when
 * there is genuinely nothing to recover.
 */
export function parseJsonObject(raw: string): Record<string, unknown> | null {
  const unfenced = unfence(raw);
  for (let start = unfenced.indexOf('{'); start !== -1; start = unfenced.indexOf('{', start + 1)) {
    const candidate = extractBalanced(unfenced, start, '{', '}');
    if (candidate === null) continue;
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Not this brace. Try the next.
    }
  }
  return null;
}

function unfence(raw: string): string {
  return raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

/** Strip markdown fences, then take the outermost bracketed array. */
function extractArray(raw: string): string | null {
  const unfenced = unfence(raw);
  const start = unfenced.indexOf('[');
  if (start === -1) return null;
  return extractBalanced(unfenced, start, '[', ']');
}

/** From an opening bracket at `start`, the text up to its matching close. */
function extractBalanced(
  unfenced: string,
  start: number,
  open: '[' | '{',
  close: ']' | '}',
  repair = true,
): string | null {
  // Scan for the matching bracket rather than using lastIndexOf, so a trailing
  // sentence after the JSON does not break the parse.
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

    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return unfenced.slice(start, i + 1);
    }
  }

  // Unterminated — the stream may have been cut off. Try closing it.
  if (depth > 0 && repair) {
    const repaired = unfenced.slice(start) + close.repeat(depth);
    try {
      JSON.parse(repaired);
      return repaired;
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * `arabicFor` is the Gemini path's: its segments name the pieces of the
 * passage they cover instead of echoing the Arabic (translation/sourceUnits.ts),
 * and it returns that Arabic, or null when the record names no usable pieces,
 * in which case an echoed `arabic` is still taken.
 */
function coerceSegment(
  value: unknown,
  arabicFor?: (record: Record<string, unknown>) => string | null,
): TranslatedSegment | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;

  const type = SEGMENT_TYPES.includes(record.type as SegmentType)
    ? (record.type as SegmentType)
    : 'prose';

  const arabic =
    arabicFor?.(record) ?? (typeof record.arabic === 'string' ? record.arabic : '');
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
