import type {
  AppSettings,
  BiographyEntry,
  Block,
  Book,
  CrawlState,
  DictionaryEntry,
  Entity,
  ExplanationCard,
  GlossaryEntry,
  HadithRecord,
  Mark,
  Page,
  QulCompilation,
  QulEntry,
  QulResource,
  QuranVerse,
  ReadingPosition,
  ShareRecord,
  SharhCard,
  TocNode,
  TranslationCard,
  TranslationProfile,
  WordGloss,
} from '../types';
import type { StoredNarratorProfile } from '../biography/narratorProfile';
import type {
  PageMeta,
  SearchHit,
  StorageAdapter,
  WorkBundle,
  WorkRestoreReport,
} from '../platform/storage/StorageAdapter';
import { letterFold } from '../lib/arabic';
import type { ShareBundle } from './bundle';

// A read-only StorageAdapter backed by a shared bundle.
//
// ---------------------------------------------------------------------------
// Why this shape, rather than a separate viewer
//
// Every screen in the reader reaches its data through `useApp().storage`, and
// nothing in it knows or cares which adapter that is. So a shared chapter is
// not a second reading surface to be built and then kept in step with the real
// one — it is the same reader, handed a different adapter. Verse tapping,
// ḥadīth sheets, narrator cards, the contents drawer, search, the card panel
// and the mark rendering all work because they were never told anything
// changed.
//
// ---------------------------------------------------------------------------
// Three kinds of call, and the rule for each
//
//   From the bundle      The shared chapter's own text, cards, marks, entities
//                        and resolved references. Served entirely from memory.
//
//   Delegated            The visitor's own device data: the seeded muṣḥaf and
//                        QUL resources, their font settings, their glossary.
//                        Amendment 18 is explicit that nothing from the Qurʾān
//                        layer travels in a bundle, precisely because every
//                        install already has it — so those reads go to the real
//                        adapter and a shared view gets tafsīr and verse
//                        translation for free.
//
//   Ignored              Every write that would put shared content into the
//                        visitor's database. Silently, not loudly: the reader
//                        persists a reading position on a timer whether or not
//                        anyone asked it to, and a throw there would take down
//                        a screen the visitor is merely scrolling. The
//                        mutating *controls* are hidden in share mode; this is
//                        the backstop behind that, not the mechanism.
//
// The one thing that must never happen is a shared chapter appearing in the
// visitor's own library, before or after viewing. Nothing here writes a book,
// a block, a card, a mark or an entity, so it cannot.
// ---------------------------------------------------------------------------

/** Writes that are dropped. Named so the intent reads at the call site. */
const ignored = async (): Promise<void> => {};

export class ShareStorageAdapter implements StorageAdapter {
  private readonly bundle: ShareBundle;
  /** The visitor's real storage, for their own device data. */
  private readonly own: StorageAdapter;

  private readonly blocksById: Map<string, Block>;
  private readonly narratorsByNaming: Map<string, StoredNarratorProfile[]>;
  private readonly hadithsByReference: Map<string, HadithRecord>;
  private readonly book: Book;

  constructor(bundle: ShareBundle, own: StorageAdapter) {
    this.bundle = bundle;
    this.own = own;

    this.blocksById = new Map(bundle.blocks.map((block) => [block.id, block]));

    // The same multiEntry `byNaming` index IndexedDB would build, in a Map.
    // A chapter names a few dozen people, so this is a handful of entries.
    this.narratorsByNaming = new Map();
    for (const profile of bundle.resolved.narrators) {
      for (const naming of profile.namings) {
        const list = this.narratorsByNaming.get(naming);
        if (list) list.push(profile);
        else this.narratorsByNaming.set(naming, [profile]);
      }
    }

    this.hadithsByReference = new Map(
      bundle.resolved.hadiths.map((record) => [record.reference, record]),
    );

    this.book = synthesizeBook(bundle);
  }

  async init(): Promise<void> {
    // The real adapter is already open; this one has nothing to open.
  }

  // ---------------------------------------------------------------- books

  async getBook(id: string): Promise<Book | undefined> {
    return id === this.book.id ? this.book : undefined;
  }

  async listBooks(): Promise<Book[]> {
    return [this.book];
  }

  putBook = ignored;
  deleteBook = ignored;

