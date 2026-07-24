// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONNECTION contracts. Phase 0.
// ----------------------------------------------------------------------------
// Transport-neutral connection + authorization-mode model. Secrets are ALWAYS
// opaque references (never a raw token value, never a Graph field name). Token
// ownership is ORGANIZATION-scoped; the authorizing user is audit provenance
// only. No Graph endpoint, version, or "access_token" field appears here — those
// live exclusively under src/lib/meta/provider/graph/.
// ============================================================================
import type { Brand } from "../types";

/** Canonical connection id (ZONO uuid, not a Meta id). */
export type MetaConnectionId = Brand<string, "MetaConnectionId">;

/** Lifecycle status of an org's Meta connection. */
export type MetaConnectionStatus =
  | "not_connected"
  | "connected"
  | "needs_reauth"
  | "revoked"
  | "disabled"; // kill-switched or admin-disabled

/** Coarse health signal derived from status + token/webhook checks. */
export type MetaConnectionHealth = "healthy" | "degraded" | "unhealthy" | "unknown";

/**
 * How the connection was authorized. The architecture is NOT locked to one
 * token strategy — all four are valid connection origins (§8 of the design).
 *  - user_oauth     : classic Facebook Login (a user's grant).
 *  - business_login : Facebook Login for Business (config_id bundle).
 *  - system_user    : Business Manager System-User credential (org automation).
 *  - unknown        : not yet determined (pre-exchange / legacy).
 */
export type MetaAuthorizationMode = "user_oauth" | "business_login" | "system_user" | "unknown";

/** The kind of credential backing the connection (canonical, not a Graph term). */
export type MetaTokenKind = "user" | "page" | "system_user" | "unknown";

/**
 * An OPAQUE reference to an encrypted secret. Phase 0 never holds a real token;
 * downstream phases resolve this against the encrypted secret store. The raw
 * value is never placed on a canonical contract, never logged, never returned
 * to a client.
 */
export type MetaSecretRef = Brand<string, "MetaSecretRef">;

/**
 * The set of capabilities Meta actually GRANTED, captured at a point in time.
 * Canonical capability keys only — raw Graph permission strings never appear
 * outside the Graph layer. `configuredScopes` is what we asked for; `granted`
 * is what debug_token proved — the evaluator must never conflate the two.
 */
export interface MetaPermissionSnapshot {
  connectionId: MetaConnectionId;
  /** Canonical capability keys proven granted (see capability registry). */
  granted: readonly string[];
  /** Canonical capability keys requested/configured (⊇ granted possible). */
  configured: readonly string[];
  mode: MetaAuthorizationMode;
  capturedAt: string; // ISO-8601
}

/**
 * The safe, non-secret descriptor of a connection. Everything here is
 * client-safe: no token value, no Graph field. `tokenRef` is opaque.
 */
export interface MetaConnectionDescriptor {
  id: MetaConnectionId;
  orgId: string;
  status: MetaConnectionStatus;
  health: MetaConnectionHealth;
  mode: MetaAuthorizationMode;
  tokenKind: MetaTokenKind;
  /** Opaque handle to the encrypted credential — never the value itself. */
  tokenRef: MetaSecretRef | null;
  /** Audit provenance only — the token is org-owned, not user-owned. */
  authorizingUserId: string | null;
  scopes: MetaPermissionSnapshot | null;
  expiresAt: string | null;
  lastVerifiedAt: string | null;
  reconnectRequired: boolean;
}
