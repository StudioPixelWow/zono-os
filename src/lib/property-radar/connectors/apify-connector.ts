// ============================================================================
// ZONO Property Radar™ — Apify connector (server-only). One concrete, swappable
// implementation of ScrapeConnector. All knobs (token, actor ref, timeout,
// retries, rate limit) come from ConnectorRuntimeConfig (env-derived). To swap
// Apify for another scraper, add a sibling connector and register it in index.ts
// — the sync engine and providers stay untouched.
// ============================================================================
import "server-only";
import { ApifyClient } from "apify-client";
import type { ConnectorRuntimeConfig } from "./types";
import type { RawListing, ScrapeConnector, ScrapeJob } from "./types";

// Process-wide rate-limit gate (min spacing between actor runs).
let lastRunAt = 0;

async function rateLimit(perMinute: number): Promise<void> {
  if (perMinute <= 0) return;
  const minGap = Math.ceil(60_000 / perMinute);
  const wait = lastRunAt + minGap - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRunAt = Date.now();
}

export class ApifyConnector implements ScrapeConnector {
  readonly name = "apify";
  private readonly client: ApifyClient;

  constructor(private readonly config: ConnectorRuntimeConfig) {
    this.client = new ApifyClient({
      token: config.token,
      maxRetries: config.maxRetries,
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    });
  }

  async run(job: ScrapeJob): Promise<RawListing[]> {
    await rateLimit(this.config.rateLimitPerMinute);
    const timeoutSecs = Math.max(30, Math.floor(this.config.timeoutMs / 1000));
    const run = await this.client.actor(job.jobRef).call(job.input, {
      timeout: timeoutSecs,
      waitSecs: Math.max(20, timeoutSecs - 10),
      memory: 512,
    });
    if (run.status !== "SUCCEEDED") {
      throw new Error(`Apify actor ${job.jobRef} finished with status=${run.status}`);
    }
    const datasetId = run.defaultDatasetId;
    if (!datasetId) return [];
    const { items } = await this.client.dataset(datasetId).listItems({ limit: job.maxItems });
    return items as RawListing[];
  }
}
