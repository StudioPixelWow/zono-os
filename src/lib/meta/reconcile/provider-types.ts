// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PROVIDER INSPECTION CONTRACTS. Phase 3C.
// ----------------------------------------------------------------------------
// The canonical, READ-ONLY request/result the reconciliation engine hands to the
// sealed Graph inspection gateway (mirrors the Phase-3A publish gateway seam). The
// request carries a server-resolved credential + known provider ids; the result
// is canonical — NO raw Graph payload, token, or signed URL escapes. Inspection
// NEVER writes: it cannot publish, edit, or delete provider content. `ambiguous`
// marks an inconclusive read (e.g. a transient failure) that must NOT be treated
// as proof of deletion.
// ============================================================================
import type { MetaPlatform } from "../types";

/** Canonical provider-object lifecycle state (matches meta_provider_object_state). */
export type ProviderObjectState = "exists" | "processing" | "published" | "inaccessible" | "deleted" | "hidden" | "permission_lost" | "unknown" | "ambiguous";

export type InspectKind = "object" | "container" | "asset_health";
export type InspectConfidence = "high" | "medium" | "low";
export type InspectEvidenceKind = "provider_inspection" | "webhook" | "manual" | "recovery" | "publish_confirmation";

export interface ProviderInspectRequest {
  kind: InspectKind;
  platform: MetaPlatform;
  assetExternalId: string;
  /** Server-resolved Page/IG credential; used inside Graph, never surfaced. */
  tokenPlain: string;
  externalObjectId: string | null;
  externalContainerId: string | null;
  contentKind: string | null;
  correlationId: string;
  timeoutMs: number;
  /** Bounded lookup window for a narrow deterministic find (ms); 0 = disabled. */
  lookupWindowMs: number;
}

export interface ProviderInspectError {
  kind: string;
  safeMessage: string;
  providerCodeCategory: string | null;
  retryClass: string;
}

export interface ProviderInspectResult {
  found: boolean;
  providerObjectId: string | null;
  providerContainerId: string | null;
  state: ProviderObjectState;
  visibility: string | null;
  permalink: string | null;
  providerCreatedTime: string | null;
  providerUpdatedTime: string | null;
  externalParentId: string | null;
  confidence: InspectConfidence;
  evidenceKind: InspectEvidenceKind;
  /** True when the read was inconclusive (transient) — NOT proof of deletion. */
  ambiguous: boolean;
  error: ProviderInspectError | null;
  retryClass: string;
  warnings: readonly string[];
}

/** The sealed inspection gateway the reconciliation engine depends on
 *  (implemented in provider/graph/inspect.ts). Read-only by contract. */
export interface InspectionGateway {
  inspect(req: ProviderInspectRequest): Promise<ProviderInspectResult>;
}
