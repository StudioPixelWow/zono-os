// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · GRAPH ERROR NORMALIZATION. Phase 0.
// ----------------------------------------------------------------------------
// ⛔ The ONLY place a raw Graph error body is read. It maps Graph error codes /
// subcodes to the canonical MetaProviderError taxonomy and produces a SAFE
// message — the raw body, token, and trace id NEVER escape this layer. Pure
// function; no network.
// ============================================================================
import { MetaProviderError, type MetaProviderErrorKind } from "../errors";
import type { GraphErrorBody } from "./types";

/**
 * Map a raw Graph error code/subcode to a canonical kind. Graph's numeric codes
 * are stable enough to classify; anything unrecognized degrades to a coarse
 * transient/permanent bucket by HTTP status.
 */
function classify(code: number | undefined, subcode: number | undefined, httpStatus: number | undefined): MetaProviderErrorKind {
  // OAuth / token failures.
  if (code === 190) {
    if (subcode === 463) return "token_expired";
    if (subcode === 458 || subcode === 460 || subcode === 467) return "token_revoked";
    return "authentication";
  }
  if (code === 10 || code === 200 || code === 3) return "permission_missing";
  if (code === 4 || code === 17 || code === 32 || code === 613) return "rate_limited";
  if (code === 368) return "policy_restricted";
  if (code === 100) return "invalid_request";
  if (code === 803) return "asset_not_found";
  if (httpStatus && httpStatus >= 500) return "transient_provider";
  if (httpStatus === 429) return "rate_limited";
  if (httpStatus === 404) return "asset_not_found";
  if (httpStatus && httpStatus >= 400) return "invalid_request";
  return "permanent_provider";
}

/** A safe, generic message per kind — never echoes the raw provider text. */
function safeMessageFor(kind: MetaProviderErrorKind): string {
  const M: Partial<Record<MetaProviderErrorKind, string>> = {
    token_expired: "the Meta connection token has expired — reconnect required",
    token_revoked: "the Meta connection was revoked — reconnect required",
    authentication: "Meta rejected the credential — reconnect required",
    permission_missing: "a required Meta permission has not been granted",
    rate_limited: "Meta rate limit reached — retry later",
    policy_restricted: "the action was blocked by Meta policy",
    invalid_request: "the request was rejected as invalid by Meta",
    asset_not_found: "the referenced Meta asset was not found",
    transient_provider: "a temporary Meta provider error occurred — retry",
    permanent_provider: "a permanent Meta provider error occurred",
  };
  return M[kind] ?? "a Meta provider error occurred";
}

/**
 * Normalize a raw Graph error into a canonical MetaProviderError. Only a coarse
 * provider-code *category* and an optional retry hint survive; the raw body,
 * message, token, and fbtrace_id are dropped.
 */
export function normalizeGraphError(body: GraphErrorBody | null, httpStatus: number | undefined, correlationId: string | null): MetaProviderError {
  const err = body?.error;
  const kind = classify(err?.code, err?.error_subcode, httpStatus);
  const providerCodeCategory = err?.code != null ? `graph:${err.code}` : httpStatus != null ? `http:${httpStatus}` : null;
  const retryAfterMs = kind === "rate_limited" ? 60_000 : null;
  return MetaProviderError.of(kind, safeMessageFor(kind), { providerCodeCategory, retryAfterMs, correlationId });
}
