import type { IDBPDatabase } from 'idb';
import type { BookStore, Schema } from './idbSchema';

// Deleting every row an index points at, in batches: what deleteBook, the
// per-store clears, deleteQulResource and deleteNarratorShard share. Moved
// verbatim from IdbStorageAdapter.ts in restructure Phase 4 step 4d
// (docs/refactor/plans/phase4-storage.md), the method made a function that
// takes the database handle first.

/**
 * How many primary keys one purge round trip carries.
 *
 * Large enough that removing a 100,000-block commentary costs a couple of dozen
 * round trips instead of 200,000; small enough that the key array stays a few
 * hundred kilobytes rather than several megabytes.
 */
const PURGE_BATCH = 4096;

/**
 * Delete every row an index points at, a batch of primary keys at a time.
 *
 * This replaces the obvious cursor idiom — `openCursor`, then
 * `await cursor.delete()`, then `await cursor.continue()` — which was wrong
 * here in two separate ways:
 *
 *   - It awaits two IndexedDB requests *per row*. Removing Fatḥ al-Bārī meant
 *     something like two hundred thousand awaited round trips, which on the
 *     tablet is minutes with no sign that anything is happening.
 *   - A value cursor deserializes each record before throwing it away. On
 *     `pages`, whose values hold the fetched HTML, that read tens of
 *     megabytes it never looked at — the exact cost `listFetchedPageIndices`
 *     was written with a key cursor to avoid.
 *
 * `getAllKeys` fetches primary keys only, one request per batch, and the
 * deletes are queued together on the transaction rather than awaited singly.
 */
export async function purgeIndex(
  handle: IDBPDatabase<Schema>,
  store: BookStore | 'narratorProfiles' | 'qulEntries',
  index: 'byBook' | 'byShard' | 'byResource',
  key: string,
): Promise<number> {
  // idb's generics cannot express "this index belongs to this store" across a
  // union of store names, and every caller (idbLibrary.ts, idbReference.ts)
  // passes a valid pair. The untyped handle is the library's own escape hatch
  // for exactly this.
  const db = handle as unknown as IDBPDatabase;
  let removed = 0;
  for (;;) {
    const tx = db.transaction(store, 'readwrite');
    const keys = await tx.store.index(index).getAllKeys(key, PURGE_BATCH);
    if (keys.length > 0) {
      await Promise.all(keys.map((primary) => tx.store.delete(primary)));
    }
    await tx.done;
    removed += keys.length;
    if (keys.length < PURGE_BATCH) return removed;
  }
}
