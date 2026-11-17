import { useEffect, useRef, type RefObject } from 'react';
import type { useApp } from '../../app/AppContext';
import type { Block } from '../../types';
import type { BlockListHandle } from './BlockList';

// The reader's saved reading position: restored once the blocks are in, and
// saved, throttled, as the visible block changes. `restoredRef` is its own.
// Moved verbatim from ReaderScreen.tsx in restructure Phase 5 step 5g2
// (docs/refactor/plans/phase5-big-ui-files.md).

export function useReadingPosition({
  storage,
  bookId,
  loading,
  blocks,
  visibleBlock,
  listRef,
}: {
  storage: ReturnType<typeof useApp>['storage'];
  bookId: string;
  loading: boolean;
  blocks: Block[];
  visibleBlock: Block | null;
  listRef: RefObject<BlockListHandle | null>;
}) {
  const restoredRef = useRef(false);

  // Restore the saved reading position once the blocks are in.
  useEffect(() => {
    if (loading || blocks.length === 0 || restoredRef.current) return;
    restoredRef.current = true;
    void storage.getReadingPosition(bookId).then((position) => {
      if (position) {
        requestAnimationFrame(() => listRef.current?.scrollToOrder(position.blockOrder));
      }
    });
  }, [loading, blocks.length, storage, bookId]);

  // Persist it as he reads, throttled so scrolling does not thrash IndexedDB.
  useEffect(() => {
    if (!visibleBlock) return;
    const timer = setTimeout(() => {
      void storage.putReadingPosition({
        bookId,
        blockOrder: visibleBlock.order,
        updatedAt: Date.now(),
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [visibleBlock, storage, bookId]);
}
