// ============================================================================
// ZONO creative-studio — single source of truth for provider + image model.
// The model string is NEVER hardcoded in business logic — every image call
// resolves it here. Precedence: OPENAI_IMAGE_MODEL → legacy ZONO alias →
// verified default. Do NOT add a second OpenAI integration.
//
// Default model: gpt-image-2 — verified available in the OpenAI API
// (OpenAI "Introducing gpt-image-2 — available today in the API", 2026).
// gpt-image-1 is retired (see RETIRED_IMAGE_MODELS): a stale pin to it is coerced to the default.
// ============================================================================

/** Verified default image model (override via env). */
export const DEFAULT_IMAGE_MODEL = "gpt-image-2";
/** Models this integration is known to support. Extend as OpenAI ships more. */
export const SUPPORTED_IMAGE_MODELS = ["gpt-image-2"] as const;
/** RETIRED models — never used again. Any request/env pin for one is coerced to
 *  the current default (user mandate: "תגרוס את הישן" — scrap the old model). */
export const RETIRED_IMAGE_MODELS = ["gpt-image-1", "dall-e-2", "dall-e-3"] as const;

/** Resolve the OpenAI image model. A retired pin (e.g. a stale gpt-image-1 env
 *  var) is coerced to the verified default so the old model can never come back. */
export function resolveImageModel(): string {
  const requested = (process.env.OPENAI_IMAGE_MODEL || process.env.ZONO_OPENAI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL).trim();
  if ((RETIRED_IMAGE_MODELS as readonly string[]).includes(requested)) return DEFAULT_IMAGE_MODEL;
  return requested || DEFAULT_IMAGE_MODEL;
}

export type ImageProviderName = "openai" | "mock";

/** Which provider to use. Mock when no key (deterministic tests); openai when a key exists. */
export function resolveProviderName(): ImageProviderName {
  return process.env.OPENAI_API_KEY ? "openai" : "mock";
}

export interface ImageConfigStatus {
  provider: ImageProviderName;
  model: string;
  hasKey: boolean;
  modelRecognized: boolean;
  /** true when live generation can run; false → mock only (configuration-blocked). */
  liveReady: boolean;
  notes: string[];
}

/**
 * Validate configuration without exposing secrets. Never returns/logs the key.
 * `liveReady` is false when no key is present — callers must fall back to mock
 * and mark live generation as configuration-blocked (not "complete").
 */
export function validateImageConfig(): ImageConfigStatus {
  const hasKey = Boolean(process.env.OPENAI_API_KEY);
  const model = resolveImageModel();
  const modelRecognized = (SUPPORTED_IMAGE_MODELS as readonly string[]).includes(model);
  const notes: string[] = [];
  if (!hasKey) notes.push("OPENAI_API_KEY not set — using mock provider; live generation is configuration-blocked.");
  if (!modelRecognized) notes.push(`Model '${model}' is not in the known-supported list; confirm it against current OpenAI docs.`);
  return {
    provider: hasKey ? "openai" : "mock",
    model,
    hasKey,
    modelRecognized,
    liveReady: hasKey,
    notes,
  };
}
