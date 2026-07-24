// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH HTTP CLIENT. Phase 1.
// ----------------------------------------------------------------------------
// ⛔ BOUNDARY: this file lives under provider/graph/ — the only place raw Graph
// I/O may occur. A thin fetch wrapper with a timeout and a JSON reader. The fetch
// implementation is INJECTABLE (`GraphFetch`) so tests drive the full flow with a
// mock transport and no network. Errors are normalized to MetaProviderError via
// graph/errors.ts — a raw Graph body never escapes.
// ============================================================================
import { normalizeGraphError } from "./errors";
import type { GraphErrorBody } from "./types";

/** The minimal fetch surface the Graph client needs (global fetch satisfies it). */
export type GraphFetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<GraphResponse>;

export interface GraphResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

/** The default transport — the platform `fetch`. */
export const defaultGraphFetch: GraphFetch = (url, init) => fetch(url, init) as unknown as Promise<GraphResponse>;

export interface GraphCallOptions {
  method?: string;
  timeoutMs?: number;
  correlationId?: string | null;
  fetchImpl?: GraphFetch;
}

/**
 * Perform a Graph call and return parsed JSON, or throw a normalized
 * MetaProviderError. A raw Graph error body is classified + stripped by
 * `normalizeGraphError`; nothing sensitive escapes.
 */
export async function graphJson<T>(url: string, opts: GraphCallOptions = {}): Promise<T> {
  const fetchImpl = opts.fetchImpl ?? defaultGraphFetch;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? 15_000) : null;
  try {
    const res = await fetchImpl(url, { method: opts.method ?? "GET", signal: controller?.signal });
    const body = (await res.json().catch(() => null)) as (T & GraphErrorBody) | null;
    if (!res.ok || (body && (body as GraphErrorBody).error)) {
      throw normalizeGraphError((body as GraphErrorBody) ?? null, res.status, opts.correlationId ?? null);
    }
    return body as T;
  } catch (e) {
    // Re-throw canonical errors; wrap anything else (network/timeout) safely.
    if (e && typeof e === "object" && "meta" in e) throw e;
    const aborted = e && typeof e === "object" && (e as { name?: string }).name === "AbortError";
    throw normalizeGraphError(null, aborted ? 504 : undefined, opts.correlationId ?? null);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
