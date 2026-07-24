// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SAFE READ MODELS. Phase 1.
// ----------------------------------------------------------------------------
// PURE mappers from persistence rows to client-safe descriptors. The encrypted
// token reference is NEVER surfaced (dropped to null); only opaque status +
// non-secret metadata leave the server. Used by the engine, service, and the
// Integration-Center descriptor.
// ============================================================================
import type { MetaConnectionId, MetaConnectionDescriptor, MetaPermissionSnapshot } from "./types";
import type { MetaConnectionRow, MetaBusinessRow, MetaPageRow, MetaInstagramRow, MetaPermissionSnapshotRow } from "./ports";
import type { MetaBusinessAsset, MetaPageAsset, MetaInstagramAsset, MetaAssetRef } from "../assets/types";

/** Map a connection row to a client-safe descriptor. The token ref is dropped. */
export function toConnectionDescriptor(row: MetaConnectionRow): MetaConnectionDescriptor {
  return {
    id: row.id as MetaConnectionId,
    orgId: row.orgId,
    status: row.status,
    health: row.health,
    mode: row.mode,
    tokenKind: row.tokenKind,
    tokenRef: null, // never surface the encrypted ref to a client
    authorizingUserId: row.authorizingUserId,
    scopes: null,
    expiresAt: row.expiresAt,
    lastVerifiedAt: row.lastVerifiedAt,
    reconnectRequired: row.reconnectRequired,
  };
}

/** Attach a permission snapshot (granted vs configured) to a descriptor. */
export function withPermissionSnapshot(desc: MetaConnectionDescriptor, snap: MetaPermissionSnapshotRow): MetaConnectionDescriptor {
  const scopes: MetaPermissionSnapshot = {
    connectionId: snap.connectionId as MetaConnectionId,
    granted: snap.granted,
    configured: snap.configured,
    mode: snap.mode,
    capturedAt: snap.capturedAt,
  };
  return { ...desc, scopes };
}

function ref(kind: MetaAssetRef["kind"], row: { id: string; externalId: string; connectionId: string }): MetaAssetRef {
  return { kind, id: row.id, externalId: row.externalId, connectionId: row.connectionId as MetaConnectionId };
}

export function toBusinessAsset(row: MetaBusinessRow): MetaBusinessAsset {
  return {
    ref: ref("business", row),
    name: row.name,
    verificationStatus: (row.verificationStatus as MetaBusinessAsset["verificationStatus"]) ?? "unknown",
    status: (row.status as MetaBusinessAsset["status"]) ?? "unknown",
  };
}

/** Page asset — the encrypted Page credential is NEVER surfaced. */
export function toPageAsset(row: MetaPageRow): MetaPageAsset {
  return {
    ref: ref("page", row),
    name: row.name,
    category: row.category,
    tokenRef: null,
    permittedTasks: row.permittedTasks,
    status: (row.status as MetaPageAsset["status"]) ?? "unknown",
    linkedInstagramId: row.linkedInstagramExternalId,
  };
}

export function toInstagramAsset(row: MetaInstagramRow, pageCanonicalId: string): MetaInstagramAsset {
  return {
    ref: ref("instagram", row),
    username: row.username,
    accountType: (row.accountType as MetaInstagramAsset["accountType"]) ?? "unknown",
    pageId: pageCanonicalId,
    followersCached: row.followers,
    status: (row.status as MetaInstagramAsset["status"]) ?? "unknown",
  };
}
