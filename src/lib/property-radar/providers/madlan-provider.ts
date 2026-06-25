// ============================================================================
// ZONO Property Radar™ — Madlan provider (connector-backed, real).
// Delegates fetching to a swappable ScrapeConnector configured purely via env
// (PROPERTY_RADAR_MADLAN_ACTOR / APIFY_MADLAN_ACTOR_ID + token). Fails clearly
// with ProviderNotConfiguredError when the connector isn't set up.
// ============================================================================
import { ApifyBackedProvider } from "./apify-backed-provider";

export class MadlanPropertyProvider extends ApifyBackedProvider {
  readonly providerName = "madlan" as const;
  // Override buildInput() here if the Madlan actor expects different keys.
}