  // ------------------------------------------------------------------ toc

  async listTocNodes(bookId: string): Promise<TocNode[]> {
    if (bookId !== this.book.id) return [];
    return [...this.bundle.tocNodes].sort((a, b) => a.order - b.order);
  }

  putTocNodes = ignored;

  // ---------------------------------------------------------------- pages

  /**
   * A bundle carries page *metadata*, never page HTML.
   *
   * The stored HTML is the raw fetched markup, kept locally so parsers can be
   * improved and re-run. It is many times the size of the text it yielded and
   * nothing in the reader displays it — so it does not travel, and this
   * returns undefined rather than pretending otherwise.
   */
  async getPage(): Promise<Page | undefined> {
    return undefined;
  }

  async listPageMeta(bookId: string): Promise<PageMeta[]> {
    if (bookId !== this.book.id) return [];
    return this.bundle.pageMeta;
  }

  async listFetchedPageIndices(bookId: string): Promise<number[]> {
    return (await this.listPageMeta(bookId)).map((meta) => meta.pageIndex).sort((a, b) => a - b);
  }

  async countPages(bookId: string): Promise<number> {
    return (await this.listPageMeta(bookId)).length;
  }

  putPage = ignored;

  // --------------------------------------------------------------- blocks

  async listBlocks(bookId: string): Promise<Block[]> {
    if (bookId !== this.book.id) return [];
    return [...this.bundle.blocks].sort((a, b) => a.order - b.order);
  }

  async getBlock(id: string): Promise<Block | undefined> {
    return this.blocksById.get(id);
  }

  async listBlocksForPage(pageId: string): Promise<Block[]> {
    return this.bundle.blocks
      .filter((block) => block.pageId === pageId)
      .sort((a, b) => a.order - b.order);
  }

  async countBlocks(bookId: string): Promise<number> {
    return bookId === this.book.id ? this.bundle.blocks.length : 0;
  }

  putBlocks = ignored;
  deleteBlocksForPage = ignored;

  /**
   * Search, scoped to the shared chapter.
   *
   * Reading and searching are both non-mutating, and a visitor looking for a
   * phrase in the chapter they were sent is doing exactly what the share is
   * for. A few hundred blocks scan instantly, so there is no index to build.
   */
  async searchBlocks(bookId: string, normalizedQuery: string, limit: number): Promise<SearchHit[]> {
    return this.scan(bookId, normalizedQuery, limit, (block) => block.normalized);
  }

  async searchBlocksLoose(bookId: string, foldedQuery: string, limit: number): Promise<SearchHit[]> {
    return this.scan(bookId, foldedQuery, limit, (block) => letterFold(block.normalized));
  }

  private async scan(
    bookId: string,
    query: string,
    limit: number,
    field: (block: Block) => string,
  ): Promise<SearchHit[]> {
    if (!query || bookId !== this.book.id) return [];
    const hits: SearchHit[] = [];
    for (const block of await this.listBlocks(bookId)) {
      const at = field(block).indexOf(query);
      if (at === -1) continue;
      hits.push({ block, matchStart: at, matchLength: query.length });
      if (hits.length >= limit) break;
    }
    return hits;
  }

  // ------------------------------------------------------------- entities

  async listEntities(bookId: string): Promise<Entity[]> {
    return bookId === this.book.id ? this.bundle.entities : [];
  }

  putEntities = ignored;
  clearEntities = ignored;

  // ---------------------------------------------------------------- marks

  async listMarks(bookId: string): Promise<Mark[]> {
    return bookId === this.book.id ? this.bundle.marks : [];
  }

  putMarks = ignored;
  deleteMarks = ignored;

  // ---------------------------------------------------------------- cards

  async listCards(bookId: string): Promise<TranslationCard[]> {
    return bookId === this.book.id ? this.bundle.cards : [];
  }

  /**
   * Always undefined, and that is the point.
   *
   * This is the translation cache's lookup: a hit here is what lets the reader
   * skip a paid call. A visitor cannot translate anything, so nothing should
   * ever consult it — and if something does, a miss is the safe answer,
   * because returning a card keyed to somebody else's profile and glossary
   * would be a false cache hit.
   */
  async getCardByCacheKey(): Promise<TranslationCard | undefined> {
    return undefined;
  }

