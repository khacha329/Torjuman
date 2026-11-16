import Anthropic from '@anthropic-ai/sdk';
import { TranslationError } from './TranslationProvider';

// What every Claude call in the app shares, so the SDK is used the same way
// everywhere. It sits in the translation core rather than under providers/
// because Explain and gloss (here in translation/) and QUL compile use it as
// well as the provider, and the translation core may not import its providers
// (docs/refactor/layers.json). Restructure Phase 3 gave it one home; check Q
// (scripts/verify-requests.ts) shows every call sends what it sent before.

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
