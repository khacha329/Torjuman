/**
 * Seconds to wait, from a `retry-after` header's value, or null.
 *
 * RFC 9110 allows two forms: a number of seconds, or an HTTP date. Both call
 * sites read only the first, with `Number()`, so a date gave `NaN` seconds on
 * the Claude path and no wait at all on the Gemini one (FOUND_ISSUES 11). A
 * date already past is a wait of 0, and anything else unreadable is null, so
 * the caller falls back to its own backoff.
 */
export function retryAfterSeconds(header: string | null | undefined): number | null {
  if (header === null || header === undefined) return null;
  const trimmed = header.trim();
  if (trimmed === '') return null;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);

  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * Seconds to wait, from Anthropic's `retry-after-ms` header, or null. The SDK
 * reads this one before `retry-after`; the app read only the latter, so with
 * `retry-after-ms` alone the wait the SDK knew was reported as null
 * (FOUND_ISSUES 15.4).
 */
export function retryAfterMsSeconds(header: string | null | undefined): number | null {
  if (header === null || header === undefined || header.trim() === '') return null;
  const ms = Number(header);
  return Number.isFinite(ms) ? Math.max(0, ms / 1000) : null;
}
