import { normalize } from '../lib/arabic';
import type { HttpClient } from '../platform/http/HttpClient';
import type { HadithAttribution } from '../types';
import { narratorMatches } from './narrator';
import { recordRetrieval, type RetrievalOutcome } from '../app/retrievalLog';

// dorar.net — grading and takhrīj, and nothing else.
//
// ---------------------------------------------------------------------------
// What was checked
//
// The amendment asks: verify whether the endpoint returns English before
// treating it as a translation source. It does not, and this was measured
// rather than assumed. A real response is in fixtures/dorar-search.json — a
// search for «إنما الأعمال بالنيات», fetched through the dev proxy — and it
// contains fifteen records and **zero Latin characters**. Matn, narrator,
// grading scholar, source book and grade are all Arabic. The English toggle is
// a property of the website, not of this endpoint.
//
// So dorar is wired up as a metadata source. `english` is never populated from
// here, by any path, and the "no verified English translation available" note
// stays exactly as it was. That is not a limitation to route around; it is the
// correct output.
//
// The parser below is written against that captured response, and reads each
// field by the Arabic label dorar prints before it rather than by class name —
// the same reasoning as the Shamela parser, where class numbers turned out to
// be unstable across volumes. Two shapes in the real markup are worth naming:
// the matn is prefixed with its result number ("3 - "), and records are
// separated by a run of dashes.
//
// The service also answers 403 to a plain request while accepting one that
// identifies as a browser, which is why the proxy in vite.config.ts sets a
// User-Agent and a Referer exactly as the Shamela proxy does.
// ---------------------------------------------------------------------------

const DORAR_API = 'https://dorar.net/dorar_api.json';

export interface DorarHit {
  arabic: string;
  attribution: HadithAttribution;
  /** Stable-ish identity for a hit that has no reference of its own. */
  fingerprint: string;
}

/**
 * The labels dorar prints before each field.
 *
 * These are what the reader sees on the page and what every consumer of this
 * service keys on. Reading by label rather than by markup is deliberate: it
 * survives a template change, and it fails visibly (a null field) rather than
 * silently (the wrong field) when something moves.
 */
const LABELS: [key: keyof HadithAttribution, label: string][] = [
  ['rawi', 'الراوي'],
  ['mohdith', 'المحدث'],
  ['book', 'المصدر'],
  ['numberOrPage', 'الصفحة أو الرقم'],
  ['grade', 'خلاصة حكم المحدث'],
  ['takhrij', 'التخريج'],
];

const EMPTY: HadithAttribution = {
  rawi: null,
  mohdith: null,
  book: null,
  numberOrPage: null,
  grade: null,
  takhrij: null,
};

/**
 * Everything a lookup did, for the diagnostics view.
 *
 * This is scraped markup behind a JSON envelope rather than a documented API,
 * so it will break when dorar changes their page. When it does, the useful
 * question is not "why is there no grading" but "what came back and what did it
 * match against" — so the request, the raw reply, the narrator, and which
 * records passed the filter are all kept.
 */
export interface DorarDiagnostics {
  /**
   * Which of the three kinds of empty this was.
   *
   * Stated at each exit rather than inferred afterwards from the status code
   * and the counts. Those two cannot separate the cases that matter: a parse
   * failure and a genuinely empty result set are both "HTTP 200, nothing
   * parsed", and calling the first one "no match" would report a broken scraper
   * as a correct negative — the exact confusion this field exists to end.
   *
   * The initial value is `lookup-failed`, so an exit added later and left
   * unannotated is reported as a fault rather than as a clean miss.
   */
  outcome: RetrievalOutcome;
  url: string;
  query: string;
  status: number;
  /** Truncated: this is for reading, not for re-parsing. */
  rawResponse: string;
  parsed: number;
  narrator: string | null;
  /** Narrators dorar returned, in order, so a near-miss is visible. */
  narratorsSeen: string[];
  matched: number;
  problem: string | null;
}

export interface DorarSearchResult {
  /** Records whose narrator matches the book's. Never reduced to one. */
  hits: DorarHit[];
  diagnostics: DorarDiagnostics;
}

/**
 * Search dorar and return every record that belongs to this narration.
 *
 * ---------------------------------------------------------------------------
 * Two rules, and they are the whole point of this function
 *
 * 1. NEVER auto-select a single result. dorar ranks by text match, so the top
 *    hit for the opening ḥadīth of Riyāḍ aṣ-Ṣāliḥīn is a different companion's
 *    narration graded as defective. There is no scoring rule over the matn that
 *    fixes this, because the difference is not in the text.
 *
 * 2. Filter by narrator, and show nothing when nothing matches. An unmatched
 *    grading is worse than an absent one — it is a false statement about a
 *    ḥadīth the user is about to teach from.
 *
 * What comes back is a list. Several scholars grading the same narration
 * differently is normal and is information the user needs; collapsing it to a
 * representative would be resolving a scholarly disagreement on his behalf.
 * ---------------------------------------------------------------------------
 */
