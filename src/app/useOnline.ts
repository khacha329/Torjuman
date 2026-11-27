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
// `navigator.onLine` despite the paragraph above. Only those translations
// report (DECISIONS, lane B2): Explain, gloss, compile, the retrieval APIs and
// an on-device profile's Translate do not.
//
// What clears an assumption of offline: a cloud translation that gets any
// response, the browser's own `online` event, or a reload (the assumption is
// this module's state, never stored). Until one of them, whatever reads the
// signal shows its offline state — Explain local-only, Meaning hidden, the
// catalog's Import and the on-device model's download disabled — and those
// screens offer no way back of their own: a cloud Translate in the reader is it.
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

// Registered once, for the app's lifetime, and never removed. Each subscriber
// used to add the same two functions and remove them when it unsubscribed;
// `addEventListener` keeps one registration of a given function, so the first
// subscriber to go (a sheet closing) took both away from every other one, and
// from then on the browser's `online` event no longer cleared an assumption
// of offline (FOUND_ISSUES 97). Guarded, so a script that imports this
// module in Node, with no window, does not fail.
if (typeof window !== 'undefined') {
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', emit);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
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
