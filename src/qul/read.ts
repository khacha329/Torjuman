import type {
  AyahMatch,
  QulEntryValue,
  QulResourceKind,
} from '../types';
import type { SqliteTable } from './sqlite';

// Reading a QUL resource file into the app's own records.
//
// ---------------------------------------------------------------------------
// Detection is by content, never by filename
//
// QUL's downloads arrive named for what they contain and not for how they are
// encoded: this project's own sample set has a tafsīr that came down as JSON
// and a topics resource that came down as SQLite, and the site offers several
// of them in both. A filename is a hint the user can also change by accident.
//
// So the format is decided from the file's first bytes (see sqlite.ts), and the
// *kind* is decided from the shape of what is inside — which keys, which
// columns, which fields. Anything that does not match a known shape is refused
// with a message naming what was actually found. Importing half of an
// unrecognised file is worse than importing none of it: a resource that is
// silently short by 4,000 āyāt looks exactly like one that is complete.
// ---------------------------------------------------------------------------

/** One record on its way into storage. IDs are assigned at commit. */
export interface QulDraftEntry {
  key: string;
  value: QulEntryValue;
}

export interface QulReading {
  kind: QulResourceKind;
  format: 'json' | 'sqlite';
  /** What to call this in the reference-works list. */
  name: string;
  entries: QulDraftEntry[];
  /** One line naming the kind, for the confirmation screen. */
  label: string;
  /** Facts about what was read, so the user confirms against the real thing. */
  details: string[];
  /** A genuine excerpt. Arabic that renders wrongly here is a bad import. */
  sample: string;
}

/** Refusal, with the reason in the user's terms. */
export class QulFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QulFormatError';
  }
}

const AYAH_KEY = /^(\d{1,3}):(\d{1,3})$/;

function isAyahKey(value: string): boolean {
  const match = AYAH_KEY.exec(value);
  if (!match) return false;
  const surah = Number(match[1]);
  return surah >= 1 && surah <= 114 && Number(match[2]) >= 1;
}

function nameFromFile(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || fileName;
}

function excerpt(text: string, length = 220): string {
  const plain = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > length ? `${plain.slice(0, length)}…` : plain;
}

// ------------------------------------------------------------------- JSON

export function readQulJson(root: unknown, fileName: string): QulReading {
  if (root === null || typeof root !== 'object' || Array.isArray(root)) {
    throw new QulFormatError(
      'That file is JSON, but not an object keyed by sūrah or āyah. QUL resources are keyed by "2:255" or by "2".',
    );
  }

  const record = root as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) throw new QulFormatError('That file contains no entries.');

  // The shape produced by QUL's own sqlite→json converter script: one array of
  // rows per table. Handled here so a user who converted a resource before
  // importing it does not get told the file is unrecognised.
  if (Array.isArray(record.topics)) {
    return readTopicRows(record.topics as unknown[], fileName, 'json');
  }

  const first = record[keys[0]];

  if (keys.every(isAyahKey)) {
    if (Array.isArray(first)) return readAyahMatchingJson(record, fileName);
    return readTafsirJson(record, fileName);
  }

  if (keys.every((key) => /^\d{1,3}$/.test(key) && Number(key) >= 1 && Number(key) <= 114)) {
    return readSurahInfoJson(record, fileName);
  }

  throw new QulFormatError(
    `That file's keys are not sūrah or āyah references — the first is "${keys[0]}". ` +
      'It does not look like a QUL tafsīr, ayah-matching, topics or surah-info resource.',
  );
}

