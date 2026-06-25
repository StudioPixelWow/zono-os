// ============================================================================
// ZONO Property Radar™ — Yad2 provider (PLACEHOLDER).
// Architecture stub only. Real incremental scanning + detail fetching against
// Yad2 lands in a later phase. Every method throws ProviderNotImplementedError so
// the registry can return a typed provider without any scraping wired up.
// ============================================================================
import type {
  NormalizedListingDetails,
  PropertyProvider,
  PropertyProviderScanResult,
  PropertyRadarArea,
} from "./types";
import { ProviderNotImplementedError } from "./errors";

export class Yad2PropertyProvider implements PropertyProvider {
  readonly providerName = "yad2" as const;

  async scanAreaMetadata(_area: PropertyRadarArea): Promise<PropertyProviderScanResult> {
    void _area;
    throw new ProviderNotImplementedError("yad2", "Yad2 scanAreaMetadata is not implemented yet");
  }

  async fetchListingDetails(externalId: string): Promise<NormalizedListingDetails> {
    void externalId;
    throw new ProviderNotImplementedError("yad2", "Yad2 fetchListingDetails is not implemented yet");
  }
}
