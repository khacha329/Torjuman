import {
  TranslationError,
  type ModelOption,
  type TranslationProvider,
  type TranslationRequest,
  type TranslationResult,
} from '../TranslationProvider';
import type { TranslatedSegment, TranslationErrorKind, TranslationUsage } from '../../types';
import {
  GEMINI_BASE,
  GEMINI_DEFAULT_MODEL,
  GEMINI_MODELS,
  MAX_TOKENS_CEILING,
  maxTokensFor,
} from '../models';
import { renderSystem, renderUser } from '../prompt';
import { coerceSegments, parseSegmentRecords, parseSegments } from '../parseSegments';
import { GEMINI_RESPONSE_SCHEMA, stripJsonInstruction } from '../schema';
import { delay } from '../../lib/delay';
import {
  GEMINI_FINISH_REASONS,
  GEMINI_NO_FINISH_REASON,
  geminiHttpError,
  geminiModelUrl,
  postGemini,
  readRetryAfter,
  unknownFinishReason,
} from '../gemini';
import {
  halfwayCut,
  numberedUnits,
  splitUnits,
  unitRange,
  unitsText,
  type SourceUnit,
} from '../sourceUnits';

// Google Generative Language API.
//
// Two deliberate differences from the Anthropic path, rather than a port of it:
//
//  1. The key travels in the `x-goog-api-key` header, never as a URL query
//     parameter — see postGemini in ../gemini.ts for why.
//
//  2. The segment shape is declared as a `responseSchema`, so valid JSON is
//     enforced by the API rather than requested in the prompt. This is the
//     more reliable of the two mechanisms, and the JSON discipline on the
//     Anthropic side comes from the prompt only because that path also has to
//     survive the web-search tool being switched on.

const MAX_RETRIES = 3;

/** Shared with the Anthropic tool definition so both shapes cannot drift. */
const RESPONSE_SCHEMA = GEMINI_RESPONSE_SCHEMA;

interface GeminiUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
}

interface GeminiChunk {
  candidates?: {
    content?: { parts?: { text?: string }[] };
    finishReason?: string;
  }[];
  usageMetadata?: GeminiUsageMetadata;
  /** Set, with no candidates, when Gemini refuses the prompt itself. */
  promptFeedback?: { blockReason?: string };
}

export class GeminiProvider implements TranslationProvider {
  readonly id = 'gemini' as const;
  readonly displayName = 'Gemini';
  readonly availableModels: ModelOption[] = GEMINI_MODELS;
  readonly knownModels: ModelOption[] = GEMINI_MODELS;
  readonly defaultModel = GEMINI_DEFAULT_MODEL;
  readonly keyHelpUrl = 'https://aistudio.google.com/apikey';
  readonly keyPlaceholder = 'AIza…';
  readonly isFree = true;
  readonly fitFor =
    'Good for reading along and checking passages you would otherwise skip.';

