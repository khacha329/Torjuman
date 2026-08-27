import Anthropic from '@anthropic-ai/sdk';
import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { LocalSourceRef, WebSourceRef } from '../types';
import { normalize } from '../lib/arabic';
import { maxTokensFor } from './models';
import { TranslationError, type TranslationUsage } from './TranslationProvider';

// "What does this phrase mean?" — a research question, not a translation one.
//
// The user understands the words; what is unclear is the concept. So this
// searches his own library first, then the web, and returns an explanation with
// citations. It never touches the translation card it hangs from.

export interface ExplainResult {
  explanation: string;
  localSources: LocalSourceRef[];
  webSources: WebSourceRef[];
  usage: TranslationUsage;
  costUsd: number | null;
}

const EXPLAIN_TOOL = {
  name: 'emit_explanation',
  description: 'Return the explanation and the sources it rests on.',
  input_schema: {
    type: 'object' as const,
    properties: {
      explanation: {
        type: 'string',
        description:
          'What the phrase means as a concept, in plain English for a non-native speaker. Grounded in the supplied sources.',
      },
      localSourceIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of the supplied library passages actually relied on.',
      },
      webSources: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            title: { type: 'string' },
            siteName: { type: 'string' },
            excerpt: {
              type: 'string',
              description:
                'One or two sentences showing relevance. Never a reproduction of the article.',
            },
          },
          required: ['url', 'title', 'excerpt'],
        },
      },
    },
    required: ['explanation'],
  },
};

const SYSTEM = `You are helping someone prepare a study circle on classical Islamic
Arabic scholarship. He reads Arabic fluently and already understands the words
of the phrase he is asking about. His question is what the phrase means as a
CONCEPT — how the scholars use it, what it covers, where they draw its limits.

Answer that question, not the translation.

RULES

1. Passages from the user's own library are supplied below. They are the better
   source: cite them in preference to anything from the web.
2. Every claim from the web must carry its link. Make no uncited assertions.
3. Web excerpts are one or two sentences, enough to show relevance. Never
   reproduce a section of an article, and never assemble a paraphrase dense
   enough to substitute for reading the source.
4. Prefer scholarly and institutional sources. Treat forum and Q&A material as
   weak, and say so if you rely on it.
5. Plain, clear English suited to a non-native speaker. Keep Arabic technical
   terms in Arabic script with a brief gloss.
6. If the sources do not settle the question, say so rather than filling the
   gap.`;

/**
 * Search the user's own imported books for the phrase's key terms.
 *
 * This runs before any web call, and is the higher-quality path: offline, free,
 * and citable to a ج/ص the user can turn to directly.
 */
export async function searchLibrary(
  storage: StorageAdapter,
  phrase: string,
  excludeBookId: string,
  limit = 8,
): Promise<LocalSourceRef[]> {
  // Reference works — Fatḥ al-Bārī, an-Nawawī's sharḥ — are exactly what this
  // should be searching, alongside the reading library. Only dictionaries are
  // excluded, being keyed by root rather than passage.
  const books = (await storage.listBooks()).filter(
    (book) => book.role !== 'dictionary' && book.importStatus !== 'pending',
  );
  if (books.length === 0) return [];

  // Key terms: the longest words carry the most signal, and stopwords carry
  // none. Searching the whole phrase verbatim almost never hits.
  const terms = normalize(phrase)
    .split(' ')
    .filter((word) => word.length >= 4)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  if (terms.length === 0) return [];

  const found: LocalSourceRef[] = [];

  for (const book of books) {
    const meta = new Map(
      (await storage.listPageMeta(book.id)).map((entry) => [entry.pageIndex, entry]),
    );

    for (const term of terms) {
      const hits = await storage.searchBlocks(book.id, term, 4);
      for (const hit of hits) {
        // The passage being asked about is not evidence about itself.
        if (book.id === excludeBookId && hit.block.normalized.includes(normalize(phrase))) {
          continue;
        }
        if (found.some((existing) => existing.blockId === hit.block.id)) continue;

        const pageIndex = Number(hit.block.pageId.split(':p')[1] ?? 0);
        const page = meta.get(pageIndex);

        found.push({
          bookId: book.id,
          blockId: hit.block.id,
          bookTitle: book.title,
          volume: page?.volume ?? null,
          printPage: page?.printPage ?? null,
          excerpt: hit.block.text.slice(0, 400),
        });
        if (found.length >= limit) return found;
      }
    }
  }

  return found;
}

