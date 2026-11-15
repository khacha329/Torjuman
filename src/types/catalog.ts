// The recommended-books catalog.
// Re-exported by index.ts: outside types/, import them from `types`.

import type { Book } from './book';

/**
 * One recommended work — a pointer to a book, never the book.
 *
 * ---------------------------------------------------------------------------
 * Why the app ships a list of IDs and not the texts
 *
 * Most of the works involved are modern and under copyright: Ibn ʿUthaymīn died
 * in 2001 and other commentators in this space are living. Putting their text
 * inside a distributed application is redistribution. Shipping a list of
 * Shamela IDs is not — it is a bibliography.
 *
 * The classical layer (an-Nawawī, Ibn Ḥajar, Ibn Daqīq al-ʿĪd, al-Fayyūmī)
 * raises no such question, but one mechanism for both is simpler than two, and
 * it keeps the install small and the recommendations updatable without a
 * release.
 *
 * Every factual field here — title, author, category, page count — is read off
 * Shamela by scripts/build-catalog.ts rather than typed in, so a wrong ID
 * fails when the catalog is built instead of on someone's first run.
 * ---------------------------------------------------------------------------
 */
export interface CatalogEntry {
  shamelaId: number;
  /** As Shamela prints it. */
  title: string;
  titleEn: string;
  author: string;
  role: Book['role'];
  /** Shamela's own category, e.g. "شروح الحديث". */
  category: string;
  /** How the first-run screen groups it: purpose, not Shamela's taxonomy. */
  group: string;
  /** Read from the pager, so the size is honest before committing to it. */
  approxPages: number;
  description: string;
  /** Pre-selected in the default first-run set. */
  recommended: boolean;
}

export interface Catalog {
  version: number;
  updatedAt: string;
  entries: CatalogEntry[];
}
