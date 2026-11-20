import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Book, HadithJsonEntry, QulResource } from '../types';
import { chooseCandidate } from './hadithJson';

// The hadith-json match report, run on the device against an imported book.
//
// The same measurement `npm run report:hadith-json` makes over the fixtures
// (scripts/hadithMatch.ts), which hold six ḥadīth; the tablet has the whole
// book. It uses the app's own `chooseCandidate`, so what it reports is what a
// tap would do. Nothing is written.

export interface UnmatchedHadith {
  number: number;
  /** The matn's opening words, number prefix removed, so it can be found in the book. */
  firstWords: string;
}

export interface DeviceMatchReport {
  bookTitle: string;
  collection: string;
  /** Matn blocks that carry a number — the ones a tap can look up. */
  numbered: number;
  byNumber: number;
  byNeighbour: number;
  unmatched: UnmatchedHadith[];
  /** Matn blocks with no number at all: not measurable, listed for scale. */
  unnumbered: number;
}

const BOOK_NUMBER = /^\s*[٠-٩0-9]+\s*(?:\/\s*[٠-٩0-9]+\s*)?[-ـ–—]\s*/u;

export function firstWords(matn: string, count = 8): string {
  return matn.replace(BOOK_NUMBER, '').trim().split(/\s+/).slice(0, count).join(' ');
}

/** Let the UI paint between batches; a book has over a thousand ḥadīth to check. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export async function matchBookAgainstCollection(
  storage: StorageAdapter,
  book: Book,
  resource: QulResource,
  onProgress?: (done: number, total: number) => void,
): Promise<DeviceMatchReport> {
  const slug = resource.collection ?? '';
  const keys = Array.from({ length: resource.entryCount }, (_, i) => `${slug}:${i + 1}`);
  const rows = await storage.getQulEntries(resource.id, keys);
  const entries = new Map<number, HadithJsonEntry>();
  for (const row of rows) if (row.value.t === 'hadith-json') entries.set(row.value.number, row.value);

  const blocks = (await storage.listBlocks(book.id)).filter((block) => block.type === 'hadith_matn');
  const numbered = blocks.filter((block) => block.hadithNumber !== null);

  let byNumber = 0;
  let byNeighbour = 0;
  const unmatched: UnmatchedHadith[] = [];

  for (let i = 0; i < numbered.length; i++) {
    const block = numbered[i];
    const number = Number(block.hadithNumber);
    const match = chooseCandidate(number, block.text, (n) => entries.get(n));
    if (!match) unmatched.push({ number, firstWords: firstWords(block.text) });
    else if (match.offset === 0) byNumber++;
    else byNeighbour++;

    if (i % 25 === 24) {
      onProgress?.(i + 1, numbered.length);
      await tick();
    }
  }
  onProgress?.(numbered.length, numbered.length);

  return {
    bookTitle: book.title,
    collection: slug,
    numbered: numbered.length,
    byNumber,
    byNeighbour,
    unmatched,
    unnumbered: blocks.length - numbered.length,
  };
}
