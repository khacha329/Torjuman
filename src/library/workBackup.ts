import type { WorkBundle, WorkRestoreReport } from '../platform/storage/StorageAdapter';

// The work backup as a file: made, recognised, and described in the words the
// rest of Settings uses.
//
// Settings → Work backup makes it and restores it. Since lane C it can also
// leave through the proxy relay or the share sheet, the routes the whole-tablet
// transfer already had (CLAUDE.md trap 8: on the owner's tablet a saved file
// could not be had at all). So the receive screen, where a relayed or shared
// file arrives, has to tell a work backup from a tablet transfer file; both
// read the file through `readWorkBackup` below.
//
// The count was added for FOUND_ISSUES 32: the export's message counted
// translation cards, explanations, marks and glossary entries, and left out
// the commentary cards and word glosses the file carries just the same. One
// list here, so the next store a backup gains is counted in one place.

/** `hashiya-work-2026-11-26.json`: the name the backup has always had. */
export function workBackupFilename(date: Date = new Date()): string {
  return `hashiya-work-${date.toISOString().slice(0, 10)}.json`;
}

/** The bundle as the file Settings saves, relays or shares. */
export function workBackupFile(bundle: WorkBundle, date: Date = new Date()): File {
  return new File([JSON.stringify(bundle)], workBackupFilename(date), { type: 'application/json' });
}

/**
 * Whether a parsed file is a work backup. The two arrays every backup has
 * ever carried; a backup from an older app may lack later fields, and a
 * restore writes what is there.
 */
export function isWorkBundle(value: unknown): value is WorkBundle {
  if (typeof value !== 'object' || value === null) return false;
  const bundle = value as Partial<WorkBundle>;
  return Array.isArray(bundle.cards) && Array.isArray(bundle.marks);
}

/**
 * The file as a work backup, or null if it is not one.
 *
 * Decided from the first bytes where it can be, so a library-sized file is
 * never read whole as text just to be turned down. A tablet transfer file and
 * a per-book file are gzip — two magic bytes — or, where the browser cannot
 * compress, the same NDJSON uncompressed, whose first line opens
 * `{"kind":"header"` (`deviceTransfer.ts`, `transfer.ts`). A work backup is one
 * JSON object, small, and opens with its own fields; only what is left is
 * parsed whole.
 */
export async function readWorkBackup(file: Blob): Promise<WorkBundle | null> {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) return null;
  const opening = new TextDecoder().decode(head).trimStart();
  if (!opening.startsWith('{') || /^\{\s*"kind"\s*:/.test(opening)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    return null;
  }
  return isWorkBundle(parsed) ? parsed : null;
}

/** The bundle's fields worth naming, in the order a reader thinks of them. */
const COUNTED: [field: keyof WorkBundle, one: string, many: string][] = [
  ['cards', 'translation card', 'translation cards'],
  ['explanationCards', 'explanation', 'explanations'],
  ['sharhCards', 'commentary card', 'commentary cards'],
  ['marks', 'mark or note', 'marks and notes'],
  ['glossary', 'glossary entry', 'glossary entries'],
  ['wordGlosses', 'word gloss', 'word glosses'],
  ['qulCompilations', 'compiled verse view', 'compiled verse views'],
];

/** "3 translation cards, 1 explanation, …" — every counted field, zeros included. */
export function describeWorkBundle(bundle: WorkBundle): string {
  return COUNTED.map(([field, one, many]) => {
    const rows = bundle[field];
    // Read loosely: a backup from an older app can lack a field this one has.
    const count = Array.isArray(rows) ? rows.length : 0;
    return `${count.toLocaleString()} ${count === 1 ? one : many}`;
  }).join(', ');
}

/**
 * What a restore did, as Settings → Work backup has always said it; the
 * receive screen says the same when a backup arrives through the proxy or
 * the share sheet. Moved from BackupSection.importWork.
 */
export function describeRestore(report: WorkRestoreReport): string {
  const missing = report.missingBooks.map((book) => `${book.title} (${book.shamelaId})`).join(', ');
  return (
    `Restored ${report.restoredCards} card(s) and ${report.restoredMarks} mark(s).` +
    (missing
      ? ` Referenced books not on this device: ${missing}. Import them and the work will bind to them automatically.`
      : '')
  );
}
