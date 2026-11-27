import type { ReactNode } from 'react';
import { navigate } from '../app/router';
import type { Book } from '../types';
import { percentOf } from '../lib/format';
import { Button, ProgressBar, Spinner } from './kit';
import { useLongPress } from './useLongPress';

// One book in the Library grid. Moved out of LibraryScreen.tsx when the
// Library gained pins, a manual order and folders; the card's body is as it
// was, with the arranging controls added above the title.
//
// The arranging controls are buttons — Pin, Move up, Move down and ⋯ for the
// menu — and a long press anywhere on the card opens the same menu. No drag:
// on the tablet a drag across a scrolling grid fights the page's own scroll,
// and a press-and-hold that starts a drag is the same gesture that starts a
// text selection. In share mode (`arranging` false) none of it is rendered
// and the card takes no long press.

export function LibraryBookCard({
  book,
  isCrawling,
  deleting,
  anyDeleting,
  onDelete,
  onResume,
  arranging,
  pinned,
  canMoveUp,
  canMoveDown,
  onPin,
  onMove,
  onOpenMenu,
}: {
  book: Book;
  isCrawling: boolean;
  deleting: boolean;
  anyDeleting: boolean;
  onDelete: () => void;
  onResume: () => void;
  arranging: boolean;
  pinned: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPin: () => void;
  onMove: (delta: -1 | 1) => void;
  onOpenMenu: () => void;
}) {
  const percent = percentOf(book.fetchedPages, book.totalPages);
  const press = useLongPress(onOpenMenu, arranging);

  return (
    <div
      {...press}
      data-book-card={book.shamelaId}
      className={`flex flex-col rounded-lg border bg-white p-4 shadow-sm ${
        pinned ? 'border-accent/50' : 'border-rule'
      } ${arranging ? 'select-none [-webkit-touch-callout:none]' : ''}`}
    >
      {arranging && (
        <div className="mb-2 flex items-center gap-1">
          <IconButton label={pinned ? 'Unpin' : 'Pin to top'} pressed={pinned} onClick={onPin}>
            <PinIcon filled={pinned} />
          </IconButton>
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={!canMoveUp}>
            <ArrowIcon up />
          </IconButton>
          <IconButton label="Move down" onClick={() => onMove(1)} disabled={!canMoveDown}>
            <ArrowIcon />
          </IconButton>
          <IconButton label="More" onClick={onOpenMenu}>
            <span aria-hidden="true" className="text-lg leading-none">
              ⋯
            </span>
          </IconButton>
        </div>
      )}

      <button
        onClick={() => navigate({ name: 'reader', bookId: book.id })}
        className="mb-2 text-right"
      >
        <h2 className="arabic text-xl leading-snug font-semibold" dir="rtl">
          {book.title}
        </h2>
        <p className="arabic text-sm text-muted" dir="rtl">
          {book.author}
        </p>
      </button>

      <dl className="mb-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted">
        <div className="col-span-2 flex justify-between">
          <dt>Volumes</dt>
          <dd>{book.volumeCount}</dd>
        </div>
        <div className="col-span-2 flex justify-between">
          <dt>Pages</dt>
          <dd>
            {book.fetchedPages.toLocaleString()} / {book.totalPages.toLocaleString()}
          </dd>
        </div>
        <div className="col-span-2 flex justify-between">
          <dt>Profile</dt>
          <dd>
            {book.structureProfile === 'hadith-commentary' ? 'Hadith commentary' : 'Generic'}
          </dd>
        </div>
      </dl>

      {book.importStatus !== 'complete' && (
        <div className="mb-3">
          <ProgressBar percent={percent} />
          <p className="mt-1 text-xs text-muted">
            {isCrawling ? 'Importing…' : `Import incomplete — ${percent}%`}
          </p>
        </div>
      )}

      <div className="mt-auto flex gap-2">
        <Button onClick={() => navigate({ name: 'reader', bookId: book.id })}>Read</Button>
        {book.importStatus !== 'complete' && !isCrawling && (
          <Button onClick={onResume}>Resume import</Button>
        )}
        <div className="ml-auto">
          {deleting ? (
            <Spinner label="Deleting…" />
          ) : (
            <Button variant="danger" disabled={anyDeleting} onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** A 44 px square: a finger's width on the tablet, and four still fit a row. */
function IconButton({
  label,
  onClick,
  disabled,
  pressed,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-md border transition disabled:cursor-not-allowed disabled:opacity-30 ${
        pressed
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-transparent text-muted hover:bg-rule/40 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M9 3h6l-1 6 4 4v2h-5v6l-1 1-1-1v-6H6v-2l4-4z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon({ up = false }: { up?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d={up ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
