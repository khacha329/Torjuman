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

// ------------------------------------------------------------ finish reasons

/**
 * What each of Gemini's `finishReason` values means for a translation.
 *
 * Until this table only MAX_TOKENS, SAFETY and PROHIBITED_CONTENT were read;
 * every other stop fell through to the JSON parser, and a reply that stopped
 * with RECITATION after "[ {" reached the card as "No structured output
 * returned … No JSON array found" — a parse failure, which it was not. Now
 * every stop has its own message naming the reason, and only a reply that
 * finished normally (STOP) and still cannot be read is a parse failure.
 *
 * The values are the `FinishReason` enum of the Gemini API reference
 * (generateContent, Candidate.finishReason), read for this change. A content
 * filter's stop is a `refusal`; the others are `stopped`. MAX_TOKENS is
 * handled by the provider before this table (its budget retry, then
 * `truncated`), and STOP is not a stop to report. A value the API adds later
 * reaches `unknownFinishReason`, which still names it.
 */
export const GEMINI_FINISH_REASONS: Record<
  string,
  { kind: 'refusal' | 'stopped'; message: string }
> = {
  SAFETY: {
    kind: 'refusal',
    message: 'Gemini stopped because its safety filter flagged the reply (SAFETY).',
  },
  PROHIBITED_CONTENT: {
    kind: 'refusal',
    message: 'Gemini stopped because it flagged the reply as possibly prohibited content (PROHIBITED_CONTENT).',
  },
  BLOCKLIST: {
    kind: 'refusal',
    message: 'Gemini stopped because the reply contained a term on its blocklist (BLOCKLIST).',
  },
  SPII: {
    kind: 'refusal',
    message:
      'Gemini stopped because it flagged the reply as possibly holding sensitive personal information (SPII).',
  },
  ESCALATION: {
    kind: 'refusal',
    message: 'Gemini stopped because the request was filtered by an escalation rule (ESCALATION).',
  },
  RECITATION: {
    kind: 'stopped',
    message:
      'Gemini stopped because the reply reproduced a known text too closely (RECITATION). Classical books trigger this.',
  },
  LANGUAGE: {
    kind: 'stopped',
    message: 'Gemini stopped because it flagged the language as unsupported (LANGUAGE).',
  },
  OTHER: {
    kind: 'stopped',
    message: 'Gemini stopped for a reason it did not give (OTHER).',
  },
  FINISH_REASON_UNSPECIFIED: {
    kind: 'stopped',
    message: 'Gemini stopped with an unspecified finish reason (FINISH_REASON_UNSPECIFIED).',
  },
  MALFORMED_RESPONSE: {
    kind: 'stopped',
    message: 'Gemini stopped because its own reply was malformed (MALFORMED_RESPONSE).',
  },
  MALFORMED_FUNCTION_CALL: {
    kind: 'stopped',
    message:
      'Gemini stopped over a malformed tool call, though a translation offers it no tools (MALFORMED_FUNCTION_CALL).',
  },
  UNEXPECTED_TOOL_CALL: {
    kind: 'stopped',
    message:
      'Gemini stopped over a tool call, though a translation offers it no tools (UNEXPECTED_TOOL_CALL).',
  },
  TOO_MANY_TOOL_CALLS: {
    kind: 'stopped',
    message:
      'Gemini stopped after too many tool calls, though a translation offers it no tools (TOO_MANY_TOOL_CALLS).',
  },
  MISSING_THOUGHT_SIGNATURE: {
    kind: 'stopped',
    message: 'Gemini stopped because it reported a missing thought signature (MISSING_THOUGHT_SIGNATURE).',
  },
  CONTINUATION: {
    kind: 'stopped',
    message:
      'Gemini stopped at its per-request limit and expects the reply to be continued, which this app does not do (CONTINUATION).',
  },
  PUP_LIMITED_DISABLED: {
    kind: 'stopped',
    message:
      'Gemini stopped because the account is limited or disabled under its Prohibited Use Policy (PUP_LIMITED_DISABLED). Check the account in Google AI Studio.',
  },
  // Image-generation stops. A text request should never see one; each is
  // still named rather than read as a parse failure.
  IMAGE_SAFETY: { kind: 'stopped', message: 'Gemini stopped with an image-safety stop (IMAGE_SAFETY).' },
  IMAGE_PROHIBITED_CONTENT: {
    kind: 'stopped',
    message: 'Gemini stopped with an image stop (IMAGE_PROHIBITED_CONTENT).',
  },
  IMAGE_OTHER: { kind: 'stopped', message: 'Gemini stopped with an image stop (IMAGE_OTHER).' },
  IMAGE_RECITATION: { kind: 'stopped', message: 'Gemini stopped with an image stop (IMAGE_RECITATION).' },
  NO_IMAGE: { kind: 'stopped', message: 'Gemini stopped with an image stop (NO_IMAGE).' },
};

/** A finish reason the table does not know: still named, never a parse failure. */
export function unknownFinishReason(reason: string): { kind: 'stopped'; message: string } {
  return {
    kind: 'stopped',
    message: `Gemini stopped with a finish reason this app does not know (${reason}).`,
  };
}

/**
 * A reply whose stream closed without any finish reason. Gemini sets one on
 * the candidate when it stops generating, so a stream that ends without it
 * was cut — what the tablet showed as three whole segments and a fourth
 * broken off mid-string, reported as "No JSON array found".
 */
export const GEMINI_NO_FINISH_REASON =
  'The connection was interrupted: the reply from Gemini ended without a finish reason, before it was complete.';
