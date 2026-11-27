import type { Book, BookPlacement, LibraryFolder } from '../types';

// How the Library lays out its books: Pinned first, then each folder in the
// order it was made, then Unfiled; and the placement rows a pin, a move or a
// change of folder writes. Pure, so the Library screen holds no ordering rule
// of its own and the rules read in one place.
//
// A section's order is its books' `position`s, lowest first. A book with no
// position — every book before this existed, and every book imported since —
// sits above the placed ones, newest import first: the order the Library has
// always had, so a new tablet looks exactly as it did, and a book just
// imported appears at the top, where the owner looks for it. A move renumbers
// its whole section 0, 1, 2… rather than swapping two numbers, so the unplaced
// books in it take places too and nothing can jump past them later.

export type SectionKey = 'pinned' | 'unfiled' | `folder:${string}`;

export interface LibrarySection {
  key: SectionKey;
  /** The folder, for a folder's section. */
  folder: LibraryFolder | null;
  books: Book[];
}

/** A book with no row is unpinned, unfiled and unplaced. */
export function placementOf(
  placements: ReadonlyMap<number, BookPlacement>,
  shamelaId: number,
): BookPlacement {
  return (
    placements.get(shamelaId) ?? {
      shamelaId,
      pinned: false,
      position: null,
      folderId: null,
      updatedAt: 0,
    }
  );
}

/**
 * The section a placement puts its book in. Pinned wins over a folder: a
 * pinned book is shown once, at the top, and goes back to its folder when it
 * is unpinned. A placement naming a folder that no longer exists is Unfiled —
 * `deleteLibraryFolder` clears them, and this is what keeps a book visible if
 * a row ever outlives its folder some other way (a restore of an older backup,
 * say).
 */
export function sectionKeyOf(placement: BookPlacement, folderIds: ReadonlySet<string>): SectionKey {
  if (placement.pinned) return 'pinned';
  if (placement.folderId !== null && folderIds.has(placement.folderId)) {
    return `folder:${placement.folderId}`;
  }
  return 'unfiled';
}

function compareInSection(placements: ReadonlyMap<number, BookPlacement>) {
  return (a: Book, b: Book): number => {
    const pa = placementOf(placements, a.shamelaId).position;
    const pb = placementOf(placements, b.shamelaId).position;
    if (pa === null && pb !== null) return -1;
    if (pa !== null && pb === null) return 1;
    if (pa !== null && pb !== null && pa !== pb) return pa - pb;
    // Unplaced, or the same place — which happens: a deleted book's row keeps
    // its number while its section is renumbered without it, and a restored
    // backup brings another tablet's numbers. Newest import first, then by
    // id, so the order is the same on every render; the next move in the
    // section renumbers it and the tie is gone.
    return b.importedAt - a.importedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };
}

/**
 * Every section, in display order, each with its books in order. Pinned and
 * Unfiled are always returned, possibly empty; the screen decides which
 * headings to show.
 */
export function arrangeLibrary(
  books: readonly Book[],
  placements: ReadonlyMap<number, BookPlacement>,
  folders: readonly LibraryFolder[],
): LibrarySection[] {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const sections: LibrarySection[] = [
    { key: 'pinned', folder: null, books: [] },
    ...folders.map((folder): LibrarySection => ({ key: `folder:${folder.id}`, folder, books: [] })),
    { key: 'unfiled', folder: null, books: [] },
  ];
  const byKey = new Map(sections.map((section) => [section.key, section]));
  for (const book of books) {
    byKey.get(sectionKeyOf(placementOf(placements, book.shamelaId), folderIds))!.books.push(book);
  }
  const compare = compareInSection(placements);
  for (const section of sections) section.books.sort(compare);
  return sections;
}

/** The rows that give `ordered` the places 0, 1, 2…, with any changes to one book. */
function renumbered(
  ordered: readonly Book[],
  placements: ReadonlyMap<number, BookPlacement>,
  now: number,
  changed?: { shamelaId: number; pinned: boolean; folderId: string | null },
): BookPlacement[] {
  return ordered.map((book, index) => {
    const base = placementOf(placements, book.shamelaId);
    const own = changed && changed.shamelaId === book.shamelaId ? changed : null;
    return {
      ...base,
      pinned: own ? own.pinned : base.pinned,
      folderId: own ? own.folderId : base.folderId,
      position: index,
      updatedAt: now,
    };
  });
}

/**
 * Move Up (-1) or Move Down (+1) within the book's own section: the rows to
 * write, or none when it is already at that end.
 */
export function moveBook(
  sections: readonly LibrarySection[],
  placements: ReadonlyMap<number, BookPlacement>,
  book: Book,
  delta: -1 | 1,
  now: number,
): BookPlacement[] {
  const section = sections.find((candidate) => candidate.books.some((b) => b.id === book.id));
  if (!section) return [];
  const from = section.books.findIndex((b) => b.id === book.id);
  const to = from + delta;
  if (to < 0 || to >= section.books.length) return [];
  const ordered = [...section.books];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return renumbered(ordered, placements, now);
}

/**
 * Pin, unpin or refile a book: the rows to write. A book that changes section
 * goes to the top of the one it arrives in — a pinned book to the top of the
 * library, which is what "pin to the top" asks — and that section is
 * renumbered. One that stays in its section (a pinned book refiled, which
 * stays in Pinned) keeps its place, and only its own row changes.
 */
export function relocateBook(
  sections: readonly LibrarySection[],
  placements: ReadonlyMap<number, BookPlacement>,
  folders: readonly LibraryFolder[],
  book: Book,
  change: { pinned?: boolean; folderId?: string | null },
  now: number,
): BookPlacement[] {
  const folderIds = new Set(folders.map((folder) => folder.id));
  const before = placementOf(placements, book.shamelaId);
  const after = {
    shamelaId: book.shamelaId,
    pinned: change.pinned ?? before.pinned,
    folderId: change.folderId === undefined ? before.folderId : change.folderId,
  };
  if (after.pinned === before.pinned && after.folderId === before.folderId) return [];
  const from = sectionKeyOf(before, folderIds);
  const to = sectionKeyOf({ ...before, ...after }, folderIds);
  if (from === to) {
    return [{ ...before, ...after, updatedAt: now }];
  }
  const target = sections.find((section) => section.key === to);
  const others = (target?.books ?? []).filter((b) => b.id !== book.id);
  return renumbered([book, ...others], placements, now, after);
}
