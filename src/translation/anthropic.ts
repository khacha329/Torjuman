import Anthropic from '@anthropic-ai/sdk';
import type { TranslationUsage } from '../types';
import { TranslationError } from './TranslationProvider';
import { retryAfterMsSeconds, retryAfterSeconds } from './retryAfter';

// What every Claude call in the app shares, so the SDK is used the same way
// everywhere: the client, the web-search tool, the text of a reply, the
// running token total, and the error mapping every call uses. It sits
// in the translation core rather than under providers/ because Explain and
// gloss (here in translation/) and QUL compile use it as well as the provider,
// and the translation core may not import its providers
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
 * The web-search tool translation's dig-deeper pass and Explain's research
 * pass offer Claude: at most five searches per request. Moved from
 * providers/AnthropicProvider.ts in restructure Phase 3 step 3h; Explain wrote
 * the same object inline.
 */
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209' as const,
  name: 'web_search' as const,
  max_uses: 5,
};

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
 * The same error carrying `raw`, unless it already has some or there is none
 * to add. Used where a stream fails after the reply began, so the partial
 * reply reaches the failed card's raw text (FOUND_ISSUES 15.2).
 */
export function withRaw(error: TranslationError, raw: string): TranslationError {
  if (error.raw || raw === '') return error;
  return new TranslationError(error.kind, error.message, {
    retryAfterSeconds: error.retryAfterSeconds,
    raw,
  });
}

/**
 * Research notes so far, with the next turn's text after a blank line.
 *
 * A research pass that pauses (`pause_turn`) is several replies, and their
 * notes were concatenated with no separator ("…searching.Turn 2: …"), in
 * translate and in Explain alike (FOUND_ISSUES 14.5).
 */
export function joinNotes(notes: string, next: string): string {
  if (notes === '') return next;
  if (next === '') return notes;
  return `${notes}\n\n${next}`;
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
 * The one error mapping every Claude call uses: translation, the key check,
 * Explain, gloss and QUL compile. A rejected key, a key without access to the
 * model (403), a rate limit with its retry-after, no connection, a rejected
 * request, an error event inside a stream, a connection that drops mid-reply,
 * and any other API error with its status. It returns the error so a
 * caller writes `throw toTranslationError(error)`.
 *
 * Until FOUND_ISSUES 11 there were two: this one, moved from
 * providers/AnthropicProvider.ts in restructure Phase 3 step 3e, and a shorter
 * one for Explain, gloss and compile that turned a 403 into `api` and dropped
 * the 429's retry-after. Their messages were the only reason to keep both.
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
    return new TranslationError(
      'rate-limit',
      // "try again", not "retranslate": since FOUND_ISSUES 11 Explain, gloss
      // and compile show this message too.
      'Anthropic is rate-limiting this key. Wait a moment and try again — your key is fine.',
      {
        // retry-after-ms first, as the SDK reads them: with only it the wait
        // the SDK knew was reported as null (FOUND_ISSUES 15.4).
        retryAfterSeconds:
          retryAfterMsSeconds(error.headers?.get?.('retry-after-ms')) ??
          retryAfterSeconds(error.headers?.get?.('retry-after')),
      },
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
    // An error event inside a stream arrives as an APIError with no status,
    // whose message is the event's JSON: it read "Anthropic API error
    // undefined: {…}" (FOUND_ISSUES 14.3). The event's own type and message
    // are read instead.
    if (error.status === undefined) {
      const inner = (error.error as { error?: { type?: string; message?: string } } | undefined)
        ?.error;
      if (inner?.message) {
        return new TranslationError(
          'api',
          `Anthropic reported an error mid-reply: ${inner.message}${inner.type ? ` (${inner.type})` : ''}.`,
        );
      }
    }
    return new TranslationError('api', `Anthropic API error ${error.status}: ${error.message}`);
  }
  // fetch reports a connection that drops while the body is read as a
  // TypeError. messages.create (the key check, gloss, compile) passes it
  // through unwrapped; a stream (translate, Explain) wraps it in a plain
  // AnthropicError whose `cause` is the TypeError (MessageStream's
  // handleError). Both came out as kind `api` with the message "network
  // error" (FOUND_ISSUES 14.2).
  //
  // A TypeError from other code inside a caller's `try` lands here too and is
  // labelled "network": the reply shaping in Explain, gloss and compile (which
  // is guarded), gloss's storage write, and the stream listeners (onChunk,
  // onProgress, the streamEvent handler), which MessageStream calls
  // synchronously, so their TypeError arrives as an AnthropicError cause. All
  // of them are `setState` calls or guarded reads; a mislabel would cost the
  // heading and message only, and raw is still kept. Narrowing by message is
  // brittle ("network error" in Chrome, "terminated" in undici, others in
  // WebViews), so the check stays by type.
  if (
    error instanceof TypeError ||
    (error instanceof Anthropic.AnthropicError && error.cause instanceof TypeError)
  ) {
    return new TranslationError(
      'network',
      'The connection to api.anthropic.com dropped mid-reply. Check the network connection.',
    );
  }
  return new TranslationError(
    'api',
    error instanceof Error ? error.message : String(error),
  );
}
