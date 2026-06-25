// ============================================================================
// ZONO Property Radar™ — connector layer contracts (client-safe types).
// A connector is the swappable transport that fetches raw listing data. The sync
// engine NEVER sees a connector — it only sees a PropertyProvider. Apify can be
// replaced with a different backend without touching the sync engine.
// All concrete config (tokens, actor ids, timeouts, retries) comes from env.
// ============================================================================
import type { PropertyProviderName } from "../types";

export type RawListing = Record<string, unknown>;

/** Everything a connector needs to run one scrape job — built from env + runtime. */
export interface ProviderConnectorRunInput {
  provider: PropertyProviderName;
  actorId: string;
  input: Record<string, unknown>;
  timeoutMs: number;
  maxRetries: number;
  pollIntervalMs: number;
}

/** Normalized result of a connector run (provider-agnostic). */
export interface ProviderConnectorRunResult {
  provider: PropertyProviderName;
  datasetItems: unknown[];
  runId?: string;
  datasetId?: string;
  creditsUsedEstimate: number;
  durationMs: number;
  status: "success" | "timeout" | "failed";
  raw?: unknown;
}

/** What a provider can actually do — drives engine/scoring expectations. */
export interface ProviderCapabilities {
  supportsIncremental: boolean;
  supportsPagination: boolean;
  supportsPriceUpdates: boolean;
  supportsDeletedDetection: boolean;
  supportsPublishedDate: boolean;
  estimatedCreditCostPerPage: number;
  estimatedCreditCostPerFullFetch: number;
}
