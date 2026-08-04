// ============================================================================
// ZONO creative-studio — single source of truth for provider + image model.
// The model string is NEVER hardcoded in business logic — every image call
// resolves it here. Precedence: OPENAI_IMAGE_MODEL → legacy ZONO alias →
// verified default. Do NOT add a second OpenAI integration.
//
// Default model: gpt-image-2 — verified available in the OpenAI API
// (OpenAI "Introducing gpt-image-2 — available today in the API", 2026).
// gpt-image-1 remains a supported fallback; set the env var to pin either.
// ============================================================================

/** Verified default image model (override via env). */
export const DEFAULT_IMAGE_MODEL = "gpt-image-2";
/** Models this integration is known to support. Extend as OpenAI ships more. */
export const SUPPORTED_IMAGE_MODELS = ["gpt-image-2", "gpt-image-1"] as const;

/** Resolve the configured OpenAI image model (precedence: env → legacy alias → default). */
export function resolveImageModel(): string {
  return (
    process.env.OPENAI_IMAGE_MODEL ||
    process.env.ZONO_OPENAI_IMAGE_MODEL ||
    DEFAULT_IMAGE_MODEL
  );
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