  async validateKey(key: string): Promise<boolean> {
    if (!key.trim()) return false;
    let response: Response;
    try {
      response = await fetch(`${GEMINI_BASE}/models`, {
        headers: { 'x-goog-api-key': key },
      });
    } catch {
      throw new TranslationError(
        'network',
        'Could not reach the Gemini API. Check the network connection.',
      );
    }
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      return false;
    }
    return response.ok;
  }

  /**
   * One translation, in as many parts as it takes.
   *
   * Normally one part, the whole passage. A RECITATION stop cuts what is left
   * of the passage in two and sends each half on its own, once: the owner's
   * classical books stop Gemini on output that reproduces a known text, and a
   * shorter passage reproduces less. Every whole segment that came back is
   * kept, whatever happens after it — a reply that stops part-way, or a part
   * that fails, ends the run as a partial result (`incomplete`) rather than an
   * error, and only a run with nothing to show throws.
   */
  async translate(
    request: TranslationRequest,
    key: string,
    onChunk?: (partial: string) => void,
  ): Promise<TranslationResult> {
    const text = request.targetText;
    const usage: TranslationUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const segments: TranslatedSegment[] = [];
    const raws: string[] = [];
    const queue: PassagePart[] = [{ start: 0, end: text.length }];
    let split = false;

    const partial = (
      stopReason: string,
      message: string,
      untranslatedFrom: number | null,
    ): TranslationResult => ({
      segments,
      usage,
      costUsd: null,
      raw: raws.join('\n'),
      incomplete: { stopReason, message, untranslatedFrom },
    });

    while (queue.length > 0) {
      const part = queue.shift()!;
      const partRequest = partRequestFor(request, part);
      const units = splitUnits(partRequest.targetText);
      const earlier = raws.join('\n');

      let reply: GeminiReply;
      try {
        reply = await this.stream(partRequest, units, key, (streamed) =>
          onChunk?.(earlier ? `${earlier}\n${streamed}` : streamed),
        );
      } catch (caught) {
        // A connection dropped mid-reply still delivered whatever came before
        // the drop, kept as the error's raw: its whole segments are kept too.
        if (caught instanceof TranslationError && caught.kind === 'network' && caught.raw) {
          const read = readReply(partRequest.targetText, units, caught.raw);
          segments.push(...read.segments);
          raws.push(caught.raw);
          if (segments.length > 0) {
            return partial('none', caught.message, resumeOffset(text, part, read));
          }
          throw caught;
        }
        // A later part that fails (a rate limit after the split, say) costs
        // the parts before it nothing.
        if (segments.length > 0 && caught instanceof TranslationError) {
          return partial(caught.stopReason ?? 'none', caught.message, part.start);
        }
        throw caught;
      }

      raws.push(reply.text);
      usage.inputTokens += reply.usage.inputTokens;
      usage.outputTokens += reply.usage.outputTokens;
      usage.cacheReadTokens += reply.usage.cacheReadTokens;
      const raw = raws.join('\n');

      // A blocked prompt has no candidates, only promptFeedback.blockReason; it
      // was reported as an empty parse failure (FOUND_ISSUES 14.4).
      if (reply.blockReason) {
        const message = `Gemini declined to translate this passage (${reply.blockReason}).`;
        if (segments.length > 0) return partial(reply.blockReason, message, part.start);
        throw new TranslationError('refusal', message, { raw: raw || null });
      }

      const read = readReply(partRequest.targetText, units, reply.text);
      if (reply.finishReason === 'STOP' && read.closed && read.segments.length > 0) {
        segments.push(...read.segments);
        continue;
      }
      // Every piece came back whole although the reply did not end cleanly
      // (it stopped on the closing bracket): nothing is missing.
      if (
        read.segments.length > 0 &&
        read.coveredTo !== null &&
        partRequest.targetText.slice(read.coveredTo).trim() === ''
      ) {
        segments.push(...read.segments);
        continue;
      }

      segments.push(...read.segments);
      const resumeAt = resumeOffset(text, part, read);

      if (reply.finishReason === 'RECITATION' && !split && resumeAt !== null) {
        split = true;
        const remaining = text.slice(resumeAt, part.end);
        const cut = halfwayCut(remaining, splitUnits(remaining));
        if (cut !== null) {
          queue.unshift(
            { start: resumeAt, end: resumeAt + cut },
            { start: resumeAt + cut, end: part.end },
          );
          continue;
        }
      }

      const stop = describeStop(reply, parseSegments(reply.text));
      if (segments.length > 0) {
        return partial(reply.finishReason ?? 'none', stop.message, resumeAt);
      }
      throw new TranslationError(stop.kind, stop.message, {
        raw,
        stopReason: stop.kind === 'parse' ? null : (reply.finishReason ?? 'none'),
      });
    }

    return {
      segments,
      usage,
      // The Gemini path here is the free tier: the budget that matters is
      // requests, not dollars, so the UI shows a request count instead.
      costUsd: null,
      raw: raws.join('\n'),
    };
  }

  /**
   * One request for one part, streamed: the rate-limit retries and the one
   * retry with a larger budget after MAX_TOKENS, then the reply as it ended.
   */
  private async stream(
    request: TranslationRequest,
    units: SourceUnit[],
    key: string,
    onChunk: (partial: string) => void,
  ): Promise<GeminiReply> {
    const url = geminiModelUrl(request.model, 'streamGenerateContent?alt=sse');

    let text = '';
    let finishReason: string | undefined;
    let blockReason: string | undefined;
    let budget = maxTokensFor(request.targetText);
    let truncationRetried = false;
    const usage: TranslationUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const body = {
        systemInstruction: {
          // The schema below enforces the shape, so the prose instruction to
          // emit JSON is stripped — leaving it in invites the model to write
          // the JSON twice.
          parts: [{ text: stripJsonInstruction(renderSystem(request)) }],
        },
        contents: [
          {
            role: 'user',
            // The target as numbered pieces, which the segments name instead
            // of echoing the Arabic (sourceUnits.ts).
            parts: [{ text: renderUser(request, numberedUnits(request.targetText, units)) }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: budget,
        },
      };

      let response: Response;
      try {
        response = await postGemini(url, key, body);
      } catch {
        throw new TranslationError(
          'network',
          'Could not reach the Gemini API. Check the network connection.',
        );
      }

      if (response.status === 429) {
        const retryAfter = readRetryAfter(response);
        if (attempt < MAX_RETRIES) {
          // Exponential backoff: 2s, 4s, 8s — or whatever the API asked for.
          const waitMs = retryAfter !== null ? retryAfter * 1000 : 2000 * 2 ** attempt;
          await delay(waitMs);
          continue;
        }
        throw new TranslationError(
          'rate-limit',
          'Gemini free-tier rate limit reached. Your key is fine — wait a moment and translate again, ' +
            'or check your current limits in Google AI Studio.',
          { retryAfterSeconds: retryAfter },
        );
      }

      if (!response.ok) {
        throw await geminiHttpError(response);
      }

      if (!response.body) {
        throw new TranslationError('api', 'Gemini returned an empty response stream.');
      }

      // Server-sent events: one `data: {json}` line per chunk.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        let read: ReadableStreamReadResult<Uint8Array>;
        try {
          read = await reader.read();
        } catch {
          // A connection that drops after the headers rejects the read with a
          // TypeError, which escaped unmapped (FOUND_ISSUES 14.1). What
          // arrived before the drop is kept as raw.
          throw new TranslationError(
            'network',
            'The connection to the Gemini API dropped mid-reply. Check the network connection.',
            { raw: text || null },
          );
        }
        const { done, value } = read;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (payload === '' || payload === '[DONE]') continue;

          let chunk: GeminiChunk;
          try {
            chunk = JSON.parse(payload) as GeminiChunk;
          } catch {
            continue;
          }

          // Every part of every candidate, not the first: a response can carry
          // several parts and reading only one loses the rest of the answer.
          for (const candidate of chunk.candidates ?? []) {
            for (const part of candidate.content?.parts ?? []) {
              if (part.text) {
                text += part.text;
                onChunk(text);
              }
            }
            if (candidate.finishReason) finishReason = candidate.finishReason;
          }
          if (chunk.promptFeedback?.blockReason) {
            blockReason = chunk.promptFeedback.blockReason;
          }

          if (chunk.usageMetadata) {
            // Each chunk reports cumulative totals, so overwrite rather than add.
            usage.inputTokens = chunk.usageMetadata.promptTokenCount ?? usage.inputTokens;
            usage.outputTokens =
              chunk.usageMetadata.candidatesTokenCount ?? usage.outputTokens;
            usage.cacheReadTokens =
              chunk.usageMetadata.cachedContentTokenCount ?? usage.cacheReadTokens;
          }
        }
      }

      // Truncation is not a parse failure. Retry once with a larger budget
      // rather than telling the user the reply was malformed.
      if (finishReason === 'MAX_TOKENS' && !truncationRetried && budget < MAX_TOKENS_CEILING) {
        truncationRetried = true;
        budget = Math.min(budget * 2, MAX_TOKENS_CEILING);
        text = '';
        finishReason = undefined;
        attempt--; // The retry is for length, not for rate limiting.
        continue;
      }

      break;
    }

    return { text, finishReason, blockReason, usage, budget };
  }
}

