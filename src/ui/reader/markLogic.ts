import type { Block, Mark, MarkRange, NoteCard } from '../../types';
import { newId } from '../../lib/id';

// Creating, replacing and clearing reading marks.
//
// All of this is pure so the precedence rules can be tested without a database
// or a browser.

export type MarkKind = Mark['kind'];
export type MarkScope = Mark['scope'];

export interface MarkAnchor {
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
}

/**
 * Widen a selection to whole words.
 *
 * Arabic is cursive: a letter's shape depends on its neighbours, and a mark
 * boundary falling mid-word would put the two halves in separate elements and
 * risk breaking the join. Snapping outward guarantees every boundary lands in
 * whitespace, which also matches intent — nobody means to underline half a
 * word.
 */
export function snapToWords(text: string, start: number, end: number): [number, number] {
  let from = Math.max(0, Math.min(start, text.length));
  let to = Math.max(0, Math.min(end, text.length));
  if (to < from) [from, to] = [to, from];

  while (from > 0 && !/\s/.test(text[from - 1])) from--;
  while (to < text.length && !/\s/.test(text[to])) to++;

  return [from, to];
}

function overlaps(a: MarkAnchor, b: MarkAnchor, orderOf: Map<string, number>): boolean {
  const aStart = position(a.startBlockId, a.startOffset, orderOf);
  const aEnd = position(a.endBlockId, a.endOffset, orderOf);
  const bStart = position(b.startBlockId, b.startOffset, orderOf);
  const bEnd = position(b.endBlockId, b.endOffset, orderOf);
  return aStart < bEnd && bStart < aEnd;
}

/** A comparable position: block order major, character offset minor. */
function position(blockId: string, offset: number, orderOf: Map<string, number>): number {
  return (orderOf.get(blockId) ?? 0) * 1_000_000 + offset;
}

export interface MarkMutation {
  put: Mark[];
  remove: string[];
}

/**
 * Apply a new mark, resolving it against what is already there.
 *
 * The rules, in the order they are checked:
 *
 *   - Span scope always beats block scope, and vice versa they coexist. A read
 *     span inside a skip block is the whole point, so marks of *different*
 *     scope never interfere with each other.
 *   - At the same scope, a new mark of one kind replaces any overlapping mark
 *     of the other kind.
 *   - At the same scope, overlapping marks of the same kind merge into one.
 */
export function applyMark(
  existing: Mark[],
  incoming: {
    bookId: string;
    anchor: MarkAnchor;
    kind: MarkKind;
    scope: MarkScope;
    note?: string | null;
  },
  orderOf: Map<string, number>,
): MarkMutation {
  const sameScope = existing.filter((mark) => mark.scope === incoming.scope);
  const touching = sameScope.filter((mark) => overlaps(mark, incoming.anchor, orderOf));

  const opposite = touching.filter((mark) => mark.kind !== incoming.kind);
  const same = touching.filter((mark) => mark.kind === incoming.kind);

  // Merge with same-kind neighbours by taking the outermost bounds.
  let { startBlockId, startOffset, endBlockId, endOffset } = incoming.anchor;
  let note = incoming.note ?? null;

  for (const mark of same) {
    if (position(mark.startBlockId, mark.startOffset, orderOf) < position(startBlockId, startOffset, orderOf)) {
      startBlockId = mark.startBlockId;
      startOffset = mark.startOffset;
    }
    if (position(mark.endBlockId, mark.endOffset, orderOf) > position(endBlockId, endOffset, orderOf)) {
      endBlockId = mark.endBlockId;
      endOffset = mark.endOffset;
    }
    note ??= mark.note;
  }

  // An existing mark always keeps its identity through a merge, so its note —
  // and the card in the panel showing it — survives. Comparing timestamps
  // would not do: a mark created in the same millisecond as the incoming one
  // would lose, and the note with it.
  const inherited = same.length > 0
    ? same.reduce((oldest, mark) => (mark.createdAt < oldest.createdAt ? mark : oldest))
    : null;

  const id = inherited?.id ?? newId('mark');
  const createdAt = inherited?.createdAt ?? Date.now();
  const collapsed = inherited?.collapsed ?? false;

  const merged: Mark = {
    id,
    bookId: incoming.bookId,
    startBlockId,
    startOffset,
    endBlockId,
    endOffset,
    kind: incoming.kind,
    scope: incoming.scope,
    note,
    createdAt,
    collapsed,
  };

  return {
    put: [merged],
    remove: [
      ...opposite.map((mark) => mark.id),
      ...same.filter((mark) => mark.id !== merged.id).map((mark) => mark.id),
    ],
  };
}

