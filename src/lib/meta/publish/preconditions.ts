// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH PRECONDITIONS (PURE). Phase 3A.
// ----------------------------------------------------------------------------
// FAIL-CLOSED preconditions. Publishing is never permitted just because a status
// string says "approved" — approval + version integrity is verified STRUCTURALLY
// (current version == approved version AND content hash == approved hash). Each
// target is checked independently so one blocked target does not block a valid
// sibling. Facebook Groups / Extended kinds / missing capability / disconnected
// assets / kill switch all block. No provider call, no secret.
// ============================================================================
import type { DraftState } from "../content/domain";
import type { MetaCapabilityDecision } from "../capability/types";
import { contentKind } from "../content/model";

export interface TargetRuntime {
  capability: MetaCapabilityDecision;
  assetStatus: string;
  connectionStatus: string;
  connectionHealth: string;
  mediaValid: boolean;
  variantMissing: boolean;
}

export interface PreconditionInput {
  draft: DraftState;
  approvedVersion: number;
  approvedContentHash: string;
  targetIds: readonly string[];
  runtime: (targetId: string) => TargetRuntime | null;
  globalKillSwitch: boolean;
  orgKillSwitch: boolean;
  actorCanPublish: boolean;
}

export interface TargetPrecondition { targetId: string; ok: boolean; reasons: readonly string[] }
export interface PreconditionResult {
  ok: boolean;
  operationBlock: string | null;
  targets: readonly TargetPrecondition[];
  publishableTargetIds: readonly string[];
}

export function checkPublishPreconditions(input: PreconditionInput): PreconditionResult {
  const { draft } = input;
  let opBlock: string | null = null;
  if (!input.actorCanPublish) opBlock = "actor_not_permitted";
  else if (input.globalKillSwitch || input.orgKillSwitch) opBlock = "kill_switch";
  else if (draft.archivedAt) opBlock = "draft_archived";
  else if (draft.status !== "approved" || draft.approvalState !== "approved") opBlock = "draft_not_approved";
  else if (draft.currentVersion !== input.approvedVersion) opBlock = "approval_version_mismatch";
  else if ((draft.contentHash ?? "") !== input.approvedContentHash) opBlock = "edited_after_approval";

  const selected = draft.targets.filter((t) => input.targetIds.includes(t.id) && t.enabled);
  if (!opBlock && selected.length === 0) opBlock = "no_enabled_target";

  const targets: TargetPrecondition[] = selected.map((t) => {
    const reasons: string[] = [];
    const def = contentKind(t.contentKind);
    if (!def) reasons.push("unknown_content_kind");
    else if (!def.enabled) reasons.push("content_kind_disabled");
    if (/group/i.test(t.contentKind)) reasons.push("facebook_groups_not_allowed");
    const rt = input.runtime(t.id);
    if (!rt) { reasons.push("runtime_unavailable"); return { targetId: t.id, ok: false, reasons }; }
    if (!rt.capability.allowed) reasons.push(`capability_denied:${rt.capability.reason ?? "unknown"}`);
    if (rt.assetStatus !== "active") reasons.push("asset_not_active");
    if (rt.connectionStatus === "revoked" || rt.connectionStatus === "needs_reauth") reasons.push("connection_reauth_required");
    else if (rt.connectionStatus !== "connected") reasons.push("connection_not_active");
    if (rt.connectionHealth === "unhealthy") reasons.push("connection_unhealthy");
    if (!rt.mediaValid) reasons.push("media_invalid");
    if (rt.variantMissing) reasons.push("variant_required");
    return { targetId: t.id, ok: reasons.length === 0, reasons };
  });

  const publishable = targets.filter((t) => t.ok).map((t) => t.targetId);
  return {
    ok: !opBlock && publishable.length > 0,
    operationBlock: opBlock,
    targets,
    publishableTargetIds: publishable,
  };
}
