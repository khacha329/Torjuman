// How the owner arranges the library: pins, a manual order, folders.
// Re-exported by index.ts: outside types/, import them from `types`.

/**
 * Where one book sits in the library: pinned or not, its place in its
 * section, and the folder it is filed in.
 *
 * Keyed by the Shamela ID, and kept in a store of its own rather than on the
 * `Book` record, so that it outlives the book's text. A book is replaced in
 * three ways — a per-book file over the copy on the device
 * (`adoptStagedBook`, which rewrites the `books` row), "Add book" again with
 * the same ID (`createBookFromPreview`, which rewrites it too), or deleting
 * it and importing it afresh — and a field on the `Book` would have to be
 * carried by hand through each of them, and is simply gone after the third.
 * A row here is not touched by any of them, so the book comes back pinned,
 * in its place and in its folder. For the same reason `deleteBook` leaves it:
 * it is a few bytes, and it is what makes the third way keep the arrangement.
 *
 * A book with no row is unpinned, unfiled and unplaced, which is what every
 * book on a tablet was before this store existed.
 */
export interface BookPlacement {
  shamelaId: number;
  pinned: boolean;
  /**
   * The book's place among the others in its section (Pinned, a folder or
   * Unfiled), lowest first. Only the order matters, and a section is
   * renumbered 0, 1, 2… whenever a book in it moves. `null` until the book is
   * first moved: such a book sits above the placed ones, newest import first,
   * which is where a book just imported has always appeared.
   */
  position: number | null;
  /** The `LibraryFolder` it is filed in; `null` is Unfiled. At most one. */
  folderId: string | null;
  updatedAt: number;
}

/**
 * A folder in the library. Its books are the placements that name it; the
 * folder itself holds only its name and whether it is shown open.
 */
export interface LibraryFolder {
  id: string;
  name: string;
  /** Collapsed to its header line. Kept here so it survives a reload. */
  collapsed: boolean;
  /** Folders are listed in the order they were made. */
  createdAt: number;
}
