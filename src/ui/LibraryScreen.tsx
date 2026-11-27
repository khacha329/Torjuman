import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import { navigate } from '../app/router';
import { useReadOnly } from '../app/readOnly';
import type { Book, BookPlacement, LibraryFolder } from '../types';
import {
  arrangeLibrary,
  moveBook,
  placementOf,
  relocateBook,
  type LibrarySection,
} from '../library/arrangement';
import { newId } from '../lib/id';
import { Button, LinkButton, TopBar } from './kit';
import { useCrawlProgress } from './useCrawlProgress';
import { useCatalogImport } from './useCatalogImport';
import { LibraryBookCard } from './LibraryBookCard';
import { LibraryBookMenu } from './LibraryBookMenu';
import { FolderNameForm, LibraryFolderHeader, LibrarySectionHeading } from './LibraryFolderHeader';

// The Library: the reading books, arranged by the owner — Pinned at the top,
// then folders in the order they were made, then Unfiled. The ordering rules
// are library/arrangement.ts; the arrangement itself is stored apart from the
// books, by Shamela ID (see BookPlacement), so replacing a book keeps it.
//
// With no pin and no folder the screen is one grid in the order it has always
// had, newest import first, with no headings. The arranging controls — the
// buttons on each card, the long-press menu, New folder, and each folder's
// collapse, Rename and Delete — are hidden, not disabled, in share mode
// (app/readOnly.ts says why hidden).

