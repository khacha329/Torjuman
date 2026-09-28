import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Block, HadithRecord, TocNode } from '../types';
import type { StoredNarratorProfile } from '../biography/narratorProfile';
import { SHARE_VERSION, type ShareBundle } from './bundle';
import { generateShareId } from './shareLink';

// Assembling a shared chapter out of the reader's own library.
//
// ---------------------------------------------------------------------------
// Two rules govern everything here
//
//   Both ends in range.  A card, mark or entity is carried only when its start
//                        AND end block are both inside the range. One that
//                        straddles the boundary belongs half to a chapter that
//                        is not being shared, and shipping it would leave the
//                        visitor an anchor pointing at a block they do not
//                        have — which fails silently, deep inside the
//                        virtualized list, rather than here.
//
//   Reached, not owned.  `resolved` holds the reference records the range
//                        actually touches and nothing else. It is the
//                        difference between a bundle of a few hundred kilobytes
//                        and one carrying a rijāl database — and between citing
//                        a licensed dataset and redistributing it.
// ---------------------------------------------------------------------------

/** Where a share's range came from, for the title and for the caller's UI. */
export interface ShareRange {
  /** The blocks to carry, in reading order. */
  blocks: Block[];
  /** The chapter heading this range corresponds to, when it is a chapter. */
  label: string | null;
}

/**
 * Every descendant of a TOC node, including itself.
 *
 * A bāb's blocks are not all filed under the bāb: a sub-heading inside it gets
 * its own node, and its blocks point at that. Collecting the subtree is what
 * makes "share this chapter" mean the chapter rather than its first paragraph.
 */
export function tocSubtree(nodes: TocNode[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const list = childrenOf.get(node.parentId);
    if (list) list.push(node.id);
    else childrenOf.set(node.parentId, [node.id]);
  }

  const ids = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length > 0) {
    for (const child of childrenOf.get(queue.pop()!) ?? []) {
      if (ids.has(child)) continue;
      ids.add(child);
      queue.push(child);
    }
  }
  return ids;
}

/** The blocks belonging to a chapter, in reading order. */
export function chapterRange(
  blocks: Block[],
  tocNodes: TocNode[],
  tocNodeId: string,
): ShareRange {
  const subtree = tocSubtree(tocNodes, tocNodeId);
  return {
    blocks: blocks.filter((block) => block.tocNodeId !== null && subtree.has(block.tocNodeId)),
    label: tocNodes.find((node) => node.id === tocNodeId)?.title ?? null,
  };
}

/** An explicit span of the book, by block order, for a range that is not a chapter. */
export function orderRange(blocks: Block[], startOrder: number, endOrder: number): ShareRange {
  const [low, high] = startOrder <= endOrder ? [startOrder, endOrder] : [endOrder, startOrder];
  return {
    blocks: blocks.filter((block) => block.order >= low && block.order <= high),
    label: null,
  };
}

function pageIndexOf(block: Block): number {
  return Number(block.pageId.split(':p')[1] ?? 0);
}

/**
 * Drop the author's billing telemetry from a card before it travels.
 *
 * `costUsd` and `usage` are what a translation cost the person who made it, and
 * `rawResponse` is the unparsed model output kept when JSON parsing failed.
 * None of it is about the text. In the author's own library the cost is the
 * point — he is deciding whether a passage is worth Sonnet — but on a chapter
 * handed to a study circle it is a price tag on somebody's lesson preparation.
 *
 * Removed here rather than only hidden in the UI, so it is genuinely absent
 * from the file rather than merely not drawn. Someone holding the link holds
 * the key, and anything left in the bundle is readable by them.
 *
 * The provider and model stay. That a rendering came from a model at all is
 * something a reader needs in order to weigh it.
 */
function withoutTelemetry<T extends { costUsd?: number | null; usage?: unknown; rawResponse?: string }>(
  card: T,
): T {
  const { costUsd: _costUsd, usage: _usage, rawResponse: _rawResponse, ...rest } = card;
  return rest as T;
}

export interface BuildOptions {
  bookId: string;
  range: ShareRange;
  /** Overrides the title derived from the book and the chapter heading. */
  title?: string;
}

/**
 * Read everything a shared range needs out of storage and return the bundle.
 *
 * Deliberately takes a `StorageAdapter` rather than the reader's loaded state:
 * an export must reflect what is actually stored, not what one screen happened
 * to have in memory, and this way it is callable from anywhere — including a
 * verification harness with an in-memory adapter.
 */