/** A stretch of the request's targetText, end exclusive. */
interface PassagePart {
  start: number;
  end: number;
}

interface GeminiReply {
  text: string;
  /** Undefined when the stream closed without one. */
  finishReason: string | undefined;
  blockReason: string | undefined;
  usage: TranslationUsage;
  /** The output budget the last attempt ran with. */
  budget: number;
}

/**
 * The request for one part. The whole passage is the request itself, byte
 * for byte. A part after a split is sent trimmed, with the rest of the
 * passage around it as context, so its pronouns and argument still have what
 * came before and after.
 */
function partRequestFor(request: TranslationRequest, part: PassagePart): TranslationRequest {
  const text = request.targetText;
  if (part.start === 0 && part.end === text.length) return request;
  const join = (...pieces: string[]) =>
    pieces
      .map((piece) => piece.trim())
      .filter(Boolean)
      .join('\n\n');
  return {
    ...request,
    targetText: text.slice(part.start, part.end).trim(),
    contextBefore: join(request.contextBefore, text.slice(0, part.start)),
    contextAfter: join(text.slice(part.end), request.contextAfter),
  };
}

/**
 * The whole segments of a reply, their Arabic filled in from the pieces they
 * name, and how far into the part's text they reach (`coveredTo`; null when a
 * segment named no usable pieces, so where the reply stopped is not known).
 */
