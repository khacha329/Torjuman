import { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../app/AppContext';
import type { Block, Mark } from '../../types';
import {
  applyMark,
  blockMarkFor,
  markRangesByBlock,
  marksIn,
  noteCardsFrom,
  snapToWords,
  type MarkAnchor,
  type MarkKind,
} from './markLogic';

// Reading marks for the open book.
//
// Marks are visual only: nothing here hides, reorders, or filters a block. The
// reader shows the whole book and the marks are read alongside it, the way pen
// marks in a printed copy are.

export function useMarks(bookId: string, blocks: Block[]) {
  const { storage } = useApp();
  const [marks, setMarks] = useState<Mark[]>([]);

  useEffect(() => {
    void storage.listMarks(bookId).then(setMarks);
  }, [storage, bookId]);

  const orderOf = useMemo(
    () => new Map(blocks.map((block) => [block.id, block.order])),
    [blocks],
  );

  const byBlock = useMemo(() => markRangesByBlock(marks, blocks), [marks, blocks]);
  const noteCards = useMemo(() => noteCardsFrom(marks, blocks), [marks, blocks]);

  const commit = useCallback(
    async (put: Mark[], remove: string[]) => {
      setMarks((previous) => [
        ...previous.filter((mark) => !remove.includes(mark.id) && !put.some((p) => p.id === mark.id)),
        ...put,
      ]);
      if (remove.length > 0) await storage.deleteMarks(remove);
      if (put.length > 0) await storage.putMarks(put);
    },
    [storage],
  );

  /** Margin tap: toggle skip on a whole block. */
  const toggleBlockSkip = useCallback(
    async (block: Block) => {
      const existing = blockMarkFor(marks, block.id);

      // Tapping an existing mark's band clears it, whichever kind it is.
      if (existing) {
        await commit([], [existing.id]);
        return;
      }

      const mutation = applyMark(
        marks,
        {
          bookId,
          anchor: {
            startBlockId: block.id,
            startOffset: 0,
            endBlockId: block.id,
            endOffset: block.text.length,
          },
          kind: 'skip',
          scope: 'block',
        },
        orderOf,
      );
      await commit(mutation.put, mutation.remove);
    },
    [marks, bookId, orderOf, commit],
  );

  /** Long-press menu, and the selection toolbar's span marking. */
  const setMark = useCallback(
    async (
      anchor: MarkAnchor,
      kind: MarkKind,
      scope: 'block' | 'span',
      note?: string | null,
    ) => {
      const mutation = applyMark(marks, { bookId, anchor, kind, scope, note }, orderOf);
      await commit(mutation.put, mutation.remove);
    },
    [marks, bookId, orderOf, commit],
  );

  /** Clear every mark intersecting a range, at any scope. */
  const clearMarksIn = useCallback(
    async (anchor: MarkAnchor) => {
      const touching = marksIn(marks, anchor, orderOf);
      if (touching.length === 0) return;
      await commit([], touching.map((mark) => mark.id));
    },
    [marks, orderOf, commit],
  );

  const clearBlock = useCallback(
    async (block: Block) => {
      await clearMarksIn({
        startBlockId: block.id,
        startOffset: 0,
        endBlockId: block.id,
        endOffset: block.text.length,
      });
    },
    [clearMarksIn],
  );

  /**
   * Mark a selection. Offsets are widened to whole words: Arabic is cursive,
   * and a boundary inside a word would split its letters across two elements
   * and risk breaking the join.
   */
  const markSelection = useCallback(
    async (
      anchor: MarkAnchor,
      kind: MarkKind,
      note?: string | null,
    ) => {
      const startBlock = blocks.find((block) => block.id === anchor.startBlockId);
      const endBlock = blocks.find((block) => block.id === anchor.endBlockId);
      if (!startBlock || !endBlock) return;

      const [startOffset] = snapToWords(startBlock.text, anchor.startOffset, anchor.startOffset);
      const [, endOffset] = snapToWords(endBlock.text, anchor.endOffset, anchor.endOffset);

      await setMark(
        { ...anchor, startOffset, endOffset },
        kind,
        'span',
        note,
      );
    },
    [blocks, setMark],
  );

  const setNote = useCallback(
    async (markId: string, note: string | null) => {
      const mark = marks.find((candidate) => candidate.id === markId);
      if (!mark) return;
      await commit([{ ...mark, note }], []);
    },
    [marks, commit],
  );

  const setCollapsed = useCallback(
    async (markId: string, collapsed: boolean) => {
      const mark = marks.find((candidate) => candidate.id === markId);
      if (!mark) return;
      await commit([{ ...mark, collapsed }], []);
    },
    [marks, commit],
  );

  const removeMark = useCallback(
    async (markId: string) => {
      await commit([], [markId]);
    },
    [commit],
  );

  /** Ordered positions of every `read` mark, for session navigation. */
  const readPositions = useMemo(
    () =>
      marks
        .filter((mark) => mark.kind === 'read')
        .map((mark) => orderOf.get(mark.startBlockId) ?? 0)
        .sort((a, b) => a - b),
    [marks, orderOf],
  );

  return {
    marks,
    byBlock,
    noteCards,
    readPositions,
    toggleBlockSkip,
    setMark,
    markSelection,
    clearMarksIn,
    clearBlock,
    setNote,
    setCollapsed,
    removeMark,
    marksIn: (anchor: MarkAnchor) => marksIn(marks, anchor, orderOf),
  };
}
