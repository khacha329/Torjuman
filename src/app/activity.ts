// Whether the app is in the middle of something it would be rude to interrupt.
//
// ---------------------------------------------------------------------------
// One signal, two consumers
//
// A service-worker update is the only thing in this app that can pull the page
// out from under the reader, and there are exactly two states where doing so
// costs real work: a catalog import part-way through a book, and a translation
// in flight. Both are long, both are invisible to the update machinery, and
// both live in different parts of the tree — the batch is an app-level service,
// the translator is a hook inside the reader.
//
// So rather than thread a busy flag through context to two unrelated places,
// this is a module singleton in the manner of `secrets` and `router`: whoever
// starts long work calls `begin()` and calls the returned function when done.
// The update prompt reads `busy` and waits.
//
// It is a *counter*, not a flag. Two overlapping translations must not have the
// first one to finish declare the app idle.
// ---------------------------------------------------------------------------

type Listener = (busy: boolean) => void;

const listeners = new Set<Listener>();
let count = 0;

function emit(): void {
  const busy = count > 0;
  for (const listener of listeners) listener(busy);
}

/**
 * Mark the start of work that should not be interrupted.
 *
 * Returns the function that ends it. That function is idempotent, because the
 * natural call site is a `finally` that can also be reached by an error path
 * which already ended it — and a double decrement would leave the app
 * permanently "idle" while still working.
 */
export function beginActivity(): () => void {
  count++;
  emit();

  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    count--;
    emit();
  };
}

export function isBusy(): boolean {
  return count > 0;
}

export function subscribeActivity(listener: Listener): () => void {
  listeners.add(listener);
  listener(count > 0);
  return () => {
    listeners.delete(listener);
  };
}
