// ============================================================================
// ZONO creative-studio — ImageProvider interface + adapters (server-only).
//
//   CreativeGenerationService → ImageProvider → OpenAIImageProvider | MockImageProvider
//
// This is a THIN adapter layer over the EXISTING OpenAI integration
// (visual-providers / openai-ad-pipeline) — it does NOT introduce a second
// OpenAI client. It exists to: (1) normalize provider errors into stable
// application error classes, (2) stamp the resolved model onto every result,
// (3) provide a deterministic mock for tests, (4) route by configuration.
// ============================================================================
import "server-only";
import { resolveImageModel, resolveProviderName } from "./model-config";
import { classifyProviderError } from "./provider-retry";
import type { ProviderErrorClass } from "./provider-retry";

export interface ImageGenParams {
  prompt: string;
  referenceImageUrls?: string[];
  size?: string;      // e.g. "1024x1536"
  n?: number;
}

export interface ImageGenResult {
  provider: "openai" | "mock";
  model: string;
  images: { b64: string; mime: string }[];
  durationMs: number;
}

export class ProviderError extends Error {
  readonly klass: ProviderErrorClass;
  readonly status?: number;
  constructor(klass: ProviderErrorClass, message: string, status?: number) {
    super(message);
    this.name = "ProviderError";
    this.klass = klass;
    this.status = status;
  }
}

export interface ImageProvider {
  readonly name: "openai" | "mock";
  generate(params: ImageGenParams): Promise<ImageGenResult>;
  edit(params: Required<Pick<ImageGenParams, "prompt" | "referenceImageUrls">> & ImageGenParams): Promise<ImageGenResult>;
}

/** Deterministic mock — no network, no key. Returns a 1x1 PNG marked with the model. */
export class MockImageProvider implements ImageProvider {
  readonly name = "mock" as const;
  private readonly px =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  private make(params: ImageGenParams): ImageGenResult {
    const n = Math.max(1, params.n ?? 1);
    return {
      provider: "mock",
      model: resolveImageModel(),
      images: Array.from({ length: n }, () => ({ b64: this.px, mime: "image/png" })),
      durationMs: 0,
    };
  }
  async generate(params: ImageGenParams): Promise<ImageGenResult> { return this.make(params); }
  async edit(params: ImageGenParams): Promise<ImageGenResult> { return this.make(params); }
}

/**
 * OpenAI adapter. Delegates the actual HTTP call to the existing pipeline
 * functions (imported lazily to avoid load-order/server-only cycles), then
 * normalizes errors + stamps the model. No second OpenAI client is created.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly name = "openai" as const;

  private async call(fn: () => Promise<{ b64: string; mime: string }>): Promise<ImageGenResult> {
    const start = Date.now();
    try {
      const img = await fn();
      return { provider: "openai", model: resolveImageModel(), images: [img], durationMs: Date.now() - start };
    } catch (err) {
      const { klass, status } = classifyProviderError(err);
      throw new ProviderError(klass, (err as Error)?.message ?? "image provider error", status);
    }
  }

  async generate(params: ImageGenParams): Promise<ImageGenResult> {
    const { generateFinalImage } = await import("./visual-providers");
    return this.call(() => generateFinalImage(params.prompt, params.referenceImageUrls?.[0] ?? null, { size: params.size }));
  }

  async edit(params: ImageGenParams): Promise<ImageGenResult> {
    const { generateAdImageRaw } = await import("./openai-ad-pipeline");
    return this.call(() => generateAdImageRaw(params.prompt, params.referenceImageUrls ?? []));
  }
}

/** Resolve the configured provider (mock when no key). */
export function resolveImageProviderInstance(): ImageProvider {
  return resolveProviderName() === "openai" ? new OpenAIImageProvider() : new MockImageProvider();
}
