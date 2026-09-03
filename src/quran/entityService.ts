import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type { Block, Book, Entity, EntityRange } from '../types';
import { detectEntities, hadithCollectionFor, unmatchedDelimitedSpans } from './detectEntities';
import { loadQuranIndex } from './quranIndex';
import { buildPersonIndex } from '../biography/detectNames';
import { isBiographicalWork } from '../biography/service';

// Building and rebuilding a book's entities.
//
// Regeneration is a supported operation rather than a migration: entities are
// derived entirely from blocks, so they can be thrown away and rebuilt at any
// time. Nothing here reads or writes blocks, cards, the glossary, or the
// retrieval caches, which is what makes that safe.

export interface EntityBuildResult {
  total: number;
  exact: number;
  partial: number;
  unresolved: number;
  crossBlock: number;
  /** Delimiter-paired spans that matched nothing — the useful diagnostic. */
  unmatched: { blockId: string; text: string }[];
}

export function summarize(
  entities: Entity[],
  unmatched: { blockId: string; text: string }[] = [],
): EntityBuildResult {
  return {
    total: entities.length,
    exact: entities.filter((entity) => entity.matchQuality === 'exact').length,
    partial: entities.filter((entity) => entity.matchQuality === 'partial').length,
    unresolved: entities.filter((entity) => entity.matchQuality === 'unresolved').length,
    crossBlock: entities.filter((entity) => entity.startBlockId !== entity.endBlockId).length,
    unmatched,
  };
}

/** Detect from scratch and replace whatever was stored for this book. */
export async function regenerateEntities(
  storage: StorageAdapter,
  book: Book,
): Promise<EntityBuildResult> {
  // The name index is read across ALL books, not this one: the names being
  // marked come from whichever biographical dictionaries are imported, and the
  // book being scanned is normally not one of them.
  const [quran, blocks, people] = await Promise.all([
    loadQuranIndex(),
    storage.listBlocks(book.id),
    storage.listBiographyEntries(),
  ]);

  // Names are not marked inside a name dictionary.
  //
  // Taqrīb produced 16,174 of them, which is not a bug in the matcher — the
  // whole body of that book IS names, so nearly every block matches. It is
  // simply circular: nobody looks a narrator up from inside a narrator
  // dictionary, and the cost is 16,000 rows and a page painted end to end.
  // Commentaries stay marked; only the biographical works themselves opt out.
  const marksNames = !isBiographicalWork(book);

  const entities = detectEntities(book.id, blocks, {
    quran,
    hadithCollection: book.hadithCollection ?? hadithCollectionFor(book.title),
    people: marksNames ? buildPersonIndex(people) : undefined,
  });

  await storage.clearEntities(book.id);
  await storage.putEntities(entities);

  // Stamped so `ensureEntities` can tell stale from merely present. Recorded
  // even when this book does not mark names, so it is not rebuilt forever.
  await storage.putBook({ ...book, nameIndexSize: people.length });

  return summarize(entities, unmatchedDelimitedSpans(blocks, entities));
}

/**
 * Entities for a book, detecting them once if they are not there yet.
 *
 * Books imported before entities existed, and books restored from an older
 * backup, land here with nothing stored and get built on first open.
 */
export async function ensureEntities(
  storage: StorageAdapter,
  book: Book,
): Promise<Entity[]> {
  const blocks = await storage.countBlocks(book.id);
  if (blocks === 0) return [];

  const existing = await storage.listEntities(book.id);

  // "Present" is not "current".
  //
  // The marked-name layer is derived from the imported biographical works, so
  // a book detected before one of those finished importing carries no names —
  // and the old gate, "has any entities at all", then blocked the rebuild
  // permanently, because the verse and ḥadīth entities were there in their
  // thousands. Comparing against the index size the layer was built with makes
  // finishing an import heal itself instead of needing Re-detect.
  const indexSize = (await storage.listBiographyEntries()).length;
  const current = existing.length > 0 && book.nameIndexSize === indexSize;
  if (current) return existing;

  await regenerateEntities(storage, book);
  return storage.listEntities(book.id);
}

