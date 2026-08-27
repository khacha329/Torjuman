import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../app/secrets';
import { newId } from '../../lib/id';
import type { Block, Entity, ProviderId, TranslationCard } from '../../types';
import { knownReferencesIn } from '../../quran/entityService';
import { TranslationError } from '../../translation/TranslationProvider';
import { providerFor } from '../../translation/registry';
import { cacheKeyFor, glossaryHashOf, TRANSLITERATION_INSTRUCTION } from '../../translation/prompt';
import { enrichSegments } from '../../retrieval/enrich';
import { loadQuranEnglish, loadQuranIndex } from '../../quran/quranIndex';
import {
  applyProseTranslations,
  segmentSelection,
} from '../../translation/offline/segmentSelection';
import { translateProse } from '../../translation/offline/OfflineProvider';
import { blocksInRange, contextAround, type SelectionAnchor } from './selection';

// Orchestrates one translation: pick the provider the profile pins → cache
// check → provider call → scripture retrieval → persist.
//
// Nothing here names a provider. The profile pins one, the registry hands back
// an implementation, and this code talks to the interface.

export interface TranslateRequest {
  anchor: Pick<
    SelectionAnchor,
    'startBlockId' | 'startOffset' | 'endBlockId' | 'endOffset' | 'sourceText'
  >;
  digDeeper?: boolean;
  /** Re-run even if a cached card already covers this exact range. */
  force?: boolean;
  /** "Retranslate with…" — run this one on a different provider/model. */
  providerId?: ProviderId;
  model?: string;
}

