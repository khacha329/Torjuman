// The TranslatedSegment contract, declared once and given to both providers.
//
// Asking a model in prose to "return only a JSON array" is a request, not a
// constraint, and it fails in at least five distinct ways: narration around the
// JSON, markdown fences, a preamble, truncation mid-array, and — the one that
// made dig-deeper fail far more often than plain translation — extra content
// blocks from the web-search tool sitting alongside the text.
//
// Declaring the output as a schema removes the whole class of failure. Anthropic
// gets it as a forced tool call, Gemini as a responseSchema; both come back as
// parsed data with no fences, preamble, or narration possible.

export const EMIT_TOOL_NAME = 'emit_translation';

const SEGMENT_PROPERTIES = {
  type: {
    type: 'string',
    enum: ['quran', 'hadith', 'poetry', 'prose'],
    description: 'What kind of material this segment is.',
  },
  arabic: { type: 'string', description: 'The Arabic of this segment.' },
  english: {
    type: 'string',
    description:
      'The English rendering. Empty for a Qurʾānic verse or a hadith matn, which the application retrieves from an authoritative source.',
  },
  reference: {
    type: 'string',
    description: 'For quran, "surah:ayah". For hadith, the collection and number.',
  },
  note: { type: 'string', description: 'Ambiguity, or a note that a poem was summarised.' },
  uncertainTerms: {
    type: 'array',
    items: { type: 'string' },
    description: 'Arabic terms that look like glossary candidates but are not in it.',
  },
} as const;

/** Anthropic tool definition. Forced with tool_choice. */
export const EMIT_TRANSLATION_TOOL = {
  name: EMIT_TOOL_NAME,
  description: 'Return the translated segments.',
  input_schema: {
    type: 'object' as const,
    properties: {
      segments: {
        type: 'array',
        items: {
          type: 'object',
          properties: SEGMENT_PROPERTIES,
          required: ['type', 'arabic', 'english'],
        },
      },
    },
    required: ['segments'],
  },
};

/** Gemini generationConfig.responseSchema — the same shape, as a bare array. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: SEGMENT_PROPERTIES,
    required: ['type', 'arabic', 'english'],
  },
};

/**
 * Remove the "return only JSON" instruction from a profile's system prompt.
 *
 * The profile text belongs to the user and is never edited on disk. But once
 * the output shape is enforced by the API, that instruction is not merely
 * redundant — it actively encourages the model to *also* write the JSON out as
 * text alongside the tool call. So it is stripped in flight, on the paths that
 * enforce a schema, and left intact everywhere else.
 */
export function stripJsonInstruction(systemPrompt: string): string {
  return systemPrompt
    .replace(
      /^Return ONLY a JSON array of segments\..*?\n(?:Each segment:.*?\n)?/ms,
      'Break the passage into segments, one per distinct piece of material.\n',
    )
    .replace(/\n{3,}/g, '\n\n');
}
