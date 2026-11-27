import type { CardFallback, CloudProviderId } from '../../types';
import {
  TranslationError,
  type TranslationRequest,
  type TranslationResult,
} from '../TranslationProvider';
import {
  ANTHROPIC_CROSS_FALLBACK_MODEL,
  ANTHROPIC_FALLBACK_ORDER,
  GEMINI_MODELS,
} from '../models';
import { modelLabel, providerFor } from './registry';

// When the model a profile asks for is busy, another one answers.
//
// The owner saw Gemini turn translations away with "This model is currently
// experiencing high demand" (503). Each provider already retries such an
// answer a few times (GeminiProvider's SERVER_RETRIES, the Anthropic SDK's
// two retries of a 529). If those fail too, the translation is asked of the
// next model in a chain the owner set (2026-11-26):
//
//   Gemini   the profile's model, then every other offered Gemini model in
//            GEMINI_MODELS' order (3.8 Flash → 3.6 Flash → 3.5 Flash Lite →
//            3.1 Flash Lite), then Claude Haiku 5.5;
//   Claude   the profile's model, then each cheaper Claude model
//            (ANTHROPIC_FALLBACK_ORDER), then the Gemini models in that order.
//
// Crossing to the other provider needs that provider's key and the Settings
// switch (`crossProviderFallback`, on by default). A step that crosses gets
// the request without `allowExternalLookup` (the owner's answer to the lane's
// review): a Gemini translation that Haiku takes over is the plain one Gemini
// would have given, not a paid research pass with web search. The on-device
// model is never in a chain: it cannot honour the prompt, and it must only
// ever see the prose that offline/segmentSelection.ts cuts out for it.
//
// What starts a fallback is only an `overloaded` error from the profile's own
// model, and only one with no paid output on it: an overload in the middle of
// a Claude reply has billed tokens in its raw text, and asking again elsewhere
// would throw that reply away. A model further down the chain is stepped over
// when it is busy, not offered to the key, rate-limited, or refuses the key,
// as long as it too has nothing paid on it. Anything else from it (a reply it
// stopped, one that could not be read) is the answer, and the error says
// which model gave it (`answeredBy`).
//
// It sits under providers/ because it asks the registry for providers, which
// the translation core may not import (docs/refactor/layers.json).

/** One model the chain may ask. */
export interface FallbackStep {
  providerId: CloudProviderId;
  model: string;
}

export interface FallbackOutcome {
  result: TranslationResult;
  /** Which provider and model answered. */
  providerId: CloudProviderId;
  model: string;
  /** Set when that is not the one asked for. */
  fallback: CardFallback | null;
}

/** The models asked, in order, for a translation pinned to `providerId` and `model`. */
export function fallbackChain(
  providerId: CloudProviderId,
  model: string,
  options: { crossProvider: boolean; hasKey: (id: CloudProviderId) => boolean },
): FallbackStep[] {
  const gemini = GEMINI_MODELS.map((option) => option.id);
  const own: FallbackStep[] = [{ providerId, model }];
  let cross: FallbackStep[];
  if (providerId === 'gemini') {
    own.push(...gemini.filter((id) => id !== model).map((id) => ({ providerId, model: id })));
    cross = [{ providerId: 'anthropic', model: ANTHROPIC_CROSS_FALLBACK_MODEL }];
  } else {
    const at = ANTHROPIC_FALLBACK_ORDER.indexOf(model);
    if (at !== -1) {
      own.push(...ANTHROPIC_FALLBACK_ORDER.slice(at + 1).map((id) => ({ providerId, model: id })));
    }
    cross = gemini.map((id) => ({ providerId: 'gemini' as const, model: id }));
  }
  const other: CloudProviderId = providerId === 'gemini' ? 'anthropic' : 'gemini';
  return options.crossProvider && options.hasKey(other) ? [...own, ...cross] : own;
}