function readTafsirJson(record: Record<string, unknown>, fileName: string): QulReading {
  const entries: QulDraftEntry[] = [];
  let passages = 0;
  let grouped = 0;
  let sample = '';

  for (const [key, raw] of Object.entries(record)) {
    // A bare string is a pointer at the group leader that carries the passage.
    // QUL writes 1,196 of these in al-Muyassar alone.
    if (typeof raw === 'string') {
      if (!isAyahKey(raw)) {
        throw new QulFormatError(
          `Entry "${key}" is the string "${excerpt(raw, 40)}", which is neither a passage nor a reference to one.`,
        );
      }
      entries.push({ key, value: { t: 'pointer', to: raw } });
      continue;
    }

    if (raw === null || typeof raw !== 'object') {
      throw new QulFormatError(`Entry "${key}" is not a tafsīr passage.`);
    }

    const value = raw as { text?: unknown; ayah_keys?: unknown };
    if (typeof value.text !== 'string') {
      throw new QulFormatError(`Entry "${key}" carries no text.`);
    }

    const ayahKeys = Array.isArray(value.ayah_keys)
      ? value.ayah_keys.map(String).filter(isAyahKey)
      : [key];
    if (ayahKeys.length > 1) grouped++;
    passages++;
    if (!sample) sample = excerpt(value.text);

    entries.push({
      key,
      value: { t: 'passage', text: value.text, ayahKeys: ayahKeys.length > 0 ? ayahKeys : [key] },
    });
  }

  return {
    kind: 'tafsir',
    format: 'json',
    name: nameFromFile(fileName),
    entries,
    label: 'Tafsīr — commentary keyed by āyah',
    details: [
      `${entries.length.toLocaleString()} āyāt covered`,
      `${passages.toLocaleString()} distinct passages`,
      grouped > 0
        ? `${grouped.toLocaleString()} of them treat several āyāt as one unit, and will be shown whole`
        : 'no grouped passages',
    ],
    sample,
  };
}

function readAyahMatchingJson(
  record: Record<string, unknown>,
  fileName: string,
): QulReading {
  const entries: QulDraftEntry[] = [];
  let total = 0;

  for (const [key, raw] of Object.entries(record)) {
    if (!Array.isArray(raw)) {
      throw new QulFormatError(`Entry "${key}" is not a list of matched āyāt.`);
    }

    const matches: AyahMatch[] = [];
    for (const item of raw as Record<string, unknown>[]) {
      const matchedKey = String(item?.matched_ayah_key ?? '');
      if (!isAyahKey(matchedKey)) continue;
      matches.push({
        ayahKey: matchedKey,
        matchedWords: Number(item.matched_words_count ?? 0),
        coverage: Number(item.coverage ?? 0),
        score: Number(item.score ?? 0),
      });
    }

    if (matches.length === 0) continue;
    // Strongest first: the list is shown in this order and truncated from the
    // bottom, so ordering here decides what the user actually sees.
    matches.sort((a, b) => b.score - a.score);
    total += matches.length;
    entries.push({ key, value: { t: 'matches', matches } });
  }

  if (entries.length === 0) {
    throw new QulFormatError('No āyah matches were found in that file.');
  }

  return {
    kind: 'ayah-matching',
    format: 'json',
    name: nameFromFile(fileName),
    entries,
    label: 'Ayah matching — similar and parallel verses',
    details: [
      `${entries.length.toLocaleString()} āyāt have matches`,
      `${total.toLocaleString()} matches in total`,
    ],
    sample: `${entries[0].key} → ${(entries[0].value as { matches: AyahMatch[] }).matches
      .slice(0, 3)
      .map((match) => match.ayahKey)
      .join(', ')}`,
  };
}

function readSurahInfoJson(record: Record<string, unknown>, fileName: string): QulReading {
  const entries: QulDraftEntry[] = [];
  let sample = '';

  for (const [key, raw] of Object.entries(record)) {
    if (raw === null || typeof raw !== 'object') {
      throw new QulFormatError(`Entry "${key}" is not a sūrah description.`);
    }
    const value = raw as {
      surah_number?: unknown;
      surah_name?: unknown;
      text?: unknown;
      short_text?: unknown;
    };
    if (typeof value.text !== 'string') {
      throw new QulFormatError(`Sūrah ${key} carries no description text.`);
    }
    if (!sample) sample = excerpt(value.text);

    entries.push({
      key,
      value: {
        t: 'surah',
        surahNumber: Number(value.surah_number ?? key),
        surahName: String(value.surah_name ?? ''),
        text: value.text,
        shortText: typeof value.short_text === 'string' ? value.short_text : '',
      },
    });
  }

  return {
    kind: 'surah-info',
    format: 'json',
    name: nameFromFile(fileName),
    entries,
    label: 'Surah info — background on each sūrah',
    details: [`${entries.length} of 114 sūrahs described`],
    sample,
  };
}

