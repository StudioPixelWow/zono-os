// ============================================================================
// ZONO Property Radar™ — provider env loader.
// Reads ONLY environment variables. Returns a token-free view safe to pass to
// any server code (apifyTokenExists is a boolean — never the token itself).
// The raw token is exposed only through getApifyToken() (server-only).
//
// Environment:
//   PROPERTY_RADAR_PROVIDER=mock|apify          (mode; default: none)
//   APIFY_API_TOKEN  (fallback: APIFY_TOKEN, PROPERTY_RADAR_APIFY_TOKEN)
//   APIFY_YAD2_ACTOR_ID / APIFY_MADLAN_ACTOR_ID
//   PROPERTY_RADAR_PROVIDER_TIMEOUT_MS=120000
//   PROPERTY_RADAR_PROVIDER_MAX_RETRIES=2
//   PROPERTY_RADAR_PROVIDER_POLL_INTERVAL_MS=3000
//   PROPERTY_RADAR_YAD2_ENABLED=true|false       (default true)
//   PROPERTY_RADAR_MADLAN_ENABLED=true|false      (default true)
// ============================================================================

export type ProviderMode = "mock" | "apify" | "none";

export interface PropertyRadarProviderEnv {
  providerMode: ProviderMode;
  apifyTokenExists: boolean;
  timeoutMs: number;
  maxRetries: number;
  pollIntervalMs: number;
  yad2ActorId: string | null;
  madlanActorId: string | null;
  yad2Enabled: boolean;
  madlanEnabled: boolean;
}

function envStr(...names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  return null;
}
function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v == null || v.trim() === "") return fallback;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

/** Token-free env view. Safe to use anywhere server-side; never reaches client. */
export function getPropertyRadarProviderEnv(): PropertyRadarProviderEnv {
  const modeRaw = (process.env.PROPERTY_RADAR_PROVIDER ?? "").trim().toLowerCase();
  const providerMode: ProviderMode = modeRaw === "mock" ? "mock" : modeRaw === "apify" ? "apify" : "none";

  return {
    providerMode,
    apifyTokenExists: !!envStr("APIFY_API_TOKEN", "APIFY_TOKEN", "PROPERTY_RADAR_APIFY_TOKEN"),
    timeoutMs: envInt("PROPERTY_RADAR_PROVIDER_TIMEOUT_MS", 120_000),
    maxRetries: envInt("PROPERTY_RADAR_PROVIDER_MAX_RETRIES", 2),
    pollIntervalMs: envInt("PROPERTY_RADAR_PROVIDER_POLL_INTERVAL_MS", 3_000),
    yad2ActorId: envStr("APIFY_YAD2_ACTOR_ID", "PROPERTY_RADAR_YAD2_ACTOR"),
    madlanActorId: envStr("APIFY_MADLAN_ACTOR_ID", "PROPERTY_RADAR_MADLAN_ACTOR"),
    yad2Enabled: envBool("PROPERTY_RADAR_YAD2_ENABLED", true),
    madlanEnabled: envBool("PROPERTY_RADAR_MADLAN_ENABLED", true),
  };
}

/**
 * The raw Apify token — SERVER-ONLY. Keep usage inside the connector. Never log
 * it, never return it through any DTO, never send it to the client.
 */
export function getApifyToken(): string | null {
  return envStr("APIFY_API_TOKEN", "APIFY_TOKEN", "PROPERTY_RADAR_APIFY_TOKEN");
}

/** Optional per-provider credit-cost overrides (default 1 each). */
export function getProviderCreditCosts(provider: "yad2" | "madlan"): {
  perPage: number;
  perFullFetch: number;
} {
  const up = provider.toUpperCase();
  return {
    perPage: envInt(`PROPERTY_RADAR_${up}_CREDIT_PER_PAGE`, 1),
    perFullFetch: envInt(`PROPERTY_RADAR_${up}_CREDIT_PER_FULL_FETCH`, 1),
  };
}
