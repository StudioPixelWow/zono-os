// ============================================================================
// ZONO Property Radar™ — Apify connector client (SERVER-ONLY, fetch-based).
// Isolated here so Apify is fully replaceable. Starts an actor run, polls until
// terminal status, fetches dataset items, with bounded retries + a hard overall
// timeout. The token is read from env, sent ONLY as an Authorization header, and
// NEVER logged or returned. All Apify-specific knowledge lives in this file.
// ============================================================================
import "server-only";
import { getApifyToken } from "./env";
import type { ProviderConnectorRunInput, ProviderConnectorRunResult } from "./types";

const APIFY_BASE = (process.env.PROPERTY_RADAR_APIFY_BASE_URL ?? "").trim() || "https://api.apify.com/v2";
const TERMINAL_OK = "SUCCEEDED";
const TERMINAL_BAD = new Set(["FAILED", "ABORTED", "TIMED-OUT", "TIMED_OUT"]);

function isRetryableStatus(s: number): boolean {
  return s === 408 || s === 429 || (s >= 500 && s <= 599);
}
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function apifyFetch(
  path: string,
  token: string,
  init: RequestInit,
  perReqTimeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), Math.max(2000, perReqTimeoutMs));
  try {
    return await fetch(`${APIFY_BASE}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

interface RunData {
  id?: string;
  status?: string;
  defaultDatasetId?: string;
}

/** Run an Apify actor end-to-end and return a provider-agnostic result. */
export async function runApifyActor(
  input: ProviderConnectorRunInput,
): Promise<ProviderConnectorRunResult> {
  const startedMs = Date.now();
  const fail = (status: "failed" | "timeout", raw?: unknown): ProviderConnectorRunResult => ({
    provider: input.provider,
    datasetItems: [],
    creditsUsedEstimate: 0,
    durationMs: Date.now() - startedMs,
    status,
    raw,
  });

  const token = getApifyToken();
  if (!token) return fail("failed", "missing token"); // caller should guard first

  const actorPath = input.actorId.replace("/", "~"); // Apify path uses ~ not /
  const deadline = startedMs + input.timeoutMs;
  const perReq = Math.min(input.timeoutMs, 60_000);

  // 1) Start the run (retry only retryable failures).
  let run: RunData | null = null;
  for (let attempt = 0; attempt <= input.maxRetries; attempt++) {
    try {
      const res = await apifyFetch(
        `/acts/${actorPath}/runs`,
        token,
        { method: "POST", body: JSON.stringify(input.input) },
        perReq,
      );
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { data?: RunData } | null;
        run = body?.data ?? null;
        break;
      }
      if (!isRetryableStatus(res.status) || attempt === input.maxRetries) {
        return fail("failed", `start status ${res.status}`);
      }
    } catch {
      if (attempt === input.maxRetries) return fail("failed", "start network error");
    }
    await sleep(input.pollIntervalMs);
  }
  if (!run?.id) return fail("failed", "no run id");

  // 2) Poll until terminal or our deadline.
  let status = run.status ?? "RUNNING";
  let datasetId = run.defaultDatasetId;
  while (status !== TERMINAL_OK && !TERMINAL_BAD.has(status)) {
    if (Date.now() >= deadline) return fail("timeout", "poll deadline exceeded");
    await sleep(input.pollIntervalMs);
    try {
      const res = await apifyFetch(`/actor-runs/${run.id}`, token, { method: "GET" }, perReq);
      if (res.ok) {
        const body = (await res.json().catch(() => null)) as { data?: RunData } | null;
        status = body?.data?.status ?? status;
        datasetId = body?.data?.defaultDatasetId ?? datasetId;
      } else if (!isRetryableStatus(res.status)) {
        return fail("failed", `poll status ${res.status}`);
      }
    } catch {
      /* transient — keep polling until deadline */
    }
  }

  if (status !== TERMINAL_OK) return fail("failed", `run status ${status}`);
  if (!datasetId) {
    return { provider: input.provider, datasetItems: [], runId: run.id, creditsUsedEstimate: 1, durationMs: Date.now() - startedMs, status: "success" };
  }

  // 3) Fetch dataset items (clean JSON). Empty + malformed handled defensively.
  let items: unknown[] = [];
  try {
    const res = await apifyFetch(
      `/datasets/${datasetId}/items?clean=true&format=json`,
      token,
      { method: "GET" },
      perReq,
    );
    if (res.ok) {
      const body = await res.json().catch(() => null);
      items = Array.isArray(body) ? body : [];
    }
  } catch {
    items = [];
  }

  return {
    provider: input.provider,
    datasetItems: items,
    runId: run.id,
    datasetId,
    creditsUsedEstimate: 1,
    durationMs: Date.now() - startedMs,
    status: "success",
  };
}
