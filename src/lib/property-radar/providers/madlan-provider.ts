// ============================================================================
// ZONO Property Radar™ — Madlan provider (connector-backed, real).
// Fetches via the generic Apify connector, configured purely via env
// (APIFY_MADLAN_ACTOR_ID + token). Fails with ProviderNotConfiguredError when
// not configured — never crashes the build.
// ============================================================================
import { ApifyBackedProvider } from "./apify-backed-provider";
import { buildMadlanActorInput } from "./input-builders";
import { normalizeMadlanDetails, normalizeMadlanMetadata } from "./madlan-normalizer";
import type { PropertyRadarProviderEnv } from "../connectors/env";
import type { RawListing } from "../connectors/types";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyProviderScanOptions,
  PropertyRadarArea,
} from "./types";

export class MadlanPropertyProvider extends ApifyBackedProvider {
  readonly providerName = "madlan" as const;
  protected providerNameForCosts(): "madlan" { return "madlan"; }
  protected resolveActorId(env: PropertyRadarProviderEnv): string | null { return env.madlanActorId; }
  protected isEnabled(env: PropertyRadarProviderEnv): boolean { return env.madlanEnabled; }
  protected buildInput(area: PropertyRadarArea, options?: PropertyProviderScanOptions): Record<string, unknown> {
    return buildMadlanActorInput(area, options);
  }
  protected toMetadata(raw: RawListing): NormalizedListingMetadata { return normalizeMadlanMetadata(raw); }
  protected toDetails(raw: RawListing): NormalizedListingDetails { return normalizeMadlanDetails(raw); }
}
