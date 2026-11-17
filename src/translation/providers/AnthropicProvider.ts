import Anthropic from '@anthropic-ai/sdk';
import type { TranslatedSegment, TranslationUsage } from '../../types';
import {
  TranslationError,
  type ModelOption,
  type TranslationProvider,
  type TranslationRequest,
  type TranslationResult,
} from '../TranslationProvider';
import {
  ANTHROPIC_DEFAULT_MODEL,
  ANTHROPIC_KEY_CHECK_MODEL,
  ANTHROPIC_MODELS,
  maxTokensFor,
  outputCeilingFor,
  outputConfigFor,
  costOf,
  SUPERSEDED_ANTHROPIC_MODELS,
} from '../models';
import { renderSystem, renderUser } from '../prompt';
import { addUsage, anthropicClient, textOf, toTranslationError, WEB_SEARCH_TOOL } from '../anthropic';
import { coerceSegments, parseSegments } from '../parseSegments';
import {
  answerWithTool,
  EMIT_TOOL_NAME,
  EMIT_TRANSLATION_TOOL,
  stripJsonInstruction,
} from '../schema';

// Anthropic, via the official SDK. The client is built in ../anthropic.ts.
//
// Output shape is enforced by a strict tool rather than requested in prose —
// see schema.ts for why, and for why the tool is not forced.

const MAX_RESEARCH_TURNS = 4;

export class AnthropicProvider implements TranslationProvider {
  readonly id = 'anthropic' as const;
  readonly displayName = 'Claude';
  readonly availableModels: ModelOption[] = ANTHROPIC_MODELS;
  readonly knownModels: ModelOption[] = [...ANTHROPIC_MODELS, ...SUPERSEDED_ANTHROPIC_MODELS];
  readonly defaultModel = ANTHROPIC_DEFAULT_MODEL;
  readonly keyHelpUrl = 'https://console.anthropic.com/settings/keys';
  readonly keyPlaceholder = 'sk-ant-…';
  readonly isFree = false;
  readonly fitFor = 'For passages you intend to teach from.';

  private client(key: string): Anthropic {
    return anthropicClient(key);
  }

  async validateKey(key: string): Promise<boolean> {
    if (!key.trim()) return false;
    try {
      await this.client(key).messages.create({
        model: ANTHROPIC_KEY_CHECK_MODEL,
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

    // Dig deeper runs as two passes: the first searches and reasons in prose,
    // the second turns that into segments. Pass 2 is short input, short output,
    // no search. The split dates from forced tool_choice, which stopped the
    // model calling the search tool at all; tool_choice auto would now allow
    // one pass, but merging them is a separate change from the model upgrade.
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
        output_config: outputConfigFor(request.model),
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

  /** Pass 2 (or the only pass): strict tool, no search, structured out. */
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

    // Sized against THIS model's ceiling rather than the shared default: the
    // current Claude models accept 128K output tokens, and this call streams,
    // which is what the SDK requires for a budget that large.
    const ceiling = outputCeilingFor(request.model);
    let budget = maxTokensFor(request.targetText, 4, request.model);

    for (let attempt = 0; attempt < 2; attempt++) {
      const stream = client.messages.stream({
        model: request.model,
        max_tokens: budget,
        system: [
          {
            type: 'text',
            // The JSON-only instruction is stripped here: with the shape
            // enforced by the tool, leaving it in encourages the model to write
            // the JSON out as text instead of calling the tool. In its place,
            // an instruction to answer through the tool, which tool_choice can
            // no longer force on the current models.
            text: answerWithTool(stripJsonInstruction(renderSystem(request)), EMIT_TOOL_NAME),
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
        messages: [{ role: 'user', content: userContent }],
        tools: [EMIT_TRANSLATION_TOOL],
        tool_choice: { type: 'auto' },
        output_config: outputConfigFor(request.model),
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
        if (attempt === 0 && budget < ceiling) {
          budget = Math.min(budget * 2, ceiling);
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

      // The model was told to call the tool but tool_choice auto cannot make it,
      // and a paid response is never thrown away. Fall back to the tolerant
      // text parser.
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

/** Read the tool call's arguments. */
function segmentsFromToolUse(message: Anthropic.Message): TranslatedSegment[] | null {
  for (const block of message.content) {
    if (block.type !== 'tool_use' || block.name !== EMIT_TOOL_NAME) continue;
    const input = block.input as { segments?: unknown };
    const segments = coerceSegments(input?.segments);
    if (segments.length > 0) return segments;
  }
  return null;
}

function emptyUsage(): TranslationUsage {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}
