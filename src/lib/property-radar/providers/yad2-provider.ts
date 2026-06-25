// ============================================================================
// ZONO Property Radar™ — Yad2 provider (connector-backed, real).
// All fetching goes through the generic Apify connector, configured purely via
// env (APIFY_YAD2_ACTOR_ID + token). Fails with ProviderNotConfiguredError when
// not configured — never crashes the build.
// ============================================================================
import { ApifyBackedProvider } from "./apify-backed-provider";
import { buildYad2ActorInput } from "./input-builders";
import { normalizeYad2Details, normalizeYad2Metadata } from "./yad2-normalizer";
import type { PropertyRadarProviderEnv } from "../connectors/env";
import type { RawListing } from "../connectors/types";
import type {
  NormalizedListingDetails,
  NormalizedListingMetadata,
  PropertyProviderScanOptions,
  PropertyRadarArea,
} from "./types";

export class Yad2PropertyProvider extends ApifyBackedProvider {
  readonly providerName = "yad2" as const;
  protected providerNameForCosts(): "yad2" { return "yad2"; }
  protected resolveActorId(env: PropertyRadarProviderEnv): string | null { return env.yad2ActorId; }
  protected isEnabled(env: PropertyRadarProviderEnv): boolean { return env.yad2Enabled; }
  protected buildInput(area: PropertyRadarArea, options?: PropertyProviderScanOptions): Record<string, unknown> {
    return buildYad2ActorInput(area, options);
  }
  protected toMetadata(raw: RawListing): NormalizedListingMetadata { return normalizeYad2Metadata(raw); }
  protected toDetails(raw: RawListing): NormalizedListingDetails { return normalizeYad2Details(raw); }
}
