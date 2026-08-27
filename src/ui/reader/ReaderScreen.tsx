import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { secrets } from '../../app/secrets';
import { hrefFor } from '../../app/router';
import { parseArabicNumber, toArabicNumerals } from '../../lib/arabic';
import type { PageMeta } from '../../platform/storage/StorageAdapter';
import type { Block, Book, Card, Entity, TocNode, TranslationCard } from '../../types';
import { useMarks } from './useMarks';
import { useExplanations } from './useExplanations';
import { MarginMenu } from './MarginMenu';
import { DictionarySheet, type GlossState } from './DictionarySheet';
import { glossWord } from '../../translation/gloss';
import {
  loadDictionary,
  type Dictionary,
  type LookupResult,
} from '../../dictionary/dictionaryService';
import { isSingleWord } from '../../dictionary/roots';
import {
  ensureEntities,
  entityContext,
  entityText,
  markableByBlock,
} from '../../quran/entityService';
import { EntitySheet } from './EntitySheet';
import { Button, LinkButton, Spinner } from '../common';
import { BlockList, type BlockListHandle } from './BlockList';
import { CardPanel, type PanelScope } from './CardPanel';
import { CardPopover } from './CardPopover';
import {
  buildMarkers,
  coveredBlockIds,
  scopeContaining,
  type CardMarker,
  type VisibleRange,
} from './cardLayout';
import { SearchPanel, type SearchResult } from './SearchPanel';
import { TocDrawer } from './TocDrawer';
import { peekSelection, readSelection, type SelectionAnchor } from './selection';
import { RAIL_WIDTH, SelectionRail } from './SelectionRail';
import { useDebounced } from './useAnimatedList';
import { useTranslator } from './useTranslator';

const WIDE_QUERY = '(min-width: 1024px)';

function useIsWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE_QUERY).matches);
  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return wide;
}

