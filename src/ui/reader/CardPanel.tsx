import { useEffect, useMemo, useRef, useState } from 'react';
import type { Block, Card, ProviderId, TranslationCard } from '../../types';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import { toArabicNumerals } from '../../lib/arabic';
import { TranslationCardView } from './TranslationCardView';
import { NoteCardView } from './NoteCardView';
import { ExplanationCardView } from './ExplanationCardView';
import { SharhCardView } from './SharhCardView';
import {
  blockOrderIndex,
  filterCards,
  scopeToSection,
  scopeToVisible,
  sortCardsByPosition,
  type PanelScope,
  type VisibleRange,
} from './cardLayout';
import { useAnimatedList } from './useAnimatedList';
import type { SessionStats } from './useTranslator';

// The right-hand panel.
//
// TranslationCard is currently the only card kind, but the panel sorts, scopes
// and collapses against the shared anchor fields rather than translation
// specifics, so the v2 HighlightCard and NoteCard drop into the same list.
//
// Three scopes, defaulting to Visible — see cardLayout.ts for why the section
// default was the wrong one. Collapse state is a field on the card itself and
// is persisted, so it survives a card leaving and re-entering scope with
// nothing needed here to preserve it.

export type { PanelScope };

export function CardPanel({
  cards,
  blocks,
  pageMeta,
  streaming,
  activeCardId,
  stats,
  scope,
  visibleRange,
  sectionNodeId,
  isStale,
  onScopeChange,
  onFocusCard,
  onToggleCollapse,
  onCollapseAll,
  onRetranslate,
  onDelete,
  onEditNote,
  onAddGlossaryTerm,
}: {
  /**
   * Translation cards and note cards together. The panel sorts, scopes and
   * collapses against the shared anchor fields, so it does not care which kind
   * a card is until the moment it renders one.
   */
  cards: Card[];
  blocks: Block[];
  pageMeta: Map<number, PageMeta>;
  streaming: Record<string, string>;
  activeCardId: string | null;
  stats: SessionStats;
  scope: PanelScope;
  /** Debounced by the caller: this drives what Visible shows. */
  visibleRange: VisibleRange | null;
  /** The TOC node the reader is currently inside, for the Section scope. */
  sectionNodeId: string | null;
  isStale: (card: TranslationCard) => boolean;
  onScopeChange: (scope: PanelScope) => void;
  onFocusCard: (card: Card) => void;
  onToggleCollapse: (card: Card) => void;
  onCollapseAll: (collapsed: boolean) => void;
  onRetranslate: (
    card: TranslationCard,
    options?: { providerId?: ProviderId; model?: string },
  ) => void;
  onDelete: (card: Card) => void;
  onEditNote: (card: Card) => void;
  onAddGlossaryTerm: (term: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState('');

  const orderOf = useMemo(() => blockOrderIndex(blocks), [blocks]);

  const visibleCards = useMemo(() => {
    const scoped =
      scope === 'visible'
        ? scopeToVisible(cards, blocks, visibleRange)
        : scope === 'section'
          ? scopeToSection(cards, blocks, sectionNodeId)
          : cards;
    // The filter is kept in All only. In the other two the list is already
    // short and bounded by where the reader is, so a filter there is a control
    // that costs a row of chrome and answers nothing.
    const filtered = scope === 'all' ? filterCards(scoped, filter) : scoped;
    return attachExplanations(sortCardsByPosition(filtered, orderOf));
  }, [cards, blocks, visibleRange, sectionNodeId, scope, filter, orderOf]);

  // Departing cards stay mounted briefly so the list fades rather than jumps.
  const entries = useAnimatedList(visibleCards);

  const citationFor = useMemo(() => {
    const byId = new Map(blocks.map((block) => [block.id, block]));
    return (card: Card): string | undefined => {
      const block = byId.get(card.startBlockId);
      if (!block) return undefined;
      const meta = pageMeta.get(Number(block.pageId.split(':p')[1] ?? 0));
      if (!meta) return undefined;
      const parts: string[] = [];
      if (meta.volume !== null) parts.push(`ج${toArabicNumerals(meta.volume)}`);
      if (meta.printPage !== null) parts.push(`ص${toArabicNumerals(meta.printPage)}`);
      return parts.join(' ') || undefined;
    };
  }, [blocks, pageMeta]);

  // Bring the focused card into view when the text pane selects it.
  useEffect(() => {
    if (!activeCardId || !containerRef.current) return;
    const element = containerRef.current.querySelector(`[data-card-id="${activeCardId}"]`);
    element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeCardId, visibleCards.length]);

  const anyExpanded = visibleCards.some((card) => !card.collapsed);
  const hiddenByScope = cards.length - visibleCards.length;

  return (
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      <PanelHeader
        scope={scope}
        onScopeChange={onScopeChange}
        filter={filter}
        onFilterChange={setFilter}
        total={cards.length}
        showing={visibleCards.length}
        anyExpanded={anyExpanded}
        onCollapseAll={onCollapseAll}
      />

      {entries.length === 0 ? (
        // Quiet, not blank. Scrolling past a stretch with no cards is the
        // normal case in Visible, not an error state.
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="max-w-xs text-sm text-muted">
            {cards.length === 0 ? (
              <>
                Select a passage in the text and tap <strong>Translate</strong>. Cards
                appear here in the order they occur in the book.
              </>
            ) : scope === 'all' ? (
              <>Nothing matches that filter.</>
            ) : (
              <>
                Nothing on this {scope === 'visible' ? 'part of the page' : 'section'}.{' '}
                <button
                  onClick={() => onScopeChange('all')}
                  className="underline hover:text-ink"
                >
                  Show all {cards.length}
                </button>
                .
              </>
            )}
          </p>
        </div>
      ) : (
        <div ref={containerRef} className="card-scroll flex-1 space-y-2 overflow-auto p-3">
          {entries.map(({ item: card, state }) => (
            <div
              key={card.id}
              data-card-id={card.id}
              className={state === 'out' ? 'card-leaving' : 'card-entering'}
            >
              {card.kind === 'explanation' ? (
                <ExplanationCardView
                  card={card}
                  isActive={card.id === activeCardId}
                  onFocus={() => onFocusCard(card)}
                  onToggleCollapse={() => onToggleCollapse(card)}
                  onDelete={() => onDelete(card)}
                />
              ) : card.kind === 'sharh' ? (
                <SharhCardView
                  card={card}
                  isActive={card.id === activeCardId}
                  citation={citationFor(card)}
                  onFocus={() => onFocusCard(card)}
                  onToggleCollapse={() => onToggleCollapse(card)}
                  onDelete={() => onDelete(card)}
                />
              ) : card.kind === 'note' ? (
                <NoteCardView
                  card={card}
                  isActive={card.id === activeCardId}
                  citation={citationFor(card)}
                  onFocus={() => onFocusCard(card)}
                  onToggleCollapse={() => onToggleCollapse(card)}
                  onEditNote={() => onEditNote(card)}
                  onDelete={() => onDelete(card)}
                />
              ) : (
                <TranslationCardView
                  card={card}
                  streamingText={streaming[card.id]}
                  isStale={isStale(card)}
                  isActive={card.id === activeCardId}
                  citation={citationFor(card)}
                  onFocus={() => onFocusCard(card)}
                  onToggleCollapse={() => onToggleCollapse(card)}
                  onRetranslate={(options) => onRetranslate(card, options)}
                  onDelete={() => onDelete(card)}
                  onAddGlossaryTerm={onAddGlossaryTerm}
                />
              )}
            </div>
          ))}

          {scope !== 'all' && hiddenByScope > 0 && (
            <button
              onClick={() => onScopeChange('all')}
              className="w-full rounded-md border border-dashed border-rule py-2 text-[11px] text-muted hover:border-accent/40 hover:text-ink"
            >
              {hiddenByScope} more elsewhere in the book — show all
            </button>
          )}
        </div>
      )}

      <SessionTotals stats={stats} />
    </div>
  );
}

/**
 * Pull each explanation up to sit directly beneath the translation it hangs
 * from, rather than wherever its own anchor happens to sort.
 */
function attachExplanations(sorted: Card[]): Card[] {
  const parents = new Set(sorted.map((card) => card.id));
  const attached = new Map<string, Card[]>();
  const standalone: Card[] = [];

  for (const card of sorted) {
    if (card.kind === 'explanation' && card.parentCardId && parents.has(card.parentCardId)) {
      const list = attached.get(card.parentCardId) ?? [];
      list.push(card);
      attached.set(card.parentCardId, list);
    } else {
      standalone.push(card);
    }
  }

  return standalone.flatMap((card) => [card, ...(attached.get(card.id) ?? [])]);
}

/**
 * Scoping is the change that actually keeps the panel usable: across six
 * volumes the full list runs to hundreds of entries, and collapsing alone still
 * leaves hundreds of rows to scroll.
 */
function PanelHeader({
  scope,
  onScopeChange,
  filter,
  onFilterChange,
  total,
  showing,
  anyExpanded,
  onCollapseAll,
}: {
  scope: PanelScope;
  onScopeChange: (scope: PanelScope) => void;
  filter: string;
  onFilterChange: (value: string) => void;
  total: number;
  showing: number;
  anyExpanded: boolean;
  onCollapseAll: (collapsed: boolean) => void;
}) {
  const tabs: [PanelScope, string, string][] = [
    ['visible', 'Visible', 'Cards anchored to what is on screen, following the reader as it scrolls'],
    ['section', 'Section', 'Every card in the chapter or bāb you are reading'],
    ['all', 'All', 'Every card in the book, in the order they occur'],
  ];

  return (
    <div className="no-select shrink-0 border-b border-rule bg-white/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-rule text-[11px]">
          {tabs.map(([id, label, hint], index) => (
            <button
              key={id}
              onClick={() => onScopeChange(id)}
              title={hint}
              aria-pressed={scope === id}
              className={`px-2 py-1 ${index > 0 ? 'border-l border-rule' : ''} ${
                scope === id ? 'bg-accent text-white' : 'bg-white text-muted hover:bg-parchment'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <span className="text-[11px] text-muted">
          {scope === 'all' ? `${showing} of ${total}` : `${showing} here`}
        </span>

        {total > 0 && (
          <button
            onClick={() => onCollapseAll(anyExpanded)}
            className="ml-auto rounded px-2 py-1 text-[11px] text-muted hover:bg-rule"
          >
            {anyExpanded ? 'Collapse all' : 'Expand all'}
          </button>
        )}
      </div>

      {scope === 'all' && total > 0 && (
        <input
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          placeholder="Filter by Arabic or English…"
          className="mt-2 w-full rounded-md border border-rule bg-white px-2 py-1 text-[12px] outline-none focus:border-accent"
        />
      )}
    </div>
  );
}

/**
 * A running total for the session.
 *
 * This is the part that stops the cost problem recurring: a cost that is
 * visible gets managed, one that arrives on a monthly statement does not.
 */
function SessionTotals({ stats }: { stats: SessionStats }) {
  if (stats.requests === 0) return null;

  const paid = stats.requestsByProvider.anthropic;
  const free = stats.requestsByProvider.gemini;

  return (
    <div className="no-select shrink-0 border-t border-rule bg-white/80 px-3 py-2 text-[11px] text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-ink">This session</span>
        <span>
          {stats.requests} translation{stats.requests === 1 ? '' : 's'}
        </span>
        {paid > 0 && (
          <span title="Estimated from the token counts the API reported">
            Claude: {paid} · ${stats.costUsd.toFixed(stats.costUsd < 0.01 ? 4 : 3)}
          </span>
        )}
        {free > 0 && (
          <span title="Gemini free-tier usage is counted in requests, not currency. Your current limits are shown in Google AI Studio.">
            Gemini: {free} request{free === 1 ? '' : 's'} (free tier)
          </span>
        )}
        {stats.cacheReadTokens > 0 && (
          <span className="rounded bg-emerald-50 px-1.5 text-emerald-800">
            {stats.cacheReadTokens.toLocaleString()} tokens from cache
          </span>
        )}
      </div>
    </div>
  );
}
