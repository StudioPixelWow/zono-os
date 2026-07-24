// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONNECTION ENGINE (PURE). Phase 1.
// ----------------------------------------------------------------------------
// The multi-tenant Meta connection engine, expressed over injected ports so it is
// fully deterministic and testable (no network, no DB, no server-only import).
// Responsibilities: complete OAuth, inspect + long-lived exchange, discover
// GRANTED permissions (never inferred from requested scopes), discover Business /
// Page / Instagram assets, verify ownership, encrypt every secret before it
// reaches the store, persist connection + assets + permission snapshot + token
// health, assess health, reconnect, disconnect + revoke, and reconcile removed
// assets. Secrets exist here only transiently and are handed to the cipher port
// immediately — nothing plaintext is persisted or returned.
// ============================================================================
import type { MetaConnectionPorts, MetaConnectionRow, MetaBusinessRow, MetaPageRow, MetaInstagramRow } from "./ports";
import type { MetaAuthorizationMode, MetaConnectionDescriptor, MetaConnectionHealth, MetaConnectionStatus, MetaTokenKind } from "./types";
import { toConnectionDescriptor } from "./read";
import { MetaProviderError } from "../provider/errors";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent } from "../notify/types";
import { evaluateMetaCapabilities } from "../capability/evaluate";
import type { MetaCapabilityDecision, MetaCapabilityState, MetaVerificationState } from "../capability/types";

/** Warn when a token expires within this window. */
const EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000;

export interface CompleteConnectionInput {
  orgId: string;
  authorizingUserId: string | null;
  code: string;
  mode: MetaAuthorizationMode;
  /** Canonical capability keys we REQUESTED (for the snapshot's `configured`). */
  configuredCapabilities?: readonly string[];
  /** Set on reconnect to reuse an existing connection id. */
  existingConnectionId?: string | null;
  correlationId?: string | null;
}

export interface ConnectionEngineResult {
  descriptor: MetaConnectionDescriptor;
  inventory: { businesses: number; pages: number; instagram: number };
  grantedCapabilities: readonly string[];
  events: readonly MetaNotificationEvent[];
  reconciledRemoved: number;
}

const tokenKindFor = (mode: MetaAuthorizationMode): MetaTokenKind => (mode === "system_user" ? "system_user" : mode === "unknown" ? "unknown" : "user");

/** Pure: resolve the connection's expiry (prefer debug_token's absolute expiry). */
function resolveExpiry(nowMs: number, expiresInSec: number | null, inspectExpiresAtUnix: number | null): string | null {
  if (inspectExpiresAtUnix && inspectExpiresAtUnix > 0) return new Date(inspectExpiresAtUnix * 1000).toISOString();
  if (expiresInSec && expiresInSec > 0) return new Date(nowMs + expiresInSec * 1000).toISOString();
  return null; // long-lived / non-expiring
}

