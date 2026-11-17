import type {
  Block,
  Entity,
  GlossaryEntry,
  ProviderId,
  TranslationCard,
  TranslationProfile,
} from '../../types';
import { newId } from '../../lib/id';
import { knownReferencesIn } from '../../quran/entityService';
import { TranslationError, type TranslationRequest } from '../../translation/TranslationProvider';
import { TRANSLITERATION_INSTRUCTION } from '../../translation/prompt';
import { blocksInRange, contextAround, type SelectionAnchor } from './selection';

// The steps of one translation that only compute a value: the passage
// around the selection, the request handed to the provider, the loading and
// failed cards, and the streaming text without the card's entry. No
// storage, no React state, no `await`. The one exception is the loading
// card's `newId('card')` (a module counter and a random draw) and
// `Date.now()`, inside its literal as they were, so they run when the card
// is built. `translate` in useTranslator.ts keeps every other side effect,
// every `await` and its cache key in its own order (`isStale` keeps the
// other), and calls these where their text was. Its session-stats updaters
// stay in useTranslator.ts beside `SessionStats`, since importing that type
// here would make a file cycle. Moved verbatim from useTranslator.ts in
// restructure Phase 5 steps 5i1, 5i2 and 5i3
// (docs/refactor/plans/phase5-big-ui-files.md, Design §7 and the amendment
// to Q12).

export function passageFor(
  blocks: Block[],
  entities: Entity[],
  anchor: Pick<SelectionAnchor, 'startBlockId' | 'endBlockId'>,
) {
  const selected = blocksInRange(blocks, anchor.startBlockId, anchor.endBlockId);
  const { before, after } = contextAround(blocks, anchor.startBlockId, anchor.endBlockId);

  // Verses in this passage were resolved locally at import, against the
  // bundled muṣḥaf. No model call is needed to identify them.
  const known = knownReferencesIn(
    entities,
    new Set(selected.map((block) => block.id)),
  );
  return { selected, before, after, known };
}

export function translationRequestFor({
  anchor,
  before,
  after,
  selected,
  activeProfile,
  glossary,
  useModel,
  known,
}: {
  anchor: Pick<SelectionAnchor, 'sourceText'>;
  before: Block[];
  after: Block[];
  selected: Block[];
  activeProfile: TranslationProfile;
  glossary: GlossaryEntry[];
  useModel: string;
  known: ReturnType<typeof passageFor>['known'];
}): TranslationRequest {
  return {
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
    allowExternalLookup: activeProfile.allowExternalLookup,
  };
}

export function loadingCard({
  bookId,
  anchor,
  activeProfile,
  glossaryHash,
  useProviderId,
  useModel,
  cacheKey,
}: {
  bookId: string;
  anchor: Pick<
    SelectionAnchor,
    'startBlockId' | 'startOffset' | 'endBlockId' | 'endOffset' | 'sourceText'
  >;
  activeProfile: TranslationProfile;
  glossaryHash: string;
  useProviderId: ProviderId;
  useModel: string;
  cacheKey: string;
}): TranslationCard {
  return {
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
    usedExternalLookup: activeProfile.allowExternalLookup,
  };
}

export function failedCard(card: TranslationCard, caught: unknown): TranslationCard {
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
  return failed;
}

export function withoutStream(
  previous: Record<string, string>,
  card: Pick<TranslationCard, 'id'>,
): Record<string, string> {
  const next = { ...previous };
  delete next[card.id];
  return next;
}
