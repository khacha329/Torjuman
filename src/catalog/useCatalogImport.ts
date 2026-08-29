import { useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import type { BatchState } from './importBatch';

// A view onto the app-level batch, not an owner of it.
//
// Everything that used to live here now lives in CatalogImportBatch, built once
// in AppContext beside the Crawler. This only subscribes — which is what lets
// the catalog screen be closed and reopened, and the Library show the same
// progress, without an import being lost or duplicated.

export type { EntryState, EntryStatus, BatchState } from './importBatch';

export function useCatalogImport() {
  const { batch } = useApp();
  const [state, setState] = useState<BatchState>(batch.current);

  useEffect(() => batch.subscribe(setState), [batch]);

  return {
    rows: state.rows,
    running: state.running,
    stopping: state.stopping,
    doneCount: batch.doneCount,
    unfinishedCount: batch.unfinishedCount,
    start: (selected: Parameters<typeof batch.start>[0]) => batch.start(selected),
    retryFailed: () => batch.retryFailed(),
    stopNow: () => batch.stopNow(),
    finishCurrentThenStop: () => batch.finishCurrentThenStop(),
    reset: () => batch.reset(),
  };
}
