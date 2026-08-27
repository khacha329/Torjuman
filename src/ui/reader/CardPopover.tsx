import { useState } from 'react';
import type { ProviderId, TranslationCard } from '../../types';
import { TranslationCardView } from './TranslationCardView';
import { AnchoredPanel } from './AnchoredPanel';
import type { CardMarker } from './cardLayout';

// Shown when a margin marker is tapped while the card panel is closed.
//
// Deliberately not a reopening of the panel: reflowing the whole layout
// mid-sentence is disruptive, and someone tapping a marker while reading wants
// a glance, not a mode change.
//
// A full passage translation is long enough that it outgrows a floating
// popover, so this asks for the bottom sheet whenever the content is
// substantial. A sheet can go near-full-height without covering the anchored
// text, and its drag handle is an obvious dismiss affordance on a tablet. Short
// entity lookups keep the popover; same component, chosen by length.

/** Roughly a screenful of translated text. */
const SHEET_THRESHOLD_CHARS = 600;

export function CardPopover({
  marker,
  anchor,
  cards,
  citationFor,
  isStale,
  onClose,
  onToggleCollapse,
  onRetranslate,
  onDelete,
  onAddGlossaryTerm,
}: {
  marker: CardMarker;
  anchor: HTMLElement;
  cards: TranslationCard[];
  citationFor: (card: TranslationCard) => string | undefined;
  isStale: (card: TranslationCard) => boolean;
  onClose: () => void;
  onToggleCollapse: (card: TranslationCard) => void;
  onRetranslate: (
    card: TranslationCard,
    options?: { providerId?: ProviderId; model?: string },
  ) => void;
  onDelete: (card: TranslationCard) => void;
  onAddGlossaryTerm: (term: string) => void;
}) {
  const shown = cards.filter((card) => marker.cards.some((entry) => entry.id === card.id));

  // Several cards can start in one block, so this may be a short list.
  const [expandedId, setExpandedId] = useState<string | null>(
    shown.length === 1 ? (shown[0]?.id ?? null) : null,
  );

  const contentLength = shown.reduce(
    (total, card) =>
      total +
      card.sourceText.length +
      card.segments.reduce((sum, segment) => sum + segment.english.length, 0),
    0,
  );

  return (
    <AnchoredPanel
      anchor={anchor}
      onClose={onClose}
      preferSheet={contentLength > SHEET_THRESHOLD_CHARS || shown.length > 1}
      title={
        <span className="text-[11px] font-medium">
          {shown.length === 1 ? 'Translation' : `${shown.length} translations start here`}
        </span>
      }
    >
      <div className="space-y-2">
        {shown.map((card) => (
          <TranslationCardView
            key={card.id}
            // Expansion is driven locally so opening a card here does not
            // rewrite its persisted collapse state — a glance mutates nothing.
            card={{ ...card, collapsed: shown.length > 1 && expandedId !== card.id }}
            isStale={isStale(card)}
            isActive={false}
            citation={citationFor(card)}
            onFocus={() => setExpandedId(card.id)}
            onToggleCollapse={() =>
              shown.length > 1
                ? setExpandedId((current) => (current === card.id ? null : card.id))
                : onToggleCollapse(card)
            }
            onRetranslate={(options) => onRetranslate(card, options)}
            onDelete={() => {
              onDelete(card);
              if (shown.length === 1) onClose();
            }}
            onAddGlossaryTerm={onAddGlossaryTerm}
          />
        ))}
      </div>
    </AnchoredPanel>
  );
}
