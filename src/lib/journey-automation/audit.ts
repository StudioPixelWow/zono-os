// ============================================================================
// ZONO — Audit helpers (pure). The executor produces AuditEntry[]; the server
// persists them to journey_audit_log (who/when/why/trigger/workflow/result).
// ============================================================================
import type { AuditEntry } from "./types";

export const AUDIT_LABELS: Record<string, string> = {
  trigger_fired: "טריגר הופעל",
  condition_evaluated: "תנאי הוערך",
  delay_scheduled: "השהיה תוזמנה",
  delay_fast_forwarded: "השהיה דולגה (סימולציה)",
  step_started: "צעד התחיל",
  step_done: "צעד הושלם",
  step_retry: "ניסיון חוזר",
  step_failed: "צעד נכשל",
  journey_ended: "המסע הסתיים",
  sla_breached: "הפרת SLA",
  cancelled: "בוטל",
  simulated: "סימולציה",
  resumed: "חודש",
};

export const auditLabel = (e: string): string => AUDIT_LABELS[e] ?? e;

export function actorLabel(actor: string): string {
  if (actor === "system") return "מערכת";
  if (actor.startsWith("user:")) return "משתמש";
  return actor;
}

/** Build a single explainable audit entry (used by the server for user actions). */
export function makeAudit(eventType: string, opts: Partial<AuditEntry> = {}): AuditEntry {
  return {
    eventType,
    nodeId: opts.nodeId ?? null,
    actor: opts.actor ?? "system",
    reason: opts.reason ?? "",
    detail: opts.detail ?? {},
  };
}
