import type { Catalog, CatalogEntry } from '../types';

// Loading the recommended-books list.
//
// Bundled so first run works with no network, refreshed from the project
// repository when there is one — so the recommended set can be improved, and
// corrected, without shipping a new build. The bundled copy is always the
// fallback, and a malformed or unreachable remote is never allowed to leave the
// user with no catalog at all.

/**
 * Where the refreshable copy lives.
 *
 * Derived at build time from `GITHUB_REPOSITORY` rather than hard-coded, the
 * same way the Pages base path is — so this keeps working if the repository is
 * renamed, and is simply absent in a local build, where the bundled copy is the
 * only copy. `VITE_CATALOG_URL` overrides it.
 *
 * raw.githubusercontent.com sends `access-control-allow-origin: *`, so unlike
 * shamela.ws this is reachable from the deployed PWA with no proxy.
 */
const REMOTE_URL: string | undefined =
  import.meta.env.VITE_CATALOG_URL || undefined;

/** The bundled copy, served from the app's own origin under Vite's base. */
const BUNDLED_URL = `${import.meta.env.BASE_URL}catalog.json`;

function isCatalog(value: unknown): value is Catalog {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<Catalog>;
  if (typeof candidate.version !== 'number' || !Array.isArray(candidate.entries)) {
    return false;
  }
  // Enough of a shape check that a redirect to an HTML error page, or a
  // half-edited file in the repository, is rejected rather than rendered as an
  // empty library.
  return candidate.entries.every(
    (entry: Partial<CatalogEntry>) =>
      typeof entry?.shamelaId === 'number' &&
      typeof entry?.title === 'string' &&
      typeof entry?.role === 'string',
  );
}

export interface CatalogResult {
  catalog: Catalog;
  /** Which copy this came from, so the UI can say. */
  source: 'remote' | 'bundled';
}

let cached: CatalogResult | null = null;

export async function loadCatalog(options: { online: boolean } = { online: false }): Promise<CatalogResult> {
  if (cached) return cached;

  // The remote copy is tried first only when there is a network, and its
  // failure is never fatal — it is an improvement on the bundled list, not a
  // dependency of it.
  if (options.online && REMOTE_URL) {
    try {
      const response = await fetch(REMOTE_URL, { cache: 'no-cache' });
      if (response.ok) {
        const parsed: unknown = await response.json();
        if (isCatalog(parsed)) {
          cached = { catalog: parsed, source: 'remote' };
          return cached;
        }
      }
    } catch {
      // Offline, blocked, or the file moved. Fall through to the bundled copy.
    }
  }

  const response = await fetch(BUNDLED_URL);
  if (!response.ok) {
    throw new Error(`The bundled catalog could not be read (HTTP ${response.status}).`);
  }

  const parsed: unknown = await response.json();
  if (!isCatalog(parsed)) {
    throw new Error('The bundled catalog is not in the expected format.');
  }

  cached = { catalog: parsed, source: 'bundled' };
  return cached;
}

/** Test seam and a way to force a re-read after a refresh. */
export function clearCatalogCache(): void {
  cached = null;
}

/**
 * Group entries for display, preserving the order the catalog declares.
 *
 * Grouped by purpose — Texts to study, Dictionaries, Reference for Explain —
 * rather than by Shamela's own taxonomy, because the question at first run is
 * "what is this for", not "how does Shamela file it".
 */
export function groupEntries(entries: CatalogEntry[]): [group: string, entries: CatalogEntry[]][] {
  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.group);
    if (list) list.push(entry);
    else groups.set(entry.group, [entry]);
  }
  return [...groups.entries()];
}

/**
 * Pages are the only size signal available before a crawl starts.
 *
 * Deliberately expressed as pages and an estimated time rather than megabytes:
 * what the user is committing to is a long sequential crawl, and minutes is the
 * number that decides whether he starts it now.
 */
export function estimateMinutes(pages: number): number {
  // The crawler waits 300–500ms between pages by courtesy, so ~2.5 pages a
  // second is the realistic ceiling.
  return Math.max(1, Math.round(pages / 150));
}

export function totalPages(entries: CatalogEntry[]): number {
  return entries.reduce((sum, entry) => sum + entry.approxPages, 0);
}

/**
 * Import order: smallest first, whatever order they were selected in.
 *
 * So the user has something readable while the six-volume sharḥ is still
 * crawling, rather than staring at a progress bar for twenty minutes before the
 * library has a single book in it.
 */
export function importOrder(entries: CatalogEntry[]): CatalogEntry[] {
  return [...entries].sort((a, b) => a.approxPages - b.approxPages);
}