  putCard = ignored;
  deleteCard = ignored;

  async listExplanationCards(bookId: string): Promise<ExplanationCard[]> {
    return bookId === this.book.id ? this.bundle.explanations : [];
  }

  putExplanationCard = ignored;
  deleteExplanationCard = ignored;

  async listSharhCards(bookId: string): Promise<SharhCard[]> {
    return bookId === this.book.id ? this.bundle.sharh : [];
  }

  putSharhCard = ignored;
  deleteSharhCard = ignored;

  // ----------------------------------------------------- narrator profiles

  /**
   * The bundle's profiles first, then the visitor's own.
   *
   * A visitor who has imported Taqrīb or an Itqan shard should see what their
   * own sources say as well — the lookup merges by folded full name, so the
   * two simply describe the same man more completely. Bundle rows lead so that
   * what the author saw is what the visitor sees, with the visitor's sources
   * adding to it rather than displacing it.
   */
  async findNarratorProfiles(naming: string): Promise<StoredNarratorProfile[]> {
    const fromBundle = this.narratorsByNaming.get(naming) ?? [];
    const fromDevice = await this.own.findNarratorProfiles(naming);

    const byId = new Map<string, StoredNarratorProfile>();
    for (const profile of [...fromBundle, ...fromDevice]) byId.set(profile.id, profile);
    return [...byId.values()];
  }

  async listNarratorShards(): Promise<{ shard: string; count: number }[]> {
    return this.own.listNarratorShards();
  }

  putNarratorProfiles = ignored;
  deleteNarratorShard = ignored;

  // ------------------------------------------------------ retrieval cache

  /**
   * The bundle's copy wins over the visitor's cache.
   *
   * Both are the same public record, but the bundle's is the one the author
   * actually prepared the lesson from — including its `gradings`, which are the
   * expensive part to reacquire and the part a visitor with no key cannot
   * fetch at all.
   */
  async getHadith(reference: string): Promise<HadithRecord | undefined> {
    return this.hadithsByReference.get(reference) ?? this.own.getHadith(reference);
  }

  putHadith = ignored;

  // Verses are the visitor's own cache of public Qurʾān data, fetched by their
  // browser from quran.com. Nothing about them is bundle content, so both
  // directions delegate.
  async getQuranVerse(reference: string): Promise<QuranVerse | undefined> {
    return this.own.getQuranVerse(reference);
  }

  async putQuranVerse(verse: QuranVerse): Promise<void> {
    return this.own.putQuranVerse(verse);
  }

  // ------------------------------------------------------------------ QUL
  //
  // Seeded on every install and never carried in a bundle, so all of this is
  // the visitor's own. Compilations are written through because they are a
  // pure recomputation cache over data they already hold.

  async listQulResources(): Promise<QulResource[]> {
    return this.own.listQulResources();
  }

  async getQulEntry(resourceId: string, key: string): Promise<QulEntry | undefined> {
    return this.own.getQulEntry(resourceId, key);
  }

  async getQulEntries(resourceId: string, keys: string[]): Promise<QulEntry[]> {
    return this.own.getQulEntries(resourceId, keys);
  }

  async getQulCompilation(cacheKey: string): Promise<QulCompilation | undefined> {
    return this.own.getQulCompilation(cacheKey);
  }

  async putQulCompilation(record: QulCompilation): Promise<void> {
    return this.own.putQulCompilation(record);
  }

  putQulResource = ignored;
  deleteQulResource = ignored;
  putQulEntries = ignored;

  // ------------------------------------------------------------ biography

  /**
   * The visitor's own biographical works, not the bundle's.
   *
   * A bundle carries narrator *profiles* — compact, field-by-field records —
   * and never the prose entries, which are pages of an imported book. So a
   * visitor with Usd al-Ghāba imported sees their own entries beside the
   * bundle's profiles, and one without simply sees the profiles.
   */
  async listBiographyEntries(bookId?: string): Promise<BiographyEntry[]> {
    return this.own.listBiographyEntries(bookId);
  }

  putBiographyEntries = ignored;
  clearBiographyEntries = ignored;

  // ----------------------------------------------------------- dictionary

