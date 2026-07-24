// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · DEAD-LETTER (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// The terminal graveyard for background jobs that must not keep running: retries
// exhausted, permanently failed, budget spent, or an ambiguous/recovered write.
// A dead-lettered job is NEVER auto-replayed — that is the whole point. The only
// path out is a privileged human acknowledging it and (if appropriate) starting a
// FRESH Phase-3A operation by hand; the queue itself never re-drives it. The
// record captures only secret-free context (safe error kind/class, counts) — no
// token, signed URL, raw provider payload, media bytes, or lease token.
// ============================================================================
import type { JobKind } from "./job-state";

export type DeadLetterReason = "retries_exhausted" | "permanent_failure" | "ambiguous_result" | "budget_exhausted" | "manual" | "recovery_ambiguous";

export interface DeadLetterRecord {
  id: string;
  orgId: string;
  publishJobId: string;
  publishOperationId: string;
  publishTargetId: string | null;
  jobKind: JobKind;
  reason: DeadLetterReason;
  terminalErrorKind: string | null;
  terminalErrorClass: string | null;
  attemptCount: number;
  /** Secret-free context only (ids/counts/safe reason). Never a token/payload. */
  safeContext: Record<string, unknown>;
  createdAt: string;
}

export interface BuildDeadLetterInput {
  id: string;
  orgId: string;
  publishJobId: string;
  publishOperationId: string;
  publishTargetId?: string | null;
  jobKind: JobKind;
  reason: DeadLetterReason;
  terminalErrorKind?: string | null;
  terminalErrorClass?: string | null;
  attemptCount: number;
  createdAt: string;
  extra?: Record<string, unknown>;
}

/** A short allowlist of safe scalar keys permitted in dead-letter context. */
const SAFE_KEYS = new Set(["platform", "contentKind", "requeueCount", "budgetRemaining", "correlationId", "scheduledFor"]);

function sanitize(extra: Record<string, unknown> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!extra) return out;
  for (const [k, v] of Object.entries(extra)) {
    if (!SAFE_KEYS.has(k)) continue;
    if (v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

/** Build a secret-free dead-letter record. Pure. */
export function buildDeadLetter(input: BuildDeadLetterInput): DeadLetterRecord {
  return {
    id: input.id,
    orgId: input.orgId,
    publishJobId: input.publishJobId,
    publishOperationId: input.publishOperationId,
    publishTargetId: input.publishTargetId ?? null,
    jobKind: input.jobKind,
    reason: input.reason,
    terminalErrorKind: input.terminalErrorKind ?? null,
    terminalErrorClass: input.terminalErrorClass ?? null,
    attemptCount: input.attemptCount,
    safeContext: { reason: input.reason, ...sanitize(input.extra) },
    createdAt: input.createdAt,
  };
}

/** A dead-letter is NEVER a candidate for automatic replay. Invariant, always false. */
export function isAutoReplayable(): false {
  return false;
}

/**
 * Whether a human MAY manually re-drive a dead-lettered job. This does not replay
 * the job — it authorizes starting a new Phase-3A operation. An ambiguous/
 * recovery-ambiguous record additionally requires the operator to first verify at
 * Meta that no duplicate was published.
 */
export function manualRedriveGuidance(record: DeadLetterRecord, actorCanPublish: boolean): { allowed: boolean; requiresProviderVerification: boolean; reason: string } {
  if (!actorCanPublish) return { allowed: false, requiresProviderVerification: false, reason: "not_permitted" };
  const ambiguous = record.reason === "ambiguous_result" || record.reason === "recovery_ambiguous";
  return { allowed: true, requiresProviderVerification: ambiguous, reason: ambiguous ? "verify_no_duplicate_before_redrive" : "manual_redrive_allowed" };
}
