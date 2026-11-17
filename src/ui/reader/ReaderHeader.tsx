import { useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { useApp } from '../../app/AppContext';
import { parseArabicNumber, toArabicNumerals } from '../../lib/arabic';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import type { Block, Book } from '../../types';
import type { useMarks } from './useMarks';
import { Button, LinkButton } from '../kit';
import type { BlockListHandle } from './BlockList';
import type { useReaderNavigation } from './useReaderNavigation';
import type { useHeaderHeight } from './useHeaderHeight';

// The reader's sticky header: the way back to the library, the book and
// section titles, the ج/ص of the visible block, the jump to a printed page,
// the read-mark arrows, and the Contents, Search, Share and Show/Hide cards
// buttons. `ReadMarkNav` and `JumpToPage` are its own parts. Moved verbatim
// from ReaderScreen.tsx in restructure Phase 5 step 5h1
// (docs/refactor/plans/phase5-big-ui-files.md).

export function ReaderHeader({
  headerRef,
  readOnly,
  book,
  activeTocTitle,
  currentMeta,
  pageMeta,
  jumpToPage,
  marks,
  visibleBlock,
  listRef,
  setShowToc,
  setShowSearch,
  shareButtonRef,
  setShowShare,
  sideBySide,
  updateSettings,
  settings,
}: {
  headerRef: ReturnType<typeof useHeaderHeight>['headerRef'];
  readOnly: boolean;
  book: Book;
  activeTocTitle: string | undefined;
  currentMeta: PageMeta | undefined;
  pageMeta: Map<number, PageMeta>;
  jumpToPage: ReturnType<typeof useReaderNavigation>['jumpToPage'];
  marks: ReturnType<typeof useMarks>;
  visibleBlock: Block | null;
  listRef: RefObject<BlockListHandle | null>;
  setShowToc: Dispatch<SetStateAction<boolean>>;
  setShowSearch: Dispatch<SetStateAction<boolean>>;
  shareButtonRef: RefObject<HTMLSpanElement | null>;
  setShowShare: Dispatch<SetStateAction<boolean>>;
  sideBySide: boolean;
  updateSettings: ReturnType<typeof useApp>['updateSettings'];
  settings: ReturnType<typeof useApp>['settings'];
}) {
  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-30 flex shrink-0 flex-wrap items-center gap-2 border-b border-rule bg-white/85 px-3 py-2 backdrop-blur"
    >
      {/* A shared link is a chapter, not a door into the app.
          Someone sent this to read; the library behind it is not theirs and
          holds nothing for them. With the banner's exit gone too, a shared
          view now has no route out at all, which is the intent: the page
          shows what was shared and stops there. Note this hides the
          affordance, not the route — the app is client-side, so anyone who
          edits the URL still lands on their own (empty) library. */}
      {!readOnly && (
        <LinkButton to={{ name: 'library' }} variant="ghost">
          ← Library
        </LinkButton>
      )}

      <div className="min-w-0 flex-1">
        <p className="arabic truncate text-sm font-semibold" dir="rtl">
          {book.title}
        </p>
        {activeTocTitle && (
          <p className="arabic truncate text-[11px] text-muted" dir="rtl">
            {activeTocTitle}
          </p>
        )}
      </div>

      {currentMeta && (
        <span className="arabic shrink-0 rounded bg-parchment px-2 py-1 text-xs text-muted" dir="rtl">
          {currentMeta.volume !== null && `ج${toArabicNumerals(currentMeta.volume)} `}
          {currentMeta.printPage !== null && `ص${toArabicNumerals(currentMeta.printPage)}`}
        </span>
      )}

      <JumpToPage pageMeta={pageMeta} onJump={jumpToPage} />

      {marks.readPositions.length > 0 && (
        <ReadMarkNav
          positions={marks.readPositions}
          currentOrder={visibleBlock?.order ?? 0}
          onJump={(order) => listRef.current?.scrollToOrder(order, 'center')}
        />
      )}

      <Button onClick={() => setShowToc(true)}>Contents</Button>
      <Button onClick={() => setShowSearch((value) => !value)}>Search</Button>
      {/* Publishing is the author's act and is never offered inside somebody
          else's shared view — a visitor cannot re-share what they were sent. */}
      {!readOnly && (
        <span ref={shareButtonRef}>
          <Button onClick={() => setShowShare(true)}>Share</Button>
        </span>
      )}
      {sideBySide && (
        <Button
          onClick={() => void updateSettings({ panelCollapsed: !settings.panelCollapsed })}
          title="Ctrl/⌘ + \"
        >
          {settings.panelCollapsed ? 'Show cards' : 'Hide cards'}
        </Button>
      )}
    </header>
  );
}

/**
 * Jump between passages marked to be read out, for running a session.
 *
 * Navigation only: it moves the scroll position and changes nothing about what
 * is displayed. Nothing is ever hidden or filtered.
 */
function ReadMarkNav({
  positions,
  currentOrder,
  onJump,
}: {
  positions: number[];
  currentOrder: number;
  onJump: (order: number) => void;
}) {
  const previous = [...positions].reverse().find((order) => order < currentOrder);
  const next = positions.find((order) => order > currentOrder);

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-rule">
      <button
        onClick={() => previous !== undefined && onJump(previous)}
        disabled={previous === undefined}
        className="px-2 py-1 text-xs text-muted hover:bg-rule disabled:opacity-30"
        title="Previous passage marked to read"
      >
        ↑
      </button>
      <span className="text-[10px] text-muted" title="Passages marked to read">
        {positions.length}
      </span>
      <button
        onClick={() => next !== undefined && onJump(next)}
        disabled={next === undefined}
        className="px-2 py-1 text-xs text-muted hover:bg-rule disabled:opacity-30"
        title="Next passage marked to read"
      >
        ↓
      </button>
    </div>
  );
}

/** Jump by printed volume/page (ج / ص), the numbers he will have in the book. */
function JumpToPage({
  pageMeta,
  onJump,
}: {
  pageMeta: Map<number, PageMeta>;
  onJump: (pageIndex: number) => void;
}) {
  const [volume, setVolume] = useState('');
  const [page, setPage] = useState('');

  const go = () => {
    const targetPage = parseArabicNumber(page);
    if (targetPage === null) return;
    const targetVolume = parseArabicNumber(volume);

    for (const meta of pageMeta.values()) {
      if (meta.printPage !== targetPage) continue;
      if (targetVolume !== null && meta.volume !== targetVolume) continue;
      onJump(meta.pageIndex);
      return;
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1 text-xs">
      <span className="arabic text-muted">ج</span>
      <input
        value={volume}
        onChange={(event) => setVolume(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && go()}
        className="w-10 rounded border border-rule px-1 py-1 text-center"
        aria-label="Volume"
      />
      <span className="arabic text-muted">ص</span>
      <input
        value={page}
        onChange={(event) => setPage(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && go()}
        className="w-14 rounded border border-rule px-1 py-1 text-center"
        aria-label="Printed page"
      />
      <Button onClick={go}>Go</Button>
    </div>
  );
}
