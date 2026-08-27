import Anthropic from '@anthropic-ai/sdk';
import type { TranslatedSegment } from '../../types';
import {
  TranslationError,
  type ModelOption,
  type TranslationProvider,
  type TranslationRequest,
  type TranslationResult,
  type TranslationUsage,
} from '../TranslationProvider';
import {
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_MODELS,
  CACHE_READ_MULTIPLIER,
  CACHE_WRITE_MULTIPLIER,
  MAX_TOKENS_CEILING,
  maxTokensFor,
  PRICES,
} from '../models';
import { renderSystem, renderUser } from '../prompt';
import { coerceSegments, parseSegments } from '../parseSegments';
import { EMIT_TOOL_NAME, EMIT_TRANSLATION_TOOL, stripJsonInstruction } from '../schema';

// Anthropic, via the official SDK.
//
// `dangerouslyAllowBrowser` is what makes the SDK send
// `anthropic-dangerous-direct-browser-access: true`, required for browser calls
// and correct here: a local, single-user, bring-your-own-key app. The key goes
// to api.anthropic.com and nowhere else, is never logged, and never appears in
// an error message.
//
// Output shape is enforced by a forced tool call rather than requested in
// prose — see schema.ts for why.

const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209' as const,
  name: 'web_search' as const,
  max_uses: 5,
};

const MAX_RESEARCH_TURNS = 4;

export class AnthropicProvider implements TranslationProvider {
  readonly id = 'anthropic' as const;
  readonly displayName = 'Claude';
  readonly availableModels: ModelOption[] = ANTHROPIC_MODELS;
  readonly defaultModel = ANTHROPIC_DEFAULT_MODEL;
  readonly keyHelpUrl = 'https://console.anthropic.com/settings/keys';
  readonly isFree = false;
  readonly fitFor = 'For passages you intend to teach from.';

  private client(key: string): Anthropic {
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }

