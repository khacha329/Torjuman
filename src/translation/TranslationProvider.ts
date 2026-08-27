import type { BlockType, GlossaryEntry, TranslatedSegment } from '../types';

// The seam between the app and whichever service actually does the translating.
//
// Nothing outside src/translation/ may reference a provider by name, except the
// registry and the settings screen. Everything else asks the registry for the
// provider a profile pins and calls this interface.
//
// Both providers are bring-your-own-key. No key is embedded in the app: a key
// shipped inside a distributed client is trivially extractable and the bill
// would be unbounded.

/**
 * `offline` labels a card produced by the on-device model. It is a label, not a
 * member of the provider registry — see registry.ts for why the offline path is
 * deliberately not interchangeable with the cloud ones.
 */
export type ProviderId = 'anthropic' | 'gemini' | 'offline';

/** The providers that talk to a network service and take an API key. */
export type CloudProviderId = Exclude<ProviderId, 'offline'>;

export function isCloudProvider(id: ProviderId): id is CloudProviderId {
  return id !== 'offline';
}

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

/** Token counts, normalized across providers. */
export interface TranslationUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface TranslationResult {
  segments: TranslatedSegment[];
  usage: TranslationUsage;
  /** Estimated USD. Null where the provider is billed in requests, not money. */
  costUsd: number | null;
  /** Raw model output, kept so a parse failure loses nothing. */
  raw: string;
}

/**
 * Why a translation failed, in the terms the user needs.
 *
 * `auth` and `rate-limit` in particular must stay distinguishable: one means
 * "your key is wrong", the other means "wait a minute". A generic error message
 * sends the user hunting in entirely the wrong place.
 */
export type TranslationErrorKind =
  | 'auth'
  | 'rate-limit'
  | 'network'
  | 'refusal'
  | 'parse'
  /** The token limit was reached mid-answer. A different remedy from a parse error. */
  | 'truncated'
  | 'api';

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
  readonly defaultModel: string;
  /** Where the user goes to get a key. */
  readonly keyHelpUrl: string;
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