export async function searchDorar(
  http: HttpClient,
  options: { arabicText: string; narrator: string | null },
): Promise<DorarSearchResult> {
  const result = await runDorarSearch(http, options);
  const d = result.diagnostics;

  // The distinction that earns its keep here is `no-match` on a full result
  // set: dorar answering with twelve records that are all some other
  // companion's narration is the pipeline working exactly as designed — the
  // narrator filter refusing to attach a grading to a ḥadīth it does not
  // belong to — and it presents as an empty panel, identically to a broken
  // request. Reading "12 parsed, 0 passed the filter" ends that in one glance.
  recordRetrieval({
    kind: 'hadith',
    outcome: d.outcome,
    query: d.query || '(no search term)',
    summary: d.problem ?? `${d.matched} of ${d.parsed} record(s) matched the narrator.`,
    detail: [
      ['url', d.url],
      ['status', d.status === 0 ? 'no response' : String(d.status)],
      ['narrator from the block', d.narrator ?? 'none extracted'],
      ['narrators returned', d.narratorsSeen.length ? d.narratorsSeen.join(' · ') : 'none'],
      ['parsed', String(d.parsed)],
      ['passed the filter', String(d.matched)],
      ['raw response', d.rawResponse || '(empty)'],
    ],
  });

  return result;
}

