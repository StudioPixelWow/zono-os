// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CANONICAL ERROR TAXONOMY. Phase 0.
// ----------------------------------------------------------------------------
// The ONLY error type a MetaProvider may throw. Normalized kinds + safe metadata
// only — a raw Graph response, token, private message, full webhook body, or app
// secret must NEVER be attached. Graph-specific normalization (mapping a raw
// Graph error → one of these kinds) lives exclusively in provider/graph/errors.ts.
// ============================================================================

/** The closed set of normalized provider error kinds. */
export type MetaProviderErrorKind =
  | "unavailable"
  | "timeout"
  | "network"
  | "authentication"
  | "authorization"
  | "permission_missing"
  | "app_review_required"
  | "business_verification_required"
  | "token_expired"
  | "token_revoked"
  | "asset_not_found"
  | "asset_disconnected"
  | "unsupported_capability"
  | "invalid_request"
  | "invalid_media"
  | "media_processing"
  | "rate_limited"
  | "policy_restricted"
  | "duplicate_operation"
  | "conflict"
  | "transient_provider"
  | "permanent_provider"
  | "not_implemented"
  | "internal";

/** Coarse status category for metrics/routing (no raw provider status). */
export type MetaErrorStatusCategory = "client" | "auth" | "provider" | "rate_limit" | "not_implemented" | "unknown";

/** Whether a retry could plausibly succeed and how the caller should treat it. */
export type MetaRetryClass = "retryable" | "retry_after_reauth" | "non_retryable";

/** The safe, canonical metadata carried on every provider error. */
export interface MetaProviderErrorMeta {
  kind: MetaProviderErrorKind;
  retryable: boolean;
  retryClass: MetaRetryClass;
  statusCategory: MetaErrorStatusCategory;
  /** A human-safe message — NEVER contains a token or raw provider body. */
  safeMessage: string;
  /** A coarse provider code *category* (never the raw provider code/body). */
  providerCodeCategory: string | null;
  retryAfterMs: number | null;
  correlationId: string | null;
}

/** Static kind → (retryable, retryClass, statusCategory) classification. */
const CLASSIFICATION: Record<MetaProviderErrorKind, Omit<MetaProviderErrorMeta, "kind" | "safeMessage" | "providerCodeCategory" | "retryAfterMs" | "correlationId">> = {
  unavailable: { retryable: true, retryClass: "retryable", statusCategory: "provider" },
  timeout: { retryable: true, retryClass: "retryable", statusCategory: "provider" },
  network: { retryable: true, retryClass: "retryable", statusCategory: "provider" },
  authentication: { retryable: false, retryClass: "retry_after_reauth", statusCategory: "auth" },
  authorization: { retryable: false, retryClass: "retry_after_reauth", statusCategory: "auth" },
  permission_missing: { retryable: false, retryClass: "non_retryable", statusCategory: "auth" },
  app_review_required: { retryable: false, retryClass: "non_retryable", statusCategory: "auth" },
  business_verification_required: { retryable: false, retryClass: "non_retryable", statusCategory: "auth" },
  token_expired: { retryable: false, retryClass: "retry_after_reauth", statusCategory: "auth" },
  token_revoked: { retryable: false, retryClass: "retry_after_reauth", statusCategory: "auth" },
  asset_not_found: { retryable: false, retryClass: "non_retryable", statusCategory: "client" },
  asset_disconnected: { retryable: false, retryClass: "retry_after_reauth", statusCategory: "auth" },
  unsupported_capability: { retryable: false, retryClass: "non_retryable", statusCategory: "client" },
  invalid_request: { retryable: false, retryClass: "non_retryable", statusCategory: "client" },
  invalid_media: { retryable: false, retryClass: "non_retryable", statusCategory: "client" },
  media_processing: { retryable: true, retryClass: "retryable", statusCategory: "provider" },
  rate_limited: { retryable: true, retryClass: "retryable", statusCategory: "rate_limit" },
  policy_restricted: { retryable: false, retryClass: "non_retryable", statusCategory: "client" },
  duplicate_operation: { retryable: false, retryClass: "non_retryable", statusCategory: "client" },
  conflict: { retryable: false, retryClass: "non_retryable", statusCategory: "client" },
  transient_provider: { retryable: true, retryClass: "retryable", statusCategory: "provider" },
  permanent_provider: { retryable: false, retryClass: "non_retryable", statusCategory: "provider" },
  not_implemented: { retryable: false, retryClass: "non_retryable", statusCategory: "not_implemented" },
  internal: { retryable: false, retryClass: "non_retryable", statusCategory: "unknown" },
};

/**
 * The canonical provider error. Construct via the static helpers so the safe
 * metadata is always well-formed. The message is deliberately generic; callers
 * attach only a `safeMessage` that has been vetted to contain no secret.
 */
export class MetaProviderError extends Error {
  readonly meta: MetaProviderErrorMeta;
  constructor(meta: MetaProviderErrorMeta) {
    super(`[meta:${meta.kind}] ${meta.safeMessage}`);
    this.name = "MetaProviderError";
    this.meta = meta;
  }

  /** Build a canonical error from a kind + safe message (+ optional extras). */
  static of(
    kind: MetaProviderErrorKind,
    safeMessage: string,
    extra?: { providerCodeCategory?: string | null; retryAfterMs?: number | null; correlationId?: string | null },
  ): MetaProviderError {
    const c = CLASSIFICATION[kind];
    return new MetaProviderError({
      kind,
      retryable: c.retryable,
      retryClass: c.retryClass,
      statusCategory: c.statusCategory,
      safeMessage,
      providerCodeCategory: extra?.providerCodeCategory ?? null,
      retryAfterMs: extra?.retryAfterMs ?? null,
      correlationId: extra?.correlationId ?? null,
    });
  }

  /** The canonical "this operation is not implemented in Phase 0" error. */
  static notImplemented(op: string, correlationId?: string | null): MetaProviderError {
    return MetaProviderError.of("not_implemented", `operation not implemented in Phase 0: ${op}`, { correlationId: correlationId ?? null });
  }
}

/** Type guard used by callers and QA. */
export function isMetaProviderError(e: unknown): e is MetaProviderError {
  return e instanceof MetaProviderError;
}

/** A canonical, non-secret rate-limit snapshot (Business-Use-Case budget). */
export interface MetaRateLimitSnapshot {
  scope: string;
  used: number;
  limit: number;
  windowStartAt: string;
  resetAtMs: number | null;
}

/** A canonical retry decision derived from an error (pure). */
export interface MetaRetryDecision {
  shouldRetry: boolean;
  afterMs: number | null;
  requiresReauth: boolean;
  reason: string;
}

/** Pure: derive a retry decision from a canonical error. */
export function decideRetry(err: MetaProviderError, attempt: number, maxAttempts = 5): MetaRetryDecision {
  const { retryClass, retryAfterMs, kind } = err.meta;
  if (retryClass === "retry_after_reauth") return { shouldRetry: false, afterMs: null, requiresReauth: true, reason: `${kind} → reconnect required` };
  if (retryClass === "non_retryable" || attempt >= maxAttempts) return { shouldRetry: false, afterMs: null, requiresReauth: false, reason: `${kind} → non-retryable/exhausted` };
  // Exponential backoff with a provider-supplied floor.
  const backoff = Math.min(60_000, 1_000 * 2 ** attempt);
  return { shouldRetry: true, afterMs: Math.max(backoff, retryAfterMs ?? 0), requiresReauth: false, reason: `${kind} → retry` };
}
