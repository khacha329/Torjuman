import type { Block, CardBase, PanelScope } from '../../types';

export type { PanelScope };

// Marker grouping and panel scoping.
//
// Everything here is written against CardBase — the shared anchor fields —
// rather than against TranslationCard. When v2 adds HighlightCard and NoteCard
// they get inline markers and scoping for free, because none of this knows what
// kind of card it is holding.

/** Order lookup for a book's blocks. Built once per render pass. */
export function blockOrderIndex(blocks: Block[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const block of blocks) map.set(block.id, block.order);
  return map;
}

export function sortCardsByPosition<T extends CardBase>(
  cards: T[],
  orderOf: Map<string, number>,
): T[] {
  return [...cards].sort(
    (a, b) =>
      (orderOf.get(a.startBlockId) ?? 0) - (orderOf.get(b.startBlockId) ?? 0) ||
      a.startOffset - b.startOffset,
  );
}

/**
 * One marker per block that any card starts in.
 *
 * Cards that begin in the same block collapse into a single marker carrying a
 * count. Stacking a marker per card would crowd the margin and eventually push
 * on the Arabic column, which must keep its full measure.
 */
export interface CardMarker {
  blockId: string;
  cards: CardBase[];
  /**
   * Distinct card kinds under this marker. Currently always ['translation'],
   * but the marker component reads this rather than assuming, so v2 can tint
   * or shape the marker by type without changing this API.
   */
  kinds: string[];
}

export function buildMarkers(cards: CardBase[]): Map<string, CardMarker> {
  const markers = new Map<string, CardMarker>();

  for (const card of cards) {
    const existing = markers.get(card.startBlockId);
    if (existing) {
      existing.cards.push(card);
      if (!existing.kinds.includes(card.kind)) existing.kinds.push(card.kind);
    } else {
      markers.set(card.startBlockId, {
        blockId: card.startBlockId,
        cards: [card],
        kinds: [card.kind],
      });
    }
  }

  // Keep each marker's cards in the order they were made, so the popover list
  // is stable rather than reshuffling as state updates.
  for (const marker of markers.values()) {
    marker.cards.sort((a, b) => a.startOffset - b.startOffset || a.createdAt - b.createdAt);
  }

  return markers;
}

/** Every block a card covers, for the subtle range indication on the text. */
export function coveredBlockIds(cards: CardBase[], blocks: Block[]): Set<string> {
  const orderOf = blockOrderIndex(blocks);
  const covered = new Set<string>();

  for (const card of cards) {
    const from = orderOf.get(card.startBlockId);
    const to = orderOf.get(card.endBlockId);
    if (from === undefined || to === undefined) continue;
    const [low, high] = from <= to ? [from, to] : [to, from];
    for (const block of blocks) {
      if (block.order >= low && block.order <= high) covered.add(block.id);
    }
  }

  return covered;
}

export interface VisibleRange {
  startIndex: number;
  endIndex: number;
}

/**
 * Three scopes, and the default is the narrowest.
 *
 * Amendment 3 gave the panel two modes and defaulted to the section. In
 * practice a bāb still holds too many cards, and — the part that actually hurt
 * — scrolling *within* a section does not change what the panel shows, so the
 * panel and the reader drift apart until the panel is answering about a page
 * the user left ten minutes ago.
 *
 * `visible` fixes that by tracking the reader continuously. `section` and `all`
 * remain, because "everything in this bāb" and "everything in the book" are
 * both real questions — just not the one you have while reading.
 *
 * The type itself is in types.ts, since the choice is persisted in AppSettings.
 */

/**
 * Buffer either side of the viewport, in blocks.
 *
 * Roughly half a screen, computed from the visible run rather than fixed: a
 * card should not vanish the instant its anchor crosses the edge, and a fixed
 * block count means something different at 26px than at 44px.
 */
export function bufferFor(visible: VisibleRange): number {
  const onScreen = Math.max(1, visible.endIndex - visible.startIndex + 1);
  return Math.max(3, Math.ceil(onScreen / 2));
}

/**
 * Cards anchored within the visible region plus half a screen either side.
 *
 * Scoping, not collapsing, is what makes the panel usable across six volumes:
 * four hundred collapsed headers is still four hundred rows to scroll.
 */
export function scopeToVisible<T extends CardBase>(
  cards: T[],
  blocks: Block[],
  visible: VisibleRange | null,
): T[] {
  if (!visible || blocks.length === 0) return cards;

  const margin = bufferFor(visible);
  const first = Math.max(0, visible.startIndex - margin);
  const last = Math.min(blocks.length - 1, visible.endIndex + margin);

  const lowOrder = blocks[first]?.order ?? -Infinity;
  const highOrder = blocks[last]?.order ?? Infinity;

  const orderOf = blockOrderIndex(blocks);
  return cards.filter((card) => {
    const order = orderOf.get(card.startBlockId);
    return order !== undefined && order >= lowOrder && order <= highOrder;
  });
}

/**
 * Cards in the chapter or bāb the reader is currently inside.
 *
 * Keyed on the TOC node the anchoring block belongs to, which is the book's own
 * idea of a section rather than a distance in blocks. With no TOC node — a book
 * whose skeleton did not parse — this falls back to showing everything, which
 * is the honest answer for "cards in this section" when there are no sections.
 */
export function scopeToSection<T extends CardBase>(
  cards: T[],
  blocks: Block[],
  tocNodeId: string | null,
): T[] {
  if (!tocNodeId) return cards;

  const sectionOf = new Map(blocks.map((block) => [block.id, block.tocNodeId]));
  return cards.filter((card) => sectionOf.get(card.startBlockId) === tocNodeId);
}

/**
 * The narrowest scope that contains a card.
 *
 * Tapping an inline marker must always open its card, so when the card falls
 * outside the active scope the panel switches to one that holds it rather than
 * doing nothing — which, from the user's side, is indistinguishable from the
 * marker being broken.
 */
export function scopeContaining<T extends CardBase>(
  card: T,
  options: {
    blocks: Block[];
    visible: VisibleRange | null;
    tocNodeId: string | null;
  },
): PanelScope {
  if (scopeToVisible([card], options.blocks, options.visible).length > 0) return 'visible';
  if (scopeToSection([card], options.blocks, options.tocNodeId).length > 0) return 'section';
  return 'all';
}

/** Free-text filter over the source Arabic and the translated English. */
export function filterCards<T extends CardBase & { sourceText?: string; segments?: { english: string }[] }>(
  cards: T[],
  query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return cards;

  return cards.filter((card) => {
    if (card.sourceText?.toLowerCase().includes(needle)) return true;
    return (card.segments ?? []).some((segment) =>
      segment.english.toLowerCase().includes(needle),
    );
  });
}
