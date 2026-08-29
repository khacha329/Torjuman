import { useEffect, useState } from 'react';
import {
  applyUpdate,
  dismissOfflineReady,
  subscribeUpdates,
  updateState,
  type UpdateState,
} from '../app/pwaUpdate';
import { Button } from './common';

// The two things a service worker ever needs to say.
//
// Neither is an error, so neither is styled as one, and neither steals focus or
// blocks the page — this sits at the bottom of the reader and can be ignored
// indefinitely. Reloading is always the reader's own tap: a study circle
// stopping mid-passage because a build landed is a worse outcome than running
// last week's build until the session ends.

export function UpdateBar() {
  const [state, setState] = useState<UpdateState>(updateState);

  useEffect(() => subscribeUpdates(setState), []);

  // Shown once, on the visit that finished caching. After that the app simply
  // works offline and saying so again is noise.
  useEffect(() => {
    if (!state.offlineReady) return;
    const timer = window.setTimeout(dismissOfflineReady, 6000);
    return () => window.clearTimeout(timer);
  }, [state.offlineReady]);

  if (!state.needRefresh && !state.offlineReady) return null;

  return (
    <div
      dir="ltr"
      className="ltr-isolate pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-3"
    >
      <div
        role="status"
        className="pointer-events-auto flex max-w-lg flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-rule bg-white px-4 py-2.5 text-sm shadow-lg"
      >
        {state.needRefresh ? (
          <>
            <span className="font-medium">Update available</span>
            <span className="text-xs text-muted">
              Installed and waiting. Nothing is lost by reloading later.
            </span>
            <span className="ms-auto flex gap-2">
              <Button variant="primary" onClick={applyUpdate}>
                Reload
              </Button>
            </span>
          </>
        ) : (
          <>
            <span className="font-medium">Ready to work offline</span>
            <span className="text-xs text-muted">
              The reader, the muṣḥaf and your books now open with no connection.
            </span>
            <button
              className="ms-auto text-xs text-muted underline"
              onClick={dismissOfflineReady}
            >
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  );
}
