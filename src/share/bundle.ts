import type {
  Block,
  Entity,
  ExplanationCard,
  HadithRecord,
  Mark,
  SharhCard,
  TocNode,
  TranslationCard,
} from '../types';
import type { StoredNarratorProfile } from '../biography/narratorProfile';
import type { PageMeta } from '../platform/storage/StorageAdapter';

// What a shared chapter is, on the wire.
//
// ---------------------------------------------------------------------------
// The unit is a chapter, and that is a licensing decision before it is a
// technical one
//
// A bundle carries book text. The text is somebody's edition — Ibn ʿUthaymīn
// died in 2001 — and putting it where a stranger can fetch it is
// redistribution however small the file is. Sharing one bāb with a study circle
// is a different act from publishing six volumes, and the whole shape of this
// format follows from wanting the first and not the second: the range is a
// chapter, the id is unguessable, and the file is encrypted so that what
// actually sits in the public repository is opaque bytes rather than Arabic.
//
// ---------------------------------------------------------------------------
// Ship pointers, not databases
//
// The temptation is to bundle the reference works so the visitor gets the full
// experience. That is the wrong trade twice over: it is megabytes, and it is
// redistributing datasets whose licences were examined one at a time (see
// docs/RESOURCES.md). So `resolved` holds only the records the shared range
// actually reaches — a chapter names perhaps thirty narrators — and nothing
// from the Qurʾān layer travels at all, because every install already has the
// muṣḥaf, its translation, and the āyah data seeded locally. Verse tapping,
// verse translation and tafsīr therefore work in a shared view at no cost in
// bundle size, which is why they are absent from this type.
// ---------------------------------------------------------------------------

/**
 * Bumped when a field changes meaning or disappears.
 *
 * A bundle is a file somebody else holds a link to, possibly for years, so this
 * is a real compatibility boundary rather than a formality: the reader refuses
 * a version it does not know instead of rendering a half-understood chapter.
 */
export const SHARE_VERSION = 1;

/**
 * The records a shared range points at, each collected once.
 *
 * Amendment 18 lists `gradings` separately from `hadithTexts`. They are one
 * store here because `HadithRecord` already carries its own `gradings` — a
 * narration and the scholars' verdicts on it arrive together and are cached
 * together, and splitting them on the way out would only have to be rejoined
 * on the way in.
 */
export interface ResolvedRefs {
  /** Only those named in the range. */
  narrators: StoredNarratorProfile[];
  /** Only those quoted in the range, with their gradings attached. */
  hadiths: HadithRecord[];
}

export interface ShareSource {
  bookId: string;
  shamelaId: number;
  title: string;
  author: string;
  publisher: string;
}

export interface ShareBundle {
  version: number;
  id: string;
  /** "Riyāḍ aṣ-Ṣāliḥīn — Bāb al-Ikhlāṣ". Shown in the banner. */
  title: string;
  sourceBook: ShareSource;
  createdAt: number;

  blocks: Block[];
  /**
   * Not in the amendment's list, and not optional in practice: the reader
   * prints ج/ص in the header and offers jump-by-printed-page, both of which
   * read this. Three numbers per page, so it costs nothing to carry.
   */
  pageMeta: PageMeta[];
  /**
   * Also absent from the amendment's list. Without it the contents drawer is
   * empty and the header cannot name the section being read, which is the one
   * piece of orientation a visitor arriving cold most needs.
   */
  tocNodes: TocNode[];

  cards: TranslationCard[];
  explanations: ExplanationCard[];
  /**
   * Retrieved commentary. A card kind the amendment predates; it renders in the
   * same panel as the others and would be a visible hole if it were dropped.
   */
  sharh: SharhCard[];
  marks: Mark[];
  /** Pre-resolved, so no detection pass runs in a shared view. */
  entities: Entity[];

  resolved: ResolvedRefs;
}

/**
 * Is this actually one of our bundles?
 *
 * A fetch can return an HTML error page, a truncated file, or — once decryption
 * is in the path — plausible bytes from a corrupted transfer. Every one of
 * those must reach the reader as "this link is broken", never as a chapter with
 * silently missing halves. Arrays are checked for presence and element shape
 * rather than validated field by field: the bundle was written by this same
 * code, so the realistic failure is wholesale, not a single bad offset.
 */
export function isShareBundle(value: unknown): value is ShareBundle {
  if (value === null || typeof value !== 'object') return false;
  const candidate = value as Partial<ShareBundle>;

  if (typeof candidate.version !== 'number') return false;
  if (typeof candidate.id !== 'string' || candidate.id === '') return false;
  if (typeof candidate.title !== 'string') return false;
  if (typeof candidate.createdAt !== 'number') return false;

  const source = candidate.sourceBook;
  if (
    source === null ||
    typeof source !== 'object' ||
    typeof source.bookId !== 'string' ||
    typeof source.title !== 'string'
  ) {
    return false;
  }

  const lists: (keyof ShareBundle)[] = [
    'blocks',
    'pageMeta',
    'tocNodes',
    'cards',
    'explanations',
    'sharh',
    'marks',
    'entities',
  ];
  for (const key of lists) {
    if (!Array.isArray(candidate[key])) return false;
  }

  // The one element-level check worth making. Blocks are what the whole view
  // renders, and a block with no id or no text would fail deep inside the
  // virtualized list rather than here.
  if (
    !candidate.blocks!.every(
      (block: Partial<Block>) =>
        typeof block?.id === 'string' && typeof block?.text === 'string',
    )
  ) {
    return false;
  }

  const resolved = candidate.resolved;
  if (
    resolved === null ||
    typeof resolved !== 'object' ||
    !Array.isArray(resolved.narrators) ||
    !Array.isArray(resolved.hadiths)
  ) {
    return false;
  }

  return true;
}

/** Human-readable counts, for the export preview and the share banner. */
export interface ShareStats {
  blocks: number;
  cards: number;
  marks: number;
  entities: number;
  narrators: number;
  hadiths: number;
}

export function statsFor(bundle: ShareBundle): ShareStats {
  return {
    blocks: bundle.blocks.length,
    cards: bundle.cards.length + bundle.explanations.length + bundle.sharh.length,
    marks: bundle.marks.length,
    entities: bundle.entities.length,
    narrators: bundle.resolved.narrators.length,
    hadiths: bundle.resolved.hadiths.length,
  };
}
