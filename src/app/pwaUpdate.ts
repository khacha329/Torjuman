import { registerSW } from 'virtual:pwa-register';
import { isBusy, subscribeActivity } from './activity';

// Service-worker updates, offered rather than applied.
//
// ---------------------------------------------------------------------------
// Why `prompt` and not `autoUpdate`
//
// `autoUpdate` sets skipWaiting, so a new worker activates while the page from
// the previous build is still running. The build's JavaScript is code-split,
// so any chunk that page has not loaded yet — a sheet, a settings panel — is
// requested under its old hashed filename against a precache that no longer
// contains it, and 404s. The failure looks like a broken feature rather than a
// version skew, and it lands on whoever happened to open a lazy route at the
// wrong moment.
//
// With `prompt`, the new worker installs and then waits. The old page keeps its
// own complete build until the reader accepts, at which point the page reloads
// and everything comes from the new one. Consistent either side of the line.
//
// ---------------------------------------------------------------------------
// Never reload on its own
//
// This is a reader used in a study circle. Reloading mid-passage to install a
// build is worse than running yesterday's build for another hour, and the
// prompt is deliberately suppressed while an import or a translation is in
// flight — see activity.ts. The notice is queued, not dropped: it appears as
// soon as the app is idle.
// ---------------------------------------------------------------------------

export interface UpdateState {
  /** A new build is installed and waiting. */
  needRefresh: boolean;
  /** Everything needed to work offline has been cached, once, on first visit. */
  offlineReady: boolean;
}

type Listener = (state: UpdateState) => void;

const listeners = new Set<Listener>();
let state: UpdateState = { needRefresh: false, offlineReady: false };
let apply: ((reloadPage?: boolean) => Promise<void>) | null = null;

/** Held back until the app is idle, then released. */
let pendingRefresh = false;

const HOUR_MS = 60 * 60 * 1000;

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

export function subscribeUpdates(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export function updateState(): UpdateState {
  return state;
}

/** Reload onto the waiting build. Only ever called from the user's own tap. */
export function applyUpdate(): void {
  void apply?.(true);
}

/** Dismiss the offline-ready notice; it is shown once per install. */
export function dismissOfflineReady(): void {
  set({ offlineReady: false });
}

/**
 * Register the worker and start watching for new builds.
 *
 * Called once, from main. Safe to call again — the second call is ignored
 * rather than registering a second worker.
 */
export function initPwaUpdates(): void {
  if (apply) return;

  apply = registerSW({
    immediate: true,

    onNeedRefresh() {
      // Queued rather than shown, if this lands mid-import. The worker is
      // already installed and waiting; nothing is lost by holding the notice.
      if (isBusy()) pendingRefresh = true;
      else set({ needRefresh: true });
    },

    onOfflineReady() {
      set({ offlineReady: true });
    },

    onRegisteredSW(_url, registration) {
      if (!registration) return;

      // An installed PWA can stay open for days, and a worker only checks for a
      // new build on navigation. Without this, a tablet left on the reader
      // would never notice a deploy at all.
      setInterval(() => {
        // Not while offline — the check would fail and achieve nothing — and
        // not mid-import, where the precache traffic competes with the crawl.
        if (!navigator.onLine || isBusy()) return;
        void registration.update();
      }, HOUR_MS);
    },
  });

  // Release anything queued while the app was busy.
  subscribeActivity((busy) => {
    if (!busy && pendingRefresh) {
      pendingRefresh = false;
      set({ needRefresh: true });
    }
  });
}
