// ============================================================================
// ZONO Property Radar™ — connector factory.
// Resolves the configured connector for a provider from env. Returns null when
// the provider isn't configured (so the provider can fail with a clear message)
// — WITHOUT loading the server-only Apify code in that case. The concrete
// connector is lazy-imported only when actually configured, which also keeps
// this module import-safe for dev/test contexts.
// Register additional connector implementations in the switch to make them
// swappable without changing providers or the sync engine.
// ============================================================================
import type { PropertyProviderName } from "../types";
import { getRadarConnectorConfig } from "./config";
import type { ConnectorRuntimeConfig, ScrapeConnector } from "./types";

export interface ResolvedConnector {
  connector: ScrapeConnector;
  config: ConnectorRuntimeConfig;
}

/** Build the connector for a provider, or null when unconfigured/unknown. */
export async function createRadarConnector(
  provider: PropertyProviderName,
): Promise<ResolvedConnector | null> {
  const config = getRadarConnectorConfig(provider);
  if (!config) return null;

  switch (config.connector) {
    case "apify": {
      const { ApifyConnector } = await import("./apify-connector"); // server-only, lazy
      return { connector: new ApifyConnector(config), config };
    }
    // case "myscraper": { const { MyScraperConnector } = await import("./myscraper-connector"); return { connector: new MyScraperConnector(config), config }; }
    default:
      return null; // unknown connector → treat as unconfigured (safe)
  }
}

export { getRadarConnectorConfig, radarConnectorEnvStatus } from "./config";
export type { ScrapeConnector, ScrapeJob, RawListing, ConnectorRuntimeConfig } from "./types";
