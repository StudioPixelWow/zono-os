// ============================================================================
// 🤖 ZONO — Copilot TIMELINE INTELLIGENCE (pure). Phase 3.
// ----------------------------------------------------------------------------
// Detects conversation milestones from the deterministic analysis + per-message
// cues, and builds a UI-ready visualization model. Each milestone carries a
// timestamp, confidence, and full explainability (evidence message ids +
// deterministic signals). One milestone per kind (duplicate-prevented); output
// is chronological. No UI here — only the model.
// ============================================================================
import { buildExplain } from "./explain";
import type { MilestoneArtifact, MilestoneKind, TimelineModel, TimelineMilestoneView } from "./types";
import type { ConversationAnalysis } from "./analyze";
import type { CommIntent } from "@/lib/comm-intelligence/engine";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

// Per-message keyword cues (deterministic). Intent-driven kinds reuse analysis.
const CUES: Partial<Record<MilestoneKind, { re: RegExp; dir?: "inbound" | "outbound"; conf: number }>> = {
  property_shared: { re: /(שולח נכס|הנה הנכס|קישור לנכס|מצרף דירה|הנה דירה|שלחתי לך נכס)/, dir: "outbound", conf: 80 },
  viewing_completed: { re: /(היינו בביקור|אחרי הצפייה|ראינו את|סיימנו את הסיור)/, conf: 78 },
  offer_submitted: { re: /(מגיש הצעה|הצעת מחיר|אני מציע|ההצעה שלי)/, conf: 82 },
  counter_offer: { re: /(הצעה נגדית|נגדית)/, conf: 84 },
  documents_requested: { re: /(צריך מסמכים|שלח מסמכים|נדרשים מסמכים|נא לשלוח מסמכים)/, dir: "outbound", conf: 80 },
  documents_sent: { re: /(שלחתי מסמכים|מצורף|שולח את החוזה|החוזה מצורף|שולח מסמכים)/, conf: 80 },
  financing_approved: { re: /(אושרה המשכנתא|אישור עקרוני|אושר מימון|המשכנתא אושרה)/, conf: 85 },
  reservation: { re: /(שריון|רזרבציה|שמרתי לך|שריינתי)/, conf: 82 },
  contract_signed: { re: /(חתמנו|חוזה נחתם|החוזה חתום|נחתם החוזה)/, conf: 88 },
  closed: { re: /(העסקה נסגרה|סגרנו|מזל טוב על|העסקה הושלמה)/, conf: 88 },
};

const INTENT_KIND: Partial<Record<MilestoneKind, CommIntent>> = {
  active_buyer: "buy", active_seller: "sell", viewing_scheduled: "viewing",
  negotiation_started: "negotiation", financing_started: "financing", lost_lead: "disengaging",
};

const ENTITY_QUALIFY = new Set(["city", "budget", "rooms"]);

