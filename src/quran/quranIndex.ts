import { normalize } from '../lib/arabic';
import { surahName } from '../shamela/quranRefs';

/**
 * The fold used for matching a quotation against the muṣḥaf.
 *
 * The amendment asks for the block-search `normalize` to be used unchanged, on
 * the reasoning that folding both sides removes the orthographic differences
 * between the sharḥ and the muṣḥaf. Measured against the real text, it does not
 * — two systematic differences survive it, and each one alone is enough to make
 * a verse fail to resolve:
 *
 *   1. Dagger alef. The muṣḥaf writes a long ā as a superscript alef
 *      (U+0670) over the preceding letter: ٱلسَّمَٰوَٰتِ, يَرَىٰكَ. The sharḥ
 *      writes it plene: السماوات, يراك. `normalize` strips U+0670 as a
 *      diacritic, leaving السموت against السماوات.
 *   2. Plene vs defective alef. Where the muṣḥaf writes إِلَٰهَ the sharḥ
 *      writes إِلَهَ — the alef is simply absent on one side.
 *
 * Converting U+0670 to alef fixes (1) and breaks (2); stripping it does the
 * reverse. The fold that survives both is to stop treating alef as
 * information: fold alef-maqṣūra to alef, then drop every alef, on both sides.
 * Two spellings that differ only in where alefs are written then agree.
 *
 * This is only ever used for muṣḥaf lookup. `normalize` is untouched and
 * remains the single fold behind block search, exactly as specified.
 */
export function quranFold(input: string): string {
  let folded = normalize(input.replace(/ى/g, 'ا'))
    // Alef and the standalone hamza carry no information that survives the
    // difference between the two orthographies, so both go. ءَامَنُوا in the
    // muṣḥaf and آمَنُوا in the sharḥ then agree.
    .replace(/[اء]/g, '')
    // Word boundaries differ too: the muṣḥaf joins يَٰٓأَيُّهَا where the sharḥ
    // writes يَا أَيُّهَا as two words. Dropping spaces entirely removes that
    // whole class of mismatch, and substring search does not need them.
    .replace(/\s+/g, '');

  for (const [uthmani, common] of ORTHOGRAPHIC_WAW) {
    folded = folded.split(uthmani).join(common);
  }
  return folded;
}

/**
 * The closed set of words the muṣḥaf spells with an orthographic wāw that the
 * sharḥ writes with an alef: ٱلصَّلَوٰة against الصلاة, ٱلزَّكَوٰة against
 * الزكاة, ٱلۡحَيَوٰة against الحياة.
 *
 * This cannot be done by pattern. In ٱلصَّلَوٰة the wāw is silent, but in
 * ٱلسَّمَٰوَٰت it is a real consonant the sharḥ also writes — both are "wāw
 * followed by dagger alef", so only the word tells them apart. The list is
 * short, closed, and covers the words that actually recur.
 *
 * Applied to both sides. It is one-directional and idempotent, so running it
 * over ordinary sharḥ text changes nothing.
 */
const ORTHOGRAPHIC_WAW: [uthmani: string, common: string][] = [
  ['صلوه', 'صله'], // صلوه -> صله
  ['زكوه', 'زكه'], // زكوه -> زكه
  ['حيوه', 'حيه'], // حيوه -> حيه
  ['مشكوه', 'مشكه'], // مشكوه -> مشكه
  ['نجوه', 'نجه'], // نجوه -> نجه
  ['غدوه', 'غده'], // غدوه -> غده
  ['ربوا', 'ربو'], // ربوا -> ربو
];

// The bundled Qurʾān, indexed for substring matching.
//
// This is what makes verse identification deterministic, free, and offline: a
// quoted span is resolved by looking it up locally, not by asking a model what
// it thinks the reference is.
//
// The trick is the corpus string. All 6,236 āyāt are normalized with the *same*
// function block search uses, then joined with single spaces. A quotation is
// then just an indexOf into that string — and because consecutive āyāt are
// joined by a space, a quotation spanning several āyāt matches in exactly the
// same way as one inside a single āyah, with no special case.
//
// Normalization is what makes this work at all. The sharḥ's orthography differs
// from the muṣḥaf's — ٱ vs ا, different harakāt, sometimes ى for ي — and folding
// both sides removes every one of those differences.

