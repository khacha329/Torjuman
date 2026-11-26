import type {
  Block,
  Entity,
  GlossaryEntry,
  ProviderId,
  TranslationCard,
  TranslationProfile,
} from '../../types';
import { newId } from '../../lib/id';
import { sha256 } from '../../lib/hash';
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

/**
 * The block ids a translation's cache key is built from.
 *
 * A selection is keyed by where it sits, as always. A standalone text — the
 * dictionary's "Translate this entry" — is anchored on the visible block only
 * so its card has a place in the panel; its key carries a hash of the text
 * instead, so it can never be served as, or served instead of, that block's own
 * translation (FOUND_ISSUES 26). `cacheKeyFor` itself is unchanged, so every
 * existing card keeps its key.
 *
 * The block id stays in a standalone key on purpose: the cache index covers
 * every book (`getCardByCacheKey`), and block ids carry their book's id, so
 * the prefix keeps a hit inside its own book. The cost is that the same entry
 * looked up from two different visible blocks is translated twice.
 */
export function cacheAnchorFor(
  anchor: Pick<
    SelectionAnchor,
    'startBlockId' | 'startOffset' | 'endBlockId' | 'endOffset' | 'sourceText'
  >,
  standalone: boolean,
): Pick<SelectionAnchor, 'startBlockId' | 'startOffset' | 'endBlockId' | 'endOffset'> {
  if (!standalone) {
    return {
      startBlockId: anchor.startBlockId,
      startOffset: anchor.startOffset,
      endBlockId: anchor.endBlockId,
      endOffset: anchor.endOffset,
    };
  }
  const id = `${anchor.startBlockId}#entry:${sha256(anchor.sourceText).slice(0, 16)}`;
  return { startBlockId: id, startOffset: 0, endBlockId: id, endOffset: anchor.sourceText.length };
}

/**
 * A standalone text's passage: nothing around it, nothing known in it. A
 * function, so every call gets its own empty arrays and nothing downstream can
 * change a shared object.
 */
export function standalonePassage(): ReturnType<typeof passageFor> {
  return { selected: [], before: [], after: [], known: { quran: [], hadith: [] } };
}

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
  standalone,
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
  standalone: boolean;
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
    // Set by the finished card from what the provider reports. It was the
    // profile's setting, whatever the provider, so a Gemini card claimed a
    // search that never ran (FOUND_ISSUES 43).
    usedExternalLookup: false,
    ...(standalone ? { standalone: true } : {}),
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
    // A fallback model gave this failure (providers/fallback.ts): the card
    // names it, as a finished card names the model that answered.
    ...(error.answeredBy
      ? {
          providerId: error.answeredBy.providerId,
          model: error.answeredBy.model,
          fallback: error.answeredBy.fallback,
        }
      : {}),
    status: 'error',
    error: error.message,
    errorKind: error.kind,
    rawResponse: error.raw ?? undefined,
    ...(error.stopReason !== null ? { stopReason: error.stopReason } : {}),
  };
  return failed;
}

/**
 * The anchor of what a partial card did not translate, for "Translate the
 * rest": from `card.partial.untranslatedFrom` (an offset in `sourceText`) to
 * the card's own end.
 *
 * A selection's sourceText is its blocks' stored text, the first from
 * startOffset and the last up to endOffset, joined with a blank line
 * (selection.ts `storedText`); a one-block selection is the browser's
 * selection.toString(), which is the block's text since BlockText renders it
 * verbatim. The offset is walked back through that join to a block and an
 * offset in it. If the stored text does not give back the card's sourceText
 * exactly — the book was re-imported, or a browser's toString differed — the
 * walk would land somewhere else, so it returns null and the reader is asked
 * to select the rest by hand. A standalone card (a dictionary entry) has no
 * blocks behind its text: its rest keeps the card's anchor and carries the
 * text alone.
 */
export function remainderAnchor(
  blocks: Block[],
  card: Pick<
    TranslationCard,
    'startBlockId' | 'startOffset' | 'endBlockId' | 'endOffset' | 'sourceText' | 'standalone' | 'partial'
  >,
): SelectionAnchor | null {
  const from = card.partial?.untranslatedFrom;
  if (from === null || from === undefined) return null;
  const rest = card.sourceText.slice(from);
  const lead = rest.length - rest.trimStart().length;
  // Trimmed at the front only, so the rest's text is still exactly its blocks'
  // stored text and a rest that comes back partial can be walked again.
  const sourceText = rest.slice(lead);
  if (sourceText.trim() === '') return null;

  if (card.standalone) {
    return {
      startBlockId: card.startBlockId,
      startOffset: card.startOffset,
      endBlockId: card.endBlockId,
      endOffset: card.endOffset,
      sourceText,
    };
  }

  const covered = blocksInRange(blocks, card.startBlockId, card.endBlockId);
  if (covered.length === 0) return null;
  const pieces = covered.map((block, index) => ({
    block,
    start: index === 0 ? card.startOffset : 0,
    end: index === covered.length - 1 ? card.endOffset : block.text.length,
  }));
  const joined = pieces
    .map((piece) => piece.block.text.slice(piece.start, piece.end))
    .join('\n\n');
  if (joined !== card.sourceText) return null;

  // The offset of the rest's first character, walked to its block.
  let at = from + lead;
  for (const piece of pieces) {
    const length = piece.end - piece.start;
    if (at < length) {
      return {
        startBlockId: piece.block.id,
        startOffset: piece.start + at,
        endBlockId: card.endBlockId,
        endOffset: card.endOffset,
        sourceText,
      };
    }
    at -= length + 2;
    // Inside the blank line between two blocks: the rest starts the next one.
    if (at < 0) at = 0;
  }
  return null;
}

export function withoutStream(
  previous: Record<string, string>,
  card: Pick<TranslationCard, 'id'>,
): Record<string, string> {
  const next = { ...previous };
  delete next[card.id];
  return next;
}
