import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import type { LibraryFolder } from '../types';
import { Button, inputClass } from './kit';

// A section heading in the Library: Pinned, a folder, or Unfiled. A folder's
// heading also opens and collapses it, and renames and deletes it; Pinned and
// Unfiled are only labels. In share mode no heading has a control (the
// Library passes `arranging` false), so a visitor sees labels only.

export function LibrarySectionHeading({
  label,
  count,
  children,
}: {
  label: ReactNode;
  count: number;
  children?: ReactNode;
}) {
  return (
    <div className="mb-3 flex min-h-9 items-center gap-2 border-b border-rule pb-1">
      <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">
        {label} <span className="font-normal text-muted">· {count}</span>
      </h2>
      {children}
    </div>
  );
}

export function LibraryFolderHeader({
  folder,
  count,
  arranging,
  onToggle,
  onRename,
  onDelete,
}: {
  folder: LibraryFolder;
  count: number;
  /** False in share mode: no control at all, the folder shown open. */
  arranging: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);

  if (renaming) {
    return (
      <div className="mb-3 border-b border-rule pb-2">
        <FolderNameForm
          initial={folder.name}
          submitLabel="Save"
          onSubmit={(name) => {
            setRenaming(false);
            if (name !== folder.name) onRename(name);
          }}
          onCancel={() => setRenaming(false)}
        />
      </div>
    );
  }

  const label = arranging ? (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!folder.collapsed}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left hover:text-accent"
    >
      <span aria-hidden="true" className="inline-block w-3 text-center text-muted">
        {folder.collapsed ? '▸' : '▾'}
      </span>
      <span className="truncate">{folder.name}</span>
    </button>
  ) : (
    folder.name
  );

  return (
    <LibrarySectionHeading label={label} count={count}>
      {arranging && (
        <>
          <Button variant="ghost" onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button variant="ghost" onClick={onDelete}>
            Delete folder
          </Button>
        </>
      )}
    </LibrarySectionHeading>
  );
}

/** A folder's name, for a new folder or a rename. Blank is refused. */
export function FolderNameForm({
  initial = '',
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        ref={input}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
        aria-label="Folder name"
        placeholder="Folder name"
        maxLength={80}
        // `dir="auto"`: a folder may well be named in Arabic.
        dir="auto"
        className={`${inputClass} max-w-xs flex-1`}
      />
      <Button type="submit" variant="primary" disabled={!name.trim()}>
        {submitLabel}
      </Button>
      <Button onClick={onCancel}>Cancel</Button>
    </form>
  );
}