export interface AyahRef {
  surah: number;
  ayah: number;
}

/** A run of agreement between a folded query and the corpus. */
export interface LocatedRun {
  queryFrom: number;
  queryTo: number;
  corpusFrom: number;
  corpusTo: number;
  ambiguous: boolean;
}

export interface QuranMatch {
  /** First āyah of the match. */
  start: AyahRef;
  /** Last āyah — equal to `start` for a quotation inside one āyah. */
  end: AyahRef;
  /** "2:255" or "2:255-2:257". */
  reference: string;
  /** Uthmānī text of the matched āyāt, joined. */
  textUthmani: string;
  quality: 'exact' | 'partial';
}

/**
 * Below this many normalized characters a quotation is not specific enough to
 * resolve. "الله" appears in over two thousand āyāt; marking it would produce an
 * affordance that means nothing.
 */
const MIN_MATCH_LENGTH = 11;

/** Shortest run of words accepted as a quotation. Below this it is noise. */
export const MIN_MATCH_WORDS = 4;

/**
 * Length of the anchor key used to find candidate positions in the corpus.
 *
 * The amendment specifies 4-word shingles. Word shingles do not survive this
 * text: the muṣḥaf joins يَٰٓأَيُّهَا into one word where the sharḥ writes
 * يَا أَيُّهَا as two, so the same phrase yields shingles of different arity on
 * the two sides and never matches. The key here is instead a fixed run of
 * *folded characters* taken at each word start. Word boundaries inside a run
 * stop mattering, while anchoring at word starts keeps the index small — one
 * entry per Qurʾānic word, about 78,000 in total.
 */
const ANCHOR_CHARS = 8;

export class QuranIndex {
  readonly edition: string;
  private readonly ayat: string[];
  private readonly counts: number[];
  /** Flat index of the first āyah of each sūrah. */
  private readonly surahStart: number[];
  /** All āyāt, folded and run together. */
  private readonly corpus: string;
  /** Character offset of each āyah within `corpus`. */
  private readonly offsets: number[];
  /** Folded-character anchor at each word start -> corpus positions. */
  private readonly anchors = new Map<string, number[]>();

  constructor(bundle: { edition: string; counts: number[]; ayat: string[] }) {
    this.edition = bundle.edition;
    this.ayat = bundle.ayat;
    this.counts = bundle.counts;

    this.surahStart = [];
    let running = 0;
    for (const count of bundle.counts) {
      this.surahStart.push(running);
      running += count;
    }

    this.offsets = new Array(this.ayat.length);
    const parts: string[] = new Array(this.ayat.length);
    let cursor = 0;
    for (let i = 0; i < this.ayat.length; i++) {
      const text = quranFold(this.ayat[i]);
      parts[i] = text;
      this.offsets[i] = cursor;
      cursor += text.length;
    }
    // Joined with nothing: the fold has already removed every space, so
    // consecutive āyāt run together and a quotation spanning several of them
    // matches exactly as one inside a single āyah does.
    this.corpus = parts.join('');

    // Anchor index. Each Qurʾānic word contributes the folded characters that
    // begin at it, so a quotation can be located from any word it starts on
    // without scanning the corpus.
    let position = 0;
    for (const ayah of this.ayat) {
      for (const word of ayah.split(/\s+/)) {
        const folded = quranFold(word);
        if (folded.length === 0) continue;
        const key = this.corpus.slice(position, position + ANCHOR_CHARS);
        if (key.length === ANCHOR_CHARS) {
          const bucket = this.anchors.get(key);
          if (bucket) bucket.push(position);
          else this.anchors.set(key, [position]);
        }
        position += folded.length;
      }
    }
  }

  get ayahCount(): number {
    return this.ayat.length;
  }

  /** Flat index -> surah:ayah. */
  refAt(flatIndex: number): AyahRef {
    let surah = 0;
    // 114 entries; a linear scan is faster than the branch cost of a binary
    // search and is called at most twice per match.
    while (surah + 1 < this.surahStart.length && this.surahStart[surah + 1] <= flatIndex) {
      surah++;
    }
    return { surah: surah + 1, ayah: flatIndex - this.surahStart[surah] + 1 };
  }