/** Complete (or reconnect) a Meta connection from an authorization code. */
export async function completeConnection(ports: MetaConnectionPorts, input: CompleteConnectionInput): Promise<ConnectionEngineResult> {
  const { store, cipher, graph, audit, clock, ids } = ports;
  const nowMs = clock.nowMs();
  const nowIso = clock.nowIso();

  // 1) Code → token → long-lived.
  const short = await graph.exchangeCode(input.code);
  const long = await graph.exchangeLongLived(short.token);
  const userToken = long.token;

  // 2) Inspect the token — the authoritative GRANTED capabilities + validity.
  const inspection = await graph.inspectToken(userToken);
  if (!inspection.valid) {
    throw MetaProviderError.of("authentication", "the exchanged token failed validation", { correlationId: input.correlationId ?? null });
  }
  const grantedCapabilities = [...inspection.grantedCapabilities];

  // 3) Discover assets (ownership is proven by presence in the discovery result).
  const businesses = await graph.discoverBusinesses(userToken);
  const pages = await graph.discoverPages(userToken);
  const instagram: Array<Awaited<ReturnType<typeof graph.discoverInstagram>>> = [];
  for (const p of pages) {
    if (p.instagramExternalId && p.tokenPlain) {
      const ig = await graph.discoverInstagram(p.instagramExternalId, p.tokenPlain, p.externalId);
      if (ig) instagram.push(ig);
    }
  }

  // 4) Resolve the connection id (reconnect / dedup by business / new).
  const businessExternalId = businesses[0]?.externalId ?? null;
  const existing = input.existingConnectionId
    ? await store.getConnection(input.orgId, input.existingConnectionId)
    : businessExternalId
      ? await store.findConnectionByBusiness(input.orgId, businessExternalId)
      : null;
  const connectionId = existing?.id ?? ids.uuid();
  const version = (existing?.version ?? 0) + 1;

  // 5) Encrypt every secret BEFORE it reaches the store.
  const tokenRef = cipher.encrypt(userToken);

  // 6) Persist connection.
  const expiresAt = resolveExpiry(nowMs, long.expiresInSec, inspection.expiresAt);
  const connectionRow: MetaConnectionRow = {
    id: connectionId,
    orgId: input.orgId,
    authorizingUserId: input.authorizingUserId,
    providerKey: "graph",
    mode: input.mode,
    businessExternalId,
    tokenRef,
    tokenKind: tokenKindFor(input.mode),
    expiresAt,
    status: "connected",
    health: "healthy",
    grantedCapabilities,
    reconnectRequired: false,
    lastVerifiedAt: nowIso,
    disconnectedAt: null,
    revocationReason: null,
    version,
  };
  await store.upsertConnection(connectionRow);

  // 7) Persist assets (encrypt Page credentials).
  const pageIdByExternal = new Map<string, string>();
  const businessRows: MetaBusinessRow[] = businesses.map((b) => ({
    id: ids.uuid(), orgId: input.orgId, connectionId, externalId: b.externalId, name: b.name, verificationStatus: b.verificationStatus, status: "active",
  }));
  const pageRows: MetaPageRow[] = pages.map((p) => {
    const id = ids.uuid();
    pageIdByExternal.set(p.externalId, id);
    return {
      id, orgId: input.orgId, connectionId, externalId: p.externalId, name: p.name, category: p.category,
      tokenRef: p.tokenPlain ? cipher.encrypt(p.tokenPlain) : null,
      permittedTasks: p.permittedTasks, status: "active", linkedInstagramExternalId: p.instagramExternalId,
    };
  });
  const instagramRows: MetaInstagramRow[] = instagram.filter((i): i is NonNullable<typeof i> => !!i).map((i) => ({
    id: ids.uuid(), orgId: input.orgId, connectionId, externalId: i.externalId, username: i.username,
    accountType: i.accountType, pageExternalId: i.pageExternalId, followers: i.followers, status: "active",
  }));
  await store.upsertBusinesses(businessRows);
  await store.upsertPages(pageRows);
  await store.upsertInstagram(instagramRows);

  // 8) Reconcile removed assets (reconnect): tombstone anything not rediscovered.
  let reconciledRemoved = 0;
  reconciledRemoved += await store.tombstoneAssetsExcept(input.orgId, connectionId, "business", businessRows.map((r) => r.externalId));
  reconciledRemoved += await store.tombstoneAssetsExcept(input.orgId, connectionId, "page", pageRows.map((r) => r.externalId));
  reconciledRemoved += await store.tombstoneAssetsExcept(input.orgId, connectionId, "instagram", instagramRows.map((r) => r.externalId));

  // 9) Permission snapshot (granted vs configured) + token health.
  await store.insertPermissionSnapshot({
    id: ids.uuid(), orgId: input.orgId, connectionId,
    granted: grantedCapabilities, configured: input.configuredCapabilities ?? [], mode: input.mode, capturedAt: nowIso,
  });
  await store.recordTokenHealth({ id: ids.uuid(), orgId: input.orgId, connectionId, ok: true, checkedAt: nowIso, detail: null });

  // 10) Audit + notification events.
  const events: MetaNotificationEvent[] = [];
  const missing = (input.configuredCapabilities ?? []).filter((c) => !grantedCapabilities.includes(c));
  if (missing.length) {
    events.push(buildMetaNotificationEvent({ event: "meta.permission.missing", orgId: input.orgId, occurredAt: nowIso, actorId: input.authorizingUserId, correlationId: input.correlationId ?? null, data: { missing } }));
  }
  await audit.log({
    action: existing ? "meta.connection.reconnected" : "meta.connection.connected",
    entityId: connectionId,
    summary: `Meta connection ${existing ? "reconnected" : "connected"} (${businessRows.length} business, ${pageRows.length} pages, ${instagramRows.length} IG)`,
    metadata: { mode: input.mode, granted: grantedCapabilities.length, missing: missing.length, reconciledRemoved },
  });

  return {
    descriptor: toConnectionDescriptor(connectionRow),
    inventory: { businesses: businessRows.length, pages: pageRows.length, instagram: instagramRows.length },
    grantedCapabilities,
    events,
    reconciledRemoved,
  };
}

