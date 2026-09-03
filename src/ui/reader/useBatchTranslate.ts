import { useCallback, useRef, useState } from 'react';
import type { Block, TranslationCard } from '../../types';
import { beginActivity } from '../../app/activity';

// Translating a whole ḥadīth's commentary, one block at a time.
//
// ---------------------------------------------------------------------------
// Why block-by-block rather than one call
//
// Several pages of commentary in a single request would exceed sensible output
// limits and come back truncated — and a truncated translation is worse than a
// failed one, because it looks complete. Splitting the run is not only about
// limits, though; three of the amendment's requirements fall out of it for
// free, and would each need building otherwise:
//
//   partial results   every block's card appears the moment it is done, so a
//                     long run is readable while it is still going.
//   resumable         each block is cached under the ordinary per-range key, so
//                     a re-run after a failure or a cancel pays only for what
//                     did not finish. Nothing needs a batch-level cache.
//   per-block cards   the amendment asks for a card per block rather than one
//                     wall of text, which is exactly what one call per block
//                     produces, anchored the ordinary way.
//
// The entity pipeline runs per call as well, so verses and ḥadīth are resolved
// from local data in every block rather than once for the batch.
//
// ---------------------------------------------------------------------------
// Cancelling keeps what is finished
//
// A ref, not state: the loop has to see the change between iterations, and a
// state value captured in the running closure never would. Cancelling stops the
// loop after the block in flight; every card already written stays, saved and
// paid for.
// ---------------------------------------------------------------------------

export interface BatchProgress {
  total: number;
  done: number;
  failed: number;
  /**
   * Whether the loop is still going.
   *
   * Explicit rather than derived from the counts, because a cancelled run
   * ends with done + failed < total and is indistinguishable from a run still
   * in flight if you only have the numbers.
   */
  running: boolean;
  /** Set once the user has asked to stop, until the block in flight returns. */
  stopping: boolean;
}

type TranslateFn = (request: {
  anchor: {
    startBlockId: string;
    startOffset: number;
    endBlockId: string;
    endOffset: number;
    sourceText: string;
  };
}) => Promise<TranslationCard | null>;

export function useBatchTranslate(translate: TranslateFn) {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const cancelled = useRef(false);

  const run = useCallback(
    async (range: Block[]) => {
      if (range.length === 0) return;

      cancelled.current = false;
      setProgress({ total: range.length, done: 0, failed: 0, running: true, stopping: false });

      // App-wide, so a service-worker update waits: reloading mid-batch would
      // lose the blocks in flight and the tokens already spent on them.
      const endActivity = beginActivity();

      let done = 0;
      let failed = 0;

      try {
        for (const block of range) {
          if (cancelled.current) break;

          const card = await translate({
            anchor: {
              startBlockId: block.id,
              startOffset: 0,
              endBlockId: block.id,
              endOffset: block.text.length,
              sourceText: block.text,
            },
          });

          // A null return is a refusal the translator has already explained —
          // a missing API key, most often. Counting it rather than throwing
          // keeps the run honest without a second error channel.
          if (card && card.status !== 'error') done += 1;
          else failed += 1;

          setProgress((current) =>
            current ? { ...current, done, failed } : current,
          );
        }
      } finally {
        endActivity();
        setProgress((current) =>
          current ? { ...current, done, failed, running: false, stopping: false } : current,
        );
      }
    },
    [translate],
  );

  const cancel = useCallback(() => {
    cancelled.current = true;
    setProgress((current) => (current ? { ...current, stopping: true } : current));
  }, []);

  const dismiss = useCallback(() => setProgress(null), []);

  return { progress, run, cancel, dismiss };
}
