// ============================================================================
// ZONO Property Radar™ — Madlan provider (PLACEHOLDER).
// Architecture stub only. Real incremental scanning + detail fetching against
// Madlan lands in a later phase. Every method throws ProviderNotImplementedError.
// ============================================================================
import type {
  NormalizedListingDetails,
  PropertyProvider,
  PropertyProviderScanResult,
  PropertyRadarArea,
} from "./types";
import { ProviderNotImplementedError } from "./errors";

export class MadlanPropertyProvider implements PropertyProvider {
  readonly providerName = "madlan" as const;

  async scanAreaMetadata(_area: PropertyRadarArea): Promise<PropertyProviderScanResult> {
    void _area;
    throw new ProviderNotImplementedError("madlan", "Madlan scanAreaMetadata is not implemented yet");
  }

  async fetchListingDetails(externalId: string): Promise<NormalizedListingDetails> {
    void externalId;
    throw new ProviderNotImplementedError("madlan", "Madlan fetchListingDetails is not implemented yet");
  }
}
