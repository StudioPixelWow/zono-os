// ============================================================================
// ZONO — OWNER INTELLIGENCE model (P5.10). PURE, client-safe, deterministic.
// ----------------------------------------------------------------------------
// The explainable management-state decisions for the ZONO owner view. NO ML, NO
// opaque 0–100 score, NO predictive churn — every result is a category derived
// from real signals + the reasons that triggered it + what data was missing.
// The server layer (server/intel.ts) fetches bounded aggregates and delegates
// every classification here.
// ============================================================================

const DAY = 86_400_000;
export function daysAgo(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : Math.floor((nowMs - t) / DAY);
}

// ── Customer activity state ─────────────────────────────────────────────────
// Rules (documented, deterministic):
//   NEW           → org created within 14 days
//   else by last meaningful activity (max domain_event / product change):
//   ACTIVE        → activity within 7 days
//   LOW_ACTIVITY  → activity within 30 days
//   INACTIVE      → activity older than 30 days
//   UNKNOWN       → no activity signal available
export type ActivityState = "NEW" | "ACTIVE" | "LOW_ACTIVITY" | "INACTIVE" | "UNKNOWN";
export const ACTIVITY_LABEL: Record<ActivityState, string> = {
  NEW: "חדש", ACTIVE: "פעיל", LOW_ACTIVITY: "פעילות נמוכה", INACTIVE: "לא פעיל", UNKNOWN: "לא ידוע",
};
export const ACTIVITY_NEW_DAYS = 14;
export const ACTIVITY_ACTIVE_DAYS = 7;
export const ACTIVITY_LOW_DAYS = 30;

export function resolveActivity(createdAt: string | null, lastActivityAt: string | null, nowMs: number): ActivityState {
  const age = daysAgo(createdAt, nowMs);
  if (age !== null && age <= ACTIVITY_NEW_DAYS) return "NEW";
  const since = daysAgo(lastActivityAt, nowMs);
  if (since === null) return "UNKNOWN";
  if (since <= ACTIVITY_ACTIVE_DAYS) return "ACTIVE";
  if (since <= ACTIVITY_LOW_DAYS) return "LOW_ACTIVITY";
  return "INACTIVE";
}

// ── Customer health state ───────────────────────────────────────────────────
// Deterministic category + explainable reasons + declared missing signals.
export type HealthState = "HEALTHY" | "WATCH" | "AT_RISK" | "CRITICAL" | "UNKNOWN";
export const HEALTH_LABEL: Record<HealthState, string> = {
  HEALTHY: "תקין", WATCH: "מעקב", AT_RISK: "בסיכון", CRITICAL: "קריטי", UNKNOWN: "לא ידוע",
};
export const HEALTH_RANK: Record<HealthState, number> = { CRITICAL: 4, AT_RISK: 3, WATCH: 2, HEALTHY: 1, UNKNOWN: 0 };

export interface HealthSignals {
  activity: ActivityState;
  billingState: string | null;        // from P5.5 resolver, or null if unavailable
  opsCritical: boolean | null;        // dead-letter/failed over threshold; null=unavailable
  opsFailedJobs: number | null;
  integrationDisconnected: number | null;
  openUrgentTickets: number | null;
  productPresence: boolean | null;    // has any core product data (adoption floor)
}
export interface HealthResult { state: HealthState; reasons: string[]; missing: string[] }

export function resolveHealth(s: HealthSignals): HealthResult {
  const reasons: string[] = [];
  const missing: string[] = [];
  if (s.billingState === null) missing.push("מצב חיוב");
  if (s.opsCritical === null) missing.push("בריאות תפעולית");
  if (s.openUrgentTickets === null) missing.push("עומס תמיכה");
  if (s.integrationDisconnected === null) missing.push("מצב אינטגרציות");

  // CRITICAL signals
  if (s.billingState === "PAYMENT_FAILED") reasons.push("כשל תשלום");
  if (s.opsCritical === true) reasons.push("תקלה תפעולית קריטית");
  if ((s.openUrgentTickets ?? 0) >= 1) reasons.push("פנייה דחופה פתוחה");
  const critical = reasons.length > 0;
  if (critical) return { state: "CRITICAL", reasons, missing };

  // AT_RISK signals
  if (s.activity === "INACTIVE") reasons.push("אין פעילות מעל 30 יום");
  if (s.billingState === "GRACE") reasons.push("תקופת חסד לאחר כשל תשלום");
  if ((s.integrationDisconnected ?? 0) >= 1) reasons.push("אינטגרציה מנותקת");
  if (reasons.length > 0) return { state: "AT_RISK", reasons, missing };

  // WATCH signals
  if (s.activity === "LOW_ACTIVITY") reasons.push("פעילות נמוכה");
  if ((s.opsFailedJobs ?? 0) >= 1) reasons.push("משימות שנכשלו");
  if (s.productPresence === false) reasons.push("אימוץ מוצר נמוך");
  if (reasons.length > 0) return { state: "WATCH", reasons, missing };

  // HEALTHY vs UNKNOWN
  if (s.activity === "UNKNOWN" && s.billingState === null && s.opsCritical === null) {
    return { state: "UNKNOWN", reasons: ["אין מספיק אותות"], missing };
  }
  return { state: "HEALTHY", reasons: ["פעיל · ללא אותות שליליים"], missing };
}

// ── Risk indicators (deterministic flags — NOT predictive churn) ────────────
export interface RiskInputs { activity: ActivityState; billingState: string | null; integrationDisconnected: number | null; openUrgentTickets: number | null; opsCritical: boolean | null; productPresence: boolean | null }
export interface RiskFlag { key: string; label: string }
export function riskFlags(r: RiskInputs): RiskFlag[] {
  const out: RiskFlag[] = [];
  if (r.activity === "INACTIVE") out.push({ key: "no_activity", label: "אין פעילות מעל 30 יום" });
  if (r.billingState === "PAYMENT_FAILED") out.push({ key: "payment_failed", label: "כשל תשלום" });
  if (r.billingState === "GRACE") out.push({ key: "grace", label: "תקופת חסד" });
  if ((r.integrationDisconnected ?? 0) >= 1) out.push({ key: "integration_down", label: "אינטגרציה מנותקת" });
  if ((r.openUrgentTickets ?? 0) >= 1) out.push({ key: "urgent_ticket", label: "פנייה דחופה פתוחה" });
  if (r.opsCritical === true) out.push({ key: "ops_critical", label: "תקלות מערכת חוזרות" });
  if (r.productPresence === false) out.push({ key: "low_adoption", label: "אימוץ מוצר נמוך" });
  return out;
}

// ── Attention queue severity ────────────────────────────────────────────────
export type AttentionSeverity = "critical" | "warning" | "info";
export const ATTENTION_TONE: Record<AttentionSeverity, string> = {
  critical: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", info: "bg-info-soft text-info",
};

// ── Data freshness (honest — never implies real-time for cron/partial data) ─
export function freshnessLabel(lastIso: string | null, nowMs: number): string {
  const d = daysAgo(lastIso, nowMs);
  if (d === null) return "אין נתונים";
  if (d === 0) {
    const mins = Math.floor((nowMs - Date.parse(lastIso!)) / 60000);
    if (mins < 60) return mins <= 1 ? "עכשיו" : `לפני ${mins} ד׳`;
    return `לפני ${Math.floor(mins / 60)} ש׳`;
  }
  return d === 1 ? "אתמול" : `לפני ${d} ימים`;
}
