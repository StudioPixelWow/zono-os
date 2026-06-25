// ============================================================================
// ZONO Property Radar™ — connector layer contracts (client-safe types).
// A connector is the swappable transport that actually fetches raw listing data
// for an area. The sync engine never sees a connector — it only sees a
// PropertyProvider. Providers delegate fetching to a connector, so Apify can be
// replaced (with a different scraper / API) WITHOUT touching the sync engine.
// All concrete config (tokens, actor refs, timeouts, retries, rate limits) is
// injected from the environment — never hardcoded.
// ============================================================================

export type RawListing = Record<string, unknown>;

/** A single scrape job — fully described by env-derived config + runtime params. */
export interface ScrapeJob {
  /** Opaque job reference resolved from env (e.g. an Apify actor id). */
  jobRef: string;
  /** Provider-specific input the connector forwards to the underlying scraper. */
  input: Record<string, unknown>;
  /** Hard cap on returned items. */
  maxItems: number;
}

/** The transport contract. Implementations are interchangeable. */
export interface ScrapeConnector {
  readonly name: string;
  /** Run a scrape job and return raw dataset items (never throws empty silently). */
  run(job: ScrapeJob): Promise<RawListing[]>;
}

/** Per-provider runtime config, assembled entirely from environment variables. */
export interface ConnectorRuntimeConfig {
  connector: string; // which connector implementation (e.g. "apify")
  token: string; // secret — from env only
  jobRef: string; // actor/job ref — from env only
  baseUrl?: string; // optional override — from env only
  timeoutMs: number;
  maxRetries: number;
  rateLimitPerMinute: number;
  maxItemsPerScan: number;
}
