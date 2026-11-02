import { blockElementFor, BLOCK_ATTRIBUTE } from './selection';

// The blocks a live selection starts and ends in, kept mounted.
//
// The reader is virtualized. Once the block a selection started in scrolls
// more than the overscan away, it unmounts — and removing a node that holds a
// range boundary moves that boundary to its parent. The selection then
// silently re-anchors somewhere else, which on a tablet looks like the
// selection jumping to start at the top of the mounted text.
//
// So the two endpoint blocks are pinned: BlockList adds them to whatever range
// it would mount anyway, wherever the reader scrolls. Only the endpoints — the
// blocks between them can unmount freely, since nothing about the selection
// lives in them, and readSelection takes their text from storage.
//
// Recorded on every selectionchange, immediately rather than debounced: the
// anchor has to be captured the moment the selection starts, while its block
// is still mounted. Waiting even one scroll can be too late.

let anchorBlockId: string | null = null;
let focusBlockId: string | null = null;

/** The block IDs to keep mounted for the current selection, if any. */
export function pinnedBlockIds(): string[] {
  const pinned: string[] = [];
  if (anchorBlockId) pinned.push(anchorBlockId);
  if (focusBlockId && focusBlockId !== anchorBlockId) pinned.push(focusBlockId);
  return pinned;
}

function idOf(node: Node | null): string | null {
  return blockElementFor(node)?.getAttribute(BLOCK_ATTRIBUTE) ?? null;
}

function update(): void {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    anchorBlockId = null;
    focusBlockId = null;
    return;
  }

  // An end that no longer resolves to a block keeps its previous pin: that is
  // exactly the case this exists for, and forgetting the pin would let the
  // block go for good.
  anchorBlockId = idOf(selection.anchorNode) ?? anchorBlockId;
  focusBlockId = idOf(selection.focusNode) ?? focusBlockId;
}

/** Start tracking the selection's endpoint blocks. Returns the way to stop. */
export function trackSelectionPins(): () => void {
  update();
  document.addEventListener('selectionchange', update);
  return () => {
    document.removeEventListener('selectionchange', update);
    anchorBlockId = null;
    focusBlockId = null;
  };
}