/**
 * Entities as per-block render ranges, with unresolved ones dropped.
 *
 * An entity can span a page break, so a single one may contribute a range to
 * two blocks: the tail of the first and the head of the second. Blocks between
 * them (there are none in practice, since a quotation crosses at most one
 * break) would be covered whole.
 */
export function markableByBlock(
  entities: Entity[],
  blocks: Block[],
): Map<string, EntityRange[]> {
  const byBlock = new Map<string, EntityRange[]>();
  const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
  const lengthOf = new Map(blocks.map((block) => [block.id, block.text.length]));

  const push = (range: EntityRange) => {
    if (range.end <= range.start) return;
    const list = byBlock.get(range.blockId);
    if (list) list.push(range);
    else byBlock.set(range.blockId, [range]);
  };

  for (const entity of entities) {
    // An affordance that leads nowhere is worse than none, so unresolved
    // spans are stored but never marked.
    if (entity.matchQuality === 'unresolved') continue;

    if (entity.startBlockId === entity.endBlockId) {
      push({
        entity,
        blockId: entity.startBlockId,
        start: entity.startOffset,
        end: entity.endOffset,
      });
      continue;
    }

    const from = orderOf.get(entity.startBlockId);
    const to = orderOf.get(entity.endBlockId);
    if (from === undefined || to === undefined) continue;

    push({
      entity,
      blockId: entity.startBlockId,
      start: entity.startOffset,
      end: lengthOf.get(entity.startBlockId) ?? entity.startOffset,
    });
    push({ entity, blockId: entity.endBlockId, start: 0, end: entity.endOffset });

    for (const block of blocks) {
      if (block.order > from && block.order < to) {
        push({ entity, blockId: block.id, start: 0, end: block.text.length });
      }
    }
  }

  for (const list of byBlock.values()) {
    list.sort((a, b) => a.start - b.start);
  }

  return byBlock;
}

/**
 * The text an entity actually covers, read out of the blocks.
 *
 * A verse carries its muṣḥaf text on the entity itself, but a ḥadīth does not —
 * there is no bundled corpus to resolve it against — so its Arabic has to come
 * back out of the book. dorar.net searches by text rather than by number, which
 * is what makes this necessary.
 */
export function entityText(entity: Entity, blocks: Block[]): string {
  const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
  const from = orderOf.get(entity.startBlockId);
  const to = orderOf.get(entity.endBlockId);
  if (from === undefined || to === undefined) return '';

  const parts: string[] = [];
  for (const block of blocks) {
    if (block.order < from || block.order > to) continue;
    const start = block.id === entity.startBlockId ? entity.startOffset : 0;
    const end = block.id === entity.endBlockId ? entity.endOffset : block.text.length;
    if (end > start) parts.push(block.text.slice(start, end));
  }
  return parts.join(' ').trim();
}

/**
 * The whole blocks an entity sits in, plus the one before it.
 *
 * The isnād formula naming the narrator — «وعن أبي هريرة رضي الله عنه قال» —
 * precedes the matn, and detection anchors an entity on the matn itself, so the
 * entity's own range almost never contains the name. Since the narrator is what
 * decides which of dorar's records belong to this narration, the surrounding
 * passage has to travel with it.
 */
export function entityContext(entity: Entity, blocks: Block[]): string {
  const orderOf = new Map(blocks.map((block) => [block.id, block.order]));
  const from = orderOf.get(entity.startBlockId);
  const to = orderOf.get(entity.endBlockId);
  if (from === undefined || to === undefined) return '';

  return blocks
    .filter((block) => block.order >= from - 1 && block.order <= to)
    .map((block) => block.text)
    .join('\n');
}

/** References for the verses inside a selected range, for the translator. */
export function knownReferencesIn(
  entities: Entity[],
  blockIds: Set<string>,
): { quran: string[]; hadith: string[] } {
  const quran: string[] = [];
  const hadith: string[] = [];

  for (const entity of entities) {
    if (entity.matchQuality === 'unresolved') continue;
    if (!blockIds.has(entity.startBlockId) && !blockIds.has(entity.endBlockId)) continue;
    if (entity.type === 'quran') quran.push(entity.reference);
    else hadith.push(entity.reference);
  }

  return { quran: [...new Set(quran)], hadith: [...new Set(hadith)] };
}
