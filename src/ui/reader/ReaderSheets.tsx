import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { Block, Entity, TocNode, TranslationCard } from '../../types';
import type { useMarks } from './useMarks';
import type { useExplanations } from './useExplanations';
import { MarginMenu } from './MarginMenu';
import { DictionarySheet } from './DictionarySheet';
import { BiographySheet } from './BiographySheet';
import { useMeaningAvailable } from './useMeaningAvailable';
import {
  entityContext,
  entityText,
} from '../../quran/entityService';
import { EntitySheet } from './EntitySheet';
import type { useSharh } from './useSharh';
import { CardPopover } from './CardPopover';
import type { CardMarker } from './cardLayout';
import { ShareChapter } from './ShareChapter';
import { TocDrawer } from './TocDrawer';
import type { SelectionAnchor } from './selection';
import { SelectionRail } from './SelectionRail';
import type { useTranslator } from './useTranslator';
import type { useWordLookup } from './useWordLookup';
import type { useReaderNavigation } from './useReaderNavigation';

// The reader's sheets and popovers: the selection rail, the biography and
// dictionary sheets, the margin menu, the entity sheet, the card popover,
// Share and the contents drawer, each shown under its own condition, with
// `blockElementFor`, the helper only the rail uses. Moved verbatim from
// ReaderScreen.tsx in restructure Phase 5 step 5h3
// (docs/refactor/plans/phase5-big-ui-files.md).

