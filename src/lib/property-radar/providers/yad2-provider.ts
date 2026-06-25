// ============================================================================
// ZONO Property Radar™ — Yad2 provider (connector-backed, real).
// Delegates all fetching to a swappable ScrapeConnector configured purely via
// env (PROPERTY_RADAR_YAD2_ACTOR / APIFY_YAD2_ACTOR_ID + token). Fails clearly
// with ProviderNotConfiguredError when the connector isn't set up.
// ============================================================================
import { ApifyBackedProvider } from "./apify-backed-provider";

export class Yad2PropertyProvider extends ApifyBackedProvider {
  readonly providerName = "yad2" as const;
  // Override buildInput() here if the Yad2 actor expects different keys.
}
