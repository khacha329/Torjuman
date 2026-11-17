import type {
  Book,
  Entity,
} from '../../types';
import { HadithSheet } from './HadithSheet';
import { QuranSheet } from './QuranSheet';

// The sheet that opens when a verse or ḥadīth is tapped.

export function EntitySheet(props: {
  entity: Entity;
  anchor: HTMLElement;
  /** The Arabic this entity covers, read out of the blocks. */
  sourceText: string;
  /** The passage around it, where the isnād names the narrator. */
  contextText: string;
  onClose: () => void;
  onTranslateSurrounding: () => void;
  /** Look this ḥadīth up in one imported commentary. */
  onSharh: (book: Book) => void;
  /** Propose translating this ḥadīth's whole commentary. */
  onTranslateAll: () => void;
}) {
  return props.entity.type === 'quran' ? (
    <QuranSheet {...props} />
  ) : (
    <HadithSheet {...props} />
  );
}
