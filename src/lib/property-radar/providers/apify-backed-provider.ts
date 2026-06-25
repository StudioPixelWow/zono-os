// ============================================================================
// ZONO Property Radar™ — connector-backed provider base (import-safe).
// Implements PropertyProvider on top of the generic Apify connector. The Apify
// client (server-only, fetch-based) is loaded LAZILY inside scanAreaMetadata, so
// importing this module never pulls server-only code — the sync engine, registry
// and dev-checks stay client-safe.
//
// Guards (fail safe, never crash build):
//   • PROPERTY_RADAR_PROVIDER must be "apify"          → else ProviderNotConfigured
//   • provider must be enabled (PROPERTY_RADAR_*_ENABLED) → else ProviderNotConfigured
//   • APIFY token + actor id must exist                → else ProviderNotConfigured
//
// Two-tier model: scanAreaMetadata runs ONE actor + caches raw items;
// fetchListingDetails serves details from that cache (no extra run). Actor-level
// detail fetch isn't supported yet → details are marked detailFetchSupported:false.
// ============================================================================
import type { PropertyProviderName } from "../types";
import {
  getPropertyRadarProviderEnv,
  getProviderCreditCosts,
  type PropertyRadarProviderEnv,
} from "../connectors/env";
import type { ProviderCapabilities, RawListing } from "../connectors/types";
import { ProviderListingNotFoundError, ProviderNotConfiguredError, ProviderInvalidResponseError } from "./errors";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyProvider,
  PropertyProviderScanOptions,
  PropertyProviderScanResult,
  PropertyRadarArea,
} from "./types";

export abstract class ApifyBackedProvider implements PropertyProvider {
  abstract readonly providerName: "yad2" | "madlan";
  readonly capabilities: ProviderCapabilities;
  private readonly cache = new Map<string, RawListing>();

  constructor() {
    // Costs are env-configurable (default 1 each).
    const cost = getProviderCreditCosts(this.providerNameForCosts());
    this.capabilities = {
      supportsIncremental: false, // actor doesn't expose a watermark yet
      supportsPagination: true,
      supportsPriceUpdates: true,
      supportsDeletedDetection: false, // partial at best — handled by validation pass
      supportsPublishedDate: true,
      estimatedCreditCostPerPage: cost.perPage,
      estimatedCreditCostPerFullFetch: cost.perFullFetch,
    };
  }

  // Subclass hooks.
  protected abstract resolveActorId(env: PropertyRadarProviderEnv): string | null;
  protected abstract isEnabled(env: PropertyRadarProviderEnv): boolean;
  protected abstract buildInput(area: PropertyRadarArea, options?: PropertyProviderScanOptions): Record<string, unknown>;
  protected abstract toMetadata(raw: RawListing): NormalizedListingMetadata;
  protected abstract toDetails(raw: RawListing): NormalizedListingDetails;
  protected abstract providerNameForCosts(): "yad2" | "madlan";

  async scanAreaMetadata(
    area: PropertyRadarArea,
    options?: PropertyProviderScanOptions,
  ): Promise<PropertyProviderScanResult> {
    const env = getPropertyRadarProviderEnv();
    const name: PropertyProviderName = this.providerName;
    if (env.providerMode !== "apify") {
      throw new ProviderNotConfiguredError(name, "PROPERTY_RADAR_PROVIDER אינו 'apify'");
    }
    if (!this.isEnabled(env)) {
      throw new ProviderNotConfiguredError(name, `${name} מושבת (PROPERTY_RADAR_${name.toUpperCase()}_ENABLED)`);
    }
    if (!env.apifyTokenExists) {
      throw new ProviderNotConfiguredError(name, "APIFY_API_TOKEN חסר");
    }
    const actorId = this.resolveActorId(env);
    if (!actorId) {
      throw new ProviderNotConfiguredError(name, `actor id חסר (APIFY_${name.toUpperCase()}_ACTOR_ID)`);
    }

    const maxPages = Math.max(1, options?.maxPages ?? 1);
    const { runApifyActor } = await import("../connectors/apify-client"); // server-only, lazy
    const result = await runApifyActor({
      provider: name,
      actorId,
      input: this.buildInput(area, options),
      timeoutMs: env.timeoutMs,
      maxRetries: env.maxRetries,
      pollIntervalMs: env.pollIntervalMs,
    });
    if (result.status !== "success") {
      throw new ProviderInvalidResponseError(name, `connector status=${result.status}`);
    }

    const listings: NormalizedListingMetadata[] = [];
    const seen = new Set<string>();
    for (const item of result.datasetItems) {
      const raw = (item ?? {}) as RawListing;
      const meta = this.toMetadata(raw);
      if (!meta.externalId || seen.has(meta.externalId)) continue;
      seen.add(meta.externalId);
      this.cache.set(meta.externalId, raw);
      listings.push(meta);
    }

    return {
      provider: name,
      area,
      listings,
      scannedPages: maxPages,
      creditsUsedEstimate: Math.max(1, this.capabilities.estimatedCreditCostPerPage * maxPages),
      stopReason: "complete",
      raw: { itemsReturned: result.datasetItems.length, durationMs: result.durationMs },
    };
  }

  async fetchListingDetails(externalId: string): Promise<NormalizedListingDetails> {
    const raw = this.cache.get(externalId);
    if (!raw) throw new ProviderListingNotFoundError(this.providerName, externalId);
    const details = this.toDetails(raw);
    // Actor-level detail fetch isn't wired yet — flag it explicitly, don't fake.
    return {
      ...details,
      rawFullPayload: { ...(details.rawFullPayload ?? {}), detailFetchSupported: false },
    };
  }
}
