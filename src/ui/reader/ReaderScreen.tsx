import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useReadOnly } from '../../app/readOnly';
import { secrets } from '../../services/secrets';
import { hrefFor } from '../../app/router';
import { toArabicNumerals } from '../../lib/arabic';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import type { Block, Book, Card, Entity, TocNode, TranslationCard } from '../../types';
import { useMarks } from './useMarks';
import { useExplanations } from './useExplanations';
import { ensureBiographyIndexes } from '../../biography/service';
import { ensureNarratorSources } from '../../biography/narratorService';
import { isSingleWord } from '../../dictionary/roots';
import {
  ensureEntities,
  markableByBlock,
} from '../../quran/entityService';
import { useSharh } from './useSharh';
import { useBatchTranslate } from './useBatchTranslate';
import {
  commentaryRange,
  estimateBatch,
  type BatchEstimate,
} from '../../translation/hadithRange';
import { LinkButton, Spinner } from '../kit';
import { BlockList, type BlockListHandle } from './BlockList';
import type { PanelScope } from './CardPanel';
import {
  buildMarkers,
  coveredBlockIds,
  scopeContaining,
  type CardMarker,
  type VisibleRange,
} from './cardLayout';
import { SearchPanel, type SearchResult } from './SearchPanel';
import {
  peekSelection,
  readSelection,
  type SelectionAnchor,
  type SelectionPeek,
} from './selection';
import { useDebounced } from './useAnimatedList';
import { useTranslator } from './useTranslator';
import {
  clampPanelWidth,
  DIVIDER_WIDTH,
  useLayoutMode,
  useViewportWidth,
  RAIL_WIDTH,
} from '../useLayoutMode';
import { useWordLookup } from './useWordLookup';
import { useReadingPosition } from './useReadingPosition';
import { useReaderNavigation } from './useReaderNavigation';
import { usePanelControls } from './usePanelControls';
import { useHeaderHeight } from './useHeaderHeight';
import { ReaderHeader } from './ReaderHeader';
import { CommentaryBars } from './CommentaryBars';
import { ReaderSheets } from './ReaderSheets';
import { ReaderCardPanel } from './ReaderCardPanel';

// The reader. It owns the state its parts share — the book and its blocks,
// the selection, the visible block and range, the open sheet and popover,
// the active card — and the five domain hooks over it (translator, marks,
// explanations, sharḥ, batch), and it lays out the columns: the rail spacer,
// the block list, the search column, the divider and the card panel, or the
// bottom sheet. Its parts (ReaderHeader, CommentaryBars, ReaderSheets,
// ReaderCardPanel) and hooks (useWordLookup, useReadingPosition,
// useReaderNavigation, usePanelControls, useHeaderHeight) take what they use
// as props and parameters of the same names.
//
// It stays at about 850 lines on purpose (restructure Phase 5, Design §6.5
// and Q11 of docs/refactor/plans/phase5-big-ui-files.md). What is left is the
// state those parts share and the code that writes it, the columns' JSX, and
// the props handed to the parts. Two candidates were left here: the data
// loading, because a hook holding the blocks would be called before
// useTranslator and every open would send its storage requests in a different
// order; and the selection tracking, whose doc comment sits above the wrong
// effect (FOUND_ISSUES 30). Splitting further means a context, which was
// rejected (Design §6.3, Q10): its value is new on every render, so every consumer would
// re-render anyway, and its reads are harder to check than a props list.