function readReply(
  partText: string,
  units: SourceUnit[],
  replyText: string,
): { segments: TranslatedSegment[]; closed: boolean; coveredTo: number | null } {
  const parsed = parseSegmentRecords(replyText);
  if (parsed === null) return { segments: [], closed: false, coveredTo: 0 };

  let coveredTo: number | null = 0;
  const segments = coerceSegments(parsed.records, (record) => {
    const range = unitRange(units, record.from, record.to);
    if (range === null) {
      coveredTo = null;
      return null;
    }
    if (coveredTo !== null) coveredTo = Math.max(coveredTo, units[range.last - 1].end);
    return unitsText(partText, units, range);
  });
  return { segments, closed: parsed.closed, coveredTo };
}

/**
 * Where in the whole passage the untranslated rest of a part begins, or null
 * when the reply did not say which pieces it covered. A part after a split was
 * sent trimmed (partRequestFor), so the whitespace trimmed off its front is
 * counted back in.
 */
function resumeOffset(
  text: string,
  part: PassagePart,
  read: { coveredTo: number | null },
): number | null {
  if (read.coveredTo === null) return null;
  const whole = part.start === 0 && part.end === text.length;
  const slice = text.slice(part.start, part.end);
  const lead = whole ? 0 : slice.length - slice.trimStart().length;
  return part.start + lead + read.coveredTo;
}

/** Why a reply that did not finish cleanly stopped, as the card will say it. */
function describeStop(
  reply: GeminiReply,
  parsed: ReturnType<typeof parseSegments>,
): { kind: TranslationErrorKind; message: string } {
  const reason = reply.finishReason;
  if (reason === undefined) return { kind: 'interrupted', message: GEMINI_NO_FINISH_REASON };
  if (reason === 'MAX_TOKENS') {
    return {
      kind: 'truncated',
      message: `The answer was cut off at the ${reply.budget.toLocaleString()}-token limit, even after retrying with a larger budget. Try translating a shorter passage.`,
    };
  }
  if (reason === 'STOP') {
    // The only reply that is a parse failure: it says it finished, and what
    // it finished with cannot be read.
    return {
      kind: 'parse',
      message: `Gemini returned no structured output: ${
        parsed.ok ? 'The array contained no usable segments.' : parsed.error
      }`,
    };
  }
  return GEMINI_FINISH_REASONS[reason] ?? unknownFinishReason(reason);
}
