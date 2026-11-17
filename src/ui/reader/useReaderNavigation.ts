import { useCallback, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { Block, Card } from '../../types';
import type { BlockListHandle } from './BlockList';

// The reader's navigation: jump to a block (and flash it), to a page, or to a
// card's first block. `flashBlockId` is its own. Moved verbatim from
// ReaderScreen.tsx in restructure Phase 5 step 5g3
// (docs/refactor/plans/phase5-big-ui-files.md).

export function useReaderNavigation({
  blocks,
  listRef,
  setActiveCardId,
}: {
  blocks: Block[];
  listRef: RefObject<BlockListHandle | null>;
  setActiveCardId: Dispatch<SetStateAction<string | null>>;
}) {
  const [flashBlockId, setFlashBlockId] = useState<string | null>(null);

  const flash = useCallback((blockId: string) => {
    setFlashBlockId(blockId);
    setTimeout(() => setFlashBlockId((current) => (current === blockId ? null : current)), 1600);
  }, []);

  const jumpToBlock = useCallback(
    (blockId: string) => {
      const index = blocks.findIndex((block) => block.id === blockId);
      if (index === -1) return;
      listRef.current?.scrollToIndex(index, 'center');
      flash(blockId);
    },
    [blocks, flash],
  );

  const jumpToPage = useCallback(
    (pageIndex: number) => {
      const index = blocks.findIndex(
        (block) => Number(block.pageId.split(':p')[1]) === pageIndex,
      );
      if (index >= 0) listRef.current?.scrollToIndex(index, 'start');
    },
    [blocks],
  );

  const focusCard = useCallback(
    (card: Card) => {
      setActiveCardId(card.id);
      jumpToBlock(card.startBlockId);
    },
    [jumpToBlock],
  );

  return { flashBlockId, flash, jumpToBlock, jumpToPage, focusCard };
}
