import type { StorageAdapter } from '../platform/storage/StorageAdapter';
import type {
  AyahMatch,
  QulResource,
  SurahInfo,
  TafsirPassage,
  TopicRecord,
} from '../types';
import type { QuranEnglish, QuranIndex } from '../quran/quranIndex';
import { surahName } from '../shamela/quranRefs';

// Looking up an āyah in the imported resources.
//
// Every function here is offline and deterministic. The entity already carries
// the reference — it was resolved against the bundled muṣḥaf at import time —
// so a lookup is a keyed read and nothing else. No search, no inference, no
// model, no network, on any path.

/** "2:255-2:257" → "2:255". Every QUL resource is keyed by a single āyah. */
export function firstAyahOf(reference: string): string {
  return reference.split('-')[0].trim();
}

export function surahOf(ayahKey: string): number {
  return Number(ayahKey.split(':')[0]);
}

export function labelForAyah(ayahKey: string): string {
  const [surah, ayah] = ayahKey.split(':');
  const name = surahName(Number(surah)) ?? surah;
  return `${name} ${ayah}`;
}

export function resourcesOfKind(
  resources: QulResource[],
  kind: QulResource['kind'],
): QulResource[] {
  return resources.filter((resource) => resource.kind === kind);
}

// ------------------------------------------------------------------ tafsīr

export interface TafsirResult {
  resource: QulResource;
  text: string;
  /** Every āyah this passage covers — one entry for an ungrouped passage. */
  ayahKeys: string[];
  /** "al-Baqarah 255" or "an-Nisāʾ 66–68" when the passage is a group. */
  coverage: string;
}

/**
 * The passage covering an āyah, in each installed tafsīr.
 *
 * A pointer is followed once. QUL stores a grouped passage on its first āyah
 * and leaves the other members pointing at it, so tapping 4:68 has to arrive at
 * the passage written on 4:66 — and then say that it covers 4:66–68, rather
 * than presenting commentary on three āyāt as if it were about the one tapped.
 */
export async function tafsirFor(
  storage: StorageAdapter,
  resources: QulResource[],
  reference: string,
): Promise<TafsirResult[]> {
  const ayahKey = firstAyahOf(reference);
  const results: TafsirResult[] = [];

  for (const resource of resourcesOfKind(resources, 'tafsir')) {
    let entry = await storage.getQulEntry(resource.id, ayahKey);
    if (entry?.value.t === 'pointer') {
      entry = await storage.getQulEntry(resource.id, entry.value.to);
    }
    if (!entry || entry.value.t !== 'passage') continue;

    const passage = entry.value as TafsirPassage;
    results.push({
      resource,
      text: passage.text,
      ayahKeys: passage.ayahKeys,
      coverage: coverageLabel(passage.ayahKeys, ayahKey),
    });
  }

  return results;
}

function coverageLabel(ayahKeys: string[], fallback: string): string {
  if (ayahKeys.length === 0) return labelForAyah(fallback);
  if (ayahKeys.length === 1) return labelForAyah(ayahKeys[0]);

  const first = ayahKeys[0];
  const last = ayahKeys[ayahKeys.length - 1];
  if (surahOf(first) === surahOf(last)) {
    const name = surahName(surahOf(first)) ?? String(surahOf(first));
    return `${name} ${first.split(':')[1]}–${last.split(':')[1]}`;
  }
  return `${labelForAyah(first)} – ${labelForAyah(last)}`;
}

// ----------------------------------------------------------------- similar

export interface RelatedAyah {
  ayahKey: string;
  label: string;
  arabic: string;
  english: string;
  /** Present only for ayah-matching results. */
  match?: AyahMatch;
}

/**
 * Matched āyāt, each with its own text and bundled translation.
 *
 * Shown inline. There is no Qurʾān reader view in this app and a link to one
 * would be a dead end, so a related āyah is presented in full where it is
 * mentioned or not at all.
 */
export async function similarFor(
  storage: StorageAdapter,
  resources: QulResource[],
  reference: string,
  quran: QuranIndex,
  english: QuranEnglish,
  limit = 12,
): Promise<RelatedAyah[]> {
  const ayahKey = firstAyahOf(reference);
  const seen = new Set<string>();
  const related: RelatedAyah[] = [];

  for (const resource of resourcesOfKind(resources, 'ayah-matching')) {
    const entry = await storage.getQulEntry(resource.id, ayahKey);
    if (entry?.value.t !== 'matches') continue;

    for (const match of entry.value.matches) {
      if (seen.has(match.ayahKey) || match.ayahKey === ayahKey) continue;
      seen.add(match.ayahKey);
      related.push({ ...renderAyah(match.ayahKey, quran, english), match });
      if (related.length >= limit) return related;
    }
  }

  return related;
}

