import type { Block, Entity, GlossaryEntry, TranslationProfile } from '../../types';
import { knownReferencesIn } from '../../quran/entityService';
import type { TranslationRequest } from '../../translation/TranslationProvider';
import { TRANSLITERATION_INSTRUCTION } from '../../translation/prompt';
import { blocksInRange, contextAround, type SelectionAnchor } from './selection';

// The steps of one translation that only compute a value: the passage around
// the selection, and the request handed to the provider. Pure — no storage, no
// state, no clock — so `translate` in useTranslator.ts keeps every side effect,
// every `await` and both cache keys in its own order, and calls these where
// their text was. Moved verbatim from useTranslator.ts in restructure Phase 5
// step 5i1 (docs/refactor/plans/phase5-big-ui-files.md, Design §7).

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
  digDeeper,
}: {
  anchor: Pick<SelectionAnchor, 'sourceText'>;
  before: Block[];
  after: Block[];
  selected: Block[];
  activeProfile: TranslationProfile;
  glossary: GlossaryEntry[];
  useModel: string;
  known: ReturnType<typeof passageFor>['known'];
  digDeeper: boolean;
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
    allowExternalLookup: digDeeper || activeProfile.allowExternalLookup,
  };
}
