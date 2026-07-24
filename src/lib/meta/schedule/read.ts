// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE SAFE READ MODELS. Phase 3B.
// ----------------------------------------------------------------------------
// PURE mappers to client-safe DTOs. NEVER expose: the lease token or owner, any
// provider token, signed URL, storage_ref, raw Graph body/payload, media bytes,
// app secret, or provider trace id. Only safe scheduling metadata, safe status,
// safe error CATEGORY, and safe counts are surfaced. Timezone context is exposed
// as the stored (UTC instant, IANA zone, wall-clock local, offset) tuple so the UI
// can render the user's intended local time deterministically.
// ============================================================================
import type { PublishJobRow, PublishJobAttemptRow } from "./ports";
import type { DeadLetterRecord } from "./dead-letter";

export interface ScheduledJobDTO {
  id: string; operationId: string; targetId: string | null; jobKind: string; status: string;
  scheduledForIso: string; timezone: string | null; localDateTime: string | null; offsetMinutes: number | null;
  runAfterIso: string; attemptCount: number; retryBudgetRemaining: number;
  lastErrorKind: string | null; safeLastError: string | null; createdAtIso: string; completedAtIso: string | null;
}

/** Map a job row to a safe DTO — lease token/owner/expiry are intentionally omitted. */
export function toScheduledJobDTO(j: PublishJobRow): ScheduledJobDTO {
  return {
    id: j.id, operationId: j.publishOperationId, targetId: j.publishTargetId, jobKind: j.jobKind, status: j.status,
    scheduledForIso: j.scheduledForIso, timezone: j.scheduledTimezone, localDateTime: j.scheduledLocalDatetime, offsetMinutes: j.scheduledOffsetMinutes,
    runAfterIso: j.runAfterIso, attemptCount: j.attemptCount, retryBudgetRemaining: j.retryBudgetRemaining,
    lastErrorKind: j.lastErrorKind, safeLastError: j.safeLastError, createdAtIso: j.createdAtIso, completedAtIso: j.completedAtIso,
  };
}

export interface JobAttemptDTO { attemptNumber: number; outcome: string | null; safeErrorKind: string | null; retryClass: string | null; nextRunAfterIso: string | null; durationMs: number | null; startedAtIso: string }
export function toJobAttemptDTO(a: PublishJobAttemptRow): JobAttemptDTO {
  return { attemptNumber: a.attemptNumber, outcome: a.outcome, safeErrorKind: a.safeErrorKind, retryClass: a.retryClass, nextRunAfterIso: a.nextRunAfterIso, durationMs: a.durationMs, startedAtIso: a.startedAtIso };
}

export interface DeadLetterDTO { id: string; operationId: string; targetId: string | null; jobKind: string; reason: string; terminalErrorKind: string | null; attemptCount: number; acknowledged: boolean; createdAtIso: string; requiresProviderVerification: boolean }
export function toDeadLetterDTO(d: DeadLetterRecord): DeadLetterDTO {
  const ambiguous = d.reason === "ambiguous_result" || d.reason === "recovery_ambiguous";
  return { id: d.id, operationId: d.publishOperationId, targetId: d.publishTargetId, jobKind: d.jobKind, reason: d.reason, terminalErrorKind: d.terminalErrorKind, attemptCount: d.attemptCount, acknowledged: false, createdAtIso: d.createdAt, requiresProviderVerification: ambiguous };
}
