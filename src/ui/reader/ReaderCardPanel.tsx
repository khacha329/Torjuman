import type { Dispatch, SetStateAction } from 'react';
import type { useApp } from '../../app/AppContext';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import type { Block, Card } from '../../types';
import type { useMarks } from './useMarks';
import type { useExplanations } from './useExplanations';
import type { useSharh } from './useSharh';
import { CardPanel, type PanelScope } from './CardPanel';
import type { VisibleRange } from './cardLayout';
import type { useTranslator } from './useTranslator';
import type { useReaderNavigation } from './useReaderNavigation';

// The reader's card panel, as the screen renders it beside the text or in the
// bottom sheet: every card kind in one list, and the one place the kinds are
// told apart for collapse and delete (plan Design §8). Moved verbatim from
// ReaderScreen.tsx in restructure Phase 5 step 5h4
// (docs/refactor/plans/phase5-big-ui-files.md).

export function ReaderCardPanel({
  allCards,
  blocks,
  pageMeta,
  translator,
  activeCardId,
  readOnly,
  sharedScope,
  settings,
  settledRange,
  sectionNodeId,
  setSharedScope,
  updateSettings,
  focusCard,
  marks,
  explanations,
  sharh,
  editNote,
}: {
  allCards: Card[];
  blocks: Block[];
  pageMeta: Map<number, PageMeta>;
  translator: ReturnType<typeof useTranslator>;
  activeCardId: string | null;
  readOnly: boolean;
  sharedScope: PanelScope;
  settings: ReturnType<typeof useApp>['settings'];
  settledRange: VisibleRange | null;
  sectionNodeId: string | null;
  setSharedScope: Dispatch<SetStateAction<PanelScope>>;
  updateSettings: ReturnType<typeof useApp>['updateSettings'];
  focusCard: ReturnType<typeof useReaderNavigation>['focusCard'];
  marks: ReturnType<typeof useMarks>;
  explanations: ReturnType<typeof useExplanations>;
  sharh: ReturnType<typeof useSharh>;
  editNote: (card: Card) => Promise<void>;
}) {
  return (
    <CardPanel
      cards={allCards}
      blocks={blocks}
      pageMeta={pageMeta}
      streaming={translator.streaming}
      activeCardId={activeCardId}
      stats={translator.stats}
      scope={readOnly ? sharedScope : settings.panelScope}
      visibleRange={settledRange}
      sectionNodeId={sectionNodeId}
      isStale={translator.isStale}
      onScopeChange={(scope: PanelScope) =>
        readOnly ? setSharedScope(scope) : void updateSettings({ panelScope: scope })
      }
      onFocusCard={focusCard}
      onToggleCollapse={(card) => {
        if (card.kind === 'note') void marks.setCollapsed(card.markId, !card.collapsed);
        else if (card.kind === 'explanation') void explanations.setCollapsed(card, !card.collapsed);
        else if (card.kind === 'sharh') void sharh.setCollapsed(card, !card.collapsed);
        else void translator.setCollapsed(card, !card.collapsed);
      }}
      onCollapseAll={(collapsed) => {
        void translator.setAllCollapsed(collapsed);
        for (const card of marks.noteCards) void marks.setCollapsed(card.markId, collapsed);
        for (const card of explanations.cards) void explanations.setCollapsed(card, collapsed);
        for (const card of sharh.cards) void sharh.setCollapsed(card, collapsed);
      }}
      onRetranslate={(card, options) => void translator.retranslate(card, options)}
      onDelete={(card) => {
        if (card.kind === 'note') void marks.removeMark(card.markId);
        else if (card.kind === 'explanation') void explanations.remove(card);
        else if (card.kind === 'sharh') void sharh.remove(card);
        else void translator.remove(card);
      }}
      onEditNote={(card) => void editNote(card)}
      onAddGlossaryTerm={(term) => void translator.addGlossaryTerm(term)}
    />
  );
}
