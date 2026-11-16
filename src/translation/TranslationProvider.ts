import type {
  BlockType,
  CloudProviderId,
  GlossaryEntry,
  TranslatedSegment,
  TranslationErrorKind,
  TranslationUsage,
} from '../types';

// The seam between the app and whichever service actually does the translating.
//
// Code outside src/translation/ asks the registry for the provider a profile
// pins and calls this interface; a provider describes itself through the
// fields below (models, default, key link and placeholder), so screens need
// not name one. What still names a provider on purpose — the seeded profile,
// Onboarding's copy, the session totals, compile's table, Explain and gloss —
// is listed with the reason in docs/refactor/plans/phase3-provider-seams.md
// (Design §5).
//
// Both providers are bring-your-own-key. No key is embedded in the app: a key
// shipped inside a distributed client is trivially extractable and the bill
// would be unbounded.

export interface ModelOption {
  id: string;
  label: string;
  /** Shown under the option in the settings dropdown. */
  note: string;
}

export interface TranslationRequest {
  /** The Arabic the user selected. */
  targetText: string;
  /** Preceding two blocks, supplied as context and not to be translated. */
  contextBefore: string;
  /** Following two blocks, same. */
  contextAfter: string;
  blockTypes: BlockType[];
  /** From the active TranslationProfile. */
  systemPrompt: string;
  glossary: GlossaryEntry[];
  model: string;
  /** Hadith numbers the source assigns to the selection, if any. */
  hadithNumbers?: string[];
  /**
   * Verse references already resolved locally against the bundled muṣḥaf.
   *
   * These are facts, not guesses: the app matched the quoted text against the
   * Qurʾān itself. Telling the model saves it the work of identifying them and
   * stops it inventing a reference that disagrees with one we can prove.
   */
  knownQuranRefs?: string[];
  /** Turn on the provider's web-search tool for this one request. */
  allowExternalLookup?: boolean;
}

export interface TranslationResult {
  segments: TranslatedSegment[];
  usage: TranslationUsage;
  /** Estimated USD. Null where the provider is billed in requests, not money. */
  costUsd: number | null;
  /** Raw model output, kept so a parse failure loses nothing. */
  raw: string;
}

export class TranslationError extends Error {
  readonly kind: TranslationErrorKind;
  readonly retryAfterSeconds: number | null;
  readonly raw: string | null;

  constructor(
    kind: TranslationErrorKind,
    message: string,
    options: { retryAfterSeconds?: number | null; raw?: string | null } = {},
  ) {
    super(message);
    this.name = 'TranslationError';
    this.kind = kind;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.raw = options.raw ?? null;
  }
}

export interface TranslationProvider {
  /**
   * Cloud only. The on-device path is deliberately not a TranslationProvider:
   * it cannot honour a system prompt, and it must only ever receive the prose
   * spans that offline/segmentSelection.ts hands it.
   */
  readonly id: CloudProviderId;
  readonly displayName: string;
  readonly availableModels: ModelOption[];
  /** Every model a card may name: the offered ones, then superseded ones still labelled. */
  readonly knownModels: ModelOption[];
  readonly defaultModel: string;
  /** Where the user goes to get a key. */
  readonly keyHelpUrl: string;
  /** Shown in an empty key field: what this provider's keys start with. */
  readonly keyPlaceholder: string;
  readonly isFree: boolean;
  /** One line describing what this provider is fit for. */
  readonly fitFor: string;

  validateKey(key: string): Promise<boolean>;

  translate(
    request: TranslationRequest,
    key: string,
    onChunk?: (partial: string) => void,
  ): Promise<TranslationResult>;
}
