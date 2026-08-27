import { useSyncExternalStore } from 'react';

// One reactive online/offline signal for the whole app.
//
// `navigator.onLine` reports link state, not reachability: a device on a
// captive-portal wifi or a dead uplink reports online. So the signal starts
// from it, updates on the browser's own events, and is corrected by real
// request outcomes — a provider call that fails to connect marks the app
// offline until something succeeds again.
//
// Everything that needs the network reads this and disables itself with a
// specific reason. Nothing fails silently.

let assumedOffline = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('online', emit);
  window.addEventListener('offline', emit);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('online', emit);
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