/**
 * Two passes, because a forced tool_choice prevents the model from calling the
 * web-search tool at all: research freely first, then structure the result.
 */
export async function explainPhrase(options: {
  apiKey: string;
  model: string;
  phrase: string;
  context: string;
  localSources: LocalSourceRef[];
  onProgress?: (partial: string) => void;
}): Promise<ExplainResult> {
  const client = new Anthropic({
    apiKey: options.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const usage: TranslationUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  const library = options.localSources
    .map(
      (source, index) =>
        `<passage id="L${index}" book="${source.bookTitle}">\n${source.excerpt}\n</passage>`,
    )
    .join('\n\n');

  const question =
    `<phrase>\n${options.phrase}\n</phrase>\n\n` +
    `<surrounding_text>\n${options.context}\n</surrounding_text>\n\n` +
    (library
      ? `<library_passages>\n${library}\n</library_passages>\n\n`
      : '<library_passages>(nothing in the library matched)</library_passages>\n\n') +
    'Explain what this phrase means as a concept. Search the web only for what the ' +
    'library passages do not settle.';

  // Pass 1 — research, free-form, web search on.
  let notes = '';
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: question }];

  try {
    for (let turn = 0; turn < 4; turn++) {
      const stream = client.messages.stream({
        model: options.model,
        max_tokens: 8000,
        system: SYSTEM,
        messages,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5 }],
      });

      let turnText = '';
      stream.on('text', (delta) => {
        turnText += delta;
        options.onProgress?.(notes + turnText);
      });

      const message = await stream.finalMessage();
      accumulate(usage, message.usage);
      notes += message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');

      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }
      break;
    }

    // Pass 2 — structure it. No search, tool forced.
    const structured = client.messages.stream({
      model: options.model,
      max_tokens: maxTokensFor(options.phrase, 6),
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `${question}\n\n<research_notes>\n${notes}\n</research_notes>\n\nNow return the structured explanation.`,
        },
      ],
      tools: [EXPLAIN_TOOL],
      tool_choice: { type: 'tool', name: 'emit_explanation' },
    });

    const final = await structured.finalMessage();
    accumulate(usage, final.usage);

    const call = final.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'emit_explanation',
    );

    if (!call) {
      throw new TranslationError('parse', 'No structured explanation was returned.', {
        raw: notes,
      });
    }

    const input = call.input as {
      explanation?: string;
      localSourceIds?: string[];
      webSources?: WebSourceRef[];
    };

    const usedIds = new Set(input.localSourceIds ?? []);
    const usedLocal = options.localSources.filter((_, index) => usedIds.has(`L${index}`));

    return {
      explanation: input.explanation ?? '',
      // If nothing was cited explicitly, keep what was offered — the passages
      // are the user's own and are worth showing either way.
      localSources: usedLocal.length > 0 ? usedLocal : options.localSources,
      webSources: (input.webSources ?? []).filter((source) => Boolean(source.url)),
      usage,
      costUsd: null,
    };
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
    throw new TranslationError(
      'api',
      error instanceof Error ? error.message : String(error),
    );
  }
}

function accumulate(total: TranslationUsage, usage: Anthropic.Usage): void {
  total.inputTokens += usage.input_tokens ?? 0;
  total.outputTokens += usage.output_tokens ?? 0;
  total.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
  total.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;
}
