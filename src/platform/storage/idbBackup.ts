import type { IDBPDatabase } from 'idb';
import type { WorkBundle, WorkRestoreReport } from './StorageAdapter';
import { DB_VERSION, type SameUnion, type Schema } from './idbSchema';
import type { SearchEntry } from './idbLibrary';
import { putSettings, SETTINGS_KEY } from './idbWork';

// The work backup: export the user's work (and the retrieval cache it leans
// on) as one bundle, and restore one. Moved verbatim from IdbStorageAdapter.ts
// in restructure Phase 4 step 4i (docs/refactor/plans/phase4-storage.md), each
// method made a function whose first parameter fetches the database handle,
// as in idbTransfer.ts. `importWork` takes the in-memory search index to clear
// it; settings go through idbWork.ts's functions.

/**
 * The stores a work backup carries, in the order the file lists them and a
 * restore writes them (restructure Phase 4 step 4m; the plan's Design §4 and
 * Q7). Not the table's order, and not a table flag: `BOOK_STORES` needs
 * `marks` before `cards`, this list `cards` before `marks`, and this order is
 * the JSON key order of a file the owner keeps. `referencedBooks` and
 * `settings` are not stores and stay written out in both functions.
 */
const WORK_STORES = [
  'cards',
  'explanationCards',
  'sharhCards',
  'marks',
  'glossary',
  'profiles',
  'positions',
  'wordGlosses',
  'quranVerses',
  'hadiths',
  // Absent on a backup written before shares existed, which `write` handles.
  'shareRecords',
  // Last, so a file keeps every earlier field where it was. Absent on a
  // backup written before lane C (FOUND_ISSUES 18), which `write` handles.
  'qulCompilations',
] as const;

type WorkStore = (typeof WORK_STORES)[number];

/** `WorkBundle`'s fields that hold rows: every array field but `referencedBooks`. */
type BundleStore = Exclude<
  { [K in keyof WorkBundle]-?: NonNullable<WorkBundle[K]> extends unknown[] ? K : never }[keyof WorkBundle],
  'referencedBooks'
>;

// The list names exactly the bundle's row fields: a store added to
// `WorkBundle` and not here, or the reverse, fails `tsc`.
true satisfies SameUnion<WorkStore, BundleStore>;

export async function exportWork(handle: () => IDBPDatabase<Schema>): Promise<WorkBundle> {
  const db = handle();
  // One read-only transaction over every store the bundle reads, so the file
  // is one moment's state (FOUND_ISSUES 22). Each store was read in its own
  // transaction, so a card saved while an export ran could be in one store's
  // read and missing from its sibling's. Only IndexedDB reads are awaited
  // inside it, which keeps it open to the end.
  const tx = db.transaction(['books', ...WORK_STORES, 'settings'] as const, 'readonly');
  const books = await tx.objectStore('books').getAll();

  // Built in the order the file lists its fields: the three header fields,
  // each store in WORK_STORES order, then settings. JSON keeps insertion
  // order, so this is the same file as the object literal this replaced. The
  // casts are because the object is complete only once the loop has run.
  const bundle = {
    version: DB_VERSION,
    exportedAt: Date.now(),
    referencedBooks: books.map((book) => ({
      shamelaId: book.shamelaId,
      bookId: book.id,
      title: book.title,
    })),
  } as WorkBundle;
  for (const store of WORK_STORES) {
    (bundle as unknown as Record<WorkStore, unknown[]>)[store] = await tx.objectStore(store).getAll();
  }
  // As idbWork.ts's getSettings reads them, inside this transaction.
  const stored = await tx.objectStore('settings').get(SETTINGS_KEY);
  if (stored) {
    const { key: _key, ...settings } = stored;
    bundle.settings = settings;
  } else {
    bundle.settings = null;
  }
  await tx.done;
  return bundle;
}

export async function importWork(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  bundle: WorkBundle,
): Promise<WorkRestoreReport> {
  const db = handle();

  const write = async <K extends WorkStore>(
    store: K,
    rows: Schema[K]['value'][] | undefined,
  ) => {
    if (!rows || rows.length === 0) return;
    for (let i = 0; i < rows.length; i += 500) {
      const tx = db.transaction(store, 'readwrite');
      await Promise.all(rows.slice(i, i + 500).map((row) => tx.store.put(row as never)));
      await tx.done;
    }
  };

  for (const store of WORK_STORES) {
    await write(store, bundle[store]);
  }
  if (bundle.settings) await putSettings(handle, bundle.settings);

  // Work anchored to a book that is not on this device restores fine — block
  // IDs are deterministic, so it will bind correctly once that book is
  // imported. Say which ones are missing rather than failing.
  const present = new Set((await db.getAll('books')).map((book) => book.shamelaId));
  const missingBooks = (bundle.referencedBooks ?? [])
    .filter((entry) => !present.has(entry.shamelaId))
    .map((entry) => ({ shamelaId: entry.shamelaId, title: entry.title }));

  searchIndex.clear();

  return {
    // Every kind of card the restore wrote. Sharḥ cards were restored and left
    // out of this count (FOUND_ISSUES 25).
    restoredCards:
      (bundle.cards?.length ?? 0) +
      (bundle.explanationCards?.length ?? 0) +
      (bundle.sharhCards?.length ?? 0),
    restoredMarks: bundle.marks?.length ?? 0,
    missingBooks,
  };
}
