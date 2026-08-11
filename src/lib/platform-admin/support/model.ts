// ============================================================================
// ZONO — PLATFORM SUPPORT model (P5.7). PURE, client-safe, deterministic.
// ----------------------------------------------------------------------------
// The canonical support status/priority vocabulary + the deterministic status
// state-machine (like the kernel subscription machine). The server layer
// (server/support.ts) enforces capability/tenancy/audit and delegates every
// transition decision here. NO impersonation logic (that is P5.8).
// ============================================================================

// ── Status ──────────────────────────────────────────────────────────────────
export type TicketStatus = "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";
export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting_customer", "resolved", "closed"];
export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "פתוח", in_progress: "בטיפול", waiting_customer: "ממתין ללקוח", resolved: "נפתר", closed: "סגור",
};

// Deterministic allowed transitions. Reopen = closed/resolved → open/in_progress.
// Self-transition is not a change (rejected). Kept intentionally small.
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["in_progress", "waiting_customer", "resolved", "closed"],
  in_progress: ["waiting_customer", "resolved", "closed", "open"],
  waiting_customer: ["in_progress", "resolved", "closed", "open"],
  resolved: ["closed", "open", "in_progress"],   // resolved → open/in_progress = reopen
  closed: ["open", "in_progress"],               // closed → open/in_progress = reopen
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return (TRANSITIONS[from] ?? []).includes(to);
}
/** Is this transition a REOPEN (from a terminal-ish state back to active)? */
export function isReopen(from: TicketStatus, to: TicketStatus): boolean {
  return (from === "closed" || from === "resolved") && (to === "open" || to === "in_progress");
}
export function isClosing(to: TicketStatus): boolean { return to === "closed"; }
/** Active = not resolved/closed (what "open tickets" counts). */
export function isActive(s: TicketStatus): boolean { return s !== "resolved" && s !== "closed"; }

// ── Priority ────────────────────────────────────────────────────────────────
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export const TICKET_PRIORITIES: TicketPriority[] = ["low", "normal", "high", "urgent"];
export const PRIORITY_LABEL: Record<TicketPriority, string> = { low: "נמוכה", normal: "רגילה", high: "גבוהה", urgent: "דחופה" };
export const PRIORITY_RANK: Record<TicketPriority, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
/** Escalation to URGENT should carry a reason (enforced by the action layer). */
export function requiresReason(from: TicketPriority, to: TicketPriority): boolean {
  return to === "urgent" && from !== "urgent";
}

// ── Source ──────────────────────────────────────────────────────────────────
// Only MANUAL_PLATFORM is safely supported in v1 (no email/WhatsApp auto-ingest
// wiring exists). Others are vocabulary for future ingestion; the create action
// only permits manual_platform + system_alert (operator-authored).
export type TicketSource = "manual_platform" | "customer_report" | "email" | "whatsapp" | "system_alert";
export const SOURCE_LABEL: Record<TicketSource, string> = {
  manual_platform: "פלטפורמה (ידני)", customer_report: "דיווח לקוח", email: "אימייל", whatsapp: "וואטסאפ", system_alert: "התראת מערכת",
};
export const OPERATOR_CREATABLE_SOURCES: TicketSource[] = ["manual_platform", "system_alert"];
export function isOperatorCreatableSource(s: string): s is TicketSource {
  return (OPERATOR_CREATABLE_SOURCES as string[]).includes(s);
}

// ── Category (small fixed set; free "general" default) ──────────────────────
export type TicketCategory = "general" | "billing" | "technical" | "integration" | "onboarding" | "data" | "abuse";
export const CATEGORIES: TicketCategory[] = ["general", "billing", "technical", "integration", "onboarding", "data", "abuse"];
export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  general: "כללי", billing: "חיוב", technical: "טכני", integration: "אינטגרציה", onboarding: "הטמעה", data: "נתונים", abuse: "שימוש לרעה",
};
export function normalizeCategory(raw: string | null | undefined): TicketCategory {
  return (CATEGORIES as string[]).includes(raw ?? "") ? (raw as TicketCategory) : "general";
}

// ── Validation helpers (pure) ───────────────────────────────────────────────
export function isValidStatus(s: string): s is TicketStatus { return (TICKET_STATUSES as string[]).includes(s); }
export function isValidPriority(p: string): p is TicketPriority { return (TICKET_PRIORITIES as string[]).includes(p); }

/** An operator is assignable only if they are a real, ACTIVE platform operator.
 *  (Org users are NEVER assignable — enforced by looking up platform_operators.) */
export function isAssignableOperator(op: { status: string } | null): boolean {
  return !!op && op.status === "active";
}

export const SUBJECT_MAX = 200;
export const NOTE_MAX = 5000;
export function validateSubject(s: string): string | null {
  const t = s.trim();
  if (t.length < 3) return "נושא קצר מדי";
  if (t.length > SUBJECT_MAX) return `נושא ארוך מדי (מקסימום ${SUBJECT_MAX})`;
  return null;
}
export function validateNote(s: string): string | null {
  const t = s.trim();
  if (t.length < 1) return "הערה ריקה";
  if (t.length > NOTE_MAX) return `הערה ארוכה מדי (מקסימום ${NOTE_MAX})`;
  return null;
}
