// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION SAFE READ MODELS. Phase 3C.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. NEVER expose: token/token ref, app secret,
// webhook signature, raw payload, raw Graph body, storage ref, signed media URL,
// lease token, provider trace, or internal matching secrets. Only safe status,
// safe error category, safe timeline state, and safe counts are surfaced.
// ============================================================================
import type { ReconcileJobRow, ReconcileAttemptRow, DiscrepancyRow, ObjectStateRow } from "./ports";

export interface DiscrepancyListItemDTO { id: string; operationId: string | null; targetId: string | null; type: string; severity: string; status: string; detectedAt: string; lastConfirmedAt: string | null; evidenceCount: number; autoRepairable: boolean; safeSummary: string | null }
export function toDiscrepancyListItem(d: DiscrepancyRow): DiscrepancyListItemDTO {
  return { id: d.id, operationId: d.publishOperationId, targetId: d.publishTargetId, type: d.discrepancyType, severity: d.severity, status: d.status, detectedAt: d.detectedAtIso, lastConfirmedAt: d.lastConfirmedAtIso, evidenceCount: d.evidenceCount, autoRepairable: d.autoRepairable, safeSummary: d.safeSummary };
}

export interface DiscrepancyDetailDTO extends DiscrepancyListItemDTO { resolution: string | null; resolutionReason: string | null; recommendedAction: string }
export function toDiscrepancyDetail(d: DiscrepancyRow): DiscrepancyDetailDTO {
  return { ...toDiscrepancyListItem(d), resolution: d.resolution, resolutionReason: d.resolutionReason, recommendedAction: recommend(d) };
}
function recommend(d: DiscrepancyRow): string {
  switch (d.discrepancyType) {
    case "provider_deleted": return "verify at Meta; do not auto-recreate — republish only if intended";
    case "local_success_provider_missing": return "await further verification before any action";
    case "ambiguous_provider_exists": case "local_processing_provider_published": return "auto-repairs to published on confirmed evidence";
    case "permalink_changed": return "permalink auto-updated from provider";
    case "capability_lost_after_publish": return "reconnect the account to restore verification";
    default: return "review evidence and acknowledge or resolve";
  }
}

export interface ObjectStateDTO { observedAt: string; state: string; visibility: string | null; permalink: string | null; evidenceKind: string }
export function toObjectStateDTO(o: ObjectStateRow): ObjectStateDTO {
  return { observedAt: o.observedAtIso, state: o.state, visibility: o.visibilityState, permalink: o.permalink, evidenceKind: o.evidenceKind };
}

export interface ReconcileJobDTO { id: string; jobKind: string; status: string; targetId: string | null; operationId: string | null; availableAt: string; attemptCount: number; safeErrorKind: string | null; reason: string | null }
export function toReconcileJobDTO(j: ReconcileJobRow): ReconcileJobDTO {
  return { id: j.id, jobKind: j.jobKind, status: j.status, targetId: j.publishTargetId, operationId: j.publishOperationId, availableAt: j.availableAtIso, attemptCount: j.attemptCount, safeErrorKind: j.safeErrorKind, reason: j.reason };
}

export interface AttemptDTO { attemptNumber: number; result: string | null; observedState: string | null; safeErrorKind: string | null; startedAt: string; durationMs: number | null }
export function toAttemptDTO(a: ReconcileAttemptRow): AttemptDTO {
  return { attemptNumber: a.attemptNumber, result: a.result, observedState: a.observedProviderState, safeErrorKind: a.safeErrorKind, startedAt: a.startedAtIso, durationMs: a.durationMs };
}
