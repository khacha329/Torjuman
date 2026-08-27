import { normalize, parseArabicNumber } from '../lib/arabic';

// Shamela cites verses by sūra *name*, e.g. "(إبراهيم: ٧)" or "[الزمر: ٥٣]".
// quran.com wants surah:ayah numbers. This table bridges the two.
//
// Lookup is done on the normalized form of the name (harakāt stripped, hamza
// and yā' folded) so that spelling variation across the six volumes — إبراهيم
// vs ابراهيم, الشورى vs الشوري — resolves to the same sūra.

const SURAH_NAMES: string[] = [
  'الفاتحة', 'البقرة', 'آل عمران', 'النساء', 'المائدة', 'الأنعام', 'الأعراف',
  'الأنفال', 'التوبة', 'يونس', 'هود', 'يوسف', 'الرعد', 'إبراهيم', 'الحجر',
  'النحل', 'الإسراء', 'الكهف', 'مريم', 'طه', 'الأنبياء', 'الحج', 'المؤمنون',
  'النور', 'الفرقان', 'الشعراء', 'النمل', 'القصص', 'العنكبوت', 'الروم',
  'لقمان', 'السجدة', 'الأحزاب', 'سبأ', 'فاطر', 'يس', 'الصافات', 'ص', 'الزمر',
  'غافر', 'فصلت', 'الشورى', 'الزخرف', 'الدخان', 'الجاثية', 'الأحقاف', 'محمد',
  'الفتح', 'الحجرات', 'ق', 'الذاريات', 'الطور', 'النجم', 'القمر', 'الرحمن',
  'الواقعة', 'الحديد', 'المجادلة', 'الحشر', 'الممتحنة', 'الصف', 'الجمعة',
  'المنافقون', 'التغابن', 'الطلاق', 'التحريم', 'الملك', 'القلم', 'الحاقة',
  'المعارج', 'نوح', 'الجن', 'المزمل', 'المدثر', 'القيامة', 'الإنسان',
  'المرسلات', 'النبأ', 'النازعات', 'عبس', 'التكوير', 'الانفطار', 'المطففين',
  'الانشقاق', 'البروج', 'الطارق', 'الأعلى', 'الغاشية', 'الفجر', 'البلد',
  'الشمس', 'الليل', 'الضحى', 'الشرح', 'التين', 'العلق', 'القدر', 'البينة',
  'الزلزلة', 'العاديات', 'القارعة', 'التكاثر', 'العصر', 'الهمزة', 'الفيل',
  'قريش', 'الماعون', 'الكوثر', 'الكافرون', 'النصر', 'المسد', 'الإخلاص',
  'الفلق', 'الناس',
];

/** Alternate names that appear in classical citation. */
const ALIASES: Record<string, number> = {
  'فاتحة الكتاب': 1,
  'براءة': 9,
  'بني إسرائيل': 17,
  'الملائكة': 35,
  'المؤمن': 40,
  'حم السجدة': 41,
  'الدهر': 76,
  'عم': 78,
  'الانشراح': 94,
  'ألم نشرح': 94,
  'الزلزال': 99,
  'اللهب': 111,
  'تبت': 111,
  'التوحيد': 112,
};

const BY_NORMALIZED_NAME = new Map<string, number>();
for (const [index, name] of SURAH_NAMES.entries()) {
  BY_NORMALIZED_NAME.set(normalize(name), index + 1);
}
for (const [alias, number] of Object.entries(ALIASES)) {
  BY_NORMALIZED_NAME.set(normalize(alias), number);
}

export function surahNumber(name: string): number | null {
  return BY_NORMALIZED_NAME.get(normalize(name)) ?? null;
}

export function surahName(number: number): string | null {
  return SURAH_NAMES[number - 1] ?? null;
}

/**
 * Matches a Shamela verse citation. Both typographic styles occur in book 9260:
 * "(البينة: ٥)" in volume 1 and "[الزمر: ٥٣]" in volume 3. The sūra name may be
 * followed by "من الآية" ("from verse"), and the number may be a range or a
 * pair separated by "/".
 *
 *   (الحج: من الآية٣٧)      → 22:37
 *   (الشعراء: ٢١٨/٢١٩)      → 26:218
 *   [الأعراف: ١٥٦]          → 7:156
 */
const CITATION = /^[([]\s*([^:：)\]]+?)\s*[:：]\s*(?:من\s*الآية)?\s*([٠-٩0-9]+)/u;

export interface ParsedCitation {
  reference: string; // "14:7"
  surah: number;
  ayah: number;
}

export function parseCitation(text: string): ParsedCitation | null {
  const match = CITATION.exec(text.trim());
  if (!match) return null;

  const surah = surahNumber(match[1]);
  const ayah = parseArabicNumber(match[2]);
  if (!surah || !ayah) return null;

  return { reference: `${surah}:${ayah}`, surah, ayah };
}

/** True if the text looks like a bare verse citation rather than running prose. */
export function looksLikeCitation(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 40) return false;
  return CITATION.test(trimmed);
}
