import { useEffect, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useOnline } from '../../app/useOnline';
import { normalize } from '../../lib/arabic';
import { secrets } from '../../services/secrets';
import { GLOSS_PROVIDER_ID } from '../../translation/gloss';

/**
 * Whether the rail offers Meaning for the selected word.
 *
 * It does when the word's gloss is already cached, or when the device is
 * online and has a key (DECISIONS 33). The old test, "online or has a key",
 * offered Meaning offline with a key, where it fails unless the word is
 * cached, and refused it offline without a key, where a cached gloss works
 * with neither: `glossWord` returns the cache before it looks at the network
 * or the key, and is keyed the same way, by `normalize(word)`.
 */
export function useMeaningAvailable(word: string, singleWord: boolean): boolean {
  const { storage } = useApp();
  const online = useOnline();
  const hasKey = secrets.getProviderKey(GLOSS_PROVIDER_ID) !== '';
  // The word whose gloss was found cached. Kept as the word, not a flag, so a
  // result that lands after the selection moved on cannot unlock another word.
  const [cachedWord, setCachedWord] = useState<string | null>(null);

  useEffect(() => {
    if (!singleWord || word === '') return;
    let current = true;
    void storage.getWordGloss(normalize(word)).then((found) => {
      if (current && found) setCachedWord(word);
    });
    return () => {
      current = false;
    };
  }, [storage, word, singleWord]);

  return (online && hasKey) || (singleWord && cachedWord === word);
}