/** Running totals for the reader's status line. */
export interface SessionStats {
  requests: number;
  requestsByProvider: Record<ProviderId, number>;
  costUsd: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

const EMPTY_STATS: SessionStats = {
  requests: 0,
  requestsByProvider: { anthropic: 0, gemini: 0, offline: 0 },
  costUsd: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function useTranslator(bookId: string, blocks: Block[], entities: Entity[] = []) {
  const { storage, http, activeProfile, glossary, settings, refreshGlossary } = useApp();

  const [cards, setCards] = useState<TranslationCard[]>([]);
  const [streaming, setStreaming] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<SessionStats>(EMPTY_STATS);

  useEffect(() => {
    void storage.listCards(bookId).then(setCards);
  }, [storage, bookId]);

  const glossaryHash = glossaryHashOf(glossary);

  /**
   * The offline path.
   *
   * The selection is cut into pieces FIRST, deterministically, against the
   * bundled muṣḥaf and the local hadith cache. Verses and hadith are finished
   * before anything is translated; only the leftover commentary prose is handed
   * to the model, and it is handed nothing else. A hadith with no verified
   * offline translation comes out as Arabic plus an honest note — it is never
   * routed to the model as a fallback, because the model is never given it.
   */
  const runOffline = useCallback(
    async (card: TranslationCard, modelId: string): Promise<TranslationCard> => {
      const [quran, english] = await Promise.all([loadQuranIndex(), loadQuranEnglish()]);

      // Verified hadith translations already cached locally, if any.
      const cache = new Map<string, { arabic: string; english: string }>();
      for (const entity of entities) {
        if (entity.type !== 'hadith' || !entity.reference) continue;
        const record = await storage.getHadith(entity.reference);
        if (record?.english) {
          cache.set(entity.reference, { arabic: record.arabic, english: record.english });
        }
      }

      const segmented = segmentSelection({
        blocks,
        entities,
        startBlockId: card.startBlockId,
        startOffset: card.startOffset,
        endBlockId: card.endBlockId,
        endOffset: card.endOffset,
        quran,
        english,
        hadithLookup: (reference) => cache.get(reference) ?? null,
      });

      setStreaming((previous) => ({
        ...previous,
        [card.id]: `Translating ${segmented.prose.length} passage(s) on device…`,
      }));

      const translated = await translateProse(
        segmented.prose.map((span) => span.text),
        {
          modelId,
          glossary: glossary.map((entry) => ({
            arabic: entry.arabic,
            english: entry.english,
          })),
          onProgress: (done, total) =>
            setStreaming((previous) => ({
              ...previous,
              [card.id]: `Translating passage ${done} of ${total} on device…`,
            })),
        },
      );

      return {
        ...card,
        status: 'complete',
        segments: applyProseTranslations(segmented, translated),
        costUsd: 0,
      };
    },
    [blocks, entities, glossary, storage],
  );

  /** A card is stale when the key it was made with no longer matches today's. */
  const isStale = useCallback(
    (card: TranslationCard) =>
      card.cacheKey !==
      cacheKeyFor({
        startBlockId: card.startBlockId,
        startOffset: card.startOffset,
        endBlockId: card.endBlockId,
        endOffset: card.endOffset,
        profileId: activeProfile.id,
        profileVersion: activeProfile.version,
        glossaryHash,
        // Compared against the card's own provider and model, so simply
        // switching provider in settings does not mark every existing card
        // stale — only a change that would actually alter this card's output.
        providerId: card.providerId,
        model: card.model,
      }),
    [activeProfile, glossaryHash],
  );

  const upsert = useCallback((card: TranslationCard) => {
    setCards((previous) => {
      const index = previous.findIndex((existing) => existing.id === card.id);
      if (index === -1) return [...previous, card];
      const next = [...previous];
      next[index] = card;
      return next;
    });
  }, []);

  const translate = useCallback(
    async ({
      anchor,
      digDeeper = false,
      force = false,
      providerId,
      model,
    }: TranslateRequest) => {
      // The profile pins provider and model; an explicit override is only for
      // the card-level "retranslate with…" action.
      const useProviderId = providerId ?? activeProfile.providerId;
      const useModel = model ?? activeProfile.model;
      const offline = useProviderId === 'offline';

      let apiKey = '';
      if (!offline) {
        apiKey = secrets.getProviderKey(useProviderId);
        if (!apiKey) {
          setNotice(
            `No ${providerFor(useProviderId).displayName} API key is set. Add one in Settings before translating.`,
          );
          return null;
        }
      }

      const cacheKey = cacheKeyFor({
        startBlockId: anchor.startBlockId,
        startOffset: anchor.startOffset,
        endBlockId: anchor.endBlockId,
        endOffset: anchor.endOffset,
        profileId: activeProfile.id,
        profileVersion: activeProfile.version,
        glossaryHash,
        providerId: useProviderId,
        model: useModel,
      });

      if (!force) {
        const cached = await storage.getCardByCacheKey(cacheKey);
        if (cached) {
          upsert(cached);
          return cached;
        }
      }

      const selected = blocksInRange(blocks, anchor.startBlockId, anchor.endBlockId);
      const { before, after } = contextAround(blocks, anchor.startBlockId, anchor.endBlockId);

      // Verses in this passage were resolved locally at import, against the
      // bundled muṣḥaf. No model call is needed to identify them.
      const known = knownReferencesIn(
        entities,
        new Set(selected.map((block) => block.id)),
      );

      const card: TranslationCard = {
        id: newId('card'),
        kind: 'translation',
        bookId,
        startBlockId: anchor.startBlockId,
        startOffset: anchor.startOffset,
        endBlockId: anchor.endBlockId,
        endOffset: anchor.endOffset,
        sourceText: anchor.sourceText,
        segments: [],
        profileId: activeProfile.id,
        promptVersion: activeProfile.version,
        glossaryHash,
        providerId: useProviderId,
        model: useModel,
        createdAt: Date.now(),
        // New cards open expanded — the user just asked for this translation,
        // so hiding it would be wrong.
        collapsed: false,
        cacheKey,
        status: 'loading',
        usedExternalLookup: digDeeper || activeProfile.allowExternalLookup,
      };

      // Held in memory only while in flight — a card left mid-request by a
      // closed tab should not come back as a permanently spinning row.
      upsert(card);
      setBusy(true);
      setNotice(null);

      try {
        if (offline) {
          const finished = await runOffline(card, useModel);
          await storage.putCard(finished);
          upsert(finished);
          setStats((previous) => ({
            ...previous,
            requests: previous.requests + 1,
            requestsByProvider: {
              ...previous.requestsByProvider,
              offline: previous.requestsByProvider.offline + 1,
            },
          }));
          return finished;
        }

        const result = await providerFor(useProviderId).translate(
          {
            targetText: anchor.sourceText,
            contextBefore: before.map((block) => block.text).join('\n\n'),
            contextAfter: after.map((block) => block.text).join('\n\n'),
            blockTypes: selected.map((block) => block.type),
            systemPrompt: activeProfile.useTransliteration
              ? `${activeProfile.systemPrompt}\n\n${TRANSLITERATION_INSTRUCTION}`
              : activeProfile.systemPrompt,
            glossary,
            model: useModel,
            hadithNumbers: selected
              .map((block) => block.hadithNumber)
              .filter((value): value is string => Boolean(value)),
            knownQuranRefs: known.quran,
            allowExternalLookup: digDeeper || activeProfile.allowExternalLookup,
          },
          apiKey,
          (partial) => setStreaming((previous) => ({ ...previous, [card.id]: partial })),
        );

        const finished: TranslationCard = {
          ...card,
          status: 'complete',
          usage: result.usage,
          costUsd: result.costUsd,
          segments: await enrichSegments(result.segments, {
            http,
            storage,
            quran: {
              translationId: settings.quranTranslationId,
              translationName: settings.quranTranslationName,
            },
            sunnahApiKey: secrets.getSunnahKey(),
            knownQuranRefs: known.quran,
          }),
        };

        await storage.putCard(finished);
        upsert(finished);

        setStats((previous) => ({
          requests: previous.requests + 1,
          requestsByProvider: {
            ...previous.requestsByProvider,
            [useProviderId]: previous.requestsByProvider[useProviderId] + 1,
          },
          costUsd: previous.costUsd + (result.costUsd ?? 0),
          cacheReadTokens: previous.cacheReadTokens + result.usage.cacheReadTokens,
          cacheWriteTokens: previous.cacheWriteTokens + result.usage.cacheWriteTokens,
        }));

        return finished;
      } catch (caught) {
        const error =
          caught instanceof TranslationError
            ? caught
            : new TranslationError(
                'api',
                caught instanceof Error ? caught.message : String(caught),
              );

        const failed: TranslationCard = {
          ...card,
          status: 'error',
          error: error.message,
          errorKind: error.kind,
          rawResponse: error.raw ?? undefined,
        };
        await storage.putCard(failed);
        upsert(failed);
        return failed;
      } finally {
        setBusy(false);
        setStreaming((previous) => {
          const next = { ...previous };
          delete next[card.id];
          return next;
        });
      }
    },
    [
      activeProfile,
      blocks,
      bookId,
      entities,
      glossary,
      glossaryHash,
      http,
      settings.quranTranslationId,
      settings.quranTranslationName,
      storage,
      upsert,
    ],
  );

  const retranslate = useCallback(
    async (
      card: TranslationCard,
      options: { digDeeper?: boolean; providerId?: ProviderId; model?: string } = {},
    ) => {
      await storage.deleteCard(card.id);
      setCards((previous) => previous.filter((existing) => existing.id !== card.id));
      return translate({
        anchor: card,
        digDeeper: options.digDeeper,
        providerId: options.providerId,
        model: options.model,
        force: true,
      });
    },
    [storage, translate],
  );

  const remove = useCallback(
    async (card: TranslationCard) => {
      await storage.deleteCard(card.id);
      setCards((previous) => previous.filter((existing) => existing.id !== card.id));
    },
    [storage],
  );

  /**
   * Collapse state is presentation only and is persisted so it survives a
   * restart. It never touches the cache key, the anchor, or the card's
   * existence — a collapsed card is still a card.
   */
  const setCollapsed = useCallback(
    async (card: TranslationCard, collapsed: boolean) => {
      const next = { ...card, collapsed };
      upsert(next);
      await storage.putCard(next);
    },
    [storage, upsert],
  );

  const setAllCollapsed = useCallback(
    async (collapsed: boolean, only?: TranslationCard[]) => {
      const targets = (only ?? cards).filter((card) => card.collapsed !== collapsed);
      if (targets.length === 0) return;

      const updated = targets.map((card) => ({ ...card, collapsed }));
      setCards((previous) =>
        previous.map((card) => {
          const match = updated.find((entry) => entry.id === card.id);
          return match ?? card;
        }),
      );
      for (const card of updated) await storage.putCard(card);
    },
    [cards, storage],
  );

  const addGlossaryTerm = useCallback(
    async (arabic: string) => {
      const english = window.prompt(`English rendering for "${arabic}":`, '');
      if (english === null || english.trim() === '') return;
      await storage.putGlossaryEntry({
        id: newId('gloss'),
        arabic,
        english: english.trim(),
        note: null,
        addedAt: Date.now(),
      });
      await refreshGlossary();
    },
    [storage, refreshGlossary],
  );

  return {
    cards,
    streaming,
    busy,
    notice,
    setNotice,
    stats,
    translate,
    retranslate,
    remove,
    setCollapsed,
    setAllCollapsed,
    addGlossaryTerm,
    isStale,
  };
}