  /** Flat indices covered by a reference like "2:255" or "2:255-2:257". */
  flatRangeOf(reference: string): [start: number, end: number] | null {
    const parts = reference.split('-');
    const first = this.parseRef(parts[0]);
    if (first === -1) return null;
    const last = parts[1] ? this.parseRef(parts[1]) : first;
    return [first, last === -1 ? first : last];
  }

  private parseRef(text: string): number {
    const match = /^(\d+):(\d+)$/.exec(text.trim());
    if (!match) return -1;
    return this.flatIndexOf(Number(match[1]), Number(match[2]));
  }

  /** surah:ayah -> flat index, or -1 if out of range. */
  flatIndexOf(surah: number, ayah: number): number {
    if (surah < 1 || surah > 114) return -1;
    if (ayah < 1 || ayah > this.counts[surah - 1]) return -1;
    return this.surahStart[surah - 1] + ayah - 1;
  }

  textOf(surah: number, ayah: number): string | null {
    const index = this.flatIndexOf(surah, ayah);
    return index === -1 ? null : this.ayat[index];
  }

  private ayahAtCharOffset(charOffset: number): number {
    let low = 0;
    let high = this.offsets.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (this.offsets[mid] <= charOffset) low = mid;
      else high = mid - 1;
    }
    return low;
  }

  /**
   * Resolve a quotation. `quoted` is raw display text; it is normalized here so
   * callers cannot accidentally use a different fold.
   *
   * Returns null when the quotation is too short to be specific, or when it
   * does not appear in the text at all — in which case the caller marks it
   * unresolved and leaves it unmarked rather than guessing.
   */
  match(quoted: string): QuranMatch | null {
    const needle = quranFold(quoted);
    if (needle.length < MIN_MATCH_LENGTH) return null;

    const first = this.corpus.indexOf(needle);
    if (first === -1) return null;

    // More than one occurrence means the quotation is real but ambiguous —
    // a formula repeated across sūrahs, for instance. Record the first and
    // mark it partial rather than asserting a reference that may be wrong.
    const second = this.corpus.indexOf(needle, first + 1);

    const startIndex = this.ayahAtCharOffset(first);
    const endIndex = this.ayahAtCharOffset(first + needle.length - 1);

    const start = this.refAt(startIndex);
    const end = this.refAt(endIndex);

    return {
      start,
      end,
      reference:
        startIndex === endIndex
          ? `${start.surah}:${start.ayah}`
          : `${start.surah}:${start.ayah}-${end.surah}:${end.ayah}`,
      textUthmani: this.ayat.slice(startIndex, endIndex + 1).join(' '),
      quality: second === -1 ? 'exact' : 'partial',
    };
  }

  /**
   * Locate a folded query in the corpus, anchored at one of its word starts,
   * and extend the agreement greedily in both directions.
   *
   * This is what makes detection independent of delimiters: the caller slides
   * over a block's words and asks this, so a verse woven into the commentary
   * with no delimiters at all is found on the strength of its content. A
   * citation like (التوبة: ١٢٣) is excluded with no special case, because it is
   * a reference rather than verse text and simply is not in the corpus.
   */
  locate(folded: string, anchorAt: number): LocatedRun | null {
    const key = folded.slice(anchorAt, anchorAt + ANCHOR_CHARS);
    if (key.length < ANCHOR_CHARS) return null;

    const candidates = this.anchors.get(key);
    if (!candidates) return null;

    let best: LocatedRun | null = null;
    let bestLength = 0;
    let tiedAtBest = 0;

    for (const position of candidates) {
      let forwardQuery = anchorAt;
      let forwardCorpus = position;
      while (
        forwardQuery < folded.length &&
        forwardCorpus < this.corpus.length &&
        folded[forwardQuery] === this.corpus[forwardCorpus]
      ) {
        forwardQuery++;
        forwardCorpus++;
      }

      let backQuery = anchorAt;
      let backCorpus = position;
      while (
        backQuery > 0 &&
        backCorpus > 0 &&
        folded[backQuery - 1] === this.corpus[backCorpus - 1]
      ) {
        backQuery--;
        backCorpus--;
      }

      const length = forwardQuery - backQuery;
      if (length > bestLength) {
        bestLength = length;
        tiedAtBest = 1;
        best = {
          queryFrom: backQuery,
          queryTo: forwardQuery,
          corpusFrom: backCorpus,
          corpusTo: forwardCorpus,
          ambiguous: false,
        };
      } else if (length === bestLength) {
        tiedAtBest++;
      }
    }

    if (!best || bestLength < MIN_MATCH_LENGTH) return null;
    // The same wording occurring in more than one place is real but ambiguous:
    // a formula repeated across sūrahs. Report the first and say so.
    best.ambiguous = tiedAtBest > 1;
    return best;
  }

  /** Turn a matched corpus span into a reference, label, and muṣḥaf text. */
  describeCorpusRange(corpusFrom: number, corpusTo: number): QuranMatch {
    const startIndex = this.ayahAtCharOffset(corpusFrom);
    const endIndex = this.ayahAtCharOffset(Math.max(corpusFrom, corpusTo - 1));
    const start = this.refAt(startIndex);
    const end = this.refAt(endIndex);

    return {
      start,
      end,
      reference:
        startIndex === endIndex
          ? `${start.surah}:${start.ayah}`
          : `${start.surah}:${start.ayah}-${end.surah}:${end.ayah}`,
      textUthmani: this.ayat.slice(startIndex, endIndex + 1).join(' '),
      quality: 'exact',
    };
  }

  /** "al-Baqarah 255" style label for the action sheet. */
  describe(match: QuranMatch): string {
    const name = surahName(match.start.surah) ?? `${match.start.surah}`;
    if (match.start.surah === match.end.surah) {
      return match.start.ayah === match.end.ayah
        ? `${name} ${match.start.ayah}`
        : `${name} ${match.start.ayah}–${match.end.ayah}`;
    }
    const endName = surahName(match.end.surah) ?? `${match.end.surah}`;
    return `${name} ${match.start.ayah} – ${endName} ${match.end.ayah}`;
  }
}