  async listDictionaryEntries(bookId: string): Promise<DictionaryEntry[]> {
    return this.own.listDictionaryEntries(bookId);
  }

  putDictionaryEntries = ignored;
  clearDictionaryEntries = ignored;

  // ------------------------------------------- the visitor's own settings

  async getSettings(): Promise<AppSettings | undefined> {
    return this.own.getSettings();
  }

  /** Font, line height and panel width are the visitor's, and they persist. */
  async putSettings(settings: AppSettings): Promise<void> {
    return this.own.putSettings(settings);
  }

  async listProfiles(): Promise<TranslationProfile[]> {
    return this.own.listProfiles();
  }

  async getProfile(id: string): Promise<TranslationProfile | undefined> {
    return this.own.getProfile(id);
  }

  putProfile = ignored;
  deleteProfile = ignored;

  async listGlossary(): Promise<GlossaryEntry[]> {
    return this.own.listGlossary();
  }

  putGlossaryEntry = ignored;
  deleteGlossaryEntry = ignored;

  /**
   * The visitor's own published shares, if they have any.
   *
   * Their device data like their settings and glossary, so it delegates —
   * but publishing does not, because a shared view must never be able to
   * re-share what it was handed.
   */
  async listShareRecords(): Promise<ShareRecord[]> {
    return this.own.listShareRecords();
  }

  putShareRecord = ignored;
  deleteShareRecord = ignored;

  async getWordGloss(word: string): Promise<WordGloss | undefined> {
    return this.own.getWordGloss(word);
  }

  async listWordGlosses(): Promise<WordGloss[]> {
    return this.own.listWordGlosses();
  }

  putWordGloss = ignored;

  // ------------------------------------------------------ crawl, position

  /**
   * Never recorded.
   *
   * The reader saves a reading position on a timer, keyed by book id. Letting
   * that through would leave a row in the visitor's database pointing at a book
   * they do not have — a shared chapter leaking into their library by the one
   * route nobody thinks to check.
   */
  putReadingPosition = ignored;

  async getReadingPosition(): Promise<ReadingPosition | undefined> {
    return undefined;
  }

  async getCrawlState(): Promise<CrawlState | undefined> {
    return undefined;
  }

  putCrawlState = ignored;

  // ------------------------------------------------------------- transfer

  /**
   * Backup is the visitor's own work, and a shared chapter is not theirs.
   *
   * Exporting through this adapter would fold somebody else's bundle into the
   * visitor's backup, where it would then be restored as though they had
   * written it. Neither direction is offered in share mode, and both refuse
   * rather than silently doing half of something.
   */
  async exportWork(): Promise<WorkBundle> {
    throw new Error('A shared chapter cannot be exported.');
  }

  async importWork(): Promise<WorkRestoreReport> {
    throw new Error('Work cannot be restored into a shared chapter.');
  }
}

/**
 * A Book row the reader can render, assembled from what the bundle carries.
 *
 * The reader needs a `Book` for the header, the structure profile and the
 * import-progress banner. A bundle is a finished extract rather than an import,
 * so the page counts describe the range itself and `importStatus` is
 * 'complete' — anything else would put an amber "still importing" bar above
 * somebody's shared chapter forever.
 */
function synthesizeBook(bundle: ShareBundle): Book {
  const volumes = new Set(
    bundle.pageMeta.map((meta) => meta.volume).filter((volume): volume is number => volume !== null),
  );

  return {
    id: bundle.sourceBook.bookId,
    shamelaId: bundle.sourceBook.shamelaId,
    title: bundle.sourceBook.title,
    author: bundle.sourceBook.author,
    publisher: bundle.sourceBook.publisher,
    edition: '',
    volumeCount: volumes.size,
    category: '',
    structureProfile: 'hadith-commentary',
    importedAt: bundle.createdAt,
    importStatus: 'complete',
    totalPages: bundle.pageMeta.length,
    fetchedPages: bundle.pageMeta.length,
    volumeStarts: [],
    hadithCollection: null,
    // Entities travel pre-resolved, so nothing must ever try to rebuild them.
    // Share mode skips `ensureEntities` outright; this is the second lock on
    // the same door, since a regeneration here would find no biographical
    // index and quietly strip every marked name from the chapter.
    nameIndexSize: undefined,
    role: 'reading',
  };
}
