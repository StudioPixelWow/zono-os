// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · ASSET contracts. Phase 0.
// ----------------------------------------------------------------------------
// Canonical, transport-neutral asset model: Business Portfolios, Facebook Pages,
// Instagram Professional accounts. ZONO canonical id = uuid; the Meta id is an
// opaque `externalId` string (immutable), never a Graph edge/field name. Page /
// IG credentials are opaque secret refs. Multiple businesses/Pages/IG accounts
// per org are supported by construction.
// ============================================================================
import type { Brand } from "../types";
import type { MetaConnectionId, MetaSecretRef } from "../connection/types";

/** Which Meta surface an asset belongs to. */
export type MetaAssetKind = "business" | "page" | "instagram";

/** Operational status of a discovered asset. */
export type MetaAssetStatus = "active" | "disconnected" | "restricted" | "tombstoned" | "unknown";

/**
 * A stable, transport-neutral reference to a Meta asset. `externalId` is the
 * immutable Meta identifier treated as opaque data (NOT a Graph edge). Used as
 * the join key across publishing / comments / webhooks.
 */
export interface MetaAssetRef {
  kind: MetaAssetKind;
  /** ZONO canonical uuid for the asset row. */
  id: string;
  /** Opaque Meta identifier (immutable). Treated as data, not a Graph path. */
  externalId: string;
  connectionId: MetaConnectionId;
}

/** Business Portfolio (a.k.a. Business Manager) asset. */
export interface MetaBusinessAsset {
  ref: MetaAssetRef;
  name: string;
  verificationStatus: "verified" | "not_verified" | "pending" | "unknown";
  status: MetaAssetStatus;
}

/** Facebook Page asset. Page credential is an opaque ref only. */
export interface MetaPageAsset {
  ref: MetaAssetRef;
  name: string;
  category: string | null;
  /** Opaque per-Page credential handle — never a raw value. */
  tokenRef: MetaSecretRef | null;
  /** Canonical task keys the token is permitted for (not raw Graph tasks). */
  permittedTasks: readonly string[];
  status: MetaAssetStatus;
  /** The linked IG account's canonical id, when present. */
  linkedInstagramId: string | null;
}

/** Instagram Professional account asset (linked to a Page). */
export interface MetaInstagramAsset {
  ref: MetaAssetRef;
  username: string;
  accountType: "business" | "creator" | "unknown";
  /** Canonical id of the Page this IG account is linked through. */
  pageId: string;
  followersCached: number | null;
  status: MetaAssetStatus;
}

/** A union view of any discovered asset (for listing surfaces). */
export type MetaAsset = MetaBusinessAsset | MetaPageAsset | MetaInstagramAsset;

/** Result of an asset-discovery pass (canonical, no raw payloads). */
export interface MetaAssetInventory {
  businesses: readonly MetaBusinessAsset[];
  pages: readonly MetaPageAsset[];
  instagram: readonly MetaInstagramAsset[];
  discoveredAt: string;
}

/** Convenience factory keeping the branded shape explicit for tests. */
export function assetRef(kind: MetaAssetKind, id: string, externalId: string, connectionId: MetaConnectionId): MetaAssetRef {
  return { kind, id, externalId, connectionId };
}

export type MetaAssetId = Brand<string, "MetaAssetId">;