/** Arabic from the bundled muṣḥaf, English from the bundled translation. */
export function renderAyah(
  ayahKey: string,
  quran: QuranIndex,
  english: QuranEnglish,
): RelatedAyah {
  const [surah, ayah] = ayahKey.split(':').map(Number);
  const flat = quran.flatIndexOf(surah, ayah);
  return {
    ayahKey,
    label: labelForAyah(ayahKey),
    arabic: quran.textOf(surah, ayah) ?? '',
    english: flat === -1 ? '' : (english.at(flat) ?? ''),
  };
}

// ------------------------------------------------------------------ topics

export interface TopicResult {
  resource: QulResource;
  topicId: number;
  name: string;
  arabicName: string;
  description: string;
  /** Every āyah in the topic, this one included. */
  ayahKeys: string[];
}

export async function topicsFor(
  storage: StorageAdapter,
  resources: QulResource[],
  reference: string,
): Promise<TopicResult[]> {
  const ayahKey = firstAyahOf(reference);
  const results: TopicResult[] = [];

  for (const resource of resourcesOfKind(resources, 'topics')) {
    const index = await storage.getQulEntry(resource.id, `ayah:${ayahKey}`);
    if (index?.value.t !== 'topics-for-ayah') continue;

    const entries = await storage.getQulEntries(
      resource.id,
      index.value.topicIds.map((topicId) => `topic:${topicId}`),
    );

    for (const entry of entries) {
      if (entry.value.t !== 'topic') continue;
      const topic = entry.value as TopicRecord;
      results.push({
        resource,
        topicId: topic.topicId,
        name: topic.name,
        arabicName: topic.arabicName,
        description: topic.description,
        ayahKeys: topic.ayahKeys,
      });
    }
  }

  // Narrower topics first: "Sincerity" is more use than "Allah", and the wide
  // ones carry thousands of āyāt.
  results.sort((a, b) => a.ayahKeys.length - b.ayahKeys.length);
  return results;
}

// -------------------------------------------------------------- surah info

export interface SurahInfoResult {
  resource: QulResource;
  info: SurahInfo;
}

export async function surahInfoFor(
  storage: StorageAdapter,
  resources: QulResource[],
  reference: string,
): Promise<SurahInfoResult | null> {
  const surah = surahOf(firstAyahOf(reference));
  for (const resource of resourcesOfKind(resources, 'surah-info')) {
    const entry = await storage.getQulEntry(resource.id, String(surah));
    if (entry?.value.t === 'surah') return { resource, info: entry.value };
  }
  return null;
}

/**
 * QUL's descriptions carry `<topic data-id="61">…</topic>` elements that only
 * mean something inside QUL's own reader. The text is kept; the element is not.
 */
export function sanitizeQulHtml(html: string): string {
  return html
    .replace(/<\s*topic[^>]*>/gi, '')
    .replace(/<\s*\/\s*topic\s*>/gi, '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '');
}

/**
 * QUL HTML reduced to blocks of plain text.
 *
 * Rendering the markup directly would mean trusting a downloaded file with
 * `dangerouslySetInnerHTML`, which is not a trade worth making for what amounts
 * to headings and paragraphs. The tags that carry meaning here are `h2`/`h3`
 * and `p`, so the text is split on those and rendered as real elements.
 */
export interface QulTextBlock {
  kind: 'heading' | 'paragraph';
  text: string;
}

export function qulTextBlocks(html: string): QulTextBlock[] {
  const cleaned = sanitizeQulHtml(html);
  const blocks: QulTextBlock[] = [];
  const pattern = /<\s*(h[1-6]|p|div|li)[^>]*>([\s\S]*?)<\s*\/\s*\1\s*>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(cleaned)) !== null) {
    const text = decodeEntities(match[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text === '') continue;
    blocks.push({ kind: /^h[1-6]$/i.test(match[1]) ? 'heading' : 'paragraph', text });
  }

  if (blocks.length === 0) {
    const text = decodeEntities(cleaned.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text !== '') blocks.push({ kind: 'paragraph', text });
  }

  return blocks;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}
