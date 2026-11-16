import Anthropic from '@anthropic-ai/sdk';
import type { TranslationUsage } from '../types';
import { TranslationError } from './TranslationProvider';

// What every Claude call in the app shares, so the SDK is used the same way
// everywhere: the client, the text of a reply, the running token total, and
// the two error mappings — the short one for Explain, gloss and compile, the
// fuller one for translation and the key check. It sits in the translation
// core rather than under providers/ because Explain and gloss (here in
// translation/) and QUL compile use it as well as the provider, and the
// translation core may not import its providers (docs/refactor/layers.json). Restructure Phase 3 gave it one home; check Q
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
 * Text from EVERY text block, not the first.
 *
 * `content` is an array, and with the search tool enabled it holds
 * `server_tool_use` and `web_search_tool_result` blocks interleaved with
 * several text blocks. Reading `content[0].text` finds a non-text block and
 * concludes there is no answer — the single most likely cause of dig-deeper
 * failing far more often than plain translation.
 */
export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

/**
 * Add one reply's token counts to a running total. A count the API leaves out
 * or sends as null adds nothing. Moved verbatim from providers/
 * AnthropicProvider.ts in restructure Phase 3 step 3g; Explain had the same
 * function as `accumulate`.
 */
export function addUsage(total: TranslationUsage, usage: Anthropic.Usage): void {
  total.inputTokens += usage.input_tokens ?? 0;
  total.outputTokens += usage.output_tokens ?? 0;
  total.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
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

/**
 * Translation and the key check: the fuller mapping, with its own messages, a
 * separate 403, and the 429's retry-after. Moved verbatim from
 * providers/AnthropicProvider.ts in restructure Phase 3 step 3e; not merged
 * with the short one above, whose messages differ (FOUND_ISSUES 11).
 */
export function toTranslationError(error: unknown): TranslationError {
  if (error instanceof TranslationError) return error;

  if (error instanceof Anthropic.AuthenticationError) {
    return new TranslationError(
      'auth',
      'Your Anthropic API key was rejected. Check it in Settings — this is a key problem, not a usage limit.',
    );
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return new TranslationError(
      'auth',
      'That Anthropic key is valid but not permitted to use this model. Check the key’s workspace and model access.',
    );
  }
  if (error instanceof Anthropic.RateLimitError) {
    const header = error.headers?.get?.('retry-after');
    return new TranslationError(
      'rate-limit',
      'Anthropic is rate-limiting this key. Wait a moment and retranslate — your key is fine.',
      { retryAfterSeconds: header ? Number(header) : null },
    );
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new TranslationError(
      'network',
      'Could not reach api.anthropic.com. Check the network connection.',
    );
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new TranslationError('api', `Anthropic rejected the request: ${error.message}`);
  }
  if (error instanceof Anthropic.APIError) {
    return new TranslationError('api', `Anthropic API error ${error.status}: ${error.message}`);
  }
  return new TranslationError(
    'api',
    error instanceof Error ? error.message : String(error),
  );
}
