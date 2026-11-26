import Anthropic from '@anthropic-ai/sdk';
import type { TranslatedSegment, TranslationUsage } from '../../types';
import {
  TranslationError,
  type KeyCheck,
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
import {
  addUsage,
  anthropicClient,
  joinNotes,
  textOf,
  toTranslationError,
  WEB_SEARCH_TOOL,
  withRaw,
} from '../anthropic';
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
  /** The research pass offers the web-search tool (`research`). */
  readonly canSearch = true;

  private client(key: string): Anthropic {
    return anthropicClient(key);
  }

  // No model list is read here (lane B2's model marking is Gemini's), so
  // `unusableModels` is always empty.
  async validateKey(key: string): Promise<KeyCheck> {
    const verdict = (valid: boolean): KeyCheck => ({ valid, unusableModels: [] });
    if (!key.trim()) return verdict(false);
    try {
      await this.client(key).messages.create({
        model: ANTHROPIC_KEY_CHECK_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      });
      return verdict(true);
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) return verdict(false);
      if (error instanceof Anthropic.PermissionDeniedError) return verdict(false);
      // A rate limit or a 400 still proves the key authenticated. An error
      // with no status proves nothing: the SDK's APIConnectionError is an
      // APIError without one, so with no network the key used to test as good
      // (FOUND_ISSUES 12). Nor does a server error (500, 529 overloaded): the
      // request may never have reached the key check, and it passed as good
      // until FOUND_ISSUES 58. Both are thrown instead, and the key screens
      // say the key was not checked rather than give a verdict on it.
      if (
        error instanceof Anthropic.APIError &&
        error.status !== undefined &&
        error.status < 500 &&
        error.status !== 401 &&
        error.status !== 403
      ) {
        return verdict(true);
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
    let searched = false;
    try {
      if (request.allowExternalLookup) {
        ({ notes: research, searched } = await this.research(client, request, usage, onChunk));
      }

      const result = await this.structure(client, request, usage, research, onChunk);
      // Reported only when a search ran: the research pass may answer without
      // calling the tool, and the card's "web search" must not claim one
      // (FOUND_ISSUES 43).
      return searched ? { ...result, searched: true } : result;
    } catch (error) {
      // Tokens billed before the failure — a finished research pass, a
      // truncated first attempt — go with the error, so the failed card and
      // the session totals still show what was paid (FOUND_ISSUES 64). The
      // error carried no usage, so a failure after research lost its cost.
      throw withUsage(toTranslationError(error), request.model, usage);
    }
  }

  /** Pass 1: web search enabled, tool_choice auto, free-form prose. Not parsed. */
  private async research(
    client: Anthropic,
    request: TranslationRequest,
    usage: TranslationUsage,
    onChunk?: (partial: string) => void,
  ): Promise<{ notes: string; searched: boolean }> {
    let searched = false;
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
      // A reply with search results holds several text blocks. The notes join
      // them with a newline (textOf); live progress ran them together
      // ("…first.Passage …") until FOUND_ISSUES 15.3.
      stream.on('streamEvent', (event) => {
        if (
          event.type === 'content_block_start' &&
          event.content_block.type === 'text' &&
          turnText !== ''
        ) {
          turnText += '\n';
        }
      });
      stream.on('text', (delta) => {
        turnText += delta;
        onChunk?.(`Researching…\n\n${joinNotes(notes, turnText)}`);
      });

      let message: Anthropic.Message;
      try {
        message = await stream.finalMessage();
      } catch (error) {
        // An error after the reply has started (an overload mid-stream) keeps
        // what was written so far as raw: the tokens are billed all the same,
        // and a paid response is never discarded (FOUND_ISSUES 15.2).
        throw withRaw(toTranslationError(error), joinNotes(notes, turnText));
      }

      addUsage(usage, message.usage);
      notes = joinNotes(notes, textOf(message));
      if (message.content.some((block) => block.type === 'server_tool_use')) searched = true;

      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }
      break;
    }

    return { notes, searched };
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

    // Every paid word a failure could otherwise lose (FOUND_ISSUES 63): the
    // research notes, an earlier attempt cut off at max_tokens (its tool
    // arguments were reset before the retry), and this attempt's tool
    // arguments and text — text a model writes instead of calling the tool
    // was not collected while streaming, so a stream that then failed lost it.
    let earlier = '';
    const paidSoFar = (...current: string[]) =>
      [research ?? '', earlier, ...current].reduce(joinNotes, '');

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
      // Collected only, never shown as progress: the progress line stays the
      // tool's arguments, as before.
      let streamedText = '';
      stream.on('text', (delta) => {
        streamedText += delta;
      });

      let message: Anthropic.Message;
      try {
        message = await stream.finalMessage();
      } catch (error) {
        // As in the research pass (FOUND_ISSUES 15.2): the research notes and
        // what this pass streamed so far are kept as raw.
        throw withRaw(toTranslationError(error), paidSoFar(partial, streamedText));
      }

      addUsage(usage, message.usage);

      if (message.stop_reason === 'refusal') {
        throw new TranslationError(
          'refusal',
          'Claude declined to translate this passage.' +
            (message.stop_details && 'explanation' in message.stop_details
              ? ` ${message.stop_details.explanation}`
              : ''),
          { raw: paidSoFar(partial, textOf(message)) || null },
        );
      }

      // Truncation is not a parse failure and needs a different remedy: retry
      // once with a bigger budget rather than telling the user the reply was
      // malformed.
      if (message.stop_reason === 'max_tokens') {
        if (attempt === 0 && budget < ceiling) {
          budget = Math.min(budget * 2, ceiling);
          earlier = joinNotes(earlier, partial || textOf(message));
          continue;
        }
        throw new TranslationError(
          'truncated',
          `The answer was cut off at the ${budget.toLocaleString()}-token limit, even after retrying with a larger budget. Try translating a shorter passage.`,
          { raw: paidSoFar(partial || textOf(message)) },
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
        { raw: paidSoFar(text || partial) },
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

/**
 * The error with what was billed before it, and that usage's cost, unless
 * nothing was. A copy of the running total: the caller's object is not kept.
 */
function withUsage(error: TranslationError, model: string, usage: TranslationUsage): TranslationError {
  const billed =
    usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens > 0;
  if (!billed || error.usage) return error;
  return error.with({ usage: { ...usage }, costUsd: costOf(model, usage) });
}
