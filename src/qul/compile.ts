import Anthropic from '@anthropic-ai/sdk';
import { sha256 } from '../lib/hash';
import { GEMINI_BASE } from '../translation/models';
import {
  TranslationError,
  type CloudProviderId,
  type TranslationUsage,
} from '../translation/TranslationProvider';

// The compiled view — the one part of the QUL feature that generates.
//
// ---------------------------------------------------------------------------
// What this is allowed to do, and what it is not
//
// Everything else in Amendment 12 retrieves: a tafsīr passage is what the
// mufassir wrote, a matched āyah is the muṣḥaf, a topic is QUL's own editorial
// grouping. This synthesizes, and so it is fenced:
//
//   * The model sees ONLY the material already retrieved and already on screen.
//     No web search, no recall, no "and it is also reported that". If it is not
//     in the tabs, it is not in the prompt.
//   * The output is badged as generated wherever it appears and never replaces
//     a source tab. The tabs stay individually readable, which is what makes a
//     compiled paragraph checkable rather than authoritative.
//   * It is off by default.
//
// The system prompt states the first rule, and the prompt physically contains
// nothing else — which is the part that actually holds.
// ---------------------------------------------------------------------------

export interface CompileSource {
  ayahLabel: string;
  ayahKey: string;
  arabic: string;
  english: string;
  englishAttribution: string;
  tafsir: { name: string; coverage: string; text: string }[];
  similar: { label: string; arabic: string; english: string }[];
  topics: { name: string; description: string }[];
  surah: { name: string; text: string } | null;
}

export interface CompileResult {
  text: string;
  usage: TranslationUsage;
  costUsd: number | null;
}

/** Bumped when the prompt changes, so old compilations are not reused. */
const COMPILE_VERSION = 1;

const SYSTEM = `You are helping someone prepare a study circle on an Arabic
commentary. Below is material about a single āyah that his app has already
retrieved and is already showing him: a translation, classical tafsīr, related
āyāt, and topical groupings.

Write one continuous account of the āyah drawing those pieces together.

RULES

1. Use ONLY what is given below. Add nothing from your own knowledge — no other
   tafsīr, no ḥadīth, no history, no reports, no scholarly opinions. If the
   material does not settle something, leave it unsettled.
2. Say where each point comes from, naming the tafsīr or the related āyah.
3. Do not translate any Arabic that is given to you without a translation. The
   Arabic of scripture and of the tafsīr is quoted, not rendered: if a tafsīr
   passage is supplied in Arabic only, describe what it addresses rather than
   producing an English version of it.
4. Plain English for a fluent Arabic reader who wants the material joined up,
   not simplified.
5. Six short paragraphs at most.`;

/** A cache key that changes when the material behind the compilation does. */
export function compileCacheKey(options: {
  ayahKey: string;
  resourceIds: string[];
  providerId: CloudProviderId;
  model: string;
}): string {
  return sha256(
    [
      COMPILE_VERSION,
      options.ayahKey,
      [...options.resourceIds].sort().join(','),
      options.providerId,
      options.model,
    ].join('|'),
  );
}

/** The prompt, as plain text. Exported so a test can assert what is in it. */
export function renderCompilePrompt(source: CompileSource): string {
  const parts: string[] = [
    `<ayah reference="${source.ayahKey}" name="${source.ayahLabel}">`,
    source.arabic,
    `</ayah>`,
    '',
    `<translation source="${source.englishAttribution}">\n${source.english}\n</translation>`,
  ];

  for (const entry of source.tafsir) {
    parts.push(
      '',
      `<tafsir name="${entry.name}" covers="${entry.coverage}">\n${entry.text}\n</tafsir>`,
    );
  }

  if (source.similar.length > 0) {
    parts.push('', '<related_ayat>');
    for (const entry of source.similar) {
      parts.push(`  <ayah reference="${entry.label}">${entry.arabic}\n  ${entry.english}</ayah>`);
    }
    parts.push('</related_ayat>');
  }

  if (source.topics.length > 0) {
    parts.push('', '<topics>');
    for (const entry of source.topics) {
      parts.push(`  <topic name="${entry.name}">${entry.description}</topic>`);
    }
    parts.push('</topics>');
  }

  if (source.surah) {
    parts.push('', `<surah name="${source.surah.name}">\n${source.surah.text}\n</surah>`);
  }

  parts.push(
    '',
    'Compile the material above into one account. Use nothing else.',
  );

  return parts.join('\n');
}

export async function compileAyah(options: {
  providerId: CloudProviderId;
  model: string;
  apiKey: string;
  source: CompileSource;
}): Promise<CompileResult> {
  const prompt = renderCompilePrompt(options.source);
  return options.providerId === 'anthropic'
    ? compileWithAnthropic(options.model, options.apiKey, prompt)
    : compileWithGemini(options.model, options.apiKey, prompt);
}

async function compileWithAnthropic(
  model: string,
  apiKey: string,
  prompt: string,
): Promise<CompileResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  try {
    const message = await client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM,
      // No tools at all, web search included: the fence in the header is only
      // real if the model has no way to reach past the prompt.
      messages: [{ role: 'user', content: prompt }],
    });

    return {
      text: message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim(),
      usage: {
        inputTokens: message.usage.input_tokens ?? 0,
        outputTokens: message.usage.output_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      costUsd: null,
    };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new TranslationError('auth', 'Your Anthropic API key was rejected.');
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new TranslationError('rate-limit', 'Rate limited. Wait a moment and try again.');
    }
    if (error instanceof Anthropic.APIConnectionError) {
      throw new TranslationError('network', 'Could not reach api.anthropic.com.');
    }
    throw new TranslationError('api', error instanceof Error ? error.message : String(error));
  }
}

async function compileWithGemini(
  model: string,
  apiKey: string,
  prompt: string,
): Promise<CompileResult> {
  let response: Response;
  try {
    response = await fetch(
      `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        // The key travels in the header, never in the query string — see the
        // note in GeminiProvider.
        headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4000 },
        }),
      },
    );
  } catch {
    throw new TranslationError('network', 'Could not reach the Gemini API.');
  }

  if (response.status === 401 || response.status === 403) {
    throw new TranslationError('auth', 'Your Gemini API key was rejected.');
  }
  if (response.status === 429) {
    throw new TranslationError('rate-limit', 'Gemini rate limit reached. Try again shortly.');
  }
  if (!response.ok) {
    throw new TranslationError('api', `Gemini API error: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      cachedContentTokenCount?: number;
    };
  };

  const text = (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? '')
    .join('')
    .trim();

  if (text === '') {
    throw new TranslationError('parse', 'Gemini returned no compiled text.');
  }

  return {
    text,
    usage: {
      inputTokens: payload.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
      cacheReadTokens: payload.usageMetadata?.cachedContentTokenCount ?? 0,
      cacheWriteTokens: 0,
    },
    costUsd: null,
  };
}
