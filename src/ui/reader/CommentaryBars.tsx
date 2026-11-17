import type { Dispatch, SetStateAction } from 'react';
import type { useApp } from '../../app/AppContext';
import type { Block } from '../../types';
import { BatchProposal, BatchRunning } from './BatchTranslateBar';
import type { BatchEstimate } from '../../translation/hadithRange';
import type { useSharh } from './useSharh';
import type { useBatchTranslate } from './useBatchTranslate';

// The reader's commentary bars, ḥadīth-only (plan Design §8): the sharḥ
// lookup's notice, the costed "Translate all…" proposal, the running batch,
// and the sharḥ search in progress. Moved verbatim from ReaderScreen.tsx in
// restructure Phase 5 step 5h2 (docs/refactor/plans/phase5-big-ui-files.md).

export function CommentaryBars({
  sharh,
  batchProposal,
  batch,
  activeProfile,
  setBatchProposal,
}: {
  sharh: ReturnType<typeof useSharh>;
  batchProposal: {
    range: Block[];
    estimate: BatchEstimate;
  } | null;
  batch: ReturnType<typeof useBatchTranslate>;
  activeProfile: ReturnType<typeof useApp>['activeProfile'];
  setBatchProposal: Dispatch<
    SetStateAction<{
      range: Block[];
      estimate: BatchEstimate;
    } | null>
  >;
}) {
  return (
    <>
      {/* A sharḥ lookup that found nothing says so here rather than producing an
          empty card. Not every ḥadīth in one collection is commented on in
          another, so this is a normal answer and reads as one. */}
      {sharh.notice && (
        <p className="flex shrink-0 items-center gap-2 border-b border-rule bg-parchment px-3 py-1.5 text-[11px] text-muted">
          {sharh.notice}
          <button
            onClick={() => sharh.setNotice(null)}
            className="ml-auto rounded px-1.5 hover:bg-rule"
          >
            Dismiss
          </button>
        </p>
      )}

      {/* Costed, not started. Nothing is spent until the second tap. */}
      {batchProposal && !batch.progress?.running && (
        <BatchProposal
          estimate={batchProposal.estimate}
          model={activeProfile.model}
          onStart={() => {
            const range = batchProposal.range;
            setBatchProposal(null);
            void batch.run(range);
          }}
          onCancel={() => setBatchProposal(null)}
        />
      )}

      {batch.progress && (
        <BatchRunning
          progress={batch.progress}
          onStop={batch.cancel}
          onDismiss={batch.dismiss}
        />
      )}

      {sharh.busy && (
        <p className="shrink-0 border-b border-rule bg-parchment px-3 py-1.5 text-[11px] text-muted">
          Searching the commentary for this ḥadīth…
        </p>
      )}
    </>
  );
}
