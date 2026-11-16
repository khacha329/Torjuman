import type { IDBPDatabase } from 'idb';
import type { WorkBundle, WorkRestoreReport } from './StorageAdapter';
import { DB_VERSION, type Schema } from './idbSchema';
import type { SearchEntry } from './idbLibrary';
import { getSettings, putSettings } from './idbWork';

// The work backup: export the user's work (and the retrieval cache it leans
// on) as one bundle, and restore one. Moved verbatim from IdbStorageAdapter.ts
// in restructure Phase 4 step 4i (docs/refactor/plans/phase4-storage.md), each
// method made a function whose first parameter fetches the database handle,
// as in idbTransfer.ts. `importWork` takes the in-memory search index to clear
// it; settings go through idbWork.ts's functions.

export async function exportWork(handle: () => IDBPDatabase<Schema>): Promise<WorkBundle> {
  const db = handle();
  const books = await db.getAll('books');

  return {
    version: DB_VERSION,
    exportedAt: Date.now(),
    referencedBooks: books.map((book) => ({
      shamelaId: book.shamelaId,
      bookId: book.id,
      title: book.title,
    })),
    cards: await db.getAll('cards'),
    explanationCards: await db.getAll('explanationCards'),
    sharhCards: await db.getAll('sharhCards'),
    marks: await db.getAll('marks'),
    glossary: await db.getAll('glossary'),
    profiles: await db.getAll('profiles'),
    positions: await db.getAll('positions'),
    wordGlosses: await db.getAll('wordGlosses'),
    quranVerses: await db.getAll('quranVerses'),
    hadiths: await db.getAll('hadiths'),
    shareRecords: await db.getAll('shareRecords'),
    settings: (await getSettings(handle)) ?? null,
  };
}

export async function importWork(
  handle: () => IDBPDatabase<Schema>,
  searchIndex: Map<string, SearchEntry[]>,
  bundle: WorkBundle,
): Promise<WorkRestoreReport> {
  const db = handle();

  const write = async <
    K extends 'cards' | 'explanationCards' | 'sharhCards' | 'marks' | 'glossary' | 'profiles' |
      'positions' | 'wordGlosses' | 'quranVerses' | 'hadiths' | 'shareRecords',
  >(
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

  await write('cards', bundle.cards);
  await write('explanationCards', bundle.explanationCards);
  await write('sharhCards', bundle.sharhCards);
  await write('marks', bundle.marks);
  await write('glossary', bundle.glossary);
  await write('profiles', bundle.profiles);
  await write('positions', bundle.positions);
  await write('wordGlosses', bundle.wordGlosses);
  await write('quranVerses', bundle.quranVerses);
  await write('hadiths', bundle.hadiths);
  // Absent on a backup written before shares existed, which `write` handles.
  await write('shareRecords', bundle.shareRecords);
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
    restoredCards: (bundle.cards?.length ?? 0) + (bundle.explanationCards?.length ?? 0),
    restoredMarks: bundle.marks?.length ?? 0,
    missingBooks,
  };
}
