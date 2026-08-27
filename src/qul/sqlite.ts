import type { Database } from 'sql.js';

// Reading a SQLite resource once, at import, and then throwing it away.
//
// ---------------------------------------------------------------------------
// Why nothing here survives the import
//
// QUL publishes some resources as SQLite. The tempting move is to keep a WASM
// SQLite layer alive and query it at runtime — and it is the wrong one. It
// would mean two query paths in the app (IndexedDB for everything else, WASM
// SQL for these), a ~640 KB WASM runtime resident for the life of the session,
// and a second thing to keep working under Capacitor.
//
// So SQLite is a transport format here and nothing more. The file is read once,
// its rows are normalized into the app's own stores, and the runtime is dropped
// on the way out of this function. Every lookup afterwards goes through the
// single StorageAdapter path, exactly like every other lookup in the app.
//
// `liveRuntimes` makes that checkable rather than merely intended: it is
// incremented when a runtime is created and decremented in the `finally` that
// closes the database, so a test can assert it is back to zero.
// ---------------------------------------------------------------------------

export interface SqliteTable {
  name: string;
  columns: string[];
  rows: Record<string, unknown>[];
}

let liveRuntimes = 0;

/** How many sql.js runtimes this module is currently holding. Should be 0. */
export function liveSqlJsRuntimes(): number {
  return liveRuntimes;
}

/**
 * Every table in a SQLite file, as plain JavaScript rows.
 *
 * The whole file is read into memory. QUL's resources are hundreds of
 * kilobytes — topics.db is 428 KB — so this is a non-issue at these sizes, and
 * streaming would mean keeping the runtime alive, which is the thing being
 * avoided.
 */
export async function readSqliteTables(bytes: Uint8Array): Promise<SqliteTable[]> {
  // Imported here rather than at the top of the file, so the 45 KB loader and
  // the 640 KB runtime are fetched the first time someone imports a SQLite
  // resource and never on a cold start. Both are emitted as ordinary assets
  // and precached, so this still works with no network.
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ]);

  // Deliberately not cached at module scope: a cached SqlJsStatic is a live
  // runtime, which is what the header rules out.
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  liveRuntimes++;

  let database: Database | null = null;
  try {
    const db = new SQL.Database(bytes);
    database = db;

    const names = db.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    const tableNames = (names[0]?.values ?? []).map((row) => String(row[0]));

    const tables: SqliteTable[] = [];
    for (const name of tableNames) {
      // Identifiers cannot be bound as parameters, and the names come from
      // sqlite_master rather than from the user, so quoting is the whole
      // defence needed here.
      const result = db.exec(`SELECT * FROM "${name.replace(/"/g, '""')}"`);
      const columns = result[0]?.columns ?? [];
      const rows = (result[0]?.values ?? []).map((values) => {
        const row: Record<string, unknown> = {};
        for (const [index, column] of columns.entries()) row[column] = values[index];
        return row;
      });
      tables.push({ name, columns, rows });
    }

    return tables;
  } finally {
    database?.close();
    liveRuntimes--;
  }
}

/** The magic that starts every SQLite file: "SQLite format 3\0". */
const SQLITE_MAGIC = [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00];

/**
 * Whether a file is SQLite, read from its first bytes.
 *
 * By content, not by extension. QUL's own downloads arrive named `.db`, `.sql`
 * and `.sqlite` for what is sometimes the same format and sometimes not, and a
 * user who renames a file should still get the right importer.
 */
export function looksLikeSqlite(bytes: Uint8Array): boolean {
  if (bytes.length < SQLITE_MAGIC.length) return false;
  return SQLITE_MAGIC.every((byte, index) => bytes[index] === byte);
}
