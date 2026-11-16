import { GEMINI_BASE } from './models';

// The request shape both Gemini model calls share: a model method's URL, and
// a JSON POST with the key in its header. Translation
// (providers/GeminiProvider.ts) and QUL compile (qul/compile.ts) each keep
// their own error handling, status checks and parsing, which differ
// (FOUND_ISSUES 11, compile's Gemini branch); only this is the same. The
// provider's key check is a GET and stays its own.
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