/** Why a step was stepped over, as the card's note says it. */
function whyPassed(error: TranslationError): string | null {
  if (error.raw || error.usage) return null;
  if (error.condition === 'overloaded') return 'was busy';
  if (error.condition === 'model-unavailable') return 'is not offered to this key';
  if (error.kind === 'rate-limit') return 'was rate-limited';
  if (error.kind === 'auth') return 'refused the key';
  return null;
}

/** "Flash 3.8", or "Claude Haiku 5.5" where the chain crossed providers. */
function stepName(step: FallbackStep, asked: FallbackStep): string {
  const label = modelLabel(step.providerId, step.model);
  return step.providerId === asked.providerId
    ? label
    : `${providerFor(step.providerId).displayName} ${label}`;
}

/** "Flash Lite 3.5 was busy and Flash 3.8 was busy": the steps passed over. */
function passedOver(passed: { step: FallbackStep; why: string }[], asked: FallbackStep): string {
  const parts = passed.map(({ step, why }) => `${stepName(step, asked)} ${why}`);
  if (parts.length <= 2) return parts.join(' and ');
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/**
 * Translate on the chain for `providerId` and `request.model`, returning the
 * first answer and who gave it. `onChunk` hears the active model's progress,
 * and a line saying which model is asked next when one is passed over.
 */
export async function translateWithFallback({
  request,
  providerId,
  keyFor,
  crossProvider,
  onChunk,
}: {
  request: TranslationRequest;
  providerId: CloudProviderId;
  keyFor: (id: CloudProviderId) => string;
  crossProvider: boolean;
  onChunk?: (partial: string) => void;
}): Promise<FallbackOutcome> {
  const chain = fallbackChain(providerId, request.model, {
    crossProvider,
    hasKey: (id) => keyFor(id).trim() !== '',
  });
  const asked = chain[0];
  const passed: { step: FallbackStep; why: string }[] = [];
  let first: TranslationError | null = null;

  for (const [index, step] of chain.entries()) {
    const fallback: CardFallback | null =
      index === 0
        ? null
        : {
            fromProviderId: asked.providerId,
            fromModel: asked.model,
            note: `${passedOver(passed, asked)}, so ${stepName(step, asked)} answered.`,
          };
    try {
      const crossed = step.providerId !== asked.providerId;
      const result = await providerFor(step.providerId).translate(
        crossed
          ? { ...request, model: step.model, allowExternalLookup: false }
          : { ...request, model: step.model },
        keyFor(step.providerId),
        onChunk,
      );
      return { result, providerId: step.providerId, model: step.model, fallback };
    } catch (caught) {
      if (!(caught instanceof TranslationError)) throw caught;
      const last = index === chain.length - 1;

      let why: string | null;
      if (first === null) {
        // Only an overload of the profile's own model, with nothing paid on
        // it, starts the chain.
        if (caught.condition !== 'overloaded' || caught.raw || caught.usage || last) throw caught;
        first = caught;
        why = 'was busy';
      } else {
        why = whyPassed(caught);
        if (why === null) {
          // This model answered, with a failure of its own: that is the
          // card's outcome, said to come from it. The note says it was asked,
          // not that it answered, since the card shows a failure under it.
          throw caught.with({
            answeredBy: {
              providerId: step.providerId,
              model: step.model,
              fallback: { ...fallback!, note: `${passedOver(passed, asked)}, so ${stepName(step, asked)} was asked.` },
            },
          });
        }
      }
      passed.push({ step, why });

      if (last) {
        // The profile's model's own error, which says why the chain began,
        // and then what every other model did. Claude's mapped messages end
        // without a full stop, Gemini's with one.
        const said = /[.!?…]$/.test(first.message) ? first.message : `${first.message}.`;
        throw first.with({
          message: `${said} The fallback found no model to answer: ${passedOver(passed.slice(1), asked)}.`,
        });
      }
      onChunk?.(`${stepName(step, asked)} ${why}. Asking ${stepName(chain[index + 1], asked)}…`);
    }
  }
  // Not reached: the loop returns or throws on its last step.
  throw new TranslationError('api', 'The translation request did not complete.');
}
