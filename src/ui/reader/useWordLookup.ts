import { useCallback, useEffect, useState } from 'react';
import type { useApp } from '../../app/AppContext';
import { secrets } from '../../services/secrets';
import type { Block } from '../../types';
import type { GlossState } from './DictionarySheet';
import { glossWord, GLOSS_PROVIDER_ID } from '../../translation/gloss';
import { ANTHROPIC_GLOSS_MODEL } from '../../translation/models';
import {
  loadDictionary,
  type Dictionary,
  type LookupResult,
} from '../../dictionary/dictionaryService';

// The reader's word lookup: the dictionary, held in memory for the session;
// the lookup sheet's state; and the gloss, the English for one word in its
// sentence. Moved verbatim from ReaderScreen.tsx in restructure Phase 5 step
// 5g1 (docs/refactor/plans/phase5-big-ui-files.md).

export function useWordLookup({ storage }: { storage: ReturnType<typeof useApp>['storage'] }) {
  // The dictionary is loaded once per session and held in memory, so a lookup
  // mid-reading is instant and needs neither network nor a model.
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [lookup, setLookup] = useState<{
    result: LookupResult;
    anchor: HTMLElement;
  } | null>(null);
  const [gloss, setGloss] = useState<GlossState | null>(null);

  /** English gloss for a word, in the sense it carries in its sentence. */
  const requestGloss = useCallback(
    async (word: string, sentence: string, blockType: Block['type'], anchorElement: HTMLElement) => {
      setLookup((current) =>
        current ?? {
          result: { surface: word, hits: [], viaFullText: false },
          anchor: anchorElement,
        },
      );
      setGloss({ status: 'loading' });
      try {
        const found = await glossWord(storage, {
          apiKey: secrets.getProviderKey(GLOSS_PROVIDER_ID),
          model: ANTHROPIC_GLOSS_MODEL,
          word,
          sentence,
          blockType,
        });
        setGloss({ status: 'ready', gloss: found });
      } catch (error) {
        setGloss({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [storage],
  );

  useEffect(() => {
    let cancelled = false;
    void loadDictionary(storage).then((loaded) => {
      if (!cancelled) setDictionary(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const lookUpWord = useCallback(
    (word: string, anchorElement: HTMLElement) => {
      if (!dictionary) return;
      setLookup({ result: dictionary.lookup(word), anchor: anchorElement });
    },
    [dictionary],
  );

  return { dictionary, lookup, setLookup, gloss, setGloss, requestGloss, lookUpWord };
}