/** Every mark intersecting a range, at any scope. */
export function marksIn(
  existing: Mark[],
  anchor: MarkAnchor,
  orderOf: Map<string, number>,
): Mark[] {
  return existing.filter((mark) => overlaps(mark, anchor, orderOf));
}

/** The block-scope mark covering a block, if any. */
export function blockMarkFor(existing: Mark[], blockId: string): Mark | undefined {
  return existing.find((mark) => mark.scope === 'block' && mark.startBlockId === blockId);
}

/**
 * Marks as per-block render ranges.
 *
 * A mark can span a page break, so one mark may contribute a range to several
 * blocks — the tail of the first, whole blocks between, and the head of the
 * last.
 */
export function markRangesByBlock(marks: Mark[], blocks: Block[]): Map<string, MarkRange[]> {
  const byBlock = new Map<string, MarkRange[]>();
  const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
  const lengthOf = new Map(blocks.map((block) => [block.id, block.text.length]));

  const push = (range: MarkRange) => {
    if (range.end <= range.start) return;
    const list = byBlock.get(range.blockId);
    if (list) list.push(range);
    else byBlock.set(range.blockId, [range]);
  };

  for (const mark of marks) {
    if (mark.startBlockId === mark.endBlockId) {
      push({
        mark,
        blockId: mark.startBlockId,
        start: mark.startOffset,
        end: mark.endOffset,
      });
      continue;
    }

    const from = orderOf.get(mark.startBlockId);
    const to = orderOf.get(mark.endBlockId);
    if (from === undefined || to === undefined) continue;

    push({
      mark,
      blockId: mark.startBlockId,
      start: mark.startOffset,
      end: lengthOf.get(mark.startBlockId) ?? mark.startOffset,
    });
    push({ mark, blockId: mark.endBlockId, start: 0, end: mark.endOffset });

    for (const block of blocks) {
      if (block.order > from && block.order < to) {
        push({ mark, blockId: block.id, start: 0, end: block.text.length });
      }
    }
  }

  for (const list of byBlock.values()) {
    list.sort((a, b) => a.start - b.start);
  }

  return byBlock;
}

/**
 * Marks that carry a note, as cards for the panel.
 *
 * Bare marks are deliberately excluded: a prepared volume holds thousands and
 * they would flood the panel and destroy its usefulness.
 */
export function noteCardsFrom(marks: Mark[], blocks: Block[]): NoteCard[] {
  const byId = new Map(blocks.map((block) => [block.id, block]));

  return marks
    .filter((mark) => mark.note !== null && mark.note.trim() !== '')
    .map((mark) => {
      const block = byId.get(mark.startBlockId);
      const sourceText = block
        ? block.text.slice(mark.startOffset, Math.min(mark.endOffset, block.text.length))
        : '';

      return {
        id: `note-${mark.id}`,
        kind: 'note' as const,
        bookId: mark.bookId,
        startBlockId: mark.startBlockId,
        startOffset: mark.startOffset,
        endBlockId: mark.endBlockId,
        endOffset: mark.endOffset,
        createdAt: mark.createdAt,
        collapsed: mark.collapsed,
        markId: mark.id,
        markKind: mark.kind,
        note: mark.note ?? '',
        sourceText: sourceText || (block?.text ?? ''),
      };
    });
}
