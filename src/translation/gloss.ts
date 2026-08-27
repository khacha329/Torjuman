import Anthropic from '@anthropic-ai/sdk';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { BlockType, WordGloss } from '../types';
import { normalize } from '../lib/arabic';
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

const GLOSS_TOOL = {
  name: 'emit_gloss',
  description: 'Return the meaning of the word as used in this sentence.',
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
      // A few hundred tokens is the whole budget: small in, small out.
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content:
            `Word: ${request.word}\n\n` +
            `Sentence (${LABELS[request.blockType]}):\n${request.sentence}`,
        },
      ],
      tools: [GLOSS_TOOL],
      tool_choice: { type: 'tool', name: 'emit_gloss' },
    });

    const call = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'emit_gloss',
    );
    if (!call) throw new TranslationError('parse', 'No gloss was returned.');

    const input = call.input as {
      word?: string;
      root?: string;
      meaning?: string;
      note?: string;
      isTechnicalTerm?: boolean;
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