export interface HealthResult {
  descriptor: MetaConnectionDescriptor;
  events: readonly MetaNotificationEvent[];
  changed: boolean;
}

/** Re-inspect the token and update connection/token health; emit lifecycle events. */
export async function inspectConnectionHealth(ports: MetaConnectionPorts, orgId: string, connectionId: string, correlationId: string | null = null): Promise<HealthResult> {
  const { store, cipher, graph, audit, clock, ids } = ports;
  const nowIso = clock.nowIso();
  const nowMs = clock.nowMs();
  const row = await store.getConnection(orgId, connectionId);
  if (!row) throw MetaProviderError.of("asset_not_found", "connection not found", { correlationId });

  const events: MetaNotificationEvent[] = [];
  let status: MetaConnectionStatus = row.status;
  let health: MetaConnectionHealth = row.health;
  let reconnectRequired = row.reconnectRequired;
  let revocationReason = row.revocationReason;
  let granted = row.grantedCapabilities;
  let ok = true;
  let detail: string | null = null;

  if (!row.tokenRef) {
    status = "needs_reauth"; health = "unhealthy"; reconnectRequired = true; ok = false; detail = "no credential";
    events.push(buildMetaNotificationEvent({ event: "meta.connection.revoked", orgId, occurredAt: nowIso, assetRef: connectionId, correlationId, data: { reason: "no_credential" } }));
  } else {
    let inspection: Awaited<ReturnType<typeof graph.inspectToken>> | null = null;
    try {
      inspection = await graph.inspectToken(cipher.decrypt(row.tokenRef));
    } catch {
      inspection = { valid: false, grantedCapabilities: [], expiresAt: null };
    }
    if (!inspection.valid) {
      status = "needs_reauth"; health = "unhealthy"; reconnectRequired = true; revocationReason = "token_invalid"; ok = false; detail = "token invalid/revoked";
      events.push(buildMetaNotificationEvent({ event: "meta.connection.revoked", orgId, occurredAt: nowIso, assetRef: connectionId, correlationId, data: { reason: "token_invalid" } }));
    } else {
      granted = inspection.grantedCapabilities;
      const expMs = inspection.expiresAt ? inspection.expiresAt * 1000 : null;
      if (expMs && expMs - nowMs <= EXPIRY_WARNING_MS) {
        status = "connected"; health = "degraded"; reconnectRequired = false; detail = "token expiring soon";
        events.push(buildMetaNotificationEvent({ event: "meta.connection.expiring", orgId, occurredAt: nowIso, assetRef: connectionId, correlationId, data: { expiresAt: new Date(expMs).toISOString() } }));
      } else {
        status = "connected"; health = "healthy"; reconnectRequired = false; detail = null;
      }
    }
  }

  const updated: MetaConnectionRow = { ...row, status, health, reconnectRequired, revocationReason, grantedCapabilities: granted, lastVerifiedAt: nowIso, version: row.version };
  await store.upsertConnection(updated);
  await store.recordTokenHealth({ id: ids.uuid(), orgId, connectionId, ok, checkedAt: nowIso, detail });
  await audit.log({ action: "meta.connection.health_checked", entityId: connectionId, summary: `health=${health} status=${status}`, metadata: { ok, health, status } });

  const changed = row.status !== status || row.health !== health;
  return { descriptor: toConnectionDescriptor(updated), events, changed };
}

