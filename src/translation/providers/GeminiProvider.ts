import {
  TranslationError,
  type KeyCheck,
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
  SUPERSEDED_GEMINI_MODELS,
} from '../models';
import { renderSystem, renderUser } from '../prompt';
import { coerceSegments, parseSegmentRecords, parseSegments } from '../parseSegments';
import { GEMINI_RESPONSE_SCHEMA, stripJsonInstruction } from '../schema';
import { pieceSequenceNote, pieceSequenceProblem } from '../segmentChecks';
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

/**
 * Retries of a 503 ("This model is currently experiencing high demand") or a
 * 500, before the fallback (providers/fallback.ts) asks another model. The
 * SDK's own policy for Claude's 529, so both providers wait alike: two
 * retries, the wait doubling from 1 s, each cut by up to a quarter at random
 * so that many clients turned away together do not all come back together.
 * Short on purpose: a busy model is usually busy for longer than a few
 * seconds, and the next model in the chain is the better bet.
 */
const SERVER_RETRIES = 2;

function serverRetryWaitMs(retry: number): number {
  return 1000 * 2 ** retry * (1 - Math.random() * 0.25);
}

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
  readonly knownModels: ModelOption[] = [...GEMINI_MODELS, ...SUPERSEDED_GEMINI_MODELS];
  readonly defaultModel = GEMINI_DEFAULT_MODEL;
  readonly keyHelpUrl = 'https://aistudio.google.com/apikey';
  readonly keyPlaceholder = 'AIza…';
  readonly isFree = true;
  readonly fitFor =
    'Good for reading along and checking passages you would otherwise skip.';

  /**
   * models.list with the key: a rejection says the key is bad, and the list
   * says which of `models` the key is offered (lane B2). The docs describe it
   * as "the Models available through the Gemini API"; whether it leaves out a
   * model a key is refused (the 2.5 models for a new key) is not stated
   * there, so a model it lists can still be refused when called, and the
   * fallback steps over one that is.
   *
   * Pages of up to 1,000 (the API's maximum), following nextPageToken; at
   * most MAX_LIST_PAGES of them, against a token that never ends. A page
   * after the first that fails leaves the list unknown: the key itself is
   * good, and no model is marked rather than marking every one.
   *
   * A server error (500, 503) is no verdict on the key: thrown, not "rejected"
   * as every non-OK status used to be.
   */
  async validateKey(key: string, models: readonly string[] = []): Promise<KeyCheck> {
    if (!key.trim()) return { valid: false, unusableModels: [] };
    const listed = new Set<string>();
    let pageToken: string | null = null;
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const query = new URLSearchParams({ pageSize: '1000' });
      if (pageToken) query.set('pageToken', pageToken);
      let response: Response;
      try {
        response = await fetch(`${GEMINI_BASE}/models?${query}`, {
          headers: { 'x-goog-api-key': key },
        });
      } catch {
        if (page > 0) return { valid: true, unusableModels: [] };
        throw new TranslationError(
          'network',
          'Could not reach the Gemini API. Check the network connection.',
          { condition: 'unreachable' },
        );
      }
      if (page > 0 && !response.ok) return { valid: true, unusableModels: [] };
      if (response.status === 400 || response.status === 401 || response.status === 403) {
        return { valid: false, unusableModels: [] };
      }
      if (!response.ok) throw await geminiHttpError(response);

      let payload: GeminiModelList;
      try {
        payload = (await response.json()) as GeminiModelList;
      } catch {
        // The key was accepted; only the list could not be read.
        return { valid: true, unusableModels: [] };
      }
      for (const entry of payload.models ?? []) {
        const methods = entry.supportedGenerationMethods;
        if (methods && !methods.includes('generateContent')) continue;
        if (typeof entry.name === 'string') listed.add(entry.name.replace(/^models\//, ''));
      }
      pageToken = payload.nextPageToken || null;
      if (!pageToken) {
        return {
          valid: true,
          unusableModels: [...new Set(models)].filter((model) => !listed.has(model)),
        };
      }
    }
    return { valid: true, unusableModels: [] };
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
      stopReason: string | null,
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
        // the parts before it nothing. No stop reason: no reply ended, so the
        // card must not say "the stream ended without one".
        if (segments.length > 0 && caught instanceof TranslationError) {
          return partial(caught.stopReason, caught.message, part.start);
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

      const stop = describeStop(reply, parseSegments(reply.text), segments.length > 0);
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
    let serverRetries = 0;
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
          { condition: 'unreachable' },
        );
      }

      if ((response.status === 503 || response.status === 500) && serverRetries < SERVER_RETRIES) {
        await delay(serverRetryWaitMs(serverRetries));
        serverRetries++;
        attempt--; // The retry is for the server, not for rate limiting.
        continue;
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
        throw await geminiHttpError(response, request.model);
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

/** models.list's response (generativelanguage v1beta, ListModelsResponse). */
interface GeminiModelList {
  models?: { name?: string; supportedGenerationMethods?: string[] }[];
  nextPageToken?: string;
}

/** The most models.list pages a key check reads (1,000 models each). */
const MAX_LIST_PAGES = 5;

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
  const arabicFor = (record: Record<string, unknown>) => {
    const range = unitRange(units, record.from, record.to);
    if (range === null) {
      coveredTo = null;
      return null;
    }
    if (coveredTo !== null) coveredTo = Math.max(coveredTo, units[range.last - 1].end);
    return unitsText(partText, units, range);
  };

  // One record at a time, so each segment's note can say what was wrong with
  // its own piece numbers (translation/segmentChecks.ts).
  const segments: TranslatedSegment[] = [];
  let previousTo = 0;
  for (const record of parsed.records) {
    const sequence = pieceSequenceProblem(previousTo, record.from, record.to, units.length);
    // The highest real piece named, so a backwards pair that covered a piece
    // does not make the next segment report it missing, and a number past the
    // end does not make every later segment look like a repeat.
    for (const end of [record.from, record.to]) {
      if (typeof end === 'number' && end >= 1 && end <= units.length) {
        previousTo = Math.max(previousTo, end);
      }
    }
    const [segment] = coerceSegments([record], arabicFor);
    if (!segment) continue;
    const note =
      sequence === null
        ? segment.note
        : [segment.note, pieceSequenceNote(sequence)]
            .filter((part): part is string => Boolean(part && part.trim()))
            .join(' ');
    segments.push(note === segment.note ? segment : { ...segment, note });
  }
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
  keptSegments: boolean,
): { kind: TranslationErrorKind; message: string } {
  const reason = reply.finishReason;
  if (reason === undefined) return { kind: 'interrupted', message: GEMINI_NO_FINISH_REASON };
  if (reason === 'MAX_TOKENS') {
    return {
      kind: 'truncated',
      message: `The answer was cut off at the ${reply.budget.toLocaleString()}-token limit, even after retrying with a larger budget. Try translating a shorter passage.`,
    };
  }
  if (reason === 'STOP' && keptSegments) {
    // Said above the segments that were kept, so not "no structured output".
    return {
      kind: 'parse',
      message:
        'Gemini said its reply was finished (STOP), but the reply broke off before the end of the passage.',
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
