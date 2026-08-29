import type { Block } from '../../types';

// Resolving a browser selection to block anchors.
//
// Native selection is used deliberately — browser bidi/RTL selection handling
// is mature and a hand-rolled implementation would be worse, especially with an
// S Pen. All this does is translate what the browser produced into
// (blockId, charOffset) pairs.

export interface SelectionAnchor {
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  sourceText: string;
}

const BLOCK_ATTRIBUTE = 'data-block-id';

function blockElementFor(node: Node | null): HTMLElement | null {
  let current: Node | null = node;
  while (current) {
    if (current instanceof HTMLElement && current.hasAttribute(BLOCK_ATTRIBUTE)) {
      return current;
    }
    current = current.parentNode;
  }
  return null;
}

/**
 * Character offset of (node, offset) within a block element, counting only the
 * text the block actually renders. Relies on BlockText rendering Block.text
 * verbatim.
 */
function offsetWithin(blockElement: HTMLElement, node: Node, offset: number): number {
  const walker = document.createTreeWalker(blockElement, NodeFilter.SHOW_TEXT);
  let total = 0;

  while (walker.nextNode()) {
    const textNode = walker.currentNode;
    if (textNode === node) return total + offset;
    total += textNode.textContent?.length ?? 0;
  }

  // The anchor was on an element rather than a text node (e.g. a triple-click
  // that selected the whole paragraph). Clamp to the end.
  return total;
}

/**
 * Resolve the live selection to anchors.
 *
 * Called at *action* time, not when the selection is made. Nothing about the
 * selection is stored in the meantime — no Range, no rect. The reader is
 * virtualized, so a Range held across a scroll can point at unmounted nodes,
 * and resolving fresh at the moment the user taps sidesteps that entirely. It
 * also means a range still being adjusted with the native handles is never read
 * half-finished.
 */
export function readSelection(): SelectionAnchor | null {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const startBlock = blockElementFor(range.startContainer);
  const endBlock = blockElementFor(range.endContainer);
  if (!startBlock || !endBlock) return null;

  const sourceText = selection.toString();
  if (sourceText.trim() === '') return null;

  return {
    startBlockId: startBlock.getAttribute(BLOCK_ATTRIBUTE)!,
    startOffset: offsetWithin(startBlock, range.startContainer, range.startOffset),
    endBlockId: endBlock.getAttribute(BLOCK_ATTRIBUTE)!,
    endOffset: offsetWithin(endBlock, range.endContainer, range.endOffset),
    sourceText,
  };
}

/**
 * Longest selection still offered a biographical lookup.
 *
 * A name in this text runs from one word («عمر») to about five («أبو حفص عمر
 * بن الخطاب»). Past that it is a phrase, and offering to look it up in a
 * biographical dictionary would be an affordance that can only ever fail.
 */
export const NAME_MAX_WORDS = 5;

export interface SelectionPeek {
  active: boolean;
  singleWord: boolean;
  /** Short enough to be a personal name — see NAME_MAX_WORDS. */
  shortSelection: boolean;
  /**
   * Viewport y of the middle of the selection, for positioning the rail.
   *
   * A *position*, deliberately, not a Range: nothing about the selection is
   * held across time here either. It is read fresh on each debounced
   * selectionchange and used only to place a fixed element, so a stale value
   * can misplace the rail by a few pixels and can do nothing worse. Anchors are
   * still resolved at action time by `readSelection`.
   */
  centerY: number | null;
}

const NO_SELECTION: SelectionPeek = {
  active: false,
  singleWord: false,
  shortSelection: false,
  centerY: null,
};

/**
 * Whether a usable selection exists inside the reader, without resolving it.
 *
 * This is all the rail needs to decide whether to show, which actions to offer,
 * and where to sit, and it is cheap enough to run on every debounced
 * selectionchange.
 */
export function peekSelection(): SelectionPeek {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return NO_SELECTION;
  }

  if (!blockElementFor(selection.anchorNode) && !blockElementFor(selection.focusNode)) {
    return NO_SELECTION;
  }

  const text = selection.toString().trim();
  if (text === '') return NO_SELECTION;

  const words = text.split(/\s+/).filter(Boolean).length;

  return {
    active: true,
    singleWord: !/\s/.test(text) && text.length <= 40,
    shortSelection: words >= 1 && words <= NAME_MAX_WORDS && text.length <= 120,
    centerY: selectionCenterY(selection),
  };
}

/**
 * The vertical middle of the selection, clamped to the viewport.
 *
 * A selection running over several paragraphs has a tall bounding box whose
 * centre can sit off screen; clamping keeps the rail beside the part of the
 * selection the user can actually see.
 */
function selectionCenterY(selection: Selection): number | null {
  // Measuring is best-effort. The reader is virtualized, so a range can point
  // at nodes that have been unmounted, and a non-layout environment has no
  // geometry at all — in both cases the rail falls back to centring on the
  // viewport, which is a worse position and not a broken one.
  let rect: DOMRect;
  try {
    const range = selection.getRangeAt(0);
    if (typeof range.getBoundingClientRect !== 'function') return null;
    rect = range.getBoundingClientRect();
  } catch {
    return null;
  }

  if (rect.height === 0 && rect.width === 0) return null;

  const top = Math.max(rect.top, 0);
  const bottom = Math.min(rect.bottom, window.innerHeight);
  if (bottom <= top) return null;
  return (top + bottom) / 2;
}

/** The blocks a selection covers, in reading order. */
export function blocksInRange(
  blocks: Block[],
  startBlockId: string,
  endBlockId: string,
): Block[] {
  const first = blocks.findIndex((block) => block.id === startBlockId);
  const last = blocks.findIndex((block) => block.id === endBlockId);
  if (first === -1 || last === -1) return [];

  const [from, to] = first <= last ? [first, last] : [last, first];
  return blocks.slice(from, to + 1);
}

/** The two blocks either side, supplied to the model as read-only context. */
export function contextAround(
  blocks: Block[],
  startBlockId: string,
  endBlockId: string,
): { before: Block[]; after: Block[] } {
  const first = blocks.findIndex((block) => block.id === startBlockId);
  const last = blocks.findIndex((block) => block.id === endBlockId);
  if (first === -1 || last === -1) return { before: [], after: [] };

  const [from, to] = first <= last ? [first, last] : [last, first];
  return {
    before: blocks.slice(Math.max(0, from - 2), from),
    after: blocks.slice(to + 1, to + 3),
  };
}
