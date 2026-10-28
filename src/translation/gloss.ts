import Anthropic from '@anthropic-ai/sdk';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { BlockType, WordGloss } from '../types';
import { normalize } from '../lib/arabic';
import { parseJsonObject } from './parseSegments';
import { answerWithTool } from './schema';
import { TranslationError } from './TranslationProvider';

// "What does this word mean here, in English?"
//
// Deliberately NOT routed through the translation profile. This is a tiny
// lookup: the glossary alone would dominate its token cost, and the profile's
// conventions are about rendering a passage, not defining a word. A separate,
// minimal request keeps it cheap enough to use freely.
//
// Cached by normalized word form, so a repeated word is free and works offline
// afterwards. It never writes to the glossary — these are transient lookups,
// not terminology decisions.

const GLOSS_TOOL_NAME = 'emit_gloss';

// Strict, so a call's input always matches this schema.
const GLOSS_TOOL = {
  name: GLOSS_TOOL_NAME,
  description: 'Return the meaning of the word as used in this sentence.',
  strict: true,
  input_schema: {
    type: 'object' as const,
    properties: {
      word: { type: 'string', description: 'The word, as given.' },
      root: { type: 'string', description: 'Its triliteral root, e.g. غ ف ر.' },
      meaning: {
        type: 'string',
        description: 'Its English meaning AS USED IN THIS SENTENCE. One or two lines.',
      },
      note: {
        type: 'string',
        description:
          'Brief, only if the classical usage differs from the modern, or something else is worth flagging.',
      },
      isTechnicalTerm: {
        type: 'boolean',
        description: 'True if this is a technical term of fiqh, ḥadīth, or ʿaqīdah.',
      },
    },
    required: ['word', 'root', 'meaning', 'isTechnicalTerm'],
    additionalProperties: false,
  },
};

const SYSTEM = `Give the English meaning of a single Arabic word as it is used in
the sentence supplied — not its full lexical range. The reader is a non-native
English speaker preparing a study circle on classical Islamic scholarship.

Give the root. Note briefly if the classical usage differs from the modern. If
the word is a technical term of fiqh, ḥadīth, or ʿaqīdah, say so.

Be brief. This is a glance, not an article.`;

const LABELS: Record<BlockType, string> = {
  chapter_title: 'a chapter heading',
  quran: 'a Qurʾānic verse',
  hadith_matn: 'the text of a hadith',
  takhrij: 'a source attribution',
  sharh: 'commentary',
  poetry: 'poetry',
  body: 'prose',
};

export interface GlossRequest {
  apiKey: string;
  model: string;
  word: string;
  sentence: string;
  blockType: BlockType;
}

/**
 * Look a word up, serving from cache when possible.
 *
 * A cached gloss works with no network. An uncached one needs it, and says so
 * rather than failing obscurely.
 */
export async function glossWord(
  storage: StorageAdapter,
  request: GlossRequest,
): Promise<WordGloss> {
  const key = normalize(request.word);

  const cached = await storage.getWordGloss(key);
  if (cached) return cached;

  if (!navigator.onLine) {
    throw new TranslationError(
      'network',
      'This word is not in the gloss cache and there is no network. The Dictionary lookup works offline.',
    );
  }
  if (!request.apiKey) {
    throw new TranslationError('auth', 'No API key is set. Add one in Settings.');
  }

  const client = new Anthropic({ apiKey: request.apiKey, dangerouslyAllowBrowser: true });

  try {
    const message = await client.messages.create({
      model: request.model,
      // Small in, small out. The answer itself is a few hundred tokens, but
      // Haiku 5.5 thinks by default and thinking counts against this limit,
      // so it leaves room for some. Billing is on what is actually generated.
      max_tokens: 2000,
      // A glance, not an article: the least thinking that does the job. Haiku
      // 5.5's own default is `medium`.
      output_config: { effort: 'low' },
      system: answerWithTool(SYSTEM, GLOSS_TOOL_NAME),
      messages: [
        {
          role: 'user',
          content:
            `Word: ${request.word}\n\n` +
            `Sentence (${LABELS[request.blockType]}):\n${request.sentence}`,
        },
      ],
      tools: [GLOSS_TOOL],
      // The current models reject a forced tool_choice; the prompt asks for it.
      tool_choice: { type: 'auto' },
    });

    const call = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === GLOSS_TOOL_NAME,
    );

    // Without a forced call the model can answer in text instead, usually with
    // the same JSON written out. Recover it before giving up on a paid reply.
    const text = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    const fields = (call?.input ?? parseJsonObject(text)) as Record<string, unknown> | null;
    if (!fields || typeof fields.meaning !== 'string' || !fields.meaning.trim()) {
      throw new TranslationError('parse', 'No gloss was returned.', { raw: text });
    }

    const input = {
      root: typeof fields.root === 'string' ? fields.root : undefined,
      meaning: fields.meaning,
      note: typeof fields.note === 'string' ? fields.note : undefined,
      isTechnicalTerm: fields.isTechnicalTerm === true,
    };

    const gloss: WordGloss = {
      word: key,
      display: request.word,
      root: input.root ?? '',
      meaning: input.meaning ?? '',
      note: input.note?.trim() ? input.note.trim() : null,
      isTechnicalTerm: Boolean(input.isTechnicalTerm),
      model: request.model,
      createdAt: Date.now(),
    };

    await storage.putWordGloss(gloss);
    return gloss;
  } catch (error) {
    if (error instanceof TranslationError) throw error;
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
