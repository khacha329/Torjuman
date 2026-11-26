import type {
  BlockType,
  CardFallback,
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
  /**
   * Whether a web search actually ran for this result. Only the Claude
   * research pass can search; a card says "web search" only when this is true
   * (FOUND_ISSUES 43), not whenever the profile allowed it.
   */
  searched?: boolean;
  /**
   * Set when the reply stopped part-way and the segments are what came back
   * whole before it did (see TranslationCard.partial). `untranslatedFrom` is
   * an offset in the request's targetText. `stopReason` is how the reply
   * ended (finishReason, or 'none'), null when what stopped the run was not a
   * reply's ending — an HTTP error on a later part. Gemini only.
   */
  incomplete?: { stopReason: string | null; message: string; untranslatedFrom: number | null };
}

/**
 * What an error says about where it came from, where the kind alone does not
 * say enough to act on.
 *
 * - `unreachable`: no response at all, the host could not be reached. The
 *   reader marks the app offline on it (app/useOnline.ts, FOUND_ISSUES 62).
 *   A connection that drops mid-reply is not this: a response began.
 * - `overloaded`: the model or the service is failing for everyone right now
 *   (Gemini 500 and 503, Claude 500 and 529), after the retries. The one
 *   condition a fallback starts on (providers/fallback.ts).
 * - `model-unavailable`: this key is not offered the model, retired or closed
 *   to new keys. A fallback model in this state is stepped over.
 */
export type ErrorCondition = 'unreachable' | 'overloaded' | 'model-unavailable';

/** Which model actually produced an error, when a fallback model did. */
export interface AnsweredBy {
  providerId: CloudProviderId;
  model: string;
  fallback: CardFallback;
}

export interface TranslationErrorOptions {
  retryAfterSeconds?: number | null;
  raw?: string | null;
  stopReason?: string | null;
  condition?: ErrorCondition | null;
  /**
   * Tokens already billed when the error came: a Claude research pass whose
   * structuring pass then failed (FOUND_ISSUES 64). With its cost, so the
   * failed card and the session totals still count what was paid.
   */
  usage?: TranslationUsage | null;
  costUsd?: number | null;
  answeredBy?: AnsweredBy | null;
}

export class TranslationError extends Error {
  readonly kind: TranslationErrorKind;
  readonly retryAfterSeconds: number | null;
  readonly raw: string | null;
  /** The provider's own reason for stopping, or 'none' (TranslationCard.stopReason). */
  readonly stopReason: string | null;
  readonly condition: ErrorCondition | null;
  readonly usage: TranslationUsage | null;
  readonly costUsd: number | null;
  readonly answeredBy: AnsweredBy | null;

  constructor(kind: TranslationErrorKind, message: string, options: TranslationErrorOptions = {}) {
    super(message);
    this.name = 'TranslationError';
    this.kind = kind;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.raw = options.raw ?? null;
    this.stopReason = options.stopReason ?? null;
    this.condition = options.condition ?? null;
    this.usage = options.usage ?? null;
    this.costUsd = options.costUsd ?? null;
    this.answeredBy = options.answeredBy ?? null;
  }

  /**
   * The same error with some fields replaced. Every field is carried over;
   * `withRaw` (anthropic.ts) used to copy three of them and drop the rest.
   */
  with(changes: TranslationErrorOptions & { message?: string }): TranslationError {
    const { message, ...options } = changes;
    return new TranslationError(this.kind, message ?? this.message, {
      retryAfterSeconds: this.retryAfterSeconds,
      raw: this.raw,
      stopReason: this.stopReason,
      condition: this.condition,
      usage: this.usage,
      costUsd: this.costUsd,
      answeredBy: this.answeredBy,
      ...options,
    });
  }
}

/** The result of a key check. */
export interface KeyCheck {
  /** The provider accepted the key. */
  valid: boolean;
  /**
   * Of the model IDs the check was asked about, the ones the key's own model
   * list leaves out. Empty when every one is listed, when none were asked
   * about, or when the provider has no such list (Claude's check does not
   * read one).
   */
  unusableModels: string[];
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

  /**
   * Test a key. Throws a TranslationError when the key could not be tested
   * (no network, a server error): that is no verdict on the key. `models`
   * are the model IDs to look for in the key's own model list, where the
   * provider reads one.
   */
  validateKey(key: string, models?: readonly string[]): Promise<KeyCheck>;

  translate(
    request: TranslationRequest,
    key: string,
    onChunk?: (partial: string) => void,
  ): Promise<TranslationResult>;
}