async function runDorarSearch(
  http: HttpClient,
  options: { arabicText: string; narrator: string | null },
): Promise<DorarSearchResult> {
  const query = searchTermFor(options.arabicText);
  const url = `${DORAR_API}?skey=${encodeURIComponent(query)}`;

  const diagnostics: DorarDiagnostics = {
    outcome: 'lookup-failed',
    url,
    query,
    status: 0,
    rawResponse: '',
    parsed: 0,
    narrator: options.narrator,
    narratorsSeen: [],
    matched: 0,
    problem: null,
  };

  if (query === '') {
    diagnostics.problem = 'The passage supplied no text to search for.';
    return { hits: [], diagnostics };
  }

  if (!options.narrator) {
    // Bailing out before the request, not after: without a narrator there is
    // no way to tell the records apart, so there is nothing to ask for.
    diagnostics.problem =
      'No narrator could be read from the passage, so no dorar record can be matched to it.';
    return { hits: [], diagnostics };
  }

  let body: string;
  try {
    const response = await http.get(url);
    diagnostics.status = response.status;
    body = response.body;
    diagnostics.rawResponse = body.slice(0, 4000);
    if (!response.ok) {
      diagnostics.problem = `dorar.net answered HTTP ${response.status}.`;
      return { hits: [], diagnostics };
    }
  } catch (error) {
    diagnostics.problem = `The request did not complete: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return { hits: [], diagnostics };
  }

  // Any parse failure is "no result" rather than an exception: this is scraped
  // markup, and a changed page must degrade rather than break the sheet.
  let all: DorarHit[];
  try {
    all = parseDorarResponse(body);
  } catch (error) {
    diagnostics.problem = `The response could not be parsed: ${
      error instanceof Error ? error.message : String(error)
    }`;
    return { hits: [], diagnostics };
  }

  diagnostics.parsed = all.length;
  diagnostics.narratorsSeen = [
    ...new Set(all.map((hit) => hit.attribution.rawi ?? '—')),
  ];

  if (all.length === 0) {
    // Parsed cleanly, and the answer is nothing. A correct negative.
    diagnostics.outcome = 'no-match';
    diagnostics.problem = 'dorar.net returned no records for this wording.';
    return { hits: [], diagnostics };
  }

  const hits = all.filter(
    (hit) => hit.attribution.rawi && narratorMatches(options.narrator!, hit.attribution.rawi),
  );
  diagnostics.matched = hits.length;

  if (hits.length === 0) {
    // The narrator filter doing its job. Also a correct negative, and the one
    // most often mistaken for a bug.
    diagnostics.outcome = 'no-match';
    diagnostics.problem =
      `dorar.net returned ${all.length} record(s), none narrated by ${options.narrator}. ` +
      'No grading is shown rather than one belonging to a different narration.';
  } else {
    diagnostics.outcome = 'hit';
  }

  return { hits, diagnostics };
}

/**
 * The opening words of the matn, as the search term.
 *
 * Long enough to be specific, short enough that a difference in the tail of the
 * ḥadīth — a different narration's extra clause — does not stop it matching.
 */
export function searchTermFor(arabicText: string): string {
  return arabicText
    .replace(/[()[\]«»"']/g, ' ')
    .split(/\s+/)
    .filter((word) => word !== '')
    .slice(0, 8)
    .join(' ')
    .trim();
}

/**
 * Unwrap JSONP if present, then read the HTML payload.
 *
 * The endpoint's callback parameter means a browser-side fetch may get
 * `callbackName({...})` rather than bare JSON. It is routed through HttpClient
 * (dev proxy in the browser phase, native HTTP under Capacitor) so CORS never
 * applies, but the wrapper can still be there and costs two lines to remove.
 */
export function parseDorarResponse(body: string): DorarHit[] {
  const trimmed = body.trim();
  const unwrapped = /^[A-Za-z_$][\w$]*\s*\(/.test(trimmed)
    ? trimmed.slice(trimmed.indexOf('(') + 1, trimmed.lastIndexOf(')'))
    : trimmed;

  let payload: { ahadith?: { result?: unknown } };
  try {
    payload = JSON.parse(unwrapped) as { ahadith?: { result?: unknown } };
  } catch {
    return [];
  }

  const html = payload.ahadith?.result;
  return typeof html === 'string' ? parseDorarHtml(html) : [];
}

/**
 * Split dorar's HTML result into records, reading each field by its label.
 *
 * ---------------------------------------------------------------------------
 * Inline tags are removed, not turned into whitespace
 *
 * dorar wraps each matched query term mid-phrase:
 *
 *   …<span class="search-keys">بالنِّيّاتِ</span>، وإنَّما لِكُلِّ…
 *
 * Flattening every tag to a newline and rejoining with spaces — the obvious
 * approach, and the first one taken here — inserts a space before that comma
 * and anywhere else a tag closes mid-word. The matn is compared against the
 * book's wording, so that is corruption, not cosmetics.
 *
 * So inline elements are deleted outright and only block-level ones become
 * newlines. The markup is also malformed — the الراوي field carries an
 * unmatched `</span>` — which this survives because nothing here depends on
 * tags nesting correctly.
 * ---------------------------------------------------------------------------
 */
export function parseDorarHtml(html: string): DorarHit[] {
  const text = html
    // The <head> block dorar prefixes its payload with is not content.
    .replace(/<\s*head[\s\S]*?<\s*\/\s*head\s*>/gi, '')
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    // Block-level boundaries are real line breaks.
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/?\s*(p|div|li|tr|h[1-6])\b[^>]*>/gi, '\n')
    // Everything else — span, a, b, i, and the stray unmatched closer — is
    // removed without leaving a space behind.
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // A field may share a line with the one before it if dorar ever stops
    // putting each on its own; splitting before every known label makes the
    // parse independent of that.
    .replace(labelBoundary(), '\n$1:')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    // A run of dashes is dorar's record separator. It is not matn.
    .filter((line) => line !== '' && !/^[-–—]{3,}$/.test(line));

  const hits: DorarHit[] = [];
  let matn: string[] = [];
  let attribution: HadithAttribution = { ...EMPTY };
  let sawLabel = false;

  const flush = () => {
    const arabic = matn
      .join(' ')
      // dorar numbers its results in the matn itself: "3 - إنما الأعمال…".
      // That is presentation, not text, and it must not end up in a record
      // that is scored against the book's own wording.
      .replace(/^\s*\d+\s*-\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (arabic !== '' && sawLabel) {
      hits.push({ arabic, attribution, fingerprint: fingerprintOf(arabic) });
    }
    matn = [];
    attribution = { ...EMPTY };
    sawLabel = false;
  };

  for (let index = 0; index < text.length; index++) {
    const line = text[index];
    const found = labelAt(line);

    if (found) {
      const [key, label] = found;
      let value = line.slice(label.length).replace(/^\s*:\s*/, '').trim();
      // dorar wraps the label in its own element, so flattening the markup
      // puts the label on one line and its value on the next. Both layouts are
      // handled, because which one arrives depends on markup this parser is
      // deliberately not tied to.
      if (value === '' && index + 1 < text.length && !labelAt(text[index + 1])) {
        value = text[++index];
      }
      attribution[key] = value === '' ? null : value;
      sawLabel = true;
      continue;
    }

    // A new matn after a completed record starts the next one.
    if (sawLabel) flush();
    matn.push(line);
  }
  flush();

  return hits;
}

function labelAt(line: string): [keyof HadithAttribution, string] | undefined {
  // Longest first, so «الصفحة أو الرقم» is not shadowed by a shorter prefix.
  return [...LABELS]
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, label]) => line.startsWith(label));
}

function fingerprintOf(arabic: string): string {
  const folded = normalize(arabic).replace(/\s+/g, '');
  let hash = 0;
  for (let index = 0; index < folded.length; index++) {
    hash = (hash * 31 + folded.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * A pattern that finds the start of any field label.
 *
 * Used to force a line break before each one, so the parse does not depend on
 * dorar continuing to put every field on its own source line. Built from the
 * same LABELS table as the reader, so the two cannot drift.
 */
function labelBoundary(): RegExp {
  const alternatives = [...LABELS]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([, label]) => label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  return new RegExp(`(${alternatives})\\s*:`, 'g');
}

/**
 * A raw response, for the connection test in Settings.
 *
 * Returned verbatim and truncated rather than parsed, because the point of the
 * test is to see what the service actually sends — including the case where the
 * parser above turns out to need adjusting.
 */
export async function probeDorar(
  http: HttpClient,
  arabicText: string,
): Promise<{ ok: boolean; status: number; body: string; hits: number }> {
  const query = searchTermFor(arabicText) || 'إنما الأعمال بالنيات';
  const response = await http.get(`${DORAR_API}?skey=${encodeURIComponent(query)}`);
  return {
    ok: response.ok,
    status: response.status,
    body: response.body.slice(0, 1200),
    hits: response.ok ? parseDorarResponse(response.body).length : 0,
  };
}
