// ============================================================================
// ZONO Property Radar™ — connector config (server-only). ENV IS THE ONLY SOURCE.
// Nothing here is hardcoded: tokens, actor/job refs, base URL, timeouts, retries
// and rate limits all come from environment variables. Returns null when a
// provider isn't fully configured, so providers can fail with a clear message
// instead of calling a half-configured scraper.
//
// Environment (all optional unless you enable a real provider):
//   PROPERTY_RADAR_CONNECTOR              connector impl (default "apify")
//   PROPERTY_RADAR_APIFY_TOKEN | APIFY_TOKEN
//   PROPERTY_RADAR_YAD2_ACTOR  | APIFY_YAD2_ACTOR_ID
//   PROPERTY_RADAR_MADLAN_ACTOR| APIFY_MADLAN_ACTOR_ID
//   PROPERTY_RADAR_APIFY_BASE_URL         optional Apify base url override
//   PROPERTY_RADAR_TIMEOUT_MS             default 120000
//   PROPERTY_RADAR_MAX_RETRIES            default 2
//   PROPERTY_RADAR_RATE_LIMIT_PER_MIN     default 20
//   PROPERTY_RADAR_MAX_ITEMS_PER_SCAN     default 50
//
// Reads env only (no I/O, no secrets in code) — safe to import anywhere; the
// actual network connector (apify-connector) is the server-only part.
// ============================================================================
import type { PropertyProviderName } from "../types";
import type { ConnectorRuntimeConfig } from "./types";

function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

/** Resolve the connector runtime config for a provider, or null if unconfigured. */
export function getRadarConnectorConfig(
  provider: PropertyProviderName,
): ConnectorRuntimeConfig | null {
  const connector = (process.env.PROPERTY_RADAR_CONNECTOR ?? "apify").trim() || "apify";

  // Secret token — env only.
  const token = firstEnv("PROPERTY_RADAR_APIFY_TOKEN", "APIFY_TOKEN");
  if (!token) return null;

  // Job/actor reference per provider — env only (no literal defaults).
  let jobRef: string | undefined;
  if (provider === "yad2") jobRef = firstEnv("PROPERTY_RADAR_YAD2_ACTOR", "APIFY_YAD2_ACTOR_ID");
  else if (provider === "madlan") jobRef = firstEnv("PROPERTY_RADAR_MADLAN_ACTOR", "APIFY_MADLAN_ACTOR_ID");
  if (!jobRef) return null;

  return {
    connector,
    token,
    jobRef,
    baseUrl: firstEnv("PROPERTY_RADAR_APIFY_BASE_URL"),
    timeoutMs: envInt("PROPERTY_RADAR_TIMEOUT_MS", 120_000),
    maxRetries: envInt("PROPERTY_RADAR_MAX_RETRIES", 2),
    rateLimitPerMinute: envInt("PROPERTY_RADAR_RATE_LIMIT_PER_MIN", 20),
    maxItemsPerScan: envInt("PROPERTY_RADAR_MAX_ITEMS_PER_SCAN", 50),
  };
}

/** Presence-only status for an admin/debug view (never returns secret values). */
export function radarConnectorEnvStatus(): {
  connector: string;
  apifyToken: boolean;
  yad2Actor: boolean;
  madlanActor: boolean;
} {
  return {
    connector: (process.env.PROPERTY_RADAR_CONNECTOR ?? "apify").trim() || "apify",
    apifyToken: !!firstEnv("PROPERTY_RADAR_APIFY_TOKEN", "APIFY_TOKEN"),
    yad2Actor: !!firstEnv("PROPERTY_RADAR_YAD2_ACTOR", "APIFY_YAD2_ACTOR_ID"),
    madlanActor: !!firstEnv("PROPERTY_RADAR_MADLAN_ACTOR", "APIFY_MADLAN_ACTOR_ID"),
  };
}
