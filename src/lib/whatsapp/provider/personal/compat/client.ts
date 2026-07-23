// ============================================================================
// 📘 C9 COMPAT — Evolution HTTP CLIENT (server-only).
// ----------------------------------------------------------------------------
// The ONLY code that performs network I/O against Evolution. Sends the `apikey`
// header, enforces a timeout, and NEVER throws — it returns a discriminated
// result the mappers/adapter can branch on. It logs nothing sensitive (no
// apikey, no QR, no message bodies).
// ============================================================================
import "server-only";
import type { EvolutionConfig } from "./config";
import { classifyHttp, type PersonalError } from "./errors";

export type HttpResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: PersonalError };

const TIMEOUT_MS = 10_000;

/** Perform an authenticated Evolution request. Path is relative to baseUrl. */
export async function evoFetch<T>(cfg: EvolutionConfig, method: string, path: string, body?: unknown): Promise<HttpResult<T>> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers: { apikey: cfg.apiKey, "content-type": "application/json", accept: "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, error: classifyHttp(res.status, text.slice(0, 200)) };
    let data: T;
    try { data = (text ? JSON.parse(text) : {}) as T; }
    catch { return { ok: false, status: res.status, error: { category: "invalid", message: "bad_json" } }; }
    return { ok: true, status: res.status, data };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return { ok: false, status: 0, error: { category: aborted ? "network" : "unavailable", message: aborted ? "timeout" : "unreachable" } };
  } finally { clearTimeout(t); }
}
