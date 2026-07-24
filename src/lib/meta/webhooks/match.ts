// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · EVENT→OBJECT MATCHING (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Resolves a verified canonical event to a canonical ZONO record + its owning org
// using ONLY trusted server-side mappings, in a fixed priority order:
//   1. meta_provider_object.external_object_id
//   2. provider container id
//   3. canonical Phase-1 asset mapping (asset_external_id → org/connection)
//   4. publish-target ↔ provider-object relation
//   5. correlation evidence
//   6. otherwise → unmatched (durable, admin-only, no publish-state mutation)
// The org is DERIVED from these mappings — never taken from the webhook payload.
// A permalink or caption ALONE can never establish ownership. Pure: the service
// supplies the looked-up candidates; this function only decides.
// ============================================================================
import type { MetaCanonicalWebhookEvent, MetaMatchConfidence } from "./types";

export interface MatchCandidateObject { providerObjectId: string; orgId: string; publishTargetId: string | null; publishOperationId: string | null }
export interface MatchCandidateAsset { orgId: string; connectionId: string | null }

export interface MatchInputs {
  /** provider_object row whose external_object_id == event.externalObjectId. */
  byExternalObjectId: MatchCandidateObject | null;
  /** provider_object row whose external_container_id == event.externalObjectId/parent. */
  byContainerId: MatchCandidateObject | null;
  /** Phase-1 canonical asset resolved from event.assetExternalId. */
  byAsset: MatchCandidateAsset | null;
}

export type MatchReason = "external_object_id" | "container_id" | "asset_mapping" | "unmatched";

export interface MatchResult {
  matched: boolean;
  orgId: string | null;
  providerObjectId: string | null;
  publishTargetId: string | null;
  publishOperationId: string | null;
  confidence: MetaMatchConfidence;
  reason: MatchReason;
}

const UNMATCHED: MatchResult = { matched: false, orgId: null, providerObjectId: null, publishTargetId: null, publishOperationId: null, confidence: "low", reason: "unmatched" };

/** Decide the match for a canonical event from trusted candidate mappings. */
export function matchEvent(ev: MetaCanonicalWebhookEvent, inputs: MatchInputs): MatchResult {
  // Ignored / unsupported events never match a publishable object.
  if (ev.eventType === "ignored" || ev.eventType === "unsupported") return UNMATCHED;

  // 1. Direct provider-object identity (strongest).
  if (ev.externalObjectId && inputs.byExternalObjectId) {
    const o = inputs.byExternalObjectId;
    return { matched: true, orgId: o.orgId, providerObjectId: o.providerObjectId, publishTargetId: o.publishTargetId, publishOperationId: o.publishOperationId, confidence: "high", reason: "external_object_id" };
  }
  // 2. Container identity (e.g. an IG container id observed on the event).
  if (inputs.byContainerId) {
    const o = inputs.byContainerId;
    return { matched: true, orgId: o.orgId, providerObjectId: o.providerObjectId, publishTargetId: o.publishTargetId, publishOperationId: o.publishOperationId, confidence: "high", reason: "container_id" };
  }
  // 3. Canonical asset mapping — resolves the ORG (never the payload) but not a
  //    specific object; useful for permission/connection events + follow-up.
  if (ev.assetExternalId && inputs.byAsset) {
    return { matched: true, orgId: inputs.byAsset.orgId, providerObjectId: null, publishTargetId: null, publishOperationId: null, confidence: ev.eventType === "permission_change" ? "high" : "medium", reason: "asset_mapping" };
  }
  // 4–6. No trusted mapping → unmatched. Durable, admin-only, no state mutation.
  return UNMATCHED;
}
