import type { BatchEstimate } from '../../translation/hadithRange';
import { formatCost } from '../../translation/hadithRange';
import type { BatchProgress } from './useBatchTranslate';
import { Button } from '../common';

// The confirmation before a batch run, and the progress of one.
//
// ---------------------------------------------------------------------------
// Nothing expensive happens one tap away
//
// This is the most expensive single action in the app — forty requests where
// every other action is one — and the cost is not guessable from the button.
// So the estimate is shown first, with the numbers that produce it, and the run
// starts only on a second, deliberate tap.
//
// The figure is an estimate and says so. Quoting "$0.43" to the cent would
// claim a precision the token estimate does not have; "about $0.43" is the same
// information without the false confidence.
// ---------------------------------------------------------------------------

export function BatchProposal({
  estimate,
  model,
  onStart,
  onCancel,
}: {
  estimate: BatchEstimate;
  model: string;
  onStart: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
      <p className="min-w-0 flex-1">
        <strong>Translate this ḥadīth's commentary?</strong>{' '}
        {estimate.blocks} block{estimate.blocks === 1 ? '' : 's'},{' '}
        {estimate.characters.toLocaleString()} characters of Arabic. Roughly{' '}
        {estimate.inputTokens.toLocaleString()} tokens in and{' '}
        {estimate.outputTokens.toLocaleString()} out on {model} —{' '}
        <strong>{formatCost(estimate.costUsd)}</strong>.
        {/* Said plainly, because it changes whether the number matters: a
            re-run after a cancel or a failure is nearly free. */}{' '}
        Blocks already translated are served from the cache and cost nothing.
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <Button onClick={onStart}>Translate all</Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function BatchRunning({
  progress,
  onStop,
  onDismiss,
}: {
  progress: BatchProgress;
  onStop: () => void;
  onDismiss: () => void;
}) {
  const finished = !progress.running;
  const percent = Math.round(((progress.done + progress.failed) / progress.total) * 100);

  return (
    <div className="shrink-0 border-b border-rule bg-parchment px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <p className="min-w-0 flex-1">
          {finished ? (
            <>
              Finished — {progress.done} of {progress.total} block
              {progress.total === 1 ? '' : 's'} translated
              {progress.failed > 0 && `, ${progress.failed} did not complete`}.
            </>
          ) : progress.stopping ? (
            <>Stopping after the block in flight — everything finished is kept.</>
          ) : (
            <>
              Translating {progress.done + progress.failed + 1} of {progress.total}…
              {progress.failed > 0 && ` ${progress.failed} did not complete.`}
            </>
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {finished ? (
            <Button variant="ghost" onClick={onDismiss}>
              Dismiss
            </Button>
          ) : (
            <Button variant="ghost" onClick={onStop} disabled={progress.stopping}>
              Stop
            </Button>
          )}
        </div>
      </div>

      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-rule">
        <div
          className="h-full bg-accent transition-[width] duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