export function LibraryScreen() {
  const { storage, crawler } = useApp();
  const arranging = !useReadOnly();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [placements, setPlacements] = useState<ReadonlyMap<number, BookPlacement>>(new Map());
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const progress = useCrawlProgress();
  // A catalog import runs at app level now, so it keeps going while you read.
  // This is where it stays visible once you have left the catalog screen —
  // otherwise it would be a crawl hitting Shamela with nothing on screen
  // saying so.
  const batch = useCatalogImport();

  const refresh = useCallback(async () => {
    // Dictionaries and reference works are consulted, not read through, so
    // they stay out of the grid. They live in Settings → Reference works.
    const all = await storage.listBooks();
    setBooks(all.filter((book) => book.role === 'reading' || book.role === undefined));
  }, [storage]);

  const refreshArrangement = useCallback(async () => {
    // A failed read shows the books unarranged rather than no books at all.
    try {
      const [rows, list] = await Promise.all([
        storage.listBookPlacements(),
        storage.listLibraryFolders(),
      ]);
      setPlacements(new Map(rows.map((row) => [row.shamelaId, row])));
      setFolders(list);
    } catch (cause) {
      setError(`Could not read how the library is arranged: ${(cause as Error).message}`);
    }
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh, progress?.fetchedPages]);

  useEffect(() => {
    void refreshArrangement();
  }, [refreshArrangement]);

  // Stable, because the menu's Escape listener is keyed on it.
  const closeMenu = useCallback(() => setMenuFor(null), []);

  const sections = useMemo(
    () => (books ? arrangeLibrary(books, placements, folders) : []),
    [books, placements, folders],
  );

  // The books as last rendered, for writes queued before the next render.
  const booksNow = useRef<Book[]>([]);
  booksNow.current = books ?? [];
  const queue = useRef<Promise<void>>(Promise.resolve());

  /**
   * Writes, then reads back, so the screen shows what was stored. One at a
   * time: a second tap lands before the first write has been read back, and
   * computed from what was rendered it would renumber a section from rows
   * that are already out of date — a Move made just after a Pin could write
   * the pin away.
   */
  const arrange = (what: string, write: () => Promise<void>) => {
    const run = async () => {
      setError(null);
      try {
        await write();
      } catch (cause) {
        setError(`Could not ${what}: ${(cause as Error).message}`);
      }
      await refreshArrangement();
    };
    queue.current = queue.current.then(run, run);
    return queue.current;
  };

  /** Placement rows computed from the stores as they are now, not as rendered. */
  const writePlacements = (
    what: string,
    compute: (
      sections: LibrarySection[],
      placements: ReadonlyMap<number, BookPlacement>,
      folders: LibraryFolder[],
    ) => BookPlacement[],
  ) =>
    arrange(what, async () => {
      const [rows, list] = await Promise.all([
        storage.listBookPlacements(),
        storage.listLibraryFolders(),
      ]);
      const current = new Map(rows.map((row) => [row.shamelaId, row]));
      const now = arrangeLibrary(booksNow.current, current, list);
      await storage.putBookPlacements(compute(now, current, list));
    });

  const pin = (book: Book, pinned: boolean) =>
    writePlacements(pinned ? 'pin the book' : 'unpin the book', (s, p, f) =>
      relocateBook(s, p, f, book, { pinned }, Date.now()),
    );

  const move = (book: Book, delta: -1 | 1) =>
    writePlacements('move the book', (s, p) => moveBook(s, p, book, delta, Date.now()));

  const file = (book: Book, folderId: string | null) =>
    writePlacements('move the book to that folder', (s, p, f) =>
      relocateBook(s, p, f, book, { folderId }, Date.now()),
    );

  const createFolder = (name: string) =>
    arrange('create the folder', () =>
      storage.putLibraryFolder({ id: newId('folder'), name, collapsed: false, createdAt: Date.now() }),
    );

  /** A folder changed from its stored row, not the rendered one, for the queue's reason. */
  const updateFolder = (what: string, id: string, change: (folder: LibraryFolder) => LibraryFolder) =>
    arrange(what, async () => {
      const stored = (await storage.listLibraryFolders()).find((folder) => folder.id === id);
      if (stored) await storage.putLibraryFolder(change(stored));
    });

  const renameFolder = (folder: LibraryFolder, name: string) =>
    updateFolder('rename the folder', folder.id, (stored) => ({ ...stored, name }));

  const toggleFolder = (folder: LibraryFolder) =>
    updateFolder(folder.collapsed ? 'open the folder' : 'collapse the folder', folder.id, (stored) => ({
      ...stored,
      collapsed: !stored.collapsed,
    }));

  const deleteFolder = async (folder: LibraryFolder, count: number) => {
    const confirmed = window.confirm(
      `Delete the folder "${folder.name}"?\n\n` +
        (count === 0
          ? 'It is empty.'
          : `Its ${count === 1 ? 'one book moves' : `${count} books move`} to Unfiled.`) +
        ' No book is deleted.',
    );
    if (!confirmed) return;
    await arrange('delete the folder', () => storage.deleteLibraryFolder(folder.id));
  };

  const remove = async (book: Book) => {
    // A chapter published from the book outlives it (FOUND_ISSUES 19), which
    // is worth saying before the yes, not discovering after.
    // A failed read only loses the extra sentence; the delete is still asked.
    const published = await storage
      .listShareRecords()
      .then((records) => records.some((record) => record.bookId === book.id))
      .catch(() => false);
    const confirmed = window.confirm(
      `Delete "${book.title}"?\n\nThis removes the imported text, and any translation cards anchored to it, from this device. It cannot be undone.` +
        (published
          ? '\n\nChapters you published from it keep working for anyone with the link, and stay under Settings → Published chapters.'
          : ''),
    );
    if (!confirmed) return;
    // A large book takes long enough to clear that an unchanged card reads as a
    // dead press. Say the row is going, and say so if it did not.
    setDeleting(book.id);
    setError(null);
    try {
      await storage.deleteBook(book.id);
      await refresh();
    } catch (cause) {
      setError(`Could not delete "${book.title}": ${(cause as Error).message}`);
    } finally {
      setDeleting(null);
    }
  };

  const resume = async (book: Book) => {
    navigate({ name: 'import' });
    void crawler.start(book.id);
  };

  const pinnedSection = sections.find((section) => section.key === 'pinned');
  const unfiledSection = sections.find((section) => section.key === 'unfiled');
  const hasPins = (pinnedSection?.books.length ?? 0) > 0;
  const hasFolders = folders.length > 0;
  const menuBook = menuFor ? books?.find((book) => book.id === menuFor) : undefined;
  const menuSection = menuBook
    ? sections.find((section) => section.books.some((book) => book.id === menuBook.id))
    : undefined;

  const grid = (section: LibrarySection) => (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {section.books.map((book, index) => {
        const isCrawling = progress?.bookId === book.id && progress.status === 'running';
        const placement = placementOf(placements, book.shamelaId);
        return (
          <LibraryBookCard
            key={book.id}
            book={book}
            isCrawling={isCrawling}
            deleting={deleting === book.id}
            anyDeleting={deleting !== null}
            onDelete={() => void remove(book)}
            onResume={() => void resume(book)}
            arranging={arranging}
            pinned={placement.pinned}
            canMoveUp={index > 0}
            canMoveDown={index < section.books.length - 1}
            onPin={() => void pin(book, !placement.pinned)}
            onMove={(delta) => void move(book, delta)}
            onOpenMenu={() => setMenuFor(book.id)}
          />
        );
      })}
    </div>
  );

  return (
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      <TopBar title="Library" subtitle="Shamela reader & translation study tool">
        <LinkButton to={{ name: 'settings' }} variant="ghost">
          Settings
        </LinkButton>
        <LinkButton to={{ name: 'import' }} variant="primary">
          Add book
        </LinkButton>
      </TopBar>

      <div className="flex-1 overflow-auto p-6">
        {batch.running && (
          <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-xs">
            <span className="font-medium">
              Importing from the catalog — {batch.doneCount} of {batch.rows.length} done
            </span>
            {batch.rows.find((row) => row.status === 'importing') && (
              <span dir="rtl" lang="ar" className="arabic text-[13px]">
                {batch.rows.find((row) => row.status === 'importing')!.entry.title}
              </span>
            )}
            <span className="text-muted">
              {batch.stopping ? 'Stopping after the current page.' : 'Carries on while you read.'}
            </span>
            <span className="ms-auto flex gap-2">
              <LinkButton to={{ name: 'catalog' }}>Show progress</LinkButton>
              <Button onClick={batch.stopNow} disabled={batch.stopping}>
                Stop now
              </Button>
            </span>
          </div>
        )}

        {error && (
          <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        {books === null && <p className="text-sm text-muted">Loading…</p>}

        {books?.length === 0 && (
          <div className="mx-auto mt-16 max-w-md text-center">
            <p className="mb-1 text-sm font-medium">No books yet</p>
            <p className="mb-5 text-sm text-muted">
              Start from the <strong>catalog</strong> — a short list of recommended works
              with their Shamela IDs already looked up — or add one directly by pasting its
              Shamela URL or ID.
            </p>
            <div className="mb-3">
              <LinkButton to={{ name: 'catalog' }} variant="primary">
                Browse the catalog
              </LinkButton>
            </div>
            <LinkButton to={{ name: 'import' }}>Add a book by ID</LinkButton>
          </div>
        )}

        {arranging && books !== null && books.length > 0 && (
          <div className="mb-4">
            {creatingFolder ? (
              <FolderNameForm
                submitLabel="Create folder"
                onSubmit={(name) => {
                  setCreatingFolder(false);
                  void createFolder(name);
                }}
                onCancel={() => setCreatingFolder(false)}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Button onClick={() => setCreatingFolder(true)}>New folder</Button>
                <span className="text-xs text-muted">
                  Hold a book, or tap its ⋯, to pin it, move it or file it in a folder.
                </span>
              </div>
            )}
          </div>
        )}

        {books !== null && books.length > 0 && (
          <div className="flex flex-col gap-6">
            {hasPins && pinnedSection && (
              <section aria-label="Pinned">
                <LibrarySectionHeading label="Pinned" count={pinnedSection.books.length} />
                {grid(pinnedSection)}
              </section>
            )}

            {sections
              .filter((section) => section.folder !== null)
              .map((section) => {
                const folder = section.folder!;
                // In share mode a folder cannot be opened again, so it is
                // never shown collapsed there.
                const collapsed = arranging && folder.collapsed;
                return (
                  <section key={section.key} aria-label={folder.name}>
                    <LibraryFolderHeader
                      folder={folder}
                      count={section.books.length}
                      arranging={arranging}
                      onToggle={() => void toggleFolder(folder)}
                      onRename={(name) => void renameFolder(folder, name)}
                      onDelete={() => void deleteFolder(folder, section.books.length)}
                    />
                    {!collapsed &&
                      (section.books.length > 0 ? (
                        grid(section)
                      ) : (
                        <p className="text-sm text-muted">
                          No books in this folder yet.
                          {arranging && ' Hold a book, or tap its ⋯, and choose this folder.'}
                        </p>
                      ))}
                  </section>
                );
              })}

            {unfiledSection && (unfiledSection.books.length > 0 || hasFolders) && (
              <section aria-label={hasFolders ? 'Unfiled' : 'Other books'}>
                {(hasPins || hasFolders) && (
                  <LibrarySectionHeading
                    label={hasFolders ? 'Unfiled' : 'Other books'}
                    count={unfiledSection.books.length}
                  />
                )}
                {unfiledSection.books.length > 0 ? (
                  grid(unfiledSection)
                ) : (
                  <p className="text-sm text-muted">Every book is pinned or in a folder.</p>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {arranging && menuBook && menuSection && (
        <LibraryBookMenu
          book={menuBook}
          pinned={placementOf(placements, menuBook.shamelaId).pinned}
          folderId={placementOf(placements, menuBook.shamelaId).folderId}
          folders={folders}
          canMoveUp={menuSection.books[0]?.id !== menuBook.id}
          canMoveDown={menuSection.books[menuSection.books.length - 1]?.id !== menuBook.id}
          onPin={(pinned) => {
            setMenuFor(null);
            void pin(menuBook, pinned);
          }}
          onMove={(delta) => void move(menuBook, delta)}
          onFile={(folderId) => {
            setMenuFor(null);
            void file(menuBook, folderId);
          }}
          onClose={closeMenu}
        />
      )}
    </div>
  );
}
