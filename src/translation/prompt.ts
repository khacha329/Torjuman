import type { BlockType, GlossaryEntry } from '../types';
import { sha256 } from '../lib/hash';
import { estimateTokens } from './models';
import type { ProviderId, TranslationRequest } from './TranslationProvider';

// Prompt assembly, shared by every provider.
//
// Both providers call the same two functions, which is what makes "glossary
// terms are applied identically under both providers" true by construction
// rather than by two implementations happening to agree.
//
// The split matters for cost. `renderSystem` is byte-identical across every
// call in a session, so it is the cacheable prefix. `renderUser` holds
// everything that varies. Never move glossary or profile text into the user
// message, and never filter the glossary per call: a prefix that changes is a
// prefix that is re-billed in full every time.

export function glossaryHashOf(glossary: GlossaryEntry[]): string {
  const canonical = [...glossary]
    .sort((a, b) => a.arabic.localeCompare(b.arabic))
    .map((entry) => `${entry.arabic} ${entry.english} ${entry.note ?? ''}`)
    .join('');
  return sha256(canonical).slice(0, 16);
}

export const TRANSLITERATION_INSTRUCTION =
  'TRANSLITERATION\n' +
  'In addition to rule 5, give a Latin-script transliteration alongside each\n' +
  'Arabic term you keep in Arabic script, e.g. رحمه الله (raḥimahu llāh — may\n' +
  'Allah have mercy on him).';

/** The stable, cacheable prefix: profile instructions followed by the glossary. */
export function renderSystem(request: TranslationRequest): string {
  const parts = [request.systemPrompt];

  if (request.glossary.length > 0) {
    const terms = request.glossary
      .map((entry) =>
        entry.note
          ? `${entry.arabic} = ${entry.english}  [${entry.note}]`
          : `${entry.arabic} = ${entry.english}`,
      )
      .join('\n');
    parts.push(
      `GLOSSARY\nRender these terms exactly as given wherever they appear:\n\n${terms}`,
    );
  } else {
    parts.push('GLOSSARY\n(empty — no fixed renderings have been set yet)');
  }

  return parts.join('\n\n');
}

const TYPE_LABELS: Record<BlockType, string> = {
  chapter_title: 'chapter heading',
  quran: 'Qurʾānic verse',
  hadith_matn: 'hadith text (matn)',
  takhrij: 'takhrīj (source attribution)',
  sharh: 'commentary',
  poetry: 'poetry',
  body: 'prose',
};

/** The per-call content. Everything here varies, so none of it is cached. */
export function renderUser(request: TranslationRequest): string {
  const sections: string[] = [];

  if (request.contextBefore.trim()) {
    sections.push(
      '<context_before>\n' +
        'The passage that comes immediately before the target. Provided only so\n' +
        'you can resolve pronouns and follow the argument. DO NOT TRANSLATE IT.\n\n' +
        request.contextBefore +
        '\n</context_before>',
    );
  }

  const uniqueTypes = [...new Set(request.blockTypes.map((type) => TYPE_LABELS[type]))];
  const numbers = request.hadithNumbers?.filter(Boolean) ?? [];
  const verses = request.knownQuranRefs?.filter(Boolean) ?? [];

  sections.push(
    '<target>\n' +
      'This — and only this — is the text to translate.\n' +
      (uniqueTypes.length > 0 ? `The source marks it as: ${uniqueTypes.join(', ')}.\n` : '') +
      (numbers.length > 0
        ? `The source numbers this hadith ${numbers.join(', ')} in Riyāḍ aṣ-Ṣāliḥīn; ` +
          'use that in the reference field.\n'
        : '') +
      // Already matched against the muṣḥaf locally, so the model is told rather
      // than asked. It still emits the quran segment; it just does not have to
      // work out which verse it is, and cannot contradict a verified match.
      (verses.length > 0
        ? `The Qurʾānic verses quoted in this passage have already been identified ` +
          `as ${verses.join(', ')}. Use exactly these references and do not substitute your own.\n`
        : '') +
      '\n' +
      request.targetText +
      '\n</target>',
  );

  if (request.contextAfter.trim()) {
    sections.push(
      '<context_after>\n' +
        'The passage that follows the target. Provided only for continuity.\n' +
        'DO NOT TRANSLATE IT.\n\n' +
        request.contextAfter +
        '\n</context_after>',
    );
  }

  sections.push(
    'Translate the <target> passage according to your instructions.\n' +
      'Respond with the JSON array only.',
  );

  return sections.join('\n\n');
}

/** What the glossary costs, so its weight is visible rather than invisible. */
export function glossaryTokenEstimate(glossary: GlossaryEntry[]): number {
  return estimateTokens(
    renderSystem({
      systemPrompt: '',
      glossary,
      targetText: '',
      contextBefore: '',
      contextAfter: '',
      blockTypes: [],
      model: '',
    }),
  );
}

/**
 * Cache key for a translation.
 *
 * providerId and model are part of the key. Without them, translating a
 * passage on Gemini and then switching to Sonnet would silently serve the
 * Gemini card — and since the entire point of the two tiers is that their
 * output differs, that would be actively misleading.
 */
export function cacheKeyFor(input: {
  startBlockId: string;
  startOffset: number;
  endBlockId: string;
  endOffset: number;
  profileId: string;
  profileVersion: number;
  glossaryHash: string;
  providerId: ProviderId;
  model: string;
}): string {
  return sha256(
    [
      input.startBlockId,
      input.startOffset,
      input.endBlockId,
      input.endOffset,
      input.profileId,
      input.profileVersion,
      input.glossaryHash,
      input.providerId,
      input.model,
    ].join('|'),
  );
}