export function detectMilestones(a: ConversationAnalysis): MilestoneArtifact[] {
  const found = new Map<MilestoneKind, MilestoneArtifact>();
  const put = (kind: MilestoneKind, occurredAt: string, confidence: number, reason: string, ev: string[], signals: string[]) => {
    if (found.has(kind)) return;                       // one per kind (duplicate-prevented)
    found.set(kind, { kind, occurredAt, explain: buildExplain({ confidence: clamp(confidence), reasoning: [reason], evidence: [reason], evidenceMessageIds: ev, deterministicSignals: signals, llmContribution: null }) });
  };

  // first_contact — the earliest message.
  if (a.transcript.length) { const m = a.transcript[0]; put("first_contact", m.sentAt, 95, "פנייה ראשונית בשיחה", [m.messageRef], ["event:first_message"]); }

  // qualification — first message carrying budget/rooms/city criteria.
  const qMsg = a.transcript.find((m) => Object.entries(a.entityEvidence).some(([k, refs]) => ENTITY_QUALIFY.has(k.split(":")[0]) && refs.includes(m.messageRef)));
  if (qMsg) put("qualification", qMsg.sentAt, 80, "הלקוח מסר קריטריונים (תקציב/חדרים/אזור)", [qMsg.messageRef], ["entity:qualification"]);

  // Intent-driven milestones.
  for (const [kind, intent] of Object.entries(INTENT_KIND) as [MilestoneKind, CommIntent][]) {
    const ref = (a.intentEvidence[intent] ?? [])[0];
    if (!ref) continue;
    const msg = a.transcript.find((m) => m.messageRef === ref);
    if (msg) put(kind, msg.sentAt, a.intents.find((i) => i.intent === intent)?.score ?? 70, `זוהתה כוונה: ${intent}`, [ref], [`intent:${intent}`]);
  }

  // Keyword-cue milestones (chronological — first match wins per kind).
  for (const m of a.transcript) {
    for (const [kind, cue] of Object.entries(CUES) as [MilestoneKind, NonNullable<(typeof CUES)[MilestoneKind]>][]) {
      if (cue.dir && m.direction !== cue.dir) continue;
      if (cue.re.test(m.text)) put(kind, m.sentAt, cue.conf, `זוהה אירוע: ${kind}`, [m.messageRef], [`keyword:${kind}`]);
    }
  }

  // reactivated — an inbound message after a >14-day gap from the previous one.
  for (let i = 1; i < a.transcript.length; i++) {
    const gapDays = (Date.parse(a.transcript[i].sentAt) - Date.parse(a.transcript[i - 1].sentAt)) / 86_400_000;
    if (gapDays > 14 && a.transcript[i].direction === "inbound") { put("reactivated", a.transcript[i].sentAt, 75, `חידוש קשר לאחר ${Math.floor(gapDays)} ימים`, [a.transcript[i].messageRef], ["event:reactivated"]); break; }
  }

  return [...found.values()].sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));
}

// ── Visualization model (no UI — model only) ────────────────────────────────
interface Meta { label: string; icon: string; color: string; severity: TimelineMilestoneView["severity"] }
const META: Record<MilestoneKind, Meta> = {
  first_contact: { label: "יצירת קשר", icon: "wave", color: "blue", severity: "info" },
  qualification: { label: "אפיון", icon: "target", color: "blue", severity: "info" },
  active_buyer: { label: "קונה פעיל", icon: "home", color: "green", severity: "success" },
  active_seller: { label: "מוכר פעיל", icon: "key", color: "green", severity: "success" },
  property_shared: { label: "נכס נשלח", icon: "send", color: "blue", severity: "info" },
  viewing_scheduled: { label: "צפייה תואמה", icon: "calendar", color: "amber", severity: "info" },
  viewing_completed: { label: "צפייה בוצעה", icon: "check", color: "green", severity: "success" },
  negotiation_started: { label: "משא ומתן", icon: "handshake", color: "amber", severity: "warning" },
  offer_submitted: { label: "הצעה הוגשה", icon: "cash", color: "amber", severity: "warning" },
  counter_offer: { label: "הצעה נגדית", icon: "swap", color: "amber", severity: "warning" },
  documents_requested: { label: "מסמכים נדרשו", icon: "doc", color: "blue", severity: "info" },
  documents_sent: { label: "מסמכים נשלחו", icon: "paperclip", color: "blue", severity: "info" },
  financing_started: { label: "מימון החל", icon: "bank", color: "blue", severity: "info" },
  financing_approved: { label: "מימון אושר", icon: "check", color: "green", severity: "success" },
  reservation: { label: "שריון", icon: "bookmark", color: "green", severity: "success" },
  contract_signed: { label: "חוזה נחתם", icon: "signature", color: "green", severity: "success" },
  closed: { label: "נסגר", icon: "party", color: "green", severity: "success" },
  lost_lead: { label: "ליד אבוד", icon: "alert", color: "red", severity: "critical" },
  reactivated: { label: "חודש", icon: "refresh", color: "blue", severity: "info" },
};

export function buildTimelineModel(milestones: MilestoneArtifact[]): TimelineModel {
  const ordered = [...milestones].sort((x, y) => x.occurredAt.localeCompare(y.occurredAt));
  return {
    milestones: ordered.map((m, i) => {
      const meta = META[m.kind];
      return { kind: m.kind, label: meta.label, icon: meta.icon, color: meta.color, severity: meta.severity, completed: true, order: i, occurredAt: m.occurredAt, explain: m.explain };
    }),
    count: ordered.length,
  };
}
