import { useCallback, useEffect, useState } from 'react';
import { beginActivity } from '../../services/activity';
import { coverageOf } from '../../translation/coverage';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../services/secrets';
import { newId } from '../../lib/id';
import type { Block, Entity, ProviderId, TranslationCard } from '../../types';
import type { TranslationResult } from '../../translation/TranslationProvider';
import { providerFor } from '../../translation/providers/registry';
import { cacheKeyFor, glossaryHashOf } from '../../translation/prompt';
import { enrichSegments } from '../../retrieval/enrich';
import { loadQuranEnglish, loadQuranIndex } from '../../quran/quranIndex';
import {
  applyProseTranslations,
  segmentSelection,
} from '../../translation/offline/segmentSelection';
import { translateProse } from '../../translation/offline/OfflineProvider';
import type { SelectionAnchor } from './selection';
import {
  cacheAnchorFor,
  failedCard,
  loadingCard,
  passageFor,
  standalonePassage,
  translationRequestFor,
  withoutStream,
} from './translationSteps';

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
  /** Re-run even if a cached card already covers this exact range. */
  force?: boolean;
  /** "Retranslate with…" — run this one on a different provider/model. */
  providerId?: ProviderId;
  model?: string;
  /**
   * Retranslate: the card this one replaces. It is removed only once the new
   * card is stored complete, so a refusal or a failure never costs the old
   * card (FOUND_ISSUES 42; a paid response is never discarded). On a failure
   * the old card stays whatever its status: a failed card can hold paid output
   * in `rawResponse` (a truncated or unparsed reply).
   */
  replaces?: TranslationCard;
  /**
   * Translate `anchor.sourceText` as a text of its own, not as the passage the
   * anchor points at: the dictionary's "Translate this entry" (FOUND_ISSUES
   * 26). See `cacheAnchorFor` and `TranslationCard.standalone`.
   */
  standalone?: boolean;
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

// The session-stats updaters of `translate`'s offline and cloud branches,
// moved verbatim from it in restructure Phase 5 step 5i3. They are here, not
// in translationSteps.ts, because `SessionStats` is declared here and
// importing it there would make a file cycle (the plan's amendment to Q12).
function withOfflineRequest(previous: SessionStats): SessionStats {
  return {
    ...previous,
    requests: previous.requests + 1,
    requestsByProvider: {
      ...previous.requestsByProvider,
      offline: previous.requestsByProvider.offline + 1,
    },
  };
}

function withCloudRequest(
  previous: SessionStats,
  useProviderId: ProviderId,
  result: TranslationResult,
): SessionStats {
  return {
    requests: previous.requests + 1,
    requestsByProvider: {
      ...previous.requestsByProvider,
      [useProviderId]: previous.requestsByProvider[useProviderId] + 1,
    },
    costUsd: previous.costUsd + (result.costUsd ?? 0),
    cacheReadTokens: previous.cacheReadTokens + result.usage.cacheReadTokens,
    cacheWriteTokens: previous.cacheWriteTokens + result.usage.cacheWriteTokens,
  };
}

