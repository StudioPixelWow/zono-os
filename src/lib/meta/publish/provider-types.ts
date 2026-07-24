// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PROVIDER PUBLISH CONTRACTS. Phase 3A.
// ----------------------------------------------------------------------------
// The canonical request/result the publishing engine hands to the sealed Graph
// publish gateway. The request carries a server-resolved credential + provider-
// fetchable media URLs (never surfaced to a client); the result is canonical —
// NO raw Graph payload escapes. `ambiguous` marks a write whose acceptance is
// unknown (must not be auto-retried).
// ============================================================================
import type { MetaPlatform } from "../types";

export interface ProviderPublishMedia {
  url: string;
  kind: "image" | "video";
  mime: string;
}

export interface ProviderPublishRequest {
  platform: MetaPlatform;
  contentKind: string;
  assetExternalId: string;
  tokenPlain: string;
  caption: string;
  hashtags: readonly string[];
  media: readonly ProviderPublishMedia[];
  idempotencyKey: string;
  correlationId: string;
  timeoutMs: number;
  pollMaxAttempts: number;
  pollMaxMs: number;
}

export type ProviderProcessingState = "done" | "processing" | "ambiguous";

export interface ProviderPublishError {
  kind: string;
  safeMessage: string;
  providerCodeCategory: string | null;
  retryClass: string;
}

export interface ProviderPublishResult {
  ok: boolean;
  providerObjectId: string | null;
  providerContainerId: string | null;
  permalink: string | null;
  processingState: ProviderProcessingState;
  ambiguous: boolean;
  error: ProviderPublishError | null;
  warnings: readonly string[];
}

/** The sealed publishing gateway the engine depends on (implemented in provider/graph). */
export interface PublishGateway {
  publish(req: ProviderPublishRequest): Promise<ProviderPublishResult>;
}
