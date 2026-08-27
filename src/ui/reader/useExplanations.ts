import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../app/secrets';
import { newId } from '../../lib/id';
import type { Block, ExplanationCard, TranslationCard } from '../../types';
import { TranslationError } from '../../translation/TranslationProvider';
import { explainPhrase, searchLibrary } from '../../translation/explain';
import { isOnlineNow } from '../../app/useOnline';

/**
 * A specific empty state, not a generic failure: it names what could be added.
 */
const NO_REFERENCE_WORKS =
  'Nothing in your library matches this phrase, and external sources are unavailable offline. ' +
  'Importing a commentary — Fatḥ al-Bārī, or an-Nawawī’s Sharḥ Ṣaḥīḥ Muslim — as a reference work ' +
  'would give this something to search. Settings → Reference works.';
import { costOf } from '../../translation/providers/AnthropicProvider';
import type { SelectionAnchor } from './selection';

// "Explain this phrase" — a research question, answered into its own card.
//
// It never modifies the translation it hangs from, and deleting it leaves that
// translation untouched.

export function useExplanations(bookId: string, blocks: Block[]) {
  const { storage, activeProfile } = useApp();
  const [cards, setCards] = useState<ExplanationCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void storage.listExplanationCards(bookId).then(setCards);
  }, [storage, bookId]);

  const upsert = useCallback((card: ExplanationCard) => {
    setCards((previous) => {
      const index = previous.findIndex((existing) => existing.id === card.id);
      if (index === -1) return [...previous, card];
      const next = [...previous];
      next[index] = card;
      return next;
    });
  }, []);

  const explain = useCallback(
    async (
      anchor: Pick<
        SelectionAnchor,
        'startBlockId' | 'startOffset' | 'endBlockId' | 'endOffset' | 'sourceText'
      >,
      translationCards: TranslationCard[],
    ) => {
      // Offline, this degrades rather than disabling: searching the user's own
      // imported books is the higher-quality half of the feature anyway, and a
      // local-only result is a first-class answer, not a consolation.
      const apiKey = secrets.getProviderKey('anthropic');
      const localOnly = !isOnlineNow() || !apiKey;

      if (localOnly && !apiKey && isOnlineNow()) {
        setNotice(
          'Explaining with web sources needs an Anthropic key. Your own library is still searched.',
        );
      }

      // If the phrase sits inside a translated range, the explanation attaches
      // to that card and renders beneath it.
      const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
      const position = orderOf.get(anchor.startBlockId) ?? 0;
      const parent = translationCards.find((candidate) => {
        const from = orderOf.get(candidate.startBlockId);
        const to = orderOf.get(candidate.endBlockId);
        return from !== undefined && to !== undefined && position >= from && position <= to;
      });

      const block = blocks.find((entry) => entry.id === anchor.startBlockId);

      const card: ExplanationCard = {
        id: newId('explain'),
        kind: 'explanation',
        bookId,
        parentCardId: parent?.id ?? null,
        startBlockId: anchor.startBlockId,
        startOffset: anchor.startOffset,
        endBlockId: anchor.endBlockId,
        endOffset: anchor.endOffset,
        createdAt: Date.now(),
        collapsed: false,
        query: anchor.sourceText,
        explanation: '',
        localSources: [],
        webSources: [],
        status: 'loading',
        providerId: 'anthropic',
        model: activeProfile.model.startsWith('claude') ? activeProfile.model : 'claude-sonnet-5',
      };

      upsert(card);
      setBusy(true);
      setNotice(null);

      try {
        // The user's own library first: better material, offline, and citable
        // to a ج/ص he can turn to.
        const localSources = await searchLibrary(storage, anchor.sourceText, bookId);

        if (localOnly) {
          const finished: ExplanationCard = {
            ...card,
            status: 'complete',
            explanation:
              localSources.length > 0
                ? 'Offline: the passages below are from your own library. External sources were not consulted, and no explanation was generated — the citations are the result.'
                : '',
            localSources,
            webSources: [],
            error: localSources.length === 0 ? NO_REFERENCE_WORKS : undefined,
            errorKind: localSources.length === 0 ? 'network' : undefined,
          };
          await storage.putExplanationCard(finished);
          upsert(finished);
          return finished;
        }

        const result = await explainPhrase({
          apiKey,
          model: card.model,
          phrase: anchor.sourceText,
          context: block?.text ?? anchor.sourceText,
          localSources,
        });

        const finished: ExplanationCard = {
          ...card,
          status: 'complete',
          explanation: result.explanation,
          localSources: result.localSources,
          webSources: result.webSources,
          usage: result.usage,
          costUsd: costOf(card.model, result.usage),
        };
        await storage.putExplanationCard(finished);
        upsert(finished);
        return finished;
      } catch (caught) {
        const error =
          caught instanceof TranslationError
            ? caught
            : new TranslationError('api', caught instanceof Error ? caught.message : String(caught));

        const failed: ExplanationCard = {
          ...card,
          status: 'error',
          error: error.message,
          errorKind: error.kind,
        };
        await storage.putExplanationCard(failed);
        upsert(failed);
        return failed;
      } finally {
        setBusy(false);
      }
    },
    [storage, bookId, blocks, activeProfile.model, upsert],
  );

  const setCollapsed = useCallback(
    async (card: ExplanationCard, collapsed: boolean) => {
      const next = { ...card, collapsed };
      upsert(next);
      await storage.putExplanationCard(next);
    },
    [storage, upsert],
  );

  const remove = useCallback(
    async (card: ExplanationCard) => {
      // Deleting an explanation leaves its parent translation untouched.
      await storage.deleteExplanationCard(card.id);
      setCards((previous) => previous.filter((existing) => existing.id !== card.id));
    },
    [storage],
  );

  return { cards, busy, notice, setNotice, explain, setCollapsed, remove };
}