export function useTranslator(bookId: string, blocks: Block[], entities: Entity[] = []) {
  const { storage, http, activeProfile, glossary, settings, refreshGlossary } = useApp();

  const [cards, setCards] = useState<TranslationCard[]>([]);
  const [streaming, setStreaming] = useState<Record<string, string>>({});
  // How many translations are in flight, not one flag: with a manual
  // Translate during a batch, or a retranslate during either, the first to
  // finish cleared the flag and the rail's Translate and Explain came back
  // while the other was still running (FOUND_ISSUES 29).
  const [inFlight, setInFlight] = useState(0);
  const busy = inFlight > 0;
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

      // Verified hadith translations already cached locally, if any — for the
      // ḥadīth that touch the selection only, read together. Every ḥadīth in
      // the book was read, one after another, before each translation:
      // thousands of sequential reads on a large collection (FOUND_ISSUES 35).
      // segmentSelection looks a reference up only for an entity touching a
      // selected block, and any such ḥadīth overlaps the selection's block
      // range, so every ḥadīth it can look up is read here. (Since FOUND_ISSUES
      // 52 it looks up nothing for narrator and person entities.) An entity
      // end whose block is not in
      // `blocks`, or a reversed one, counts as unbounded, so malformed data
      // reads too much rather than too little.
      const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
      const firstOrder = orderOf.get(card.startBlockId) ?? 0;
      const lastOrder = orderOf.get(card.endBlockId) ?? 0;
      const references = new Set<string>();
      for (const entity of entities) {
        if (entity.type !== 'hadith' || !entity.reference) continue;
        const startOrder = orderOf.get(entity.startBlockId);
        const endOrder = orderOf.get(entity.endBlockId);
        const entityFirst =
          startOrder === undefined || endOrder === undefined
            ? -Infinity
            : Math.min(startOrder, endOrder);
        const entityLast =
          startOrder === undefined || endOrder === undefined
            ? Infinity
            : Math.max(startOrder, endOrder);
        if (entityLast < firstOrder || entityFirst > lastOrder) continue;
        references.add(entity.reference);
      }
      const records = await Promise.all(
        [...references].map(async (reference) => [reference, await storage.getHadith(reference)] as const),
      );
      const cache = new Map<string, { arabic: string; english: string }>();
      for (const [reference, record] of records) {
        if (record?.english) {
          cache.set(reference, { arabic: record.arabic, english: record.english });
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
        ...cacheAnchorFor(card, card.standalone === true),
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

  /**
   * Remove the card a retranslation replaced, after its successor is stored.
   *
   * It never throws. It runs inside `translate`'s `try`, after the new card is
   * stored complete, and a rejected delete reaching the `catch` would write a
   * failed card over that complete one (same id). A delete that fails leaves
   * both cards, which loses nothing, and says so.
   */
  const dropReplaced = useCallback(
    async (replaced: TranslationCard | undefined) => {
      if (!replaced) return;
      try {
        await storage.deleteCard(replaced.id);
        setCards((previous) => previous.filter((existing) => existing.id !== replaced.id));
      } catch {
        setNotice('The new translation is saved, but the old card could not be removed.');
      }
    },
    [storage],
  );

  const translate = useCallback(
    async ({
      anchor,
      force = false,
      providerId,
      model,
      replaces,
      standalone = false,
    }: TranslateRequest) => {
      // The profile pins provider and model; an explicit override is only for
      // the card-level "retranslate with…" action.
      const useProviderId = providerId ?? activeProfile.providerId;
      const useModel = model ?? activeProfile.model;
      const offline = useProviderId === 'offline';

      // The on-device path cuts a passage out of the stored blocks by its
      // anchor (segmentSelection), so it cannot translate a text that is not
      // in the book. Refused rather than translating the visible block in
      // its place (FOUND_ISSUES 26).
      if (offline && standalone) {
        setNotice(
          'A dictionary entry is translated by a cloud provider. Choose Claude or Gemini in the profile to translate it.',
        );
        return null;
      }

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
        ...cacheAnchorFor(anchor, standalone),
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

      // A standalone text is sent alone: the visible block it is anchored on
      // is not its context, and that block's types, ḥadīth numbers and verses
      // are not its own (FOUND_ISSUES 26).
      const { selected, before, after, known } = standalone
        ? standalonePassage()
        : passageFor(blocks, entities, anchor);

      const card: TranslationCard = loadingCard({
        bookId,
        anchor,
        activeProfile,
        glossaryHash,
        useProviderId,
        useModel,
        cacheKey,
        standalone,
      });

      // Held in memory only while in flight — a card left mid-request by a
      // closed tab should not come back as a permanently spinning row.
      upsert(card);
      setInFlight((count) => count + 1);
      setNotice(null);
      // Also held app-wide, so the service-worker update prompt waits: a reload
      // mid-request loses the passage and the tokens already spent on it.
      const endActivity = beginActivity();

      try {
        if (offline) {
          const finished = await runOffline(card, useModel);
          await storage.putCard(finished);
          upsert(finished);
          await dropReplaced(replaces);
          setStats((previous) => withOfflineRequest(previous));
          return finished;
        }

        const result = await providerFor(useProviderId).translate(
          translationRequestFor({
            anchor,
            before,
            after,
            selected,
            activeProfile,
            glossary,
            useModel,
            known,
          }),
          apiKey,
          (partial) => setStreaming((previous) => ({ ...previous, [card.id]: partial })),
        );

        // Measured before enrichment, against the Arabic that was sent. A
        // well-formed answer that quietly stopped half way through the passage
        // is indistinguishable from a complete one at every other layer.
        const coverage = coverageOf(anchor.sourceText, result.segments);

        const finished: TranslationCard = {
          ...card,
          status: 'complete',
          usedExternalLookup: result.searched === true,
          usage: result.usage,
          costUsd: result.costUsd,
          coverage: coverage.ratio,
          reachedEnd: coverage.reachedEnd,
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
        await dropReplaced(replaces);

        setStats((previous) => withCloudRequest(previous, useProviderId, result));

        return finished;
      } catch (caught) {
        const failed = failedCard(card, caught);
        await storage.putCard(failed);
        upsert(failed);
        return failed;
      } finally {
        endActivity();
        setInFlight((count) => count - 1);
        setStreaming((previous) => withoutStream(previous, card));
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
      dropReplaced,
    ],
  );

  // The old card is no longer deleted first: `translate` checks the key and
  // every other precondition, and removes the old card only after the new one
  // is stored (`replaces`). Deleting it up front lost a paid Claude card when
  // the chosen provider had no key (FOUND_ISSUES 42).
  const retranslate = useCallback(
    async (
      card: TranslationCard,
      options: { providerId?: ProviderId; model?: string } = {},
    ) =>
      translate({
        anchor: card,
        providerId: options.providerId,
        model: options.model,
        force: true,
        replaces: card,
        standalone: card.standalone === true,
      }),
    [translate],
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
