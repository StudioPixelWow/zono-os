// ============================================================================
// ZONO — Communication Automation: TEMPLATE REGISTRY (pure, Hebrew-first).
// Deterministic transactional copy for critical messages — no LLM, no invented
// facts. Each template receives STRUCTURED facts and returns { title, body }.
// Voice: short, human, clear, action-oriented — never robotic or alarmist. The
// orchestrator appends the deep link, so bodies never hardcode URLs.
// ============================================================================
import type { CommTemplateId } from "./policy";

export interface TemplateFacts {
  firstName?: string | null;
  leadName?: string | null;
  count?: number | null;
  reason?: string | null;
  ticketNumber?: string | null;
  amount?: string | null;
  when?: string | null;         // pre-formatted Hebrew time/date
  title?: string | null;        // generic subject
  lines?: string[] | null;      // for digests (e.g. morning brief bullets)
}

export interface RenderedMessage { title: string; body: string }

const hi = (n?: string | null) => (n ? `${n}, ` : "");

const RENDERERS: Record<CommTemplateId, (f: TemplateFacts) => RenderedMessage> = {
  NEW_LEAD_URGENT: (f) => ({
    title: "ליד חדש ממתין לחזרה",
    body: `${hi(f.firstName)}${f.leadName ?? "ליד חדש"} ממתין/ה לחזרה${f.reason ? ` — ${f.reason}` : ""}. כדאי לחזור בהקדם.`,
  }),
  FOLLOWUP_ESCALATION: (f) => ({
    title: "פולואפ דורש טיפול",
    body: `${hi(f.firstName)}${f.leadName ?? "ליד"} דורש/ת פעולה${f.reason ? ` — ${f.reason}` : ""}.`,
  }),
  MORNING_BRIEF: (f) => ({
    title: "על הבוקר — ZONO",
    body: [
      `בוקר טוב${f.firstName ? ` ${f.firstName}` : ""},`,
      (f.lines && f.lines.length) ? "הנה מה שכדאי לטפל בו היום:" : "הכול בשליטה להיום ✓",
      ...((f.lines ?? []).map((l) => `• ${l}`)),
    ].join("\n"),
  }),
  MEETING_REMINDER: (f) => ({
    title: "תזכורת לפגישה",
    body: `${hi(f.firstName)}יש לך פגישה${f.when ? ` ב-${f.when}` : ""}${f.leadName ? ` עם ${f.leadName}` : ""}.`,
  }),
  PUBLICATION_ATTENTION: (f) => ({
    title: "פרסום דורש טיפול",
    body: `${hi(f.firstName)}${f.count && f.count > 1 ? `${f.count} פרסומים דורשים` : "פרסום דורש"} את אישורך כדי להתפרסם היום.`,
  }),
  SUPPORT_CREATED: (f) => ({
    title: "נפתחה פנייה לתמיכה",
    body: `פתחנו עבורך פנייה לצוות התמיכה${f.ticketNumber ? ` — מספר ${f.ticketNumber}` : ""}. נחזור אליך בהקדם.`,
  }),
  SUPPORT_UPDATED: (f) => ({
    title: "עדכון בפנייה שלך",
    body: `יש עדכון בפנייה שלך${f.ticketNumber ? ` ${f.ticketNumber}` : ""} מצוות התמיכה.`,
  }),
  PAYMENT_FAILED: (f) => ({
    title: "בעיה בתשלום",
    body: `${hi(f.firstName)}חיוב אחרון${f.amount ? ` על סך ${f.amount}` : ""} לא עבר. יש לעדכן את אמצעי התשלום כדי לשמור על המנוי פעיל.`,
  }),
  BILLING_UPDATE: (f) => ({
    title: f.title ?? "עדכון חשבון",
    body: `${hi(f.firstName)}${f.reason ?? "חל עדכון בחשבון שלך."}`,
  }),
  DEAL_STALE: (f) => ({
    title: "עסקה דורשת טיפול",
    body: `${hi(f.firstName)}${f.title ?? "אחת מהעסקאות הפעילות שלך"} תקועה ללא פעילות. כדאי לקדם אותה לשלב הבא.`,
  }),
  VIEWING_REQUESTED: (f) => ({
    title: "בקשת ביקור חדשה",
    body: `${hi(f.firstName)}${f.leadName ?? "לקוח"} ביקש/ה לתאם ביקור בנכס. כדאי לקבוע מועד.`,
  }),
  VIEWING_CONFIRMED: (f) => ({
    title: "הלקוח אישר הגעה לביקור",
    body: `${hi(f.firstName)}${f.leadName ?? "הלקוח"} אישר/ה הגעה לביקור${f.when ? ` (${f.when})` : ""}.`,
  }),
  VIEWING_FEEDBACK: (f) => ({
    title: "משוב לאחר ביקור",
    body: `${hi(f.firstName)}${f.leadName ?? "הלקוח"} השאיר/ה משוב לאחר הביקור${f.reason ? `: ${f.reason}` : ""}.`,
  }),
  VIEWING_FOLLOWUP: (f) => ({
    title: "ביקור דורש טיפול",
    body: `${hi(f.firstName)}${f.reason ?? "ביקור דורש את הטיפול שלך"}${f.leadName ? ` — ${f.leadName}` : ""}.`,
  }),
  GENERIC: (f) => ({
    title: f.title ?? "עדכון מ-ZONO",
    body: `${hi(f.firstName)}${f.reason ?? ""}`.trim(),
  }),
};

export function renderTemplate(id: CommTemplateId, facts: TemplateFacts): RenderedMessage {
  return (RENDERERS[id] ?? RENDERERS.GENERIC)(facts);
}

/** Append a deep-link call-to-action line (WhatsApp/email friendly). */
export function withDeepLink(msg: RenderedMessage, href: string, appBaseUrl?: string | null): RenderedMessage {
  const url = appBaseUrl ? `${appBaseUrl.replace(/\/$/, "")}${href}` : href;
  return { title: msg.title, body: `${msg.body}\n\nלפתיחה ב-ZONO:\n${url}` };
}
