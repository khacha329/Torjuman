/**
 * Seconds to wait, from a `retry-after` header's value, or null.
 *
 * RFC 9110 allows two forms: a number of seconds, or an HTTP date. Both call
 * sites read only the first, with `Number()`, so a date gave `NaN` seconds on
 * the Claude path, and on the Gemini path its own 2 s / 4 s / 8 s backoff
 * instead of the wait asked for (FOUND_ISSUES 11).
 *
 * Null means "no usable wait". Gemini translate then falls back to its own
 * backoff; on the Claude path (where the SDK does the waiting) no wait is
 * reported. A date already past is null too, not 0: a tablet clock running
 * ahead of the server would otherwise make Gemini retry with no backoff at all.
 */
export function retryAfterSeconds(header: string | null | undefined): number | null {
  if (header === null || header === undefined) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  const wait = Math.ceil((at - Date.now()) / 1000);
  return wait > 0 ? wait : null;
}

/**
 * Seconds to wait, from Anthropic's `retry-after-ms` header, or null. The SDK
 * reads this one before `retry-after`; the app read only the latter, so with
 * `retry-after-ms` alone the wait the SDK knew was reported as null
 * (FOUND_ISSUES 15.4).
 *
 * Read the way the SDK reads it (client.mjs `retryRequest`): `parseFloat`, and
 * a value of 0 or none counts as absent, so the caller falls through to
 * `retry-after` as the SDK does.
 */
export function retryAfterMsSeconds(header: string | null | undefined): number | null {
  if (!header) return null;
  const ms = parseFloat(header);
  return Number.isFinite(ms) && ms > 0 ? ms / 1000 : null;
}
