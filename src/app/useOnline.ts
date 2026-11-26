import { useSyncExternalStore } from 'react';

// One reactive online/offline signal for the whole app.
//
// `navigator.onLine` reports link state, not reachability: a device on a
// captive-portal wifi or a dead uplink reports online. So the signal starts
// from it, updates on the browser's own events, and is corrected by real
// request outcomes — a provider call that fails to connect marks the app
// offline until something succeeds again.
//
// The outcomes reported are the reader's cloud translations
// (ui/reader/useTranslator.ts): one that could not reach its host at all
// (TranslationError condition `unreachable`) reports a failure, and one that
// got any response, an error response included, reports a success. Nothing
// called either function until FOUND_ISSUES 62, so this was a reactive
// `navigator.onLine` despite the paragraph above. The browser's own `online`
// event clears the assumption as well, so a tablet that loses and regains its
// link is not left offline until the next translation.
//
// Everything that needs the network reads this and disables itself with a
// specific reason. Nothing fails silently.

let assumedOffline = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function handleOnline(): void {
  assumedOffline = false;
  emit();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', emit);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', emit);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine && !assumedOffline;
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

/** Called when a network request actually fails to reach its host. */
export function reportNetworkFailure(): void {
  if (assumedOffline) return;
  assumedOffline = true;
  emit();
}

/** Called when any request succeeds, clearing a previous assumption. */
export function reportNetworkSuccess(): void {
  if (!assumedOffline) return;
  assumedOffline = false;
  emit();
}

/** Non-reactive read, for code outside React. */
export function isOnlineNow(): boolean {
  return getSnapshot();
}
