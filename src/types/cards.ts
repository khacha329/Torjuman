// Cards (translation, note, explanation, sharḥ) and reading marks.
// Re-exported by index.ts: outside types/, import them from `types`.

import type { TranslatedSegment } from './entities';
import type { ProviderId, TranslationErrorKind, TranslationUsage } from './translation';

/**
 * Fields shared by everything that can appear in the right-hand panel.
 * v2 adds HighlightCard and NoteCard alongside TranslationCard; they anchor the
 * same way and render in the same list.
 */
export interface CardBase {
  id: string;
  bookId: string;
  kind: string;
  startBlockId: string;
  startOffset: number; // char offset within the start block
  endBlockId: string;
  endOffset: number;
  createdAt: number;
  /**
   * Presentation only, and persisted so it survives a restart.
   *
   * Collapsing never touches the cache, the anchor, or the card's existence —
   * it is emphatically not a soft delete. A translation the user paid for and
   * may want mid-lesson must never have to be discarded to keep the panel
   * readable.
   */
  collapsed: boolean;
}

export type CardStatus = 'loading' | 'complete' | 'error';

export interface TranslationCard extends CardBase {
  kind: 'translation';
  sourceText: string; // exact Arabic selected
  segments: TranslatedSegment[];
  /**
   * Share of the selected Arabic that came back translated, and whether the
   * passage's closing words did.
   *
   * Truncation already raises an error. This catches the quiet case: a
   * well-formed answer that stopped early, which every other layer accepts as
   * complete. Undefined on cards made before this was measured.
   */
  coverage?: number;
  reachedEnd?: boolean;
  profileId: string;
  promptVersion: number;
  glossaryHash: string;
  /**
   * Which service and which model produced this. Recorded on the card, not
   * just in settings, because the user is preparing lessons he will teach from
   * and needs to know at a glance whether a translation came from the free tier
   * or from Sonnet before he relies on it.
   */
  providerId: ProviderId;
  model: string;
  cacheKey: string;
  status: CardStatus;
  /** Token counts as the provider reported them. */
  usage?: TranslationUsage;
  /** Estimated USD. Null where the provider is billed in requests, not money. */
  costUsd?: number | null;
  /** Raw model output, kept when JSON parsing failed so nothing is lost. */
  rawResponse?: string;
  error?: string;
  /** Distinguishes "your key is wrong" from "wait a minute". */
  errorKind?: TranslationErrorKind;
  usedExternalLookup?: boolean;
  /**
   * Translated as its own text, not as part of the block it is anchored on:
   * the dictionary's "Translate this entry". Its cache key carries a hash of
   * the text, and its request carries no surrounding context, block types,
   * ḥadīth numbers or verses (FOUND_ISSUES 26). Absent on every other card.
   */
  standalone?: boolean;
}

/**
 * A preparation mark: what will be passed over in a session, and what will be
 * read out.
 *
 * The mapping mirrors the user's practice with a printed copy — highlight what
 * you skip, underline what you mention — so there is no new convention to
 * learn. Marks are visual only. They never hide, collapse, reorder or filter
 * anything; the book is read through normally and the marks are interpreted
 * while reading, exactly as pen marks would be.
 */
export interface Mark {
  id: string;
  bookId: string;
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  kind: 'skip' | 'read';
  /**
   * A block mark covers a whole paragraph and comes from the margin; a span
   * mark comes from a selection. Span always wins over block when they
   * overlap — an underlined sentence inside a highlighted paragraph is the
   * intended appearance, not a conflict.
   */
  scope: 'block' | 'span';
  note: string | null;
  createdAt: number;
  /** Only meaningful for marks that carry a note and so appear as cards. */
  collapsed: boolean;
}

/** One block's share of a mark, for rendering. */
export interface MarkRange {
  mark: Mark;
  blockId: string;
  start: number;
  end: number;
}

/**
 * A mark with a note, shown in the card panel.
 *
 * Bare marks are deliberately absent from the panel: a prepared volume holds
 * thousands of them and they would drown the cards.
 */
export interface NoteCard extends CardBase {
  kind: 'note';
  markId: string;
  markKind: Mark['kind'];
  note: string;
  sourceText: string;
}

/** A passage from the user's own library, cited to ج/ص. */
export interface LocalSourceRef {
  bookId: string;
  blockId: string;
  bookTitle: string;
  volume: number | null;
  printPage: number | null;
  excerpt: string;
}

/** A web source. Weaker than a local one, and marked as such. */
export interface WebSourceRef {
  url: string;
  title: string;
  siteName: string;
  /** One or two sentences. This card points at sources; it does not replace them. */
  excerpt: string;
}

/**
 * An answer to "what does this phrase mean", as distinct from "what does it
 * say" — a research question rather than a translation one.
 *
 * It never modifies the translation card it hangs from. It renders beneath it,
 * visually distinct, collapsible, and independently deletable.
 */
export interface ExplanationCard extends CardBase {
  kind: 'explanation';
  /** The translation card this attaches to, when the phrase falls inside one. */
  parentCardId: string | null;
  /** The phrase that was asked about. */
  query: string;
  explanation: string;
  localSources: LocalSourceRef[];
  webSources: WebSourceRef[];
  status: CardStatus;
  providerId: ProviderId;
  model: string;
  usage?: TranslationUsage;
  costUsd?: number | null;
  error?: string;
  errorKind?: TranslationErrorKind;
}

/**
 * A ḥadīth's commentary, retrieved verbatim from an imported sharḥ.
 *
 * The one card kind with no provider, no model, no usage and no cost, because
 * nothing about it is generated. It is a passage from a book the reader
 * imported, located by searching that book for the ḥadīth's own words, and
 * shown in Arabic exactly as the work prints it.
 *
 * That is why it carries `bookTitle` and the matched block ids rather than a
 * `sourceText`: what it holds is a citation, and a reader checking it should be
 * able to find the same words in the same book.
 */
export interface SharhCard extends CardBase {
  kind: 'sharh';
  /** The commentary the passage came from. */
  sourceBookId: string;
  sourceBookTitle: string;
  /** The matn block in the commentary, then the commentary blocks. */
  matnText: string;
  passages: string[];
  /** Independent shingles matched, of how many were tried. Shown, not hidden:
   *  a 2-of-10 match and a 9-of-10 match deserve different confidence. */
  shingleHits: number;
  shinglesTried: number;
  truncated: boolean;
}

export type Card = TranslationCard | NoteCard | ExplanationCard | SharhCard;