/** Disconnect: revoke permissions, purge the token, tombstone assets. */
export async function disconnectConnection(ports: MetaConnectionPorts, orgId: string, connectionId: string, reason = "user_disconnect", correlationId: string | null = null): Promise<MetaConnectionDescriptor> {
  const { store, cipher, graph, audit, clock, ids } = ports;
  const nowIso = clock.nowIso();
  const row = await store.getConnection(orgId, connectionId);
  if (!row) throw MetaProviderError.of("asset_not_found", "connection not found", { correlationId });

  let revoked = false;
  if (row.tokenRef) {
    try { revoked = await graph.revoke(cipher.decrypt(row.tokenRef)); } catch { revoked = false; }
  }

  const purged: MetaConnectionRow = {
    ...row,
    tokenRef: null, // purge the credential
    status: "revoked",
    health: "unhealthy",
    reconnectRequired: true,
    revocationReason: reason,
    disconnectedAt: nowIso,
    lastVerifiedAt: nowIso,
  };
  await store.upsertConnection(purged);
  // Tombstone every asset (keep-set empty).
  await store.tombstoneAssetsExcept(orgId, connectionId, "business", []);
  await store.tombstoneAssetsExcept(orgId, connectionId, "page", []);
  await store.tombstoneAssetsExcept(orgId, connectionId, "instagram", []);
  await store.recordTokenHealth({ id: ids.uuid(), orgId, connectionId, ok: false, checkedAt: nowIso, detail: `disconnected: ${reason}` });
  await audit.log({ action: "meta.connection.disconnected", entityId: connectionId, summary: `disconnected (revoke=${revoked})`, metadata: { reason, revoked } });

  return toConnectionDescriptor(purged);
}

// ── Capability gating against ACTUAL granted state ───────────────────────────
export interface CapabilityGateFlags {
  globalFeatureEnabled: boolean;
  orgFeatureEnabled: boolean;
  providerAvailable: boolean;
  businessVerification: MetaVerificationState;
  appReview: MetaVerificationState;
  webhookHealthy: boolean;
  extendedEnabled: readonly string[];
  globalKillSwitch: boolean;
  orgKillSwitch: boolean;
}

/** Build the evaluator state from a persisted connection + operator flags. */
export function buildCapabilityState(row: MetaConnectionRow, flags: CapabilityGateFlags): MetaCapabilityState {
  return {
    globalFeatureEnabled: flags.globalFeatureEnabled,
    orgFeatureEnabled: flags.orgFeatureEnabled,
    providerAvailable: flags.providerAvailable,
    connectionStatus: row.status,
    connectionHealth: row.health,
    accessMode: row.mode,
    grantedCapabilities: row.grantedCapabilities,
    businessVerification: flags.businessVerification,
    appReview: flags.appReview,
    webhookHealthy: flags.webhookHealthy,
    extendedEnabled: flags.extendedEnabled,
    globalKillSwitch: flags.globalKillSwitch,
    orgKillSwitch: flags.orgKillSwitch,
  };
}

/** Gate a set of capabilities against a connection's actual granted state. */
export function gateCapabilities(row: MetaConnectionRow, flags: CapabilityGateFlags, keys: readonly string[]): readonly MetaCapabilityDecision[] {
  return evaluateMetaCapabilities(keys, buildCapabilityState(row, flags));
}
