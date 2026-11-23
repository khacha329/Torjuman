import type { Book } from '../../types';
import { hadithCollectionFor } from '../../quran/detectEntities';
import { sharhCollectionFor } from '../../retrieval/hadithJson';

/**
 * The hadith-json collection a book's ḥadīth belong to, for the text search
 * and the card path: the collection stored at import, else the one its title
 * names (Riyāḍ, the Forty), else the one it is a sharḥ of (the six main books,
 * `sharhCollectionFor`). Null for any other book.
 *
 * It lives here, not in `retrieval/`, because it needs `quran/` too, and
 * `quran` already imports `retrieval`: the other way round would close a
 * cycle `npm run layers -- --check` fails on (plan, Design 8). Nothing is
 * stored, so a book imported before this existed needs no re-detection.
 */
export function hadithScopeFor(book: Pick<Book, 'title' | 'category' | 'hadithCollection'>): string | null {
  return book.hadithCollection ?? hadithCollectionFor(book.title) ?? sharhCollectionFor(book);
}