  async validateKey(key: string): Promise<boolean> {
    if (!key.trim()) return false;
    try {
      await this.client(key).messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return true;
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) return false;
      if (error instanceof Anthropic.PermissionDeniedError) return false;
      // A rate limit or a 400 still proves the key authenticated.
      if (error instanceof Anthropic.APIError && error.status !== 401 && error.status !== 403) {
        return true;
      }
      throw toTranslationError(error);
    }
  }

  async translate(
    request: TranslationRequest,
    key: string,
    onChunk?: (partial: string) => void,
  ): Promise<TranslationResult> {
    const client = this.client(key);
    const usage = emptyUsage();

    // Dig deeper runs as two passes. A forced tool_choice stops the model
    // calling the search tool at all, so research and structuring cannot happen
    // in one request — the first pass searches and reasons in prose, the second
    // turns that into segments. Pass 2 is short input, short output, no search.
    let research: string | null = null;
    if (request.allowExternalLookup) {
      research = await this.research(client, request, usage, onChunk);
    }

    return this.structure(client, request, usage, research, onChunk);
  }

  /** Pass 1: web search enabled, tool_choice auto, free-form prose. Not parsed. */
  private async research(
    client: Anthropic,
    request: TranslationRequest,
    usage: TranslationUsage,
    onChunk?: (partial: string) => void,
  ): Promise<string> {
    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content:
          renderUser(request) +
          '\n\nBefore translating, research anything in this passage you are unsure of — ' +
          'a narrator, an unusual term, a disputed reading. Write your findings in prose. ' +
          'Do not produce the translation yet.',
      },
    ];

    let notes = '';

    for (let turn = 0; turn < MAX_RESEARCH_TURNS; turn++) {
      const stream = client.messages.stream({
        model: request.model,
        max_tokens: 8000,
        system: [
          {
            type: 'text',
            text: renderSystem(request),
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
        messages,
        tools: [WEB_SEARCH_TOOL],
      });

      let turnText = '';
      stream.on('text', (delta) => {
        turnText += delta;
        onChunk?.(`Researching…\n\n${notes}${turnText}`);
      });

      let message: Anthropic.Message;
      try {
        message = await stream.finalMessage();
      } catch (error) {
        throw toTranslationError(error);
      }

      addUsage(usage, message.usage);
      notes += textOf(message);

      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }
      break;
    }

    return notes;
  }

  /** Pass 2 (or the only pass): forced tool call, no search, structured out. */
  private async structure(
    client: Anthropic,
    request: TranslationRequest,
    usage: TranslationUsage,
    research: string | null,
    onChunk?: (partial: string) => void,
  ): Promise<TranslationResult> {
    const userContent = research
      ? `${renderUser(request)}\n\n<research_notes>\n${research}\n</research_notes>\n\n` +
        'Now produce the translation, using the notes above where they help.'
      : renderUser(request);

    let budget = maxTokensFor(request.targetText);

    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = client.messages.stream({
        model: request.model,
        max_tokens: budget,
        system: [
          {
            type: 'text',
            // The JSON-only instruction is stripped here: with the shape
            // enforced by the tool, leaving it in encourages the model to write
            // the JSON out as text as well as calling the tool.
            text: stripJsonInstruction(renderSystem(request)),
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
        messages: [{ role: 'user', content: userContent }],
        tools: [EMIT_TRANSLATION_TOOL],
        tool_choice: { type: 'tool', name: EMIT_TOOL_NAME },
      });

      // The tool's arguments stream as input_json deltas rather than text, so
      // progress comes from those.
      let partial = '';
      stream.on('inputJson', (delta) => {
        partial += delta;
        onChunk?.(partial);
      });

      let message: Anthropic.Message;
      try {
        message = await stream.finalMessage();
      } catch (error) {
        throw toTranslationError(error);
      }

      addUsage(usage, message.usage);

      if (message.stop_reason === 'refusal') {
        throw new TranslationError(
          'refusal',
          'Claude declined to translate this passage.' +
            (message.stop_details && 'explanation' in message.stop_details
              ? ` ${message.stop_details.explanation}`
              : ''),
        );
      }

      // Truncation is not a parse failure and needs a different remedy: retry
      // once with a bigger budget rather than telling the user the reply was
      // malformed.
      if (message.stop_reason === 'max_tokens') {
        if (attempt === 0 && budget < MAX_TOKENS_CEILING) {
          budget = Math.min(budget * 2, MAX_TOKENS_CEILING);
          continue;
        }
        throw new TranslationError(
          'truncated',
          `The answer was cut off at the ${budget.toLocaleString()}-token limit, even after retrying with a larger budget. Try translating a shorter passage.`,
          { raw: partial },
        );
      }

      const segments = segmentsFromToolUse(message);
      if (segments) {
        return {
          segments,
          usage,
          costUsd: costOf(request.model, usage),
          raw: partial,
        };
      }

      // The tool was forced, so this should not happen — but a paid response is
      // never thrown away. Fall back to the tolerant text parser.
      const text = textOf(message);
      const parsed = parseSegments(text || partial);
      if (parsed.ok) {
        return { segments: parsed.segments, usage, costUsd: costOf(request.model, usage), raw: text };
      }

      throw new TranslationError(
        'parse',
        `Claude returned no structured output: ${parsed.error}`,
        { raw: text || partial },
      );
    }

    throw new TranslationError('api', 'The translation request did not complete.');
  }
}

/** Read the forced tool call's arguments. */
function segmentsFromToolUse(message: Anthropic.Message): TranslatedSegment[] | null {
  for (const block of message.content) {
    if (block.type !== 'tool_use' || block.name !== EMIT_TOOL_NAME) continue;
    const input = block.input as { segments?: unknown };
    const segments = coerceSegments(input?.segments);
    if (segments.length > 0) return segments;
  }
  return null;
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

function emptyUsage(): TranslationUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function addUsage(total: TranslationUsage, usage: Anthropic.Usage): void {
  total.inputTokens += usage.input_tokens ?? 0;
  total.outputTokens += usage.output_tokens ?? 0;
  total.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
}

/** USD estimate from the token counts the API reported. */
export function costOf(model: string, usage: TranslationUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;

  const input = usage.inputTokens * price.inputPerMTok;
  const cacheRead = usage.cacheReadTokens * price.inputPerMTok * CACHE_READ_MULTIPLIER;
  const cacheWrite = usage.cacheWriteTokens * price.inputPerMTok * CACHE_WRITE_MULTIPLIER;
  const output = usage.outputTokens * price.outputPerMTok;

  return (input + cacheRead + cacheWrite + output) / 1_000_000;
}

function toTranslationError(error: unknown): TranslationError {
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