export async function buildBundle(
  storage: StorageAdapter,
  options: BuildOptions,
): Promise<ShareBundle> {
  const { bookId, range } = options;

  const book = await storage.getBook(bookId);
  if (!book) throw new Error('That book is not in this library.');
  if (range.blocks.length === 0) throw new Error('That range contains no text.');

  const inRange = new Set(range.blocks.map((block) => block.id));
  const both = (startBlockId: string, endBlockId: string) =>
    inRange.has(startBlockId) && inRange.has(endBlockId);

  const [allCards, allMarks, allEntities, allExplanations, allSharh, allToc, allMeta] =
    await Promise.all([
      storage.listCards(bookId),
      storage.listMarks(bookId),
      storage.listEntities(bookId),
      storage.listExplanationCards(bookId),
      storage.listSharhCards(bookId),
      storage.listTocNodes(bookId),
      storage.listPageMeta(bookId),
    ]);

  const cards = allCards
    .filter((card) => both(card.startBlockId, card.endBlockId))
    .map(withoutTelemetry);
  const marks = allMarks.filter((mark) => both(mark.startBlockId, mark.endBlockId));
  const entities = allEntities.filter((entity) => both(entity.startBlockId, entity.endBlockId));
  const explanations = allExplanations
    .filter((card) => both(card.startBlockId, card.endBlockId))
    .map(withoutTelemetry);
  const sharh = allSharh.filter((card) => both(card.startBlockId, card.endBlockId));

  // Only the pages the range actually sits on. The header's ج/ص and
  // jump-by-printed-page read this, and a six-volume book's full table would be
  // most of the bundle's rows for no benefit.
  const touched = new Set(range.blocks.map(pageIndexOf));
  const pageMeta = allMeta.filter((meta) => touched.has(meta.pageIndex));

  // The whole TOC, not the subtree. It is a few thousand short rows at most,
  // and carrying it means the contents drawer can show the visitor where in
  // the work this chapter sits rather than presenting it as a free-floating
  // fragment.
  const tocNodes = allToc;

  return {
    version: SHARE_VERSION,
    id: generateShareId(),
    title: options.title ?? [book.title, range.label].filter(Boolean).join(' — '),
    sourceBook: {
      bookId: book.id,
      shamelaId: book.shamelaId,
      title: book.title,
      author: book.author,
      publisher: book.publisher,
    },
    createdAt: Date.now(),
    blocks: range.blocks,
    pageMeta,
    tocNodes,
    cards,
    explanations,
    sharh,
    marks,
    entities,
    resolved: {
      narrators: await resolveNarrators(storage, entities),
      hadiths: await resolveHadiths(storage, entities),
    },
  };
}

/**
 * The narrator profiles the marked names in this range reach.
 *
 * Looked up by the entity's own `reference`, which for a name entity is already
 * the folded form the index is keyed on — so this asks the same question the
 * reader's tap will ask, and carries exactly the rows that answer it. Stored
 * rows are carried, not merged candidates: merging is the lookup's job and it
 * will run again on the visitor's side, where an installed shard of their own
 * may have something to add.
 */
async function resolveNarrators(
  storage: StorageAdapter,
  entities: { type: string; reference: string }[],
): Promise<StoredNarratorProfile[]> {
  const names = new Set(
    entities
      .filter((entity) => entity.type === 'narrator' || entity.type === 'person')
      .map((entity) => entity.reference)
      .filter((reference) => reference.length >= 3),
  );

  const byId = new Map<string, StoredNarratorProfile>();
  for (const name of names) {
    for (const profile of await storage.findNarratorProfiles(name)) {
      byId.set(profile.id, profile);
    }
  }
  return [...byId.values()];
}

/**
 * The ḥadīth records this range quotes, as they were already cached.
 *
 * Only what is in the cache. Nothing is fetched: an export must not turn into a
 * crawl of dorar or sunnah.com, and a ḥadīth the author never looked up is one
 * the visitor can be honestly told nothing about — which is the same thing the
 * author sees.
 */
async function resolveHadiths(
  storage: StorageAdapter,
  entities: { type: string; reference: string }[],
): Promise<HadithRecord[]> {
  const references = new Set(
    entities.filter((entity) => entity.type === 'hadith').map((entity) => entity.reference),
  );

  const records: HadithRecord[] = [];
  for (const reference of references) {
    const record = await storage.getHadith(reference);
    if (record) records.push(record);
  }
  return records;
}
