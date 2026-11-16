import Anthropic from '@anthropic-ai/sdk';
import { TranslationError } from './TranslationProvider';

// What every Claude call in the app shares, so the SDK is used the same way
// everywhere: the client (step 3d) and the short error mapping (3c). It sits in the translation core rather than under providers/
// because Explain and gloss (here in translation/) and QUL compile use it as
// well as the provider, and the translation core may not import its providers
// (docs/refactor/layers.json). Restructure Phase 3 gave it one home; check Q
// (scripts/verify-requests.ts) shows every call sends what it sent before.

// `dangerouslyAllowBrowser` is what makes the SDK send
// `anthropic-dangerous-direct-browser-access: true`, required for browser calls
// and correct here: a local, single-user, bring-your-own-key app. The key goes
// to api.anthropic.com and nowhere else, is never logged, and never appears in
// an error message.

/** The SDK client every Anthropic call uses; one per call, as before. */
export function anthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

/**
 * The short error mapping Explain, gloss and compile use: a rejected key, a
 * rate limit, no connection, and anything else as an API error with the
 * SDK's message. It returns the error so a caller writes
 * `throw anthropicCallError(error)`. Moved verbatim from explain.ts in step 3c;
 * gloss.ts had the same lines, and compile.ts the same without the first one,
 * which its `try` could never need. Translation and the key check use the
 * fuller mapping in providers/AnthropicProvider.ts, whose messages and
 * retry-after differ (FOUND_ISSUES 11).
 */
export function anthropicCallError(error: unknown): TranslationError {
  if (error instanceof TranslationError) return error;
  if (error instanceof Anthropic.AuthenticationError) {
    return new TranslationError('auth', 'Your Anthropic API key was rejected.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new TranslationError('rate-limit', 'Rate limited. Wait a moment and try again.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new TranslationError('network', 'Could not reach api.anthropic.com.');
  }
  return new TranslationError(
    'api',
    error instanceof Error ? error.message : String(error),
  );
}
