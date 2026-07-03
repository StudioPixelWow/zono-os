// ============================================================================
// 🔌 Platform API — endpoint registry + scope check + rate limit (pure). 31.0.
// The single source of truth for what the gateway exposes; drives dispatch,
// OpenAPI and the Developer Center. No business logic — endpoints map to existing
// services in the (server) dispatch layer.
// ============================================================================
import type { EndpointSpec, Scope } from "./types";

// Parts 2 + 3 — the exposed surface. Reads are read-only; actions are approval-gated.
export const ENDPOINTS: EndpointSpec[] = [
  // Entity read APIs (Part 2).
  { id: "buyers.list", method: "GET", path: "/buyers", scope: "read:buyers", kind: "read", approvalGated: false, summary: "רשימת קונים + כרטיסי סוכן" },
  { id: "sellers.list", method: "GET", path: "/sellers", scope: "read:sellers", kind: "read", approvalGated: false, summary: "רשימת מוכרים + כרטיסי סוכן" },
  { id: "leads.list", method: "GET", path: "/leads", scope: "read:leads", kind: "read", approvalGated: false, summary: "רשימת לידים + כרטיסי סוכן" },
  { id: "properties.list", method: "GET", path: "/properties", scope: "read:properties", kind: "read", approvalGated: false, summary: "רשימת נכסים + כרטיסי סוכן" },
  { id: "offices.get", method: "GET", path: "/offices", scope: "read:offices", kind: "read", approvalGated: false, summary: "כרטיס צמיחת המשרד" },
  { id: "missions.list", method: "GET", path: "/missions", scope: "read:missions", kind: "read", approvalGated: false, summary: "מרכז הפעולות (משימות)" },
  { id: "workflows.list", method: "GET", path: "/workflows", scope: "read:workflows", kind: "read", approvalGated: false, summary: "תהליכים פעילים" },
  // AI read APIs (Part 3).
  { id: "ai.chief", method: "GET", path: "/ai/chief-of-staff", scope: "read:ai", kind: "ai", approvalGated: false, summary: "Chief of Staff — תדריך ארגוני" },
  { id: "ai.truth", method: "GET", path: "/ai/truth", scope: "read:ai", kind: "ai", approvalGated: false, summary: "Truth Engine — דו\"ח אמת ארגוני" },
  { id: "ai.orchestrator", method: "GET", path: "/ai/orchestrator", scope: "read:ai", kind: "ai", approvalGated: false, summary: "Multi-Agent Orchestrator — לוח" },
  { id: "ai.ask", method: "POST", path: "/ai/ask", scope: "ask:zono", kind: "ai", approvalGated: false, summary: "Ask ZONO — שאלה בשפה חופשית", params: [{ name: "query", in: "body", required: true, description: "השאלה" }] },
  // Approval-gated action APIs (Part 1/2). Created artifacts are themselves gated.
  { id: "missions.create", method: "POST", path: "/missions", scope: "action:mission", kind: "action", approvalGated: true, summary: "הצעת משימה (נוצרת כ-WAITING_FOR_APPROVAL)", params: [
    { name: "entityType", in: "body", required: true, description: "סוג ישות" }, { name: "entityId", in: "body", required: false, description: "מזהה ישות" },
    { name: "missionType", in: "body", required: true, description: "סוג משימה" }, { name: "reason", in: "body", required: true, description: "נימוק" }] },
  { id: "drafts.create", method: "POST", path: "/drafts", scope: "action:draft", kind: "action", approvalGated: true, summary: "הכנת טיוטת תקשורת (אינה נשלחת)", params: [
    { name: "entityKind", in: "body", required: true, description: "סוג ישות" }, { name: "entityId", in: "body", required: true, description: "מזהה" },
    { name: "name", in: "body", required: true, description: "שם" }, { name: "channel", in: "body", required: false, description: "ערוץ" }, { name: "purpose", in: "body", required: false, description: "מטרה" }] },
  { id: "workflows.start", method: "POST", path: "/workflows", scope: "action:workflow", kind: "action", approvalGated: true, summary: "הפעלת תהליך מתמשך (צעדים ממתינים לאישור)", params: [
    { name: "templateId", in: "body", required: true, description: "תבנית" }, { name: "entityKind", in: "body", required: true, description: "סוג ישות" },
    { name: "entityId", in: "body", required: true, description: "מזהה" }, { name: "entityName", in: "body", required: true, description: "שם" }] },
];

export function findEndpoint(method: string, path: string): EndpointSpec | null {
  const p = path.replace(/\/+$/, "") || "/";
  return ENDPOINTS.find((e) => e.method === method && e.path === p) ?? null;
}

// Part 5 — scope check. "*" grants everything; admin scopes are explicit.
export function hasScope(granted: Scope[], required: Scope): boolean {
  if (granted.includes("*")) return true;
  return granted.includes(required);
}

// Part 5 — sliding-window rate limit (pure). Given prior request timestamps.
export function withinRateLimit(timestampsMs: number[], nowMs: number, windowMs: number, max: number): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const cutoff = nowMs - windowMs;
  const recent = timestampsMs.filter((t) => t > cutoff);
  const allowed = recent.length < max;
  const remaining = Math.max(0, max - recent.length - (allowed ? 1 : 0));
  const oldest = recent.length ? Math.min(...recent) : nowMs;
  return { allowed, remaining, retryAfterMs: allowed ? 0 : Math.max(0, oldest + windowMs - nowMs) };
}