export function ReaderSheets({
  selection,
  translator,
  dictionary,
  biographyAvailable,
  withSelection,
  setBiography,
  runTranslate,
  explanations,
  setActiveCardId,
  setGloss,
  lookUpWord,
  blocks,
  requestGloss,
  marks,
  biography,
  lookup,
  gloss,
  setLookup,
  visibleBlock,
  marginMenu,
  readOnly,
  addNoteToBlock,
  proposeBatch,
  setMarginMenu,
  entitySheet,
  setEntitySheet,
  runTranslateBlock,
  sharh,
  popover,
  citationFor,
  setPopover,
  showShare,
  shareButtonRef,
  bookId,
  tocNodes,
  activeTocNodeId,
  setShowShare,
  showToc,
  setShowToc,
  jumpToPage,
}: {
  selection: {
    active: boolean;
    singleWord: boolean;
    shortSelection: boolean;
    text: string;
    centerY: number | null;
  };
  translator: ReturnType<typeof useTranslator>;
  dictionary: ReturnType<typeof useWordLookup>['dictionary'];
  biographyAvailable: boolean;
  withSelection: (act: (anchor: SelectionAnchor) => void) => void;
  setBiography: Dispatch<SetStateAction<{ selection: string; anchor: HTMLElement } | null>>;
  runTranslate: (anchor: SelectionAnchor) => Promise<void>;
  explanations: ReturnType<typeof useExplanations>;
  setActiveCardId: Dispatch<SetStateAction<string | null>>;
  setGloss: ReturnType<typeof useWordLookup>['setGloss'];
  lookUpWord: ReturnType<typeof useWordLookup>['lookUpWord'];
  blocks: Block[];
  requestGloss: ReturnType<typeof useWordLookup>['requestGloss'];
  marks: ReturnType<typeof useMarks>;
  biography: { selection: string; anchor: HTMLElement } | null;
  lookup: ReturnType<typeof useWordLookup>['lookup'];
  gloss: ReturnType<typeof useWordLookup>['gloss'];
  setLookup: ReturnType<typeof useWordLookup>['setLookup'];
  visibleBlock: Block | null;
  marginMenu: { block: Block; anchor: HTMLElement } | null;
  readOnly: boolean;
  addNoteToBlock: (block: Block) => Promise<void>;
  proposeBatch: (matnBlockId: string) => void;
  setMarginMenu: Dispatch<SetStateAction<{ block: Block; anchor: HTMLElement } | null>>;
  entitySheet: { entity: Entity; anchor: HTMLElement } | null;
  setEntitySheet: Dispatch<SetStateAction<{ entity: Entity; anchor: HTMLElement } | null>>;
  runTranslateBlock: (block: Block) => Promise<void>;
  sharh: ReturnType<typeof useSharh>;
  popover: { marker: CardMarker; anchor: HTMLElement } | null;
  citationFor: (card: TranslationCard) => string | undefined;
  setPopover: Dispatch<SetStateAction<{ marker: CardMarker; anchor: HTMLElement } | null>>;
  showShare: boolean;
  shareButtonRef: RefObject<HTMLSpanElement | null>;
  bookId: string;
  tocNodes: TocNode[];
  activeTocNodeId: string | null;
  setShowShare: Dispatch<SetStateAction<boolean>>;
  showToc: boolean;
  setShowToc: Dispatch<SetStateAction<boolean>>;
  jumpToPage: ReturnType<typeof useReaderNavigation>['jumpToPage'];
}) {
  const meaningAvailable = useMeaningAvailable(selection.text, selection.singleWord);
  return (
    <>
      {selection.active && (
        <SelectionRail
          singleWord={selection.singleWord}
          shortSelection={selection.shortSelection}
          centerY={selection.centerY}
          busy={translator.busy}
          dictionaryAvailable={dictionary !== null}
          biographyAvailable={biographyAvailable}
          meaningAvailable={meaningAvailable}
          onBiography={() =>
            withSelection((anchor) => {
              const element = blockElementFor(anchor.startBlockId);
              if (element) setBiography({ selection: anchor.sourceText, anchor: element });
            })
          }
          onTranslate={() => withSelection((anchor) => void runTranslate(anchor))}
          onExplain={() =>
            withSelection((anchor) => {
              void explanations.explain(anchor, translator.cards).then((card) => {
                if (card) setActiveCardId(card.id);
              });
            })
          }
          onDictionary={() =>
            withSelection((anchor) => {
              const element = blockElementFor(anchor.startBlockId);
              if (element) {
                setGloss(null);
                lookUpWord(anchor.sourceText, element);
              }
            })
          }
          onMeaning={() =>
            withSelection((anchor) => {
              const element = blockElementFor(anchor.startBlockId);
              const block = blocks.find((entry) => entry.id === anchor.startBlockId);
              if (element && block) {
                // Both results share one sheet, so the dictionary entry is
                // fetched alongside — asking for one never blocks the other.
                if (dictionary) lookUpWord(anchor.sourceText, element);
                void requestGloss(anchor.sourceText, block.text, block.type, element);
              }
            })
          }
          onMarkRead={() => withSelection((anchor) => void marks.markSelection(anchor, 'read'))}
          onMarkSkip={() => withSelection((anchor) => void marks.markSelection(anchor, 'skip'))}
          onClearMarks={() => withSelection((anchor) => void marks.clearMarksIn(anchor))}
        />
      )}

      {biography && (
        <BiographySheet
          selection={biography.selection}
          anchor={biography.anchor}
          onClose={() => setBiography(null)}
        />
      )}

      {lookup && (
        <DictionarySheet
          result={lookup.result}
          gloss={gloss}
          anchor={lookup.anchor}
          onClose={() => {
            setLookup(null);
            setGloss(null);
          }}
          onTranslateEntry={(text) => {
            setLookup(null);
            const block = blocks.find((entry) => entry.id === visibleBlock?.id) ?? blocks[0];
            if (!block) return;
            void translator.translate({
              anchor: {
                startBlockId: block.id,
                startOffset: 0,
                endBlockId: block.id,
                endOffset: block.text.length,
                sourceText: text,
              },
              // The block only gives the card a place; the entry is keyed and
              // sent as its own text (FOUND_ISSUES 26).
              standalone: true,
            });
          }}
        />
      )}

      {marginMenu && !readOnly && (
        <MarginMenu
          block={marginMenu.block}
          anchor={marginMenu.anchor}
          current={marks.marks.find(
            (mark) => mark.scope === 'block' && mark.startBlockId === marginMenu.block.id,
          )}
          onSkip={(block) =>
            void marks.setMark(
              {
                startBlockId: block.id,
                startOffset: 0,
                endBlockId: block.id,
                endOffset: block.text.length,
              },
              'skip',
              'block',
            )
          }
          onRead={(block) =>
            void marks.setMark(
              {
                startBlockId: block.id,
                startOffset: 0,
                endBlockId: block.id,
                endOffset: block.text.length,
              },
              'read',
              'block',
            )
          }
          onClear={(block) => void marks.clearBlock(block)}
          onAddNote={(block) => void addNoteToBlock(block)}
          onTranslateAll={(block) => proposeBatch(block.id)}
          onClose={() => setMarginMenu(null)}
        />
      )}

      {entitySheet && (
        <EntitySheet
          entity={entitySheet.entity}
          anchor={entitySheet.anchor}
          // dorar.net looks a ḥadīth up by its text, not by a number, so the
          // sheet needs the Arabic the entity actually covers.
          sourceText={entityText(entitySheet.entity, blocks)}
          // …and the passage around it, because «وعن أبي هريرة رضي الله عنه
          // قال» sits before the matn. The narrator is what decides which of
          // dorar's records belong to this narration.
          contextText={entityContext(entitySheet.entity, blocks)}
          onClose={() => setEntitySheet(null)}
          onTranslateSurrounding={() => {
            const block = blocks.find(
              (entry) => entry.id === entitySheet.entity.startBlockId,
            );
            if (!block) return;
            void runTranslateBlock(block);
          }}
          // The matn as this book prints it is the search key. Not the
          // reference: the commentary numbers its ḥadīth on its own collection's
          // scheme, and no arithmetic connects the two.
          onSharh={(work) => {
            void sharh.lookup(
              entitySheet.entity,
              work,
              entityText(entitySheet.entity, blocks),
            );
          }}
          // The entity is anchored on the matn block, which is exactly where a
          // commentary range starts.
          onTranslateAll={() => proposeBatch(entitySheet.entity.startBlockId)}
        />
      )}

      {popover && (
        <CardPopover
          marker={popover.marker}
          anchor={popover.anchor}
          cards={translator.cards}
          citationFor={citationFor}
          isStale={translator.isStale}
          onClose={() => setPopover(null)}
          onToggleCollapse={(card) => void translator.setCollapsed(card, !card.collapsed)}
          onRetranslate={(card, options) => void translator.retranslate(card, options)}
          isRetranslating={translator.isRetranslating}
          onTranslateRest={(card) => void translator.translateRest(card)}
          onDelete={(card) => void translator.remove(card)}
          onAddGlossaryTerm={(term) => void translator.addGlossaryTerm(term)}
        />
      )}

      {showShare && shareButtonRef.current && (
        <ShareChapter
          bookId={bookId}
          blocks={blocks}
          tocNodes={tocNodes}
          // The chapter on screen, which is what "share this chapter" means.
          tocNodeId={activeTocNodeId}
          anchor={shareButtonRef.current}
          onClose={() => setShowShare(false)}
        />
      )}

      {showToc && (
        <TocDrawer
          nodes={tocNodes}
          activeNodeId={activeTocNodeId}
          onClose={() => setShowToc(false)}
          onSelect={(node) => {
            setShowToc(false);
            jumpToPage(node.pageIndex);
          }}
        />
      )}
    </>
  );
}

/** The mounted element for a block, for anchoring a sheet to it. */
function blockElementFor(blockId: string): HTMLElement | null {
  const element = document.querySelector(`[data-block-id="${blockId}"]`);
  return element instanceof HTMLElement ? element : null;
}
