import type { QuranEnglish, QuranIndex } from '../../quran/quranIndex';
import type {
  RelatedAyah,
  SurahInfoResult,
  TafsirResult,
  TopicResult,
} from '../../qul/service';
import type { QuranVerse } from '../../types';

// What a verse sheet loads for its āyah. QuranSheet fills it and CompileTab
// reads it, so it is a file of its own, which neither has to import from the
// other. Moved verbatim from EntitySheet.tsx in restructure Phase 5 step 5e2
// (docs/refactor/plans/phase5-big-ui-files.md).

export interface QuranSheetData {
  verse: QuranVerse | null;
  bundledEnglish: string;
  bundledName: string;
  tafsir: TafsirResult[];
  similar: RelatedAyah[];
  topics: TopicResult[];
  surah: SurahInfoResult | null;
  quran: QuranIndex;
  english: QuranEnglish;
  resourceIds: string[];
}