// ----------------------------------------------------------------- SQLite

export function readQulSqlite(tables: SqliteTable[], fileName: string): QulReading {
  if (tables.length === 0) {
    throw new QulFormatError('That SQLite file contains no tables.');
  }

  const topics = tables.find(
    (table) => has(table, 'topic_id') && has(table, 'ayahs'),
  );
  if (topics) return readTopicRows(topics.rows, fileName, 'sqlite');

  const tafsir = tables.find((table) => textColumn(table) && ayahKeyColumn(table));
  if (tafsir) return readTafsirRows(tafsir, fileName);

  const surah = tables.find(
    (table) => has(table, 'surah_number') || (has(table, 'name') && has(table, 'text')),
  );
  if (surah && has(surah, 'surah_number')) return readSurahRows(surah, fileName);

  throw new QulFormatError(
    `That SQLite file has no table this app recognises. It contains: ${tables
      .map((table) => `${table.name} (${table.columns.join(', ')})`)
      .join('; ')}.`,
  );
}

function has(table: SqliteTable, column: string): boolean {
  return table.columns.includes(column);
}

/**
 * QUL's tafsīr tables are not uniformly named across resources, so the column
 * carrying the commentary is found rather than assumed. If none of these is
 * present the file is refused, which is the right outcome: guessing a column
 * would import a resource full of empty passages.
 */
function textColumn(table: SqliteTable): string | null {
  return (
    ['text', 'tafsir_text', 'content', 'body'].find((column) => has(table, column)) ?? null
  );
}

function ayahKeyColumn(table: SqliteTable): string | null {
  return (
    ['ayah_key', 'verse_key', 'key', 'ayah'].find((column) => has(table, column)) ?? null
  );
}

function groupColumn(table: SqliteTable): string | null {
  return (
    ['ayah_keys', 'group_ayah_key', 'group_verse_key', 'ayah_group'].find((column) =>
      has(table, column),
    ) ?? null
  );
}

function readTafsirRows(table: SqliteTable, fileName: string): QulReading {
  const textKey = textColumn(table)!;
  const keyKey = ayahKeyColumn(table)!;
  const groupKey = groupColumn(table);

  const entries: QulDraftEntry[] = [];
  let grouped = 0;
  let sample = '';

  for (const row of table.rows) {
    const key = String(row[keyKey] ?? '');
    const text = row[textKey];
    if (!isAyahKey(key) || typeof text !== 'string' || text.trim() === '') continue;

    // The group may be a JSON array, a comma-joined list, or a single key.
    const rawGroup = groupKey ? row[groupKey] : null;
    const ayahKeys = parseAyahKeyList(rawGroup, key);
    if (ayahKeys.length > 1) grouped++;
    if (!sample) sample = excerpt(text);

    entries.push({ key, value: { t: 'passage', text, ayahKeys } });
  }

  if (entries.length === 0) {
    throw new QulFormatError(
      `Table "${table.name}" has the right columns but no rows keyed by āyah.`,
    );
  }

  // Group members that carry no row of their own still have to resolve, so a
  // pointer is written for each one the passages claim to cover.
  const own = new Set(entries.map((entry) => entry.key));
  for (const entry of [...entries]) {
    const value = entry.value as { t: 'passage'; ayahKeys: string[] };
    for (const member of value.ayahKeys) {
      if (member === entry.key || own.has(member)) continue;
      entries.push({ key: member, value: { t: 'pointer', to: entry.key } });
      own.add(member);
    }
  }

  return {
    kind: 'tafsir',
    format: 'sqlite',
    name: nameFromFile(fileName),
    entries,
    label: 'Tafsīr — commentary keyed by āyah',
    details: [
      `read from the SQLite table "${table.name}"`,
      `${entries.length.toLocaleString()} āyāt covered`,
      grouped > 0
        ? `${grouped.toLocaleString()} grouped passages, shown whole`
        : 'no grouped passages',
    ],
    sample,
  };
}

