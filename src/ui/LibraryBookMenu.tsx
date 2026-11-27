import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Book, LibraryFolder } from '../types';

// The menu a book card opens on a long press, or from its ⋯ button: pin, Move
// up / Move down, and the folder it is filed in. A centred panel over a
// backdrop rather than a popover anchored to the card: on the tablet the card
// is under the finger that opened it, and a panel in the middle of the screen
// is never under it, never off the edge in portrait, and closes on a tap
// anywhere outside.
//
// Not in share mode: the Library renders it only for the owner's own books.

export function LibraryBookMenu({
  book,
  pinned,
  folderId,
  folders,
  canMoveUp,
  canMoveDown,
  onPin,
  onMove,
  onFile,
  onClose,
}: {
  book: Book;
  pinned: boolean;
  /** The folder it is filed in, or null for Unfiled. */
  folderId: string | null;
  folders: readonly LibraryFolder[];
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPin: (pinned: boolean) => void;
  onMove: (delta: -1 | 1) => void;
  onFile: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    panel.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // A folder that no longer exists reads as Unfiled, as the Library shows it.
  const filedIn = folderId !== null && folders.some((folder) => folder.id === folderId) ? folderId : null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4"
      onClick={onClose}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={`Arrange ${book.title}`}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-full max-w-sm overflow-auto rounded-lg border border-rule bg-white p-4 shadow-lg outline-none"
      >
        <p className="arabic mb-3 text-right text-lg leading-snug font-semibold" dir="rtl">
          {book.title}
        </p>

        <div className="flex flex-col gap-1">
          <MenuItem onClick={() => onPin(!pinned)}>{pinned ? 'Unpin' : 'Pin to top'}</MenuItem>
          <MenuItem onClick={() => onMove(-1)} disabled={!canMoveUp}>
            Move up
          </MenuItem>
          <MenuItem onClick={() => onMove(1)} disabled={!canMoveDown}>
            Move down
          </MenuItem>
        </div>

        <p className="mt-4 mb-1 text-xs font-medium text-muted uppercase">Folder</p>
        <div className="flex flex-col gap-1" role="radiogroup" aria-label="Folder">
          <FolderChoice checked={filedIn === null} onClick={() => onFile(null)}>
            Unfiled
          </FolderChoice>
          {folders.map((folder) => (
            <FolderChoice
              key={folder.id}
              checked={filedIn === folder.id}
              onClick={() => onFile(folder.id)}
            >
              {folder.name}
            </FolderChoice>
          ))}
        </div>
        {pinned && (
          <p className="mt-2 text-xs text-muted">
            A pinned book is shown under Pinned, and goes back to its folder when it is unpinned.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-rule bg-white px-3 py-1.5 text-sm hover:bg-parchment"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-3 py-2.5 text-left text-sm hover:bg-parchment disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function FolderChoice({
  children,
  checked,
  onClick,
}: {
  children: ReactNode;
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-parchment ${
        checked ? 'font-medium text-accent' : ''
      }`}
    >
      <span aria-hidden="true" className="w-4 text-center">
        {checked ? '✓' : ''}
      </span>
      <span className="min-w-0 truncate">{children}</span>
    </button>
  );
}