export function ReaderScreen({ bookId }: { bookId: string }) {
  const { storage, settings, updateSettings } = useApp();
  const isWide = useIsWide();

  const [book, setBook] = useState<Book | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [tocNodes, setTocNodes] = useState<TocNode[]>([]);
  const [pageMeta, setPageMeta] = useState<Map<number, PageMeta>>(new Map());
  const [loading, setLoading] = useState(true);

  const [showToc, setShowToc] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [selection, setSelection] = useState({
    active: false,
    singleWord: false,
    centerY: null as number | null,
  });
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [visibleBlock, setVisibleBlock] = useState<Block | null>(null);
  const [visibleRange, setVisibleRange] = useState<VisibleRange | null>(null);
  const [flashBlockId, setFlashBlockId] = useState<string | null>(null);
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
  const restoredRef = useRef(false);

  // Computed up here because the marker handler needs it: the panel being open
  // decides whether a marker tap scrolls the panel or opens a popover.
  const panelVisible = isWide && !settings.panelCollapsed;

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

  const [marginMenu, setMarginMenu] = useState<{
    block: Block;
    anchor: HTMLElement;
  } | null>(null);

  // The dictionary is loaded once per session and held in memory, so a lookup
  // mid-reading is instant and needs neither network nor a model.
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [lookup, setLookup] = useState<{
    result: LookupResult;
    anchor: HTMLElement;
  } | null>(null);
  const [gloss, setGloss] = useState<GlossState | null>(null);

  /** English gloss for a word, in the sense it carries in its sentence. */
  const requestGloss = useCallback(
    async (word: string, sentence: string, blockType: Block['type'], anchorElement: HTMLElement) => {
      setLookup((current) =>
        current ?? {
          result: { surface: word, hits: [], viaFullText: false },
          anchor: anchorElement,
        },
      );
      setGloss({ status: 'loading' });
      try {
        const found = await glossWord(storage, {
          apiKey: secrets.getProviderKey('anthropic'),
          model: 'claude-haiku-4-5',
          word,
          sentence,
          blockType,
        });
        setGloss({ status: 'ready', gloss: found });
      } catch (error) {
        setGloss({
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [storage],
  );

  useEffect(() => {
    let cancelled = false;
    void loadDictionary(storage).then((loaded) => {
      if (!cancelled) setDictionary(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [storage]);

  const lookUpWord = useCallback(
    (word: string, anchorElement: HTMLElement) => {
      if (!dictionary) return;
      setLookup({ result: dictionary.lookup(word), anchor: anchorElement });
    },
    [dictionary],
  );

  /** Translation cards and note cards share the panel. */
  const allCards = useMemo<Card[]>(
    () => [...translator.cards, ...marks.noteCards, ...explanations.cards],
    [translator.cards, marks.noteCards, explanations.cards],
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
  useEffect(() => {
    if (!book || blocks.length === 0) return;
    let cancelled = false;
    void ensureEntities(storage, book).then((found) => {
      if (!cancelled) setEntities(found);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, book, blocks.length]);

  const entitiesByBlock = useMemo(
    () => markableByBlock(entities, blocks),
    [entities, blocks],
  );

  // Restore the saved reading position once the blocks are in.
  useEffect(() => {
    if (loading || blocks.length === 0 || restoredRef.current) return;
    restoredRef.current = true;
    void storage.getReadingPosition(bookId).then((position) => {
      if (position) {
        requestAnimationFrame(() => listRef.current?.scrollToOrder(position.blockOrder));
      }
    });
  }, [loading, blocks.length, storage, bookId]);

  // Persist it as he reads, throttled so scrolling does not thrash IndexedDB.
  useEffect(() => {
    if (!visibleBlock) return;
    const timer = setTimeout(() => {
      void storage.putReadingPosition({
        bookId,
        blockOrder: visibleBlock.order,
        updatedAt: Date.now(),
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [visibleBlock, storage, bookId]);

  // ------------------------------------------------------------- selection

  /**
   * Track whether a selection exists, so the bottom bar can show.
   *
   * `selectionchange` on `document`, not `pointerup` on the reader: on Android
   * the selection handles are native UI drawn above the WebView, so dragging
   * them delivers no pointer event to the page at all. A pointerup handler
   * fires only on some later, unrelated tap. selectionchange *is* delivered
   * during handle drags, which makes it the only correct signal here.
   *
   * Debounced because it fires continuously during a drag. Nothing is resolved
   * or stored — only whether a selection exists and whether it is one word.
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
      const resolved = readSelection();
      if (!resolved) return;
      act(resolved);
      window.getSelection()?.removeAllRanges();
      setSelection({ active: false, singleWord: false, centerY: null });
    },
    [],
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

      const found = readSelection();
      if (!found || !isSingleWord(found.sourceText)) return;

      const element = target.closest('[data-block-id]');
      if (element instanceof HTMLElement) {
        lookUpWord(found.sourceText, element);
        // The action is unambiguous here, so the sheet opens directly and the
        // rail is skipped. Clearing the selection also takes the system bar
        // with it.
        window.getSelection()?.removeAllRanges();
        setSelection({ active: false, singleWord: false, centerY: null });
      }
    };

    document.addEventListener('dblclick', onDoubleClick);
    return () => document.removeEventListener('dblclick', onDoubleClick);
  }, [dictionary, lookUpWord]);

  const runTranslate = useCallback(
    async (anchor: SelectionAnchor) => {
      const card = await translator.translate({ anchor });
      if (card) {
        setActiveCardId(card.id);
        if (!isWide) setSheetOpen(true);
      }
    },
    [translator, isWide],
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
        if (!isWide) setSheetOpen(true);
      }
    },
    [translator, isWide],
  );

  // ------------------------------------------------------------ navigation

  const flash = useCallback((blockId: string) => {
    setFlashBlockId(blockId);
    setTimeout(() => setFlashBlockId((current) => (current === blockId ? null : current)), 1600);
  }, []);

  const jumpToBlock = useCallback(
    (blockId: string) => {
      const index = blocks.findIndex((block) => block.id === blockId);
      if (index === -1) return;
      listRef.current?.scrollToIndex(index, 'center');
      flash(blockId);
    },
    [blocks, flash],
  );

  const jumpToPage = useCallback(
    (pageIndex: number) => {
      const index = blocks.findIndex(
        (block) => Number(block.pageId.split(':p')[1]) === pageIndex,
      );
      if (index >= 0) listRef.current?.scrollToIndex(index, 'start');
    },
    [blocks],
  );

  const focusCard = useCallback(
    (card: Card) => {
      setActiveCardId(card.id);
      jumpToBlock(card.startBlockId);
    },
    [jumpToBlock],
  );

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

  /**
   * Toggling the panel from the keyboard.
   *
   * Ctrl/Cmd + \ is the editor convention for a side panel, and on a desktop
   * browser this is the reading app's only full-width gesture — there is no
   * equivalent of the phone's sheet handle.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '\\' || !(event.ctrlKey || event.metaKey)) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, [contenteditable]')) return;
      event.preventDefault();
      void updateSettings({ panelCollapsed: !settings.panelCollapsed });
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [settings.panelCollapsed, updateSettings]);

  // --------------------------------------------------------------- divider

  const dragging = useRef(false);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const width = Math.min(Math.max(window.innerWidth - event.clientX, 300), 760);
      void updateSettings({ panelWidth: width });
    };
    const stop = () => {
      dragging.current = false;
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
  }, [updateSettings]);

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
        <p className="text-sm text-muted">That book is not in this library.</p>
        <LinkButton to={{ name: 'library' }}>Back to library</LinkButton>
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
    <CardPanel
      cards={allCards}
      blocks={blocks}
      pageMeta={pageMeta}
      streaming={translator.streaming}
      activeCardId={activeCardId}
      stats={translator.stats}
      scope={settings.panelScope}
      visibleRange={settledRange}
      sectionNodeId={sectionNodeId}
      isStale={translator.isStale}
      onScopeChange={(scope: PanelScope) => void updateSettings({ panelScope: scope })}
      onFocusCard={focusCard}
      onToggleCollapse={(card) => {
        if (card.kind === 'note') void marks.setCollapsed(card.markId, !card.collapsed);
        else if (card.kind === 'explanation') void explanations.setCollapsed(card, !card.collapsed);
        else void translator.setCollapsed(card, !card.collapsed);
      }}
      onCollapseAll={(collapsed) => {
        void translator.setAllCollapsed(collapsed);
        for (const card of marks.noteCards) void marks.setCollapsed(card.markId, collapsed);
        for (const card of explanations.cards) void explanations.setCollapsed(card, collapsed);
      }}
      onRetranslate={(card, options) => void translator.retranslate(card, options)}
      onDelete={(card) => {
        if (card.kind === 'note') void marks.removeMark(card.markId);
        else if (card.kind === 'explanation') void explanations.remove(card);
        else void translator.remove(card);
      }}
      onEditNote={(card) => void editNote(card)}
      onAddGlossaryTerm={(term) => void translator.addGlossaryTerm(term)}
    />
  );

  return (
    // The app shell is English. Only the reading surface itself is RTL, and it
    // sets that on its own blocks — direction is never inherited across here.
    <div dir="ltr" className="ltr-isolate flex h-full flex-col">
      {!hasKey && <NoKeyBanner />}
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-rule bg-white/85 px-3 py-2 backdrop-blur">
        <LinkButton to={{ name: 'library' }} variant="ghost">
          ← Library
        </LinkButton>

        <div className="min-w-0 flex-1">
          <p className="arabic truncate text-sm font-semibold" dir="rtl">
            {book.title}
          </p>
          {activeTocTitle && (
            <p className="arabic truncate text-[11px] text-muted" dir="rtl">
              {activeTocTitle}
            </p>
          )}
        </div>

        {currentMeta && (
          <span className="arabic shrink-0 rounded bg-parchment px-2 py-1 text-xs text-muted" dir="rtl">
            {currentMeta.volume !== null && `ج${toArabicNumerals(currentMeta.volume)} `}
            {currentMeta.printPage !== null && `ص${toArabicNumerals(currentMeta.printPage)}`}
          </span>
        )}

        <JumpToPage pageMeta={pageMeta} onJump={jumpToPage} />

        {marks.readPositions.length > 0 && (
          <ReadMarkNav
            positions={marks.readPositions}
            currentOrder={visibleBlock?.order ?? 0}
            onJump={(order) => listRef.current?.scrollToOrder(order, 'center')}
          />
        )}

        <Button onClick={() => setShowToc(true)}>Contents</Button>
        <Button onClick={() => setShowSearch((value) => !value)}>Search</Button>
        {isWide && (
          <Button
            onClick={() => void updateSettings({ panelCollapsed: !settings.panelCollapsed })}
            title="Ctrl/⌘ + \"
          >
            {settings.panelCollapsed ? 'Show cards' : 'Hide cards'}
          </Button>
        )}
      </header>

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

      <div className="flex min-h-0 flex-1">
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
              onEntityTap={(entity, anchorElement) =>
                setEntitySheet({ entity, anchor: anchorElement })
              }
              marksByBlock={marks.byBlock}
              onMarginTap={(block) => void marks.toggleBlockSkip(block)}
              onMarginHold={(block, anchorElement) =>
                setMarginMenu({ block, anchor: anchorElement })
              }
              flashBlockId={flashBlockId}
              match={match}
              onVisibleBlockChange={setVisibleBlock}
              onVisibleRangeChange={setVisibleRange}
              onMarkerClick={handleMarkerClick}
              handleRef={listRef}
            />
          )}
        </div>

        {showSearch && (
          <div className="w-[min(24rem,80vw)] shrink-0">
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
              onPointerDown={() => {
                dragging.current = true;
                document.body.style.userSelect = 'none';
              }}
              className="w-1.5 shrink-0 cursor-col-resize bg-rule/60 transition hover:bg-accent/40"
              role="separator"
              aria-label="Resize card panel"
            />
            <aside
              className="shrink-0 border-l border-rule bg-parchment"
              style={{ width: settings.panelWidth }}
            >
              {cardPanel}
            </aside>
          </>
        )}

        {/* Collapsed, the panel leaves an edge tab behind. A control that
            disappears along with the thing it controls is how a collapsed
            panel becomes a permanently collapsed one. The divider position is
            remembered, so reopening restores the width it had. */}
        {isWide && settings.panelCollapsed && (
          <button
            onClick={() => void updateSettings({ panelCollapsed: false })}
            title="Show cards (Ctrl/⌘ + \)"
            aria-label="Show cards"
            className="group flex w-5 shrink-0 cursor-pointer items-center justify-center border-l border-rule bg-parchment transition hover:bg-accent/10"
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

      {/* Narrow / portrait: the panel becomes a bottom sheet. */}
      {!isWide && (
        <>
          <button
            onClick={() => setSheetOpen((open) => !open)}
            className="shrink-0 border-t border-rule bg-white py-2 text-sm text-muted"
          >
            {sheetOpen ? '▼ Hide cards' : `▲ Cards (${translator.cards.length})`}
          </button>
          {sheetOpen && (
            <div className="h-[55vh] shrink-0 border-t border-rule bg-parchment">
              {cardPanel}
            </div>
          )}
        </>
      )}

      {selection.active && (
        <SelectionRail
          singleWord={selection.singleWord}
          centerY={selection.centerY}
          busy={translator.busy}
          dictionaryAvailable={dictionary !== null}
          meaningAvailable={navigator.onLine || secrets.getProviderKey('anthropic') !== ''}
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
            });
          }}
        />
      )}

      {marginMenu && (
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
          onDelete={(card) => void translator.remove(card)}
          onAddGlossaryTerm={(term) => void translator.addGlossaryTerm(term)}
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
    </div>
  );
}

/**
 * Jump between passages marked to be read out, for running a session.
 *
 * Navigation only: it moves the scroll position and changes nothing about what
 * is displayed. Nothing is ever hidden or filtered.
 */
function ReadMarkNav({
  positions,
  currentOrder,
  onJump,
}: {
  positions: number[];
  currentOrder: number;
  onJump: (order: number) => void;
}) {
  const previous = [...positions].reverse().find((order) => order < currentOrder);
  const next = positions.find((order) => order > currentOrder);

  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-md border border-rule">
      <button
        onClick={() => previous !== undefined && onJump(previous)}
        disabled={previous === undefined}
        className="px-2 py-1 text-xs text-muted hover:bg-rule disabled:opacity-30"
        title="Previous passage marked to read"
      >
        ↑
      </button>
      <span className="text-[10px] text-muted" title="Passages marked to read">
        {positions.length}
      </span>
      <button
        onClick={() => next !== undefined && onJump(next)}
        disabled={next === undefined}
        className="px-2 py-1 text-xs text-muted hover:bg-rule disabled:opacity-30"
        title="Next passage marked to read"
      >
        ↓
      </button>
    </div>
  );
}

/** The mounted element for a block, for anchoring a sheet to it. */
function blockElementFor(blockId: string): HTMLElement | null {
  const element = document.querySelector(`[data-block-id="${blockId}"]`);
  return element instanceof HTMLElement ? element : null;
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

/** Jump by printed volume/page (ج / ص), the numbers he will have in the book. */
function JumpToPage({
  pageMeta,
  onJump,
}: {
  pageMeta: Map<number, PageMeta>;
  onJump: (pageIndex: number) => void;
}) {
  const [volume, setVolume] = useState('');
  const [page, setPage] = useState('');

  const go = () => {
    const targetPage = parseArabicNumber(page);
    if (targetPage === null) return;
    const targetVolume = parseArabicNumber(volume);

    for (const meta of pageMeta.values()) {
      if (meta.printPage !== targetPage) continue;
      if (targetVolume !== null && meta.volume !== targetVolume) continue;
      onJump(meta.pageIndex);
      return;
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-1 text-xs">
      <span className="arabic text-muted">ج</span>
      <input
        value={volume}
        onChange={(event) => setVolume(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && go()}
        className="w-10 rounded border border-rule px-1 py-1 text-center"
        aria-label="Volume"
      />
      <span className="arabic text-muted">ص</span>
      <input
        value={page}
        onChange={(event) => setPage(event.target.value)}
        onKeyDown={(event) => event.key === 'Enter' && go()}
        className="w-14 rounded border border-rule px-1 py-1 text-center"
        aria-label="Printed page"
      />
      <Button onClick={go}>Go</Button>
    </div>
  );
}
