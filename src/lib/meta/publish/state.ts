// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH STATE MACHINES (PURE). Phase 3A.
// ----------------------------------------------------------------------------
// Deterministic operation / target state machines. Immediate mode only — there
// is NO scheduled/queued/retry_wait/dead_letter state. Terminal success cannot
// re-execute; cancelled cannot execute; the operation result is DERIVED from its
// targets (partial success is first-class). Invalid transitions fail closed.
// ============================================================================

export type OperationStatus = "created" | "validating" | "ready" | "executing" | "partially_succeeded" | "succeeded" | "failed" | "cancelled" | "blocked";
export type TargetStatus = "pending" | "validating" | "ready" | "executing" | "provider_processing" | "succeeded" | "failed" | "skipped" | "cancelled" | "blocked" | "manual_review_required";
export type AttemptResult = "succeeded" | "failed" | "ambiguous" | "skipped" | "cancelled";

const OP: Record<OperationStatus, readonly OperationStatus[]> = {
  created: ["validating", "cancelled", "blocked"],
  validating: ["ready", "blocked", "cancelled"],
  ready: ["executing", "cancelled"],
  executing: ["succeeded", "partially_succeeded", "failed"],
  partially_succeeded: [],
  succeeded: [],
  failed: [],
  cancelled: [],
  blocked: [],
};

const TG: Record<TargetStatus, readonly TargetStatus[]> = {
  pending: ["validating", "cancelled", "blocked", "skipped"],
  validating: ["ready", "blocked", "skipped"],
  ready: ["executing", "cancelled", "skipped"],
  executing: ["provider_processing", "succeeded", "failed", "manual_review_required"],
  provider_processing: ["succeeded", "failed", "manual_review_required"],
  succeeded: [],
  failed: ["executing"],
  manual_review_required: [],
  skipped: [],
  cancelled: [],
  blocked: [],
};

export const OPERATION_TERMINAL: ReadonlySet<OperationStatus> = new Set(["partially_succeeded", "succeeded", "failed", "cancelled", "blocked"]);
export const TARGET_TERMINAL: ReadonlySet<TargetStatus> = new Set(["succeeded", "skipped", "cancelled", "blocked", "manual_review_required"]);

export function canTransitionOperation(from: OperationStatus, to: OperationStatus): boolean {
  return (OP[from] ?? []).includes(to);
}
export function canTransitionTarget(from: TargetStatus, to: TargetStatus): boolean {
  return (TG[from] ?? []).includes(to);
}

/** Derive the operation's terminal status from its targets' statuses. */
export function deriveOperationStatus(targetStatuses: readonly TargetStatus[]): OperationStatus {
  const active = targetStatuses.filter((s) => s !== "cancelled" && s !== "skipped");
  if (active.length === 0) return "cancelled";
  const succeeded = active.filter((s) => s === "succeeded").length;
  const failedish = active.filter((s) => s === "failed" || s === "blocked" || s === "manual_review_required").length;
  const pendingish = active.filter((s) => !TARGET_TERMINAL.has(s) && s !== "failed").length;
  if (pendingish > 0) return "executing";
  if (succeeded === active.length) return "succeeded";
  if (succeeded === 0) return "failed";
  if (succeeded > 0 && failedish > 0) return "partially_succeeded";
  return "failed";
}

/** A terminal-success target must never re-execute. */
export function canExecuteTarget(status: TargetStatus): boolean {
  return status === "ready" || status === "executing";
}
