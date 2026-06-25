// ============================================================================
// ZONO Property Radar™ — connector-backed provider base (import-safe).
// Implements PropertyProvider on top of a swappable ScrapeConnector. The actual
// connector (Apify, server-only) is loaded LAZILY inside the async methods, so
// importing this module never pulls server-only code — the sync engine, the
// registry and the dev-checks stay client-safe.
//
// Two-tier model: scanAreaMetadata runs ONE scrape and caches the raw items;
// fetchListingDetails serves full details from that cache (no extra scrape →
// no extra credits). When the connector isn't configured it fails clearly.
// ============================================================================
import type { PropertyProviderName } from "../types";
import type { RawListing } from "../connectors/types";
import { ProviderListingNotFoundError, ProviderNotConfiguredError } from "./errors";
import { normalizeRawToDetails, normalizeRawToMetadata } from "./normalize";
import type {
  NormalizedListingDetails,
  PropertyProvider,
  PropertyProviderScanOptions,
  PropertyProviderScanResult,
  PropertyRadarArea,
} from "./types";

export abstract class ApifyBackedProvider implements PropertyProvider {
  abstract readonly providerName: PropertyProviderName;
  // Per-process raw cache so fetchListingDetails needn't re-scrape.
  private readonly cache = new Map<string, RawListing>();

  /** Scraper input adapter. Override per provider if the actor needs other keys. */
  protected buildInput(area: PropertyRadarArea, maxItems: number): Record<string, unknown> {
    const q = area.neighborhood ? `${area.city} ${area.neighborhood}` : area.city;
    return {
      city: area.city,
      locality: area.city,
      location: q,
      query: q,
      neighborhood: area.neighborhood ?? undefined,
      dealType: "buy", // "for sale"
      maxListingsPerCity: maxItems,
      maxItems,
      maxResults: maxItems,
    };
  }

  async scanAreaMetadata(
    area: PropertyRadarArea,
    _options?: PropertyProviderScanOptions,
  ): Promise<PropertyProviderScanResult> {
    void _options;
    const resolved = await this.resolveConnector();
    if (!resolved) throw new ProviderNotConfiguredError(this.providerName);
    const { connector, config } = resolved;

    const maxItems = config.maxItemsPerScan;
    const raws = await connector.run({
      jobRef: config.jobRef,
      input: this.buildInput(area, maxItems),
      maxItems,
    });

    const listings = [];
    const seen = new Set<string>();
    for (const raw of raws) {
      const meta = normalizeRawToMetadata(this.providerName, raw);
      if (!meta.externalId || seen.has(meta.externalId)) continue;
      seen.add(meta.externalId);
      this.cache.set(meta.externalId, raw);
      listings.push(meta);
    }

    return {
      provider: this.providerName,
      area,
      listings,
      scannedPages: 1,
      creditsUsedEstimate: 1, // one scrape run per area scan
      stopReason: "complete",
      raw: { itemsReturned: raws.length, connector: connector.name },
    };
  }

  async fetchListingDetails(externalId: string): Promise<NormalizedListingDetails> {
    const raw = this.cache.get(externalId);
    if (!raw) throw new ProviderListingNotFoundError(this.providerName, externalId);
    return normalizeRawToDetails(this.providerName, raw);
  }

  // Lazy server-only import — keeps this module client-safe to import.
  private async resolveConnector() {
    const mod = await import("../connectors");
    return mod.createRadarConnector(this.providerName);
  }
}
