// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONNECTION ENGINE PORTS. Phase 1.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the PURE connection engine. The engine depends
// only on these interfaces, so it is fully testable with in-memory adapters and a
// mock Graph transport (no network, no DB, no secret store). Real adapters —
// Supabase store, AES-256-GCM cipher, the sealed Graph gateway, the audit sink —
// are wired in connection/service.ts (server-only). No Graph literal appears in
// these canonical shapes; secrets are opaque encrypted references only.
// ============================================================================
import type { MetaAuthorizationMode, MetaConnectionHealth, MetaConnectionStatus, MetaTokenKind } from "./types";

// ── Persistence currency (canonical rows; secrets = encrypted refs) ──────────
export interface MetaConnectionRow {
  id: string;
  orgId: string;
  authorizingUserId: string | null;
  providerKey: string;
  mode: MetaAuthorizationMode;
  businessExternalId: string | null;
  /** Encrypted token reference — NEVER plaintext. */
  tokenRef: string | null;
  tokenKind: MetaTokenKind;
  expiresAt: string | null;
  status: MetaConnectionStatus;
  health: MetaConnectionHealth;
  grantedCapabilities: readonly string[];
  reconnectRequired: boolean;
  lastVerifiedAt: string | null;
  disconnectedAt: string | null;
  revocationReason: string | null;
  version: number;
}

export interface MetaBusinessRow {
  id: string; orgId: string; connectionId: string; externalId: string;
  name: string; verificationStatus: string; status: string;
}
export interface MetaPageRow {
  id: string; orgId: string; connectionId: string; externalId: string;
  name: string; category: string | null;
  /** Encrypted Page credential reference — NEVER plaintext. */
  tokenRef: string | null;
  permittedTasks: readonly string[]; status: string; linkedInstagramExternalId: string | null;
}
export interface MetaInstagramRow {
  id: string; orgId: string; connectionId: string; externalId: string;
  username: string; accountType: string; pageExternalId: string; followers: number | null; status: string;
}
export interface MetaPermissionSnapshotRow {
  id: string; orgId: string; connectionId: string;
  granted: readonly string[]; configured: readonly string[]; mode: MetaAuthorizationMode; capturedAt: string;
}
export interface MetaTokenHealthRow {
  id: string; orgId: string; connectionId: string; ok: boolean; checkedAt: string; detail: string | null;
}

// ── Store port ────────────────────────────────────────────────────────────────
export interface MetaStore {
  upsertConnection(row: MetaConnectionRow): Promise<void>;
  getConnection(orgId: string, connectionId: string): Promise<MetaConnectionRow | null>;
  findConnectionByBusiness(orgId: string, businessExternalId: string): Promise<MetaConnectionRow | null>;
  listConnections(orgId: string): Promise<readonly MetaConnectionRow[]>;
  upsertBusinesses(rows: readonly MetaBusinessRow[]): Promise<void>;
  upsertPages(rows: readonly MetaPageRow[]): Promise<void>;
  upsertInstagram(rows: readonly MetaInstagramRow[]): Promise<void>;
  listBusinesses(orgId: string, connectionId: string): Promise<readonly MetaBusinessRow[]>;
  listPages(orgId: string, connectionId: string): Promise<readonly MetaPageRow[]>;
  listInstagram(orgId: string, connectionId: string): Promise<readonly MetaInstagramRow[]>;
  /** Tombstone assets of a kind whose externalId is NOT in the keep-set (reconcile). */
  tombstoneAssetsExcept(orgId: string, connectionId: string, kind: "business" | "page" | "instagram", keepExternalIds: readonly string[]): Promise<number>;
  insertPermissionSnapshot(row: MetaPermissionSnapshotRow): Promise<void>;
  recordTokenHealth(row: MetaTokenHealthRow): Promise<void>;
}

// ── Secret cipher port (AES-256-GCM in production) ───────────────────────────
export interface SecretCipher {
  encrypt(plaintext: string): string;
  decrypt(ref: string): string;
}

// ── Graph gateway port (implemented by the sealed Graph layer) ───────────────
export interface GraphTokenResult { token: string; expiresInSec: number | null }
export interface GraphTokenInspection { valid: boolean; grantedCapabilities: readonly string[]; expiresAt: number | null }
export interface DiscoveredBusiness { externalId: string; name: string; verificationStatus: "verified" | "not_verified" | "pending" | "unknown" }
export interface DiscoveredPage { externalId: string; name: string; category: string | null; tokenPlain: string | null; permittedTasks: readonly string[]; instagramExternalId: string | null }
export interface DiscoveredInstagram { externalId: string; username: string; accountType: "business" | "creator" | "unknown"; followers: number | null; pageExternalId: string }

export interface GraphGateway {
  authorizeUrl(state: string): string;
  exchangeCode(code: string): Promise<GraphTokenResult>;
  exchangeLongLived(token: string): Promise<GraphTokenResult>;
  inspectToken(token: string): Promise<GraphTokenInspection>;
  discoverBusinesses(token: string): Promise<readonly DiscoveredBusiness[]>;
  discoverPages(token: string): Promise<readonly DiscoveredPage[]>;
  discoverInstagram(igExternalId: string, pageTokenPlain: string, pageExternalId: string): Promise<DiscoveredInstagram | null>;
  revoke(token: string): Promise<boolean>;
}

// ── Audit / clock / id ports ─────────────────────────────────────────────────
export interface AuditSink {
  log(input: { action: string; entityId: string | null; summary: string; metadata: Record<string, unknown> }): Promise<void>;
}
export interface Clock { nowMs(): number; nowIso(): string }
export interface IdGen { uuid(): string }

/** The full port bundle the engine operates over. */
export interface MetaConnectionPorts {
  store: MetaStore;
  cipher: SecretCipher;
  graph: GraphGateway;
  audit: AuditSink;
  clock: Clock;
  ids: IdGen;
}
