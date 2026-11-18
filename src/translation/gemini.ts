import { GEMINI_BASE } from './models';
import { retryAfterSeconds } from './retryAfter';
import { TranslationError } from './TranslationProvider';

// What both Gemini model calls share: a model method's URL, a JSON POST with
// the key in its header, the reading of a 429's retry-after, and the mapping
// of an error response. Translation (providers/GeminiProvider.ts) and QUL
// compile (qul/compile.ts) keep their own parsing and their own retry policy:
// translation retries a 429 up to MAX_RETRIES, compile does not retry. Until
// FOUND_ISSUES 11 compile also had its own status checks and never read the
// error body, so a bad key, which Gemini reports as a 400, came out as `api`.
// The provider's key check is a GET and stays its own.
// Restructure Phase 3 step 3i gave it one home; check Q
// (scripts/verify-requests.ts) shows both send what they sent before.

/** `${GEMINI_BASE}/models/<model>:<method>`, the model name URL-encoded. */
export function geminiModelUrl(model: string, method: string): string {
  return `${GEMINI_BASE}/models/${encodeURIComponent(model)}:${method}`;
}

// The key travels in the `x-goog-api-key` header, never as a URL query
// parameter. Query strings end up in browser history, proxy logs and
// referrer headers; an API key does not belong in any of them.
export function postGemini(url: string, apiKey: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/** A 429's `retry-after`, in seconds, or null (either RFC 9110 form). */
export function readRetryAfter(response: Response): number | null {
  return retryAfterSeconds(response.headers.get('retry-after'));
}

/**
 * A non-OK Gemini response as a TranslationError, read from its JSON error
 * body: a rejected key (401, 403, PERMISSION_DENIED, or a message naming the
 * key, since Gemini reports a bad key as a 400), a model the key is not
 * offered, or any other API error with Gemini's own message. Moved from
 * providers/GeminiProvider.ts for FOUND_ISSUES 11, so compile maps the same.
 */
export async function geminiHttpError(response: Response): Promise<TranslationError> {
  let message = `HTTP ${response.status}`;
  let status = '';
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; status?: string };
    };
    message = payload.error?.message ?? message;
    status = payload.error?.status ?? '';
  } catch {
    // Keep the status-code message.
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    status === 'PERMISSION_DENIED' ||
    /api[_ ]?key/i.test(message)
  ) {
    return new TranslationError(
      'auth',
      'Your Gemini API key was rejected. Check it in Settings — this is a key problem, not a rate limit.',
    );
  }

  if (response.status === 400 && /not found|not supported/i.test(message)) {
    return new TranslationError(
      'api',
      `Gemini does not offer this model to your key: ${message}. Pick a different model in Settings.`,
    );
  }

  return new TranslationError('api', `Gemini API error: ${message}`);
}
