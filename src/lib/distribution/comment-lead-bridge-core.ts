// ============================================================================
// 🌉 ZONO — Facebook Comment → CRM Lead bridge · pure core (client-safe). CHECK.
// The MISSING link between the existing distribution comment pipeline and the
// CRM `leads` table. REUSES the existing extractPhone() (no duplicated regex);
// maps a classified comment into CRM lead fields; and returns the approved,
// phone-requesting reply text (assisted/manual — never auto-sent). Pure.
// ============================================================================
import { extractPhone } from "./infrastructure/lead-intent";

/** First Israeli phone found across the comment + any later comments/messages. */
export function pickPhone(texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    if (!t) continue;
    const p = extractPhone(t);
    if (p) return p;
  }
  return null;
}

export interface CommentLean {
  authorName: string | null;
  commentText: string | null;
  leadIntentScore: number;
  category: string | null;
  suggestedReply: string | null;
  propertyId: string | null;
}
export interface CrmLeadFields {
  full_name: string;
  phone: string | null;
  source: string;
  stage: string;
  message: string | null;
  score: number;
  property_id: string | null;
  intent: string | null;
}

/** Map a classified comment (+ resolved phone) into CRM `leads` insert fields. */
export function mapCommentToLead(c: CommentLean, phone: string | null): CrmLeadFields {
  return {
    full_name: (c.authorName ?? "").trim() || "ליד מפייסבוק",
    phone,
    source: "facebook_group_comment",
    stage: "new",
    message: c.commentText,
    score: Math.min(100, Math.max(0, Math.round(c.leadIntentScore))),
    property_id: c.propertyId,
    intent: "buyer",
  };
}

const ASKS_PHONE = /טלפון|נייד|בפרטי|צור קשר|מספר/;
const DEFAULT_PHONE_REPLY = "אשמח לעזור! אפשר להשאיר טלפון בהודעה פרטית ואחזור אליך עם כל הפרטים 🙂";

/**
 * The approved reply that asks the commenter for a phone. Prefers the
 * classifier's safe suggested reply when it already requests a phone; otherwise
 * a safe default. This is a DRAFT for assisted/manual posting — never auto-sent,
 * never bypasses Facebook.
 */
export function approvedPhoneReply(c: Pick<CommentLean, "suggestedReply" | "category">): string {
  const sr = (c.suggestedReply ?? "").trim();
  if (sr && ASKS_PHONE.test(sr)) return sr;
  return DEFAULT_PHONE_REPLY;
}

// ── Pure self-check (offline) ────────────────────────────────────────────────
export interface BCheck { name: string; pass: boolean; detail: string }
export interface BSelfCheck { ok: boolean; total: number; passed: number; checks: BCheck[] }
export function runSelfCheck(): BSelfCheck {
  const checks: BCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  add("pickPhone finds 05x in a later message", pickPhone(["מעוניין בפרטים", "0501234567 תודה"]) === "0501234567");
  add("pickPhone normalizes +972", pickPhone(["צרו קשר +972 50 123 4567"]) === "0501234567");
  add("pickPhone null when no phone", pickPhone(["כמה זה עולה?", null]) === null);

  const lead = mapCommentToLead({ authorName: "יוסי", commentText: "מעוניין", leadIntentScore: 80, category: "interested", suggestedReply: null, propertyId: "p1" }, "0501234567");
  add("mapCommentToLead fields", lead.full_name === "יוסי" && lead.phone === "0501234567" && lead.source === "facebook_group_comment" && lead.stage === "new" && lead.property_id === "p1" && lead.score === 80);
  add("mapCommentToLead default name", mapCommentToLead({ authorName: null, commentText: null, leadIntentScore: 50, category: null, suggestedReply: null, propertyId: null }, null).full_name === "ליד מפייסבוק");

  add("approvedPhoneReply keeps phone-asking suggested reply", approvedPhoneReply({ suggestedReply: "אשמח לחזור אליך — אפשר להשאיר טלפון בפרטי?", category: "interested" }).includes("טלפון"));
  add("approvedPhoneReply falls back to a phone-asking default", approvedPhoneReply({ suggestedReply: "תודה!", category: "interested" }) === DEFAULT_PHONE_REPLY && /טלפון/.test(DEFAULT_PHONE_REPLY));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
