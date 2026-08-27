import {
  TranslationError,
  type ModelOption,
  type TranslationProvider,
  type TranslationRequest,
  type TranslationResult,
  type TranslationUsage,
} from '../TranslationProvider';
import {
  GEMINI_BASE,
  GEMINI_DEFAULT_MODEL,
  GEMINI_MODELS,
  MAX_TOKENS_CEILING,
  maxTokensFor,
} from '../models';
import { renderSystem, renderUser } from '../prompt';
import { parseSegments } from '../parseSegments';
import { GEMINI_RESPONSE_SCHEMA, stripJsonInstruction } from '../schema';

// Google Generative Language API.
//
// Two deliberate differences from the Anthropic path, rather than a port of it:
//
//  1. The key travels in the `x-goog-api-key` header, never as a URL query
//     parameter. Query strings end up in browser history, proxy logs and
//     referrer headers; an API key does not belong in any of them.
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
}

export class GeminiProvider implements TranslationProvider {
  readonly id = 'gemini' as const;
  readonly displayName = 'Gemini';
  readonly availableModels: ModelOption[] = GEMINI_MODELS;
  readonly defaultModel = GEMINI_DEFAULT_MODEL;
  readonly keyHelpUrl = 'https://aistudio.google.com/apikey';
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

  async translate(
    request: TranslationRequest,
    key: string,
    onChunk?: (partial: string) => void,
  ): Promise<TranslationResult> {
    const url =
      `${GEMINI_BASE}/models/${encodeURIComponent(request.model)}:streamGenerateContent?alt=sse`;

    let text = '';
    let finishReason: string | undefined;
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
        contents: [{ role: 'user', parts: [{ text: renderUser(request) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          maxOutputTokens: budget,
        },
      };

      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: {
            'x-goog-api-key': key,
            'content-type': 'application/json',
          },
          body: JSON.stringify(body),
        });
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
        const { done, value } = await reader.read();
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
                onChunk?.(text);
              }
            }
            if (candidate.finishReason) finishReason = candidate.finishReason;
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

    if (finishReason === 'MAX_TOKENS') {
      throw new TranslationError(
        'truncated',
        `The answer was cut off at the ${budget.toLocaleString()}-token limit, even after retrying with a larger budget. Try translating a shorter passage.`,
        { raw: text },
      );
    }

    if (finishReason === 'SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      throw new TranslationError('refusal', 'Gemini declined to translate this passage.', {
        raw: text,
      });
    }

    const parsed = parseSegments(text);
    if (!parsed.ok) {
      throw new TranslationError(
        'parse',
        `Gemini returned no structured output: ${parsed.error}`,
        { raw: parsed.raw },
      );
    }

    return {
      segments: parsed.segments,
      usage,
      // The Gemini path here is the free tier: the budget that matters is
      // requests, not dollars, so the UI shows a request count instead.
      costUsd: null,
      raw: text,
    };
  }
}

function readRetryAfter(response: Response): number | null {
  const header = response.headers.get('retry-after');
  if (!header) return null;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : null;
}

async function geminiHttpError(response: Response): Promise<TranslationError> {
  let message = `HTTP ${response.status}`;
  let status = '';
  try {
    const payload = (await response.json()) as {
      error?: { message?: string; status?: string };
    };
    message = payload.error?.message ?? message;
    status = payload.error?.status ?? '';
  } catch {
    // Keep the status-code message.
  }

  if (
    response.status === 401 ||
    response.status === 403 ||
    status === 'PERMISSION_DENIED' ||
    /api[_ ]?key/i.test(message)
  ) {
    return new TranslationError(
      'auth',
      'Your Gemini API key was rejected. Check it in Settings — this is a key problem, not a rate limit.',
    );
  }

  if (response.status === 400 && /not found|not supported/i.test(message)) {
    return new TranslationError(
      'api',
      `Gemini does not offer this model to your key: ${message}. Pick a different model in Settings.`,
    );
  }

  return new TranslationError('api', `Gemini API error: ${message}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
