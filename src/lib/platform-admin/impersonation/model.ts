// ============================================================================
// ZONO — PLATFORM SUPPORT VIEW model (P5.8, Path A). PURE, client-safe.
// ----------------------------------------------------------------------------
// Vocabulary + deterministic helpers for the SECURE, PLATFORM-SIDE, READ-ONLY
// "Support View" (צפייה במערכת כמשתמש). This is NOT live-customer-app
// impersonation: no auth session, no JWT, no service-role flip, no core-auth
// change. The operator inspects a read-only reconstruction of the customer's
// account built from EXPLICITLY org+user-scoped Platform DAL reads, entirely
// inside the /platform boundary. This file has no auth power.
// ============================================================================

/** Hard ceiling: a Support View session auto-expires after 15 minutes. */
export const SUPPORT_VIEW_MAX_MS = 15 * 60 * 1000;

// ── Reason (mandatory; "other" requires free-text) ──────────────────────────
export type SupportViewReason = "technical_issue" | "permission_check" | "display_issue" | "integration_issue" | "ticket_inquiry" | "other";
export const SUPPORT_VIEW_REASONS: SupportViewReason[] = ["technical_issue", "permission_check", "display_issue", "integration_issue", "ticket_inquiry", "other"];
export const REASON_LABEL: Record<SupportViewReason, string> = {
  technical_issue: "תקלה טכנית",
  permission_check: "בדיקת הרשאות",
  display_issue: "בעיית תצוגה",
  integration_issue: "בעיית אינטגרציה",
  ticket_inquiry: "בירור פנייה",
  other: "אחר",
};
export function isValidReason(r: string): r is SupportViewReason {
  return (SUPPORT_VIEW_REASONS as string[]).includes(r);
}

export const REASON_DETAIL_MAX = 400;

/** Validate a reason selection + optional detail. "other" requires a real
 *  explanation; a generic/empty reason is rejected. Returns a Hebrew error or null. */
export function validateReason(reason: string, detail?: string | null): string | null {
  if (!isValidReason(reason)) return "יש לבחור סיבה תקינה";
  if (reason === "other") {
    const t = (detail ?? "").trim();
    if (t.length < 3) return "עבור אחר יש לפרט את הסיבה";
    if (t.length > REASON_DETAIL_MAX) return `הסבר ארוך מדי (מקסימום ${REASON_DETAIL_MAX})`;
  }
  return null;
}

/** Compose the stored/audited reason string (category + optional detail). */
export function composeReason(reason: SupportViewReason, detail?: string | null): string {
  const label = REASON_LABEL[reason];
  const t = (detail ?? "").trim();
  return reason === "other" && t ? `${label}: ${t}` : label;
}

// ── Session expiry (tracked via support_impersonation_log.started_at) ────────
export function sessionExpiresAtMs(startedAtIso: string): number {
  const t = Date.parse(startedAtIso);
  return Number.isNaN(t) ? 0 : t + SUPPORT_VIEW_MAX_MS;
}
export function isSessionExpired(startedAtIso: string, nowMs: number): boolean {
  return nowMs >= sessionExpiresAtMs(startedAtIso);
}
export function sessionRemainingMs(startedAtIso: string, nowMs: number): number {
  return Math.max(0, sessionExpiresAtMs(startedAtIso) - nowMs);
}

// ── Support View sections (only those with safe authoritative sources) ───────
export type SupportViewSection = "overview" | "properties" | "leads" | "buyers" | "tasks" | "journeys" | "distribution" | "integrations" | "activity" | "account";
export interface SectionDef { key: SupportViewSection; label: string; icon: string; scope: "org" | "user" }
export const SUPPORT_VIEW_SECTIONS: SectionDef[] = [
  { key: "overview", label: "בית", icon: "LayoutGrid", scope: "org" },
  { key: "properties", label: "נכסים", icon: "Building2", scope: "user" },
  { key: "leads", label: "לידים", icon: "Users", scope: "user" },
  { key: "buyers", label: "קונים", icon: "Users", scope: "user" },
  { key: "tasks", label: "משימות", icon: "ListChecks", scope: "user" },
  { key: "journeys", label: "מסעות לקוח", icon: "Route", scope: "org" },
  { key: "distribution", label: "שיווק והפצה", icon: "Megaphone", scope: "org" },
  { key: "integrations", label: "אינטגרציות", icon: "Globe", scope: "org" },
  { key: "activity", label: "פעילות", icon: "ScrollText", scope: "org" },
  { key: "account", label: "חשבון והרשאות", icon: "ShieldCheck", scope: "user" },
];
export function isValidSection(s: string): s is SupportViewSection {
  return SUPPORT_VIEW_SECTIONS.some((d) => d.key === s);
}
export const SUPPORT_VIEW_UNAVAILABLE = "לא זמין במצב תמיכה";