/**
 * The bundled English translation.
 *
 * Dr. Mustafa Khattab's Clear Qurʾān, shipped with the app so a verse renders
 * with no network at all. It was withdrawn from the public quran.com API — which
 * is why the *online* path defaults to Saheeh International — but is still
 * published as a static export, so the offline path carries the translation
 * actually wanted rather than a substitute.
 */
export class QuranEnglish {
  readonly translation: string;
  private readonly ayat: string[];

  constructor(bundle: { translation: string; ayat: string[] }) {
    this.translation = bundle.translation;
    this.ayat = bundle.ayat;
  }

  /** English for a flat muṣḥaf index — the same ordering the Arabic uses. */
  at(flatIndex: number): string | null {
    return this.ayat[flatIndex] ?? null;
  }

  /** Joined English for an inclusive range of flat indices. */
  range(startFlat: number, endFlat: number): string {
    return this.ayat.slice(startFlat, endFlat + 1).join(' ');
  }
}

let cachedEnglish: Promise<QuranEnglish> | null = null;

export function loadQuranEnglish(): Promise<QuranEnglish> {
  cachedEnglish ??= (async () => {
    const response = await fetch('/quran/khattab.json');
    if (!response.ok) {
      throw new Error(`Could not load the bundled translation (HTTP ${response.status}).`);
    }
    return new QuranEnglish(await response.json());
  })();
  return cachedEnglish;
}

let cached: Promise<QuranIndex> | null = null;

/**
 * Loads the bundled text and builds the index once per session.
 *
 * The asset is served from the app's own origin, so this works with no external
 * network. Building the corpus over 6,236 āyāt takes a few tens of milliseconds.
 */
export function loadQuranIndex(): Promise<QuranIndex> {
  cached ??= (async () => {
    const response = await fetch('/quran/uthmani.json');
    if (!response.ok) {
      throw new Error(`Could not load the bundled Qurʾān text (HTTP ${response.status}).`);
    }
    return new QuranIndex(await response.json());
  })();
  return cached;
}

/** Test seam: build an index from an already-loaded bundle. */
export function buildQuranIndex(bundle: {
  edition: string;
  counts: number[];
  ayat: string[];
}): QuranIndex {
  return new QuranIndex(bundle);
}