function parseAyahKeyList(raw: unknown, fallback: string): string[] {
  if (typeof raw === 'string' && raw.trim() !== '') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown[];
        const keys = parsed.map(String).filter(isAyahKey);
        if (keys.length > 0) return keys;
      } catch {
        // Fall through to the delimited reading below.
      }
    }
    const keys = trimmed.split(/[,\s]+/).filter(isAyahKey);
    if (keys.length > 0) return keys;
  }
  if (Array.isArray(raw)) {
    const keys = raw.map(String).filter(isAyahKey);
    if (keys.length > 0) return keys;
  }
  return [fallback];
}

function readSurahRows(table: SqliteTable, fileName: string): QulReading {
  const entries: QulDraftEntry[] = [];
  let sample = '';

  for (const row of table.rows) {
    const number = Number(row.surah_number ?? row.id ?? 0);
    const text = row.text ?? row.description ?? '';
    if (number < 1 || number > 114 || typeof text !== 'string' || text === '') continue;
    if (!sample) sample = excerpt(text);

    entries.push({
      key: String(number),
      value: {
        t: 'surah',
        surahNumber: number,
        surahName: String(row.surah_name ?? row.name ?? ''),
        text,
        shortText: typeof row.short_text === 'string' ? row.short_text : '',
      },
    });
  }

  if (entries.length === 0) {
    throw new QulFormatError(`Table "${table.name}" holds no sūrah descriptions.`);
  }

  return {
    kind: 'surah-info',
    format: 'sqlite',
    name: nameFromFile(fileName),
    entries,
    label: 'Surah info — background on each sūrah',
    details: [
      `read from the SQLite table "${table.name}"`,
      `${entries.length} of 114 sūrahs described`,
    ],
    sample,
  };
}

// ------------------------------------------------------------------ topics

/**
 * Topics, plus the reverse index that makes them usable.
 *
 * The resource is stored the way it is published — a topic owning a list of
 * āyāt — but every lookup goes the other way: "which topics is 2:255 in?".
 * Scanning 2,512 topics on every tap would be visible on a tablet, so the
 * inversion is done once here, at import, and stored beside the topics.
 */
function readTopicRows(
  rows: unknown[],
  fileName: string,
  format: 'json' | 'sqlite',
): QulReading {
  const entries: QulDraftEntry[] = [];
  const byAyah = new Map<string, number[]>();
  let sample = '';
  let withAyat = 0;

  for (const raw of rows) {
    if (raw === null || typeof raw !== 'object') continue;
    const row = raw as Record<string, unknown>;
    const topicId = Number(row.topic_id ?? row.id ?? NaN);
    if (!Number.isFinite(topicId)) continue;

    const ayahKeys = String(row.ayahs ?? '')
      .split(/[,\s]+/)
      .filter(isAyahKey);
    if (ayahKeys.length > 0) withAyat++;

    const name = String(row.name ?? '');
    if (!sample && name) sample = `${name} — ${ayahKeys.length} āyāt`;

    entries.push({
      key: `topic:${topicId}`,
      value: {
        t: 'topic',
        topicId,
        name,
        arabicName: String(row.arabic_name ?? ''),
        description: String(row.description ?? ''),
        ayahKeys,
      },
    });

    for (const ayahKey of ayahKeys) {
      const list = byAyah.get(ayahKey);
      if (list) list.push(topicId);
      else byAyah.set(ayahKey, [topicId]);
    }
  }

  if (entries.length === 0) {
    throw new QulFormatError('No topics were found in that file.');
  }

  for (const [ayahKey, topicIds] of byAyah) {
    entries.push({ key: `ayah:${ayahKey}`, value: { t: 'topics-for-ayah', topicIds } });
  }

  return {
    kind: 'topics',
    format,
    name: nameFromFile(fileName),
    entries,
    label: 'Topics — thematically grouped verses',
    details: [
      `${(entries.length - byAyah.size).toLocaleString()} topics, ${withAyat.toLocaleString()} of them with āyāt`,
      `${byAyah.size.toLocaleString()} āyāt appear in at least one topic`,
    ],
    sample,
  };
}
