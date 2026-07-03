// ============================================================================
// 🔌 Platform API — gateway (server-only). 31.0. Part 1.
// Authenticates the API key, enforces scope + rate limit, dispatches to the
// existing services, and writes an audit entry for every call. Read-only reads +
// approval-gated actions; nothing auto-executes.
// ============================================================================
import "server-only";
import { findEndpoint, hasScope, withinRateLimit } from "../registry";
import { PLATFORM_API_VERSION, API_BASE, type ApiResult } from "../types";
import { parseBearer, verifySecret } from "./keys";
import { loadKeyForAuth, recentAuditTimestamps, touchKey, insertAudit } from "./repository";
import { dispatch } from "./dispatch";

const RATE_WINDOW_MS = 60_000;

export async function handleApiRequest(method: "GET" | "POST", url: URL, authHeader: string | null, ip: string | null, body: Record<string, unknown>): Promise<{ status: number; json: ApiResult }> {
  // Path relative to API_BASE, e.g. "/buyers".
  const rel = url.pathname.startsWith(API_BASE) ? url.pathname.slice(API_BASE.length) || "/" : url.pathname;
  const fail = async (status: number, code: string, error: string, keyId: string | null = null, keyName: string | null = null, orgId: string | null = null, scope: string | null = null) => {
    await insertAudit(orgId, keyId, keyName, method, rel, scope, status, ip);
    return { status, json: { ok: false as const, error, code, status } };
  };

  // 1) Authenticate.
  const parsed = parseBearer(authHeader);
  if (!parsed) return fail(401, "invalid_token", "Missing or malformed API key (Bearer zk_…).");
  const loaded = await loadKeyForAuth(parsed.publicId);
  if (!loaded || !verifySecret(parsed.secret, loaded.secretHash)) return fail(401, "invalid_key", "Invalid or revoked API key.");
  const { record } = loaded;

  // 2) Rate limit (sliding window over recent audit).
  const now = Date.now();
  const ts = await recentAuditTimestamps(record.id, now - RATE_WINDOW_MS);
  const rl = withinRateLimit(ts, now, RATE_WINDOW_MS, record.rateLimitPerMin);
  if (!rl.allowed) return fail(429, "rate_limited", `Rate limit exceeded (${record.rateLimitPerMin}/min). Retry in ${Math.ceil(rl.retryAfterMs / 1000)}s.`, record.id, record.name, record.organizationId);

  // 3) Route + scope.
  const endpoint = findEndpoint(method, rel);
  if (!endpoint) return fail(404, "not_found", `No endpoint for ${method} ${rel}.`, record.id, record.name, record.organizationId);
  if (!hasScope(record.scopes, endpoint.scope)) return fail(403, "forbidden_scope", `Key is missing scope "${endpoint.scope}".`, record.id, record.name, record.organizationId, endpoint.scope);

  // 4) Dispatch (reuse existing service).
  try {
    const r = await dispatch(endpoint, { orgId: record.organizationId, createdBy: record.id, query: url.searchParams, body });
    if (!r.ok) return fail(r.status ?? 422, "action_failed", r.error ?? "Failed.", record.id, record.name, record.organizationId, endpoint.scope);
    await Promise.all([touchKey(record.id), insertAudit(record.organizationId, record.id, record.name, method, rel, endpoint.scope, 200, ip)]);
    return { status: 200, json: { ok: true, data: r.data, meta: { version: PLATFORM_API_VERSION, approvalGated: endpoint.approvalGated } } };
  } catch (e) {
    return fail(500, "internal_error", e instanceof Error ? e.message : "Internal error.", record.id, record.name, record.organizationId, endpoint.scope);
  }
}