export function ReaderScreen({ bookId }: { bookId: string }) {
  const { storage, settings, updateSettings, activeProfile, glossary } = useApp();
  // True only inside a shared view. Everything it gates is a control that
  // spends money, needs a key, or writes to a library the viewer does not own.
  const readOnly = useReadOnly();
  // Beside the text or a bottom sheet — decided by whether both fit, not by
  // device class, and switched live on rotation. See src/ui/useLayoutMode.ts.
  const sideBySide = useLayoutMode() === 'beside';
  const viewportWidth = useViewportWidth();

  const [book, setBook] = useState<Book | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tocNodes, setTocNodes] = useState<TocNode[]>([]);
  const [pageMeta, setPageMeta] = useState<Map<number, PageMeta>>(new Map());
  const [loading, setLoading] = useState(true);

  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selection, setSelection] = useState<SelectionPeek>({
    active: false,
    singleWord: false,
    shortSelection: false,
    text: '',
    centerY: null,
  });
  /** The name being looked up, and what the sheet anchors to. */
  const [biography, setBiography] = useState<{
    selection: string;
    anchor: HTMLElement;
  } | null>(null);
  /** Whether any biographical work is imported, so the rail can say so. */
  const [biographyAvailable, setBiographyAvailable] = useState(false);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [visibleBlock, setVisibleBlock] = useState<Block | null>(null);
  const [middleBlock, setMiddleBlock] = useState<Block | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleRange | null>(null);
  const [match, setMatch] = useState<{ blockId: string; range: [number, number] } | null>(null);
  // The anchoring element is kept, not a rect: the panel follows its anchor as
  // the reader scrolls and closes only when that text leaves the viewport.
  const [popover, setPopover] = useState<{
    marker: CardMarker;
    anchor: HTMLElement;
  } | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [entitySheet, setEntitySheet] = useState<{
    entity: Entity;
    anchor: HTMLElement;
  } | null>(null);

  const listRef = useRef<BlockListHandle>(null);

  const shareButtonRef = useRef<HTMLSpanElement>(null);
  const [showShare, setShowShare] = useState(false);
  /**
   * The card panel's scope inside a shared view, defaulting to All.
   *
   * Visible is the right default for the reader's own library: a six-volume
   * commentary holds thousands of cards and scoping them to what is on screen
   * is what keeps the panel usable. A shared chapter is a few hundred blocks
   * and a few dozen cards, so that reasoning does not carry over — and the
   * failure it produces is severe. A visitor lands at the top of the chapter,
   * the first translation is pages further in, and the panel is empty. Nothing
   * tells them a scope control exists, so an empty panel reads as "this share
   * has no translations" — which is the one thing a share exists to deliver.
   *
   * Kept in memory rather than in settings: the scope belongs to this viewing,
   * not to the visitor's own reading preferences, and a shared chapter must not
   * quietly rewrite those. The selector still works; only its default differs.
   */
  const [sharedScope, setSharedScope] = useState<PanelScope>('all');

  // Computed up here because the marker handler needs it: the panel being open
  // decides whether a marker tap scrolls the panel or opens a popover.
  const panelVisible = sideBySide && !settings.panelCollapsed;

  /**
   * What the Visible scope reads, held still while the reader is moving.
   *
   * The live range updates on every frame of a flick. Handing that to the panel
   * is exactly what makes it strobe, so the panel gets the settled value and
   * everything else — the ج/ص margin, the reading position — keeps the live one.
   */
  const settledRange = useDebounced(visibleRange, 220);

  /** The chapter or bāb the reader is inside, for the Section scope. */
  const sectionNodeId = visibleBlock?.tocNodeId ?? null;

  const translator = useTranslator(bookId, blocks, entities);
  const marks = useMarks(bookId, blocks);
  const explanations = useExplanations(bookId, blocks);
  const sharh = useSharh(bookId, blocks);
  const batch = useBatchTranslate(translator.translate);

  /**
   * A batch that has been costed but not started.
   *
   * Held separately from the run itself so the estimate can be shown and
   * declined: the amendment's requirement is that the price is seen BEFORE
   * anything is spent, which means a state between asking and running.
   */
  const [batchProposal, setBatchProposal] = useState<{
    range: Block[];
    estimate: BatchEstimate;
  } | null>(null);

  const proposeBatch = useCallback(
    (matnBlockId: string) => {
      const range = commentaryRange(blocks, matnBlockId);
      if (range.length === 0) return;
      setBatchProposal({
        range,
        estimate: estimateBatch(range, {
          model: activeProfile.model,
          systemPrompt: activeProfile.systemPrompt,
          glossary,
        }),
      });
    },
    [blocks, activeProfile.model, activeProfile.systemPrompt, glossary],
  );

  const [marginMenu, setMarginMenu] = useState<{
    block: Block;
    anchor: HTMLElement;
  } | null>(null);

  const { dictionary, lookup, setLookup, gloss, setGloss, requestGloss, lookUpWord } =
    useWordLookup({ storage });

  /** Every card kind shares the panel, and the anchor fields order them. */
  const allCards = useMemo<Card[]>(
    () => [...translator.cards, ...marks.noteCards, ...explanations.cards, ...sharh.cards],
    [translator.cards, marks.noteCards, explanations.cards, sharh.cards],
  );

  const editNote = useCallback(
    async (card: Card) => {
      const markId = card.kind === 'note' ? card.markId : null;
      if (!markId) return;
      const current = marks.marks.find((mark) => mark.id === markId);
      const next = window.prompt('Note for this passage:', current?.note ?? '');
      if (next === null) return;
      await marks.setNote(markId, next.trim() === '' ? null : next.trim());
    },
    [marks],
  );

  const addNoteToBlock = useCallback(
    async (block: Block) => {
      const existing = marks.marks.find(
        (mark) => mark.scope === 'block' && mark.startBlockId === block.id,
      );
      const next = window.prompt('Note for this passage:', existing?.note ?? '');
      if (next === null) return;

      if (existing) {
        await marks.setNote(existing.id, next.trim() === '' ? null : next.trim());
        return;
      }
      // A note with no mark yet implies skip, the default block-scope mark.
      await marks.setMark(
        {
          startBlockId: block.id,
          startOffset: 0,
          endBlockId: block.id,
          endOffset: block.text.length,
        },
        'skip',
        'block',
        next.trim() === '' ? null : next.trim(),
      );
    },
    [marks],
  );

  // Until a key exists, the reader carries a quiet persistent prompt rather
  // than letting the first Translate tap fail with an error.
  const [hasKey, setHasKey] = useState(() => secrets.hasAnyProviderKey());
  useEffect(() => {
    const check = () => setHasKey(secrets.hasAnyProviderKey());
    window.addEventListener('focus', check);
    return () => window.removeEventListener('focus', check);
  }, []);

  // ------------------------------------------------------------------ load

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [loadedBook, loadedBlocks, loadedToc, meta] = await Promise.all([
        storage.getBook(bookId),
        storage.listBlocks(bookId),
        storage.listTocNodes(bookId),
        storage.listPageMeta(bookId),
      ]);
      if (cancelled) return;

      setBook(loadedBook ?? null);
      setBlocks(loadedBlocks);
      setTocNodes(loadedToc);
      setPageMeta(new Map(meta.map((entry) => [entry.pageIndex, entry])));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [storage, bookId]);

  // Entities are derived data, so a book imported before detection existed —
  // or restored from an older backup — builds them here on first open.
  //
  // Never in a shared view. Its entities travelled with the bundle already
  // resolved, and detection is not a safe thing to re-run over them: it reads
  // the imported biographical works to decide which names to mark, a visitor
  // has none, and `regenerateEntities` would therefore replace a marked-up
  // chapter with an unmarked one. Read what the bundle carried and stop.
  useEffect(() => {
    if (!book || blocks.length === 0) return;
    let cancelled = false;
    const load = readOnly ? storage.listEntities(book.id) : ensureEntities(storage, book);
    void load.then((found) => {
      if (!cancelled) setEntities(found);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, book, blocks.length, readOnly]);

  const entitiesByBlock = useMemo(
    () => markableByBlock(entities, blocks),
    [entities, blocks],
  );

  useReadingPosition({ storage, bookId, loading, blocks, visibleBlock, listRef });

  // ------------------------------------------------------------- selection

  // Checked once per book rather than on every selection: the rail needs to
  // know whether to offer the action at all, and importing a biographical work
  // mid-read is not a thing that happens.
  useEffect(() => {
    let cancelled = false;
    // Indexes any biographical work imported but not yet indexed, then reports
    // whether the action has anything to search.
    void ensureBiographyIndexes(storage).then(({ indexed }) => {
      if (!cancelled) setBiographyAvailable(indexed);
    });
    // Taqrīb is read from its body rather than its contents, so it is built
    // here rather than by the index above, which refuses it — correctly.
    void ensureNarratorSources(storage).then(({ available }) => {
      if (!cancelled && available) setBiographyAvailable(true);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  /**
   * Track whether a selection exists, so the selection rail can show.
   *
   * `selectionchange` on `document`, not `pointerup` on the reader: on Android
   * the selection handles are native UI drawn above the WebView, so dragging
   * them delivers no pointer event to the page at all. A pointerup handler
   * fires only on some later, unrelated tap. selectionchange *is* delivered
   * during handle drags, which makes it the only correct signal here.
   *
   * Debounced because it fires continuously during a drag. Nothing is resolved
   * against the stored blocks here: `peekSelection` keeps only what the rail
   * needs to show, choose its actions and place itself — whether a selection
   * exists, whether it is one word or short enough to be a name, its text, and
   * its vertical centre.
   */
  useEffect(() => {
    let timer: number;

    const onSelectionChange = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setSelection(peekSelection()), 150);
    };

    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, []);

  /** Run an action against the selection as it stands right now. */
  const withSelection = useCallback(
    (act: (anchor: SelectionAnchor) => void) => {
      const resolved = readSelection(blocks);
      if (!resolved) return;
      act(resolved);
      window.getSelection()?.removeAllRanges();
      setSelection({
        active: false,
        singleWord: false,
        shortSelection: false,
        text: '',
        centerY: null,
      });
    },
    [blocks],
  );

  /**
   * Double-tap opens the dictionary directly.
   *
   * No new gesture is introduced: selecting a word on double-click is already
   * native browser behaviour, so this hooks the resulting selection rather than
   * reimplementing word detection.
   */
  useEffect(() => {
    const onDoubleClick = (event: MouseEvent) => {
      if (!dictionary) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.('[data-block-id]')) return;

      const found = readSelection(blocks);
      if (!found || !isSingleWord(found.sourceText)) return;

      const element = target.closest('[data-block-id]');
      if (element instanceof HTMLElement) {
        lookUpWord(found.sourceText, element);
        // The action is unambiguous here, so the sheet opens directly and the
        // rail is skipped. Clearing the selection also takes the system bar
        // with it.
        window.getSelection()?.removeAllRanges();
        setSelection({
        active: false,
        singleWord: false,
        shortSelection: false,
        text: '',
        centerY: null,
      });
      }
    };

    document.addEventListener('dblclick', onDoubleClick);
    return () => document.removeEventListener('dblclick', onDoubleClick);
  }, [blocks, dictionary, lookUpWord]);

  const runTranslate = useCallback(
    async (anchor: SelectionAnchor) => {
      const card = await translator.translate({ anchor });
      if (card) {
        setActiveCardId(card.id);
        if (!sideBySide) setSheetOpen(true);
      }
    },
    [translator, sideBySide],
  );

  /** "Translate the surrounding passage" from an entity sheet. */
  const runTranslateBlock = useCallback(
    async (block: Block) => {
      const card = await translator.translate({
        anchor: {
          startBlockId: block.id,
          startOffset: 0,
          endBlockId: block.id,
          endOffset: block.text.length,
          sourceText: block.text,
        },
      });
      if (card) {
        setActiveCardId(card.id);
        if (!sideBySide) setSheetOpen(true);
      }
    },
    [translator, sideBySide],
  );

  // ------------------------------------------------------------ navigation

  const { flashBlockId, flash, jumpToBlock, jumpToPage, focusCard } =
    useReaderNavigation({ blocks, listRef, setActiveCardId });

  // Text→panel sync now runs through the margin marker rather than a tap on
  // the paragraph itself. Tapping the text is how you place a cursor before
  // selecting, so making it also move the panel fought with selection.

  const translatedBlockIds = useMemo(
    () => coveredBlockIds(translator.cards, blocks),
    [translator.cards, blocks],
  );

  const markers = useMemo(() => buildMarkers(translator.cards), [translator.cards]);

  const citationFor = useMemo(() => {
    const byId = new Map(blocks.map((block) => [block.id, block]));
    return (card: TranslationCard): string | undefined => {
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

  /**
   * Tapping a margin marker.
   *
   * With the panel open the panel is the right place to answer; with it closed
   * a popover keeps the reader's layout intact rather than reflowing the page
   * mid-sentence for what is meant to be a glance.
   */
  const handleMarkerClick = useCallback(
    (marker: CardMarker, anchorElement: HTMLElement) => {
      const first = marker.cards[0];
      if (!first) return;

      if (panelVisible) {
        // A marker must always open its card, including one the active scope
        // filters out — a marker that silently does nothing is a marker the
        // user reasonably concludes is broken. So the panel switches to the
        // narrowest scope that holds it rather than failing.
        const holding = scopeContaining(first, {
          blocks,
          visible: settledRange,
          tocNodeId: sectionNodeId,
        });
        if (holding !== settings.panelScope) {
          void updateSettings({ panelScope: holding });
        }

        const card = translator.cards.find((entry) => entry.id === first.id);
        if (card?.collapsed) void translator.setCollapsed(card, false);
        setActiveCardId(first.id);
        flash(marker.blockId);
        return;
      }

      setPopover({ marker, anchor: anchorElement });
    },
    [
      blocks,
      flash,
      panelVisible,
      sectionNodeId,
      settledRange,
      settings.panelScope,
      translator,
      updateSettings,
    ],
  );

  const { dragging, dragWidth } = usePanelControls({ settings, updateSettings });

  const { headerRef, headerHeight } = useHeaderHeight({ loading, book });

  /**
   * A side column that stays on screen while the page scrolls: it starts under
   * the sticky header and fills the rest of the screen, scrolling on its own.
   */
  const stickyColumn = { top: headerHeight, height: `calc(100dvh - ${headerHeight}px)` };

  // ----------------------------------------------------------------- render

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner label="Opening book…" />
      </div>
    );
  }

  if (!book) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted">
          {readOnly ? 'This shared chapter could not be opened.' : 'That book is not in this library.'}
        </p>
        {!readOnly && <LinkButton to={{ name: 'library' }}>Back to library</LinkButton>}
      </div>
    );
  }

  const currentPageIndex = visibleBlock
    ? Number(visibleBlock.pageId.split(':p')[1] ?? 0)
    : 0;
  const currentMeta = pageMeta.get(currentPageIndex);
  const activeTocNodeId = visibleBlock?.tocNodeId ?? null;
  const activeTocTitle = tocNodes.find((node) => node.id === activeTocNodeId)?.title;

  const cardPanel = (
    <ReaderCardPanel
      allCards={allCards}
      blocks={blocks}
      pageMeta={pageMeta}
      translator={translator}
      activeCardId={activeCardId}
      readOnly={readOnly}
      sharedScope={sharedScope}
      settings={settings}
      settledRange={settledRange}
      sectionNodeId={sectionNodeId}
      setSharedScope={setSharedScope}
      updateSettings={updateSettings}
      focusCard={focusCard}
      marks={marks}
      explanations={explanations}
      sharh={sharh}
      editNote={editNote}
    />
  );

  return (
    // The app shell is English. Only the reading surface itself is RTL, and it
    // sets that on its own blocks — direction is never inherited across here.
    //
    // min-h-full, not h-full: the page grows with the text and the document
    // scrolls (see BlockList for why). A fixed-height root would also stop
    // the sticky header and side columns sticking after the first screen,
    // since a sticky element never leaves its parent's box.
    <div dir="ltr" className="ltr-isolate flex min-h-full flex-col">
      {/* Amendment 18: "No API key required or requested." A visitor was sent a
          chapter to read, not invited to set up a translation provider. */}
      {!hasKey && !readOnly && <NoKeyBanner />}
      <ReaderHeader
        headerRef={headerRef}
        readOnly={readOnly}
        book={book}
        activeTocTitle={activeTocTitle}
        currentMeta={currentMeta}
        pageMeta={pageMeta}
        jumpToPage={jumpToPage}
        marks={marks}
        visibleBlock={visibleBlock}
        middleBlock={middleBlock}
        listRef={listRef}
        setShowToc={setShowToc}
        setShowSearch={setShowSearch}
        shareButtonRef={shareButtonRef}
        setShowShare={setShowShare}
        sideBySide={sideBySide}
        updateSettings={updateSettings}
        settings={settings}
      />

      {book.importStatus !== 'complete' && (
        <p className="shrink-0 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
          This book is still importing — {book.fetchedPages.toLocaleString()} of{' '}
          {book.totalPages.toLocaleString()} pages are available so far.
        </p>
      )}

      {translator.notice && (
        <p className="flex shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-900">
          {translator.notice}
          <button
            onClick={() => translator.setNotice(null)}
            className="ml-auto rounded px-1.5 hover:bg-amber-100"
          >
            Dismiss
          </button>
        </p>
      )}

      <CommentaryBars
        sharh={sharh}
        batchProposal={batchProposal}
        batch={batch}
        activeProfile={activeProfile}
        setBatchProposal={setBatchProposal}
      />

      <div className="flex flex-1">
        {/* The rail's width, reserved rather than floated over.
            The Arabic column must measure the same with a selection as
            without one — text that reflows the moment you select it is worse
            than a permanently narrower column, and this way it is neither. */}
        <div
          className="shrink-0"
          style={{ width: `calc(${RAIL_WIDTH}px + env(safe-area-inset-left, 0px))` }}
          aria-hidden
        />

        <div className="min-w-0 flex-1">
          {blocks.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted">
              No text has been imported for this book yet.
            </div>
          ) : (
            <BlockList
              blocks={blocks}
              pageMeta={pageMeta}
              fontFamily={settings.fontFamily}
              fontSize={settings.fontSize}
              lineHeight={settings.lineHeight}
              translatedBlockIds={translatedBlockIds}
              markers={markers}
              entitiesByBlock={entitiesByBlock}
              onEntityTap={(entity, anchorElement) => {
                // A name opens the biographical lookup rather than the
                // verse/ḥadīth sheet — both kinds of it. `label` is the name as
                // the book printed it; `reference` is its folded form.
                //
                // The selection passed is the printed form deliberately: the
                // lookup re-folds it, and the sheet's header shows the reader
                // the words they actually tapped rather than a normalised
                // string they never wrote.
                if (entity.type === 'narrator' || entity.type === 'person') {
                  setBiography({
                    selection: entity.label ?? entity.reference,
                    anchor: anchorElement,
                  });
                  return;
                }
                setEntitySheet({ entity, anchor: anchorElement });
              }}
              marksByBlock={marks.byBlock}
              // The author's marks still render in the margin; the margin just
              // stops being a control. Undefined rather than a no-op so the
              // band also leaves the tab order — see MarginTarget.
              onMarginTap={readOnly ? undefined : (block) => void marks.toggleBlockSkip(block)}
              onMarginHold={
                readOnly
                  ? undefined
                  : (block, anchorElement) => setMarginMenu({ block, anchor: anchorElement })
              }
              flashBlockId={flashBlockId}
              match={match}
              onVisibleBlockChange={setVisibleBlock}
              onMiddleBlockChange={setMiddleBlock}
              onVisibleRangeChange={setVisibleRange}
              onMarkerClick={handleMarkerClick}
              handleRef={listRef}
              topInset={headerHeight}
            />
          )}
        </div>

        {showSearch && (
          <div className="sticky w-[min(24rem,80vw)] shrink-0 self-start" style={stickyColumn}>
            <SearchPanel
              bookId={bookId}
              pageMeta={pageMeta}
              onClose={() => setShowSearch(false)}
              onJump={(result: SearchResult) => {
                if (result.range) setMatch({ blockId: result.block.id, range: result.range });
                jumpToBlock(result.block.id);
              }}
            />
          </div>
        )}

        {panelVisible && (
          <>
            <div
              onPointerDown={(event) => {
                dragging.current = true;
                document.body.style.userSelect = 'none';
                // Captured, so a drag that leaves the narrow divider keeps
                // coming to it; the events still bubble to the window
                // listeners in usePanelControls, which do the resizing.
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              // touch-none: without it the browser may take a finger drag on
              // the divider as a pan and cancel it (FOUND_ISSUES 27). Only the
              // divider, so the page still scrolls under a finger elsewhere.
              className="sticky shrink-0 cursor-col-resize touch-none self-start bg-rule/60 transition hover:bg-accent/40"
              style={{ ...stickyColumn, width: DIVIDER_WIDTH }}
              role="separator"
              aria-label="Resize card panel"
            />
            <aside
              className="sticky shrink-0 self-start overflow-hidden border-l border-rule bg-parchment"
              // A sticky column, scrolling on its own: the page scrolls the
              // text, and the cards must not scroll away with it. Clamped to
              // what this screen can spare; the saved width is untouched, so a
              // desktop's wide panel stays wide there.
              style={{ ...stickyColumn, width: clampPanelWidth(dragWidth ?? settings.panelWidth, viewportWidth) }}
            >
              {cardPanel}
            </aside>
          </>
        )}

        {/* Collapsed, the panel leaves an edge tab behind. A control that
            disappears along with the thing it controls is how a collapsed
            panel becomes a permanently collapsed one. The divider position is
            remembered, so reopening restores the width it had. */}
        {sideBySide && settings.panelCollapsed && (
          <button
            onClick={() => void updateSettings({ panelCollapsed: false })}
            title="Show cards (Ctrl/⌘ + \)"
            aria-label="Show cards"
            className="group sticky flex w-5 shrink-0 cursor-pointer items-center justify-center self-start border-l border-rule bg-parchment transition hover:bg-accent/10"
            style={stickyColumn}
          >
            <span className="flex flex-col items-center gap-1.5 text-[10px] text-muted group-hover:text-accent">
              <span aria-hidden>‹</span>
              <span className="[writing-mode:vertical-rl] tracking-wide">
                Cards{allCards.length > 0 ? ` (${allCards.length})` : ''}
              </span>
            </span>
          </button>
        )}
      </div>

      {/* Narrow / portrait: the panel becomes a bottom sheet, held to the
          bottom of the screen — the page is as long as the book, and the end
          of it is not where the cards belong. */}
      {!sideBySide && (
        <div className="sticky bottom-0 z-30 flex flex-col">
          <button
            onClick={() => setSheetOpen((open) => !open)}
            className="shrink-0 border-t border-rule bg-white py-2 text-sm text-muted"
          >
            {sheetOpen ? '▼ Hide cards' : `▲ Cards (${allCards.length})`}
          </button>
          {sheetOpen && (
            <div className="h-[55vh] shrink-0 border-t border-rule bg-parchment">
              {cardPanel}
            </div>
          )}
        </div>
      )}

      <ReaderSheets
        selection={selection}
        translator={translator}
        dictionary={dictionary}
        biographyAvailable={biographyAvailable}
        withSelection={withSelection}
        setBiography={setBiography}
        runTranslate={runTranslate}
        explanations={explanations}
        setActiveCardId={setActiveCardId}
        setGloss={setGloss}
        lookUpWord={lookUpWord}
        blocks={blocks}
        requestGloss={requestGloss}
        marks={marks}
        biography={biography}
        lookup={lookup}
        gloss={gloss}
        setLookup={setLookup}
        visibleBlock={visibleBlock}
        marginMenu={marginMenu}
        readOnly={readOnly}
        addNoteToBlock={addNoteToBlock}
        proposeBatch={proposeBatch}
        setMarginMenu={setMarginMenu}
        entitySheet={entitySheet}
        setEntitySheet={setEntitySheet}
        runTranslateBlock={runTranslateBlock}
        sharh={sharh}
        popover={popover}
        citationFor={citationFor}
        setPopover={setPopover}
        showShare={showShare}
        shareButtonRef={shareButtonRef}
        bookId={bookId}
        tocNodes={tocNodes}
        activeTocNodeId={activeTocNodeId}
        setShowShare={setShowShare}
        showToc={showToc}
        setShowToc={setShowToc}
        jumpToPage={jumpToPage}
      />
    </div>
  );
}

/** Unobtrusive, persistent, and dismissable only by actually adding a key. */
function NoKeyBanner() {
  return (
    <div
      dir="ltr"
      className="ltr-isolate flex shrink-0 flex-wrap items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-900"
    >
      <span>
        No translation key yet. Gemini's is free, needs no payment method, and takes about
        two minutes.
      </span>
      <a
        href={hrefFor({ name: 'settings' })}
        className="rounded border border-emerald-300 bg-white px-2 py-0.5 font-medium hover:bg-emerald-100"
      >
        Add a key
      </a>
    </div>
  );
}
