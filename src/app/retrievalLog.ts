// What retrieval actually did, kept where a tester can read it.
//
// ---------------------------------------------------------------------------
// Three failures that look identical and have nothing in common
//
// Every retrieval path in this app ends in the same place when it goes wrong:
// a panel with nothing in it. That single appearance covers three unrelated
// situations, and telling them apart is the whole difference between a
// five-minute fix and an evening:
//
//   data-absent    the source was never installed. Nothing was wrong with the
//                  lookup; there was nothing to look in. Fix: install it.
//   lookup-failed  the source is there, and the attempt broke — an HTTP error,
//                  a parse failure, a rejected origin. Fix: the code or the
//                  deployment.
//   no-match       the source is there, the lookup ran, and the answer is
//                  genuinely nothing. Fix: none. This is a correct result.
//
// The last one matters most. A working app that honestly reports "no entry for
// this name" is indistinguishable, from the outside, from a broken one — and
// treating a correct negative as a bug is how a debugging session gets spent on
// code that was already right.
//
// ---------------------------------------------------------------------------
// A ring buffer, not storage
//
// This is a module singleton in the manner of `activity` and `secrets`, and it
// is deliberately in memory only. A retrieval log that persisted would be one
// more thing to migrate, to clear, and to keep book text out of; and the
// question it answers — "what just happened when I tapped that?" — is always
// about the current session. It survives a navigation, not a reload.
//
// ---------------------------------------------------------------------------
// What must never appear here
//
// No API keys, in any field, ever — not in a URL, not in a header dump, not in
// an error message. Call sites pass URLs and statuses; none of this app's keys
// travel in a URL, and headers are never recorded at all, so the rule holds by
// construction rather than by vigilance. The sunnah.com route carries its key
// in a header for exactly this reason.
//
// Book text is different: an excerpt is often the only way to see that the
// wrong passage was returned, so short quotations are allowed and capped.
// ---------------------------------------------------------------------------

/** Which subsystem made the attempt. */
export type RetrievalKind = 'quran' | 'hadith' | 'biography' | 'seed';

export type RetrievalOutcome = 'hit' | 'no-match' | 'data-absent' | 'lookup-failed';

export interface RetrievalRecord {
  /** Monotonic, so React keys are stable across a re-render. */
  id: number;
  at: number;
  kind: RetrievalKind;
  outcome: RetrievalOutcome;
  /** What was asked for — an āyah key, a narrator, a name. */
  query: string;
  /** One line stating the result in the terms of that subsystem. */
  summary: string;
  /** Ordered label → value pairs. The per-kind fields the amendment names. */
  detail: [label: string, value: string][];
}

/**
 * How many attempts to keep.
 *
 * Opening one verse sheet can record four (the verse, plus tafsīr, similar and
 * sūrah info), so this is roughly the last ten interactions — enough to cover
 * "I tapped three things and none of them worked" without holding a session.
 */
const CAPACITY = 40;

/**
 * Longest value kept for any single field.
 *
 * The amendment asks for dorar's raw response body, which is the field that
 * makes the difference between "the request failed" and "the request succeeded
 * and returned an error document". Whole pages of it are not needed, and this
 * log lives in memory next to a book.
 */
const MAX_VALUE = 1200;

type Listener = (records: readonly RetrievalRecord[]) => void;

const listeners = new Set<Listener>();
let records: RetrievalRecord[] = [];
let nextId = 1;

function truncate(value: string): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  if (flat.length <= MAX_VALUE) return flat;
  return `${flat.slice(0, MAX_VALUE)}… [${flat.length - MAX_VALUE} more characters]`;
}

/** Record one retrieval attempt. Never throws — diagnostics must not break the
 *  thing they are diagnosing. */
export function recordRetrieval(record: Omit<RetrievalRecord, 'id' | 'at'>): void {
  try {
    const entry: RetrievalRecord = {
      ...record,
      id: nextId++,
      at: Date.now(),
      query: truncate(record.query),
      summary: truncate(record.summary),
      detail: record.detail.map(([label, value]) => [label, truncate(String(value))]),
    };
    records = [entry, ...records].slice(0, CAPACITY);
    for (const listener of listeners) listener(records);
  } catch {
    // Deliberately swallowed.
  }
}

export function retrievalRecords(): readonly RetrievalRecord[] {
  return records;
}

export function clearRetrievalLog(): void {
  records = [];
  for (const listener of listeners) listener(records);
}

export function subscribeRetrieval(listener: Listener): () => void {
  listeners.add(listener);
  listener(records);
  return () => {
    listeners.delete(listener);
  };
}

export const OUTCOME_LABEL: Record<RetrievalOutcome, string> = {
  hit: 'found',
  'no-match': 'no match',
  'data-absent': 'data absent',
  'lookup-failed': 'lookup failed',
};

/**
 * What each outcome means for whoever is reading the panel.
 *
 * Written for the tester, not the developer: the useful thing to know is whose
 * problem it is and what the next move would be.
 */
export const OUTCOME_MEANING: Record<RetrievalOutcome, string> = {
  hit: 'The source answered.',
  'no-match': 'The source was searched and genuinely has no entry. Not a fault.',
  'data-absent': 'The source is not installed on this device. Nothing was searched.',
  'lookup-failed': 'The source is present and the attempt broke. This is a fault.',
};

/** The log as plain text, for the diagnostics clipboard. */
export function formatRetrievalLog(): string[] {
  if (records.length === 0) return ['  no retrieval attempted this session'];

  return records.flatMap((record) => [
    `  ${new Date(record.at).toISOString()}  ${record.kind}  ` +
      `[${OUTCOME_LABEL[record.outcome]}]  ${record.query}`,
    `      ${record.summary}`,
    ...record.detail.map(([label, value]) => `      ${label}: ${value}`),
  ]);
}
