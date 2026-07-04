// ============================================================================
// 🎁 ZONO — Autonomous Office™ · Approval Bundle builder (pure). PHASE 44.0.
// Composes a recommended action bundle per event from EXISTING engines. Pure &
// deterministic. Dedups actions whose artifact already exists. Nothing here
// executes — the service routes APPROVED actions to existing approval-gated
// creators. NO auto-send, NO auto-publish, NO auto-book.
// ============================================================================
import type {
  ApprovalBundle, BundleAction, BundleEventType, BundleEntityType, BundleSignals,
  ActionType, TargetSystem,
} from "./types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

interface EventCfg {
  title: string; base: number; opp?: number; risk?: number;
  mission?: string; workflow?: string; whatsapp?: string; email?: string;
  booking?: string; facebook?: string; marketing?: string; landing?: string;
}

const EVENT_CONFIG: Record<BundleEventType, EventCfg> = {
  new_lead: { title: "ליד חדש", base: 70, opp: 70, mission: "LEAD_FOLLOWUP", workflow: "lead_qualification", whatsapp: "היי, קיבלתי את פנייתך — אשמח לעזור. מתי נוח לדבר?", booking: "office_meeting" },
  new_buyer: { title: "קונה חדש", base: 68, opp: 72, mission: "BUYER_OPPORTUNITY", workflow: "buyer_closing", whatsapp: "ברוך/ה הבא/ה! אשמח להבין מה אתם מחפשים ולשלוח נכסים מתאימים.", booking: "buyer_visit", landing: "עמוד נכסים מותאם לקונה" },
  new_seller: { title: "מוכר חדש", base: 70, opp: 74, mission: "SELLER_OPPORTUNITY", workflow: "seller_recovery", whatsapp: "תודה שבחרתם בנו — נתחיל בהערכת שווי ותכנית שיווק.", booking: "valuation", marketing: "תכנית שיווק לנכס" },
  new_property: { title: "נכס חדש", base: 66, opp: 70, mission: "PROPERTY_FOLLOWUP", workflow: "listing_refresh", marketing: "קמפיין השקה", facebook: "פוסט השקה לקבוצות", landing: "עמוד נחיתה לנכס", booking: "property_visit" },
  external_listing: { title: "נכס חיצוני לגיוס", base: 64, opp: 75, mission: "SELLER_OPPORTUNITY", whatsapp: "עלה נכס חדש באזור שכדאי לנסות לגייס לבלעדיות." },
  facebook_comment: { title: "תגובת פייסבוק מתעניינת", base: 62, opp: 65, mission: "LEAD_FOLLOWUP", workflow: "lead_qualification", whatsapp: "בשמחה! שלח/י טלפון בפרטי או כאן ואחזור אליך עם הפרטים." },
  whatsapp_hot: { title: "שיחת WhatsApp חמה", base: 75, opp: 70, mission: "LEAD_FOLLOWUP", whatsapp: "ראיתי את ההודעה שלך — מתי נוח לדבר?", booking: "office_meeting" },
  seller_at_risk: { title: "מוכר בסיכון", base: 80, risk: 80, mission: "SELLER_OPPORTUNITY", workflow: "seller_recovery", whatsapp: "רציתי לעדכן על הפעילות השיווקית ולתאם ציפיות — מתי נוח?" },
  buyer_ready: { title: "קונה בשל לסגירה", base: 82, opp: 85, mission: "BUYER_OPPORTUNITY", workflow: "buyer_closing", booking: "buyer_visit", email: "ריכזתי נכסים מתאימים עבורך — נשמח לתאם צפייה." },
  listing_stale: { title: "נכס תקוע", base: 70, risk: 60, mission: "PROPERTY_FOLLOWUP", workflow: "listing_refresh", marketing: "רענון קמפיין הנכס" },
  price_opportunity: { title: "הזדמנות תמחור", base: 68, opp: 70, mission: "VALUATION_REVIEW", workflow: "price_review" },
  territory_opportunity: { title: "הזדמנות טריטוריה", base: 60, opp: 72, mission: "EXPAND_TERRITORY", marketing: "פעילות גיוס באזור" },
  meeting_completed: { title: "פגישה הושלמה", base: 58, opp: 60, mission: "LEAD_FOLLOWUP", whatsapp: "תודה על הפגישה! מסכם ומתקדם לשלב הבא.", booking: "office_meeting" },
  workflow_completed: { title: "תהליך הושלם", base: 50, opp: 55, mission: "GENERAL" },
  campaign_underperforming: { title: "קמפיין בתת-ביצוע", base: 64, risk: 55, mission: "MARKETING_CAMPAIGN", marketing: "רענון / שינוי קמפיין" },
};

const ACTION_LABEL: Record<ActionType, string> = {
  mission: "משימה מומלצת", workflow: "תהליך מומלץ", whatsapp_draft: "טיוטת WhatsApp", email_draft: "טיוטת אימייל",
  calendar_booking: "הצעת קביעת פגישה", facebook_action: "פעולת פייסבוק", marketing_action: "פעולת שיווק",
  landing_suggestion: "הצעת עמוד נחיתה", notification: "התראה לברוקר",
};

function act(type: ActionType, targetSystem: TargetSystem, canExecute: boolean, reason: string, payload: Record<string, unknown>, evidence: string[], exists = false): BundleAction {
  return { type, label: ACTION_LABEL[type], targetSystem, requiresApproval: true, canExecute, reason, evidence, payload, status: exists ? "exists" : "proposed" };
}

export function buildBundle(input: { eventType: BundleEventType; entityType: BundleEntityType; entityId: string; orgId: string | null; signals?: BundleSignals }): ApprovalBundle {
  const cfg = EVENT_CONFIG[input.eventType];
  const sig = input.signals ?? {};
  const name = sig.name ?? null;
  const existMissions = new Set(sig.existingMissionTypes ?? []);
  const existWf = new Set(sig.existingWorkflowTemplates ?? []);

  const evidence: string[] = [];
  if (sig.detail) evidence.push(sig.detail);
  if (sig.journeyStage) evidence.push(`שלב: ${sig.journeyStage}`);
  if (sig.heat != null) evidence.push(`חום לקוח ${Math.round(sig.heat)}`);
  if (sig.risk != null) evidence.push(`סיכון ${Math.round(sig.risk)}`);
  if (sig.score != null) evidence.push(`ציון ${Math.round(sig.score)}`);
  if (evidence.length === 0) evidence.push(`אירוע: ${cfg.title}`);

  const actions: BundleAction[] = [];
  if (cfg.mission) actions.push(act("mission", "mission-engine", true, `אירוע ${cfg.title} — משימת מעקב מומלצת`, { missionType: cfg.mission }, evidence, existMissions.has(cfg.mission)));
  if (cfg.workflow) actions.push(act("workflow", "workflow-builder", true, "הפעלת תהליך מובנה (מניעת כפילות מובנית)", { workflowTemplate: cfg.workflow }, evidence, existWf.has(cfg.workflow)));
  if (cfg.whatsapp) actions.push(act("whatsapp_draft", "whatsapp", true, "טיוטת פנייה — נשמרת לאישור, לא נשלחת אוטומטית", { body: cfg.whatsapp, kind: "bundle" }, evidence));
  if (cfg.email) actions.push(act("email_draft", "draft-studio", true, "טיוטת אימייל — לאישור בלבד", { body: cfg.email, kind: "email_summary" }, evidence));
  if (cfg.booking) actions.push(act("calendar_booking", "calendar-os", false, "הצעת מועדים — קביעה מתבצעת ידנית, לא נקבע אוטומטית", { bookingKind: cfg.booking }, evidence));
  if (cfg.facebook) actions.push(act("facebook_action", "facebook", false, "הצעת פרסום — טיוטה בלבד, לא מתפרסם אוטומטית", { label: cfg.facebook }, evidence));
  if (cfg.marketing) actions.push(act("marketing_action", "marketing-core", false, "הצעת שיווק — אינה מופעלת אוטומטית", { label: cfg.marketing }, evidence));
  if (cfg.landing) actions.push(act("landing_suggestion", "website-builder", false, "הצעת עמוד — נפתח ידנית בבונה", { label: cfg.landing }, evidence));
  actions.push(act("notification", "notifications", true, "התראה לברוקר על הבאנדל", { title: `${cfg.title}${name ? ` · ${name}` : ""}` }, evidence));

  const heat = sig.heat ?? 0; const risk = sig.risk ?? cfg.risk ?? 20; const opp = sig.opportunity ?? cfg.opp ?? Math.max(heat, 60);
  const priority = clamp(cfg.base + (heat ? (heat - 50) * 0.2 : 0) + (risk >= 70 ? 10 : 0));
  const confidence = clamp(60 + evidence.length * 4);

  return {
    bundleId: `${input.eventType}:${input.entityType}:${input.entityId}`, orgId: input.orgId,
    eventType: input.eventType, entityType: input.entityType, entityId: input.entityId,
    title: `${cfg.title}${name ? ` · ${name}` : ""}`,
    summary: `ZONO הכינה ${actions.length} פעולות מומלצות לאירוע "${cfg.title}". שום דבר לא בוצע — הכול ממתין לאישור.`,
    priority, confidence, risk: clamp(risk), opportunity: clamp(opp), actions, evidence, status: "pending",
  };
}

// ── Pure approval/reject state transitions (service performs the real work) ──
export function applyApproval(bundle: ApprovalBundle, which: ActionType | "all"): ApprovalBundle {
  const actions = bundle.actions.map((a) => (a.status !== "exists" && (which === "all" || a.type === which) ? { ...a, status: "approved" as const } : a));
  const executable = actions.filter((a) => a.status !== "exists");
  const approved = executable.filter((a) => a.status === "approved").length;
  const status = approved === 0 ? "pending" : approved === executable.length ? "approved" : "partially_approved";
  return { ...bundle, actions, status };
}
export function applyReject(bundle: ApprovalBundle): ApprovalBundle {
  return { ...bundle, status: "rejected", actions: bundle.actions.map((a) => (a.status === "exists" ? a : { ...a, status: "rejected" as const })) };
}

// ── Ask ZONO explanations (pure) ─────────────────────────────────────────────
export function explainWhy(bundle: ApprovalBundle): string {
  return `המערכת מציעה זאת בעקבות האירוע "${bundle.title}". ${bundle.evidence.join(" · ")}. עדיפות ${bundle.priority}, ביטחון ${bundle.confidence}%.`;
}
export function explainWhatIfApprove(bundle: ApprovalBundle): string {
  const exec = bundle.actions.filter((a) => a.canExecute && a.status !== "exists").map((a) => a.label);
  const prop = bundle.actions.filter((a) => !a.canExecute).map((a) => a.label);
  const parts: string[] = [];
  if (exec.length) parts.push(`ייווצרו כטיוטות/משימות לאישור: ${exec.join(", ")}`);
  if (prop.length) parts.push(`ייפתחו כהצעות ידניות: ${prop.join(", ")}`);
  return `${parts.join(". ")}. שום הודעה לא תישלח, שום קמפיין לא יתפרסם ושום פגישה לא תיקבע אוטומטית.`;
}
export function mostUrgent(bundles: ApprovalBundle[]): ApprovalBundle | null {
  return [...bundles].filter((b) => b.status !== "rejected" && b.status !== "approved").sort((a, b) => b.priority - a.priority)[0] ?? null;
}

// ── Self-check ───────────────────────────────────────────────────────────────
export interface ABCheck { name: string; pass: boolean }
export interface ABSelfCheck { ok: boolean; total: number; passed: number; checks: ABCheck[] }
export function runSelfCheck(): ABSelfCheck {
  const checks: ABCheck[] = []; const add = (n: string, p: boolean) => checks.push({ name: n, pass: p });
  const mk = (ev: BundleEventType, et: BundleEntityType, sig?: BundleSignals) => buildBundle({ eventType: ev, entityType: et, entityId: "x1", orgId: "o1", signals: sig });

  const lead = mk("new_lead", "lead");
  add("new lead: mission+workflow+whatsapp+booking+notification", ["mission", "workflow", "whatsapp_draft", "calendar_booking", "notification"].every((t) => lead.actions.some((a) => a.type === t)));
  add("new lead: every action requiresApproval", lead.actions.every((a) => a.requiresApproval));

  const prop = mk("new_property", "property");
  add("new property: marketing+facebook+landing present", ["marketing_action", "facebook_action", "landing_suggestion"].every((t) => prop.actions.some((a) => a.type === t)));

  const ext = mk("external_listing", "property");
  add("external listing: mission + acquisition whatsapp", ext.actions.some((a) => a.type === "mission") && ext.actions.some((a) => a.type === "whatsapp_draft"));

  const fb = mk("facebook_comment", "lead");
  add("facebook comment: phone-request whatsapp draft", fb.actions.some((a) => a.type === "whatsapp_draft" && String(a.payload.body).includes("טלפון")));

  const risk = mk("seller_at_risk", "seller", { risk: 85, name: "דנה" });
  add("seller risk: high priority + seller_recovery workflow", risk.priority >= 80 && risk.actions.some((a) => a.type === "workflow" && a.payload.workflowTemplate === "seller_recovery") && risk.risk >= 80);

  const ready = mk("buyer_ready", "buyer", { heat: 90 });
  add("buyer ready: email + booking + high priority", ready.actions.some((a) => a.type === "email_draft") && ready.actions.some((a) => a.type === "calendar_booking") && ready.priority >= 80);

  const meet = mk("meeting_completed", "lead");
  add("meeting completed: whatsapp summary + booking", meet.actions.some((a) => a.type === "whatsapp_draft") && meet.actions.some((a) => a.type === "calendar_booking"));

  // Dedup — existing mission/workflow → marked "exists" (skipped on approve)
  const dedup = mk("new_lead", "lead", { existingMissionTypes: ["LEAD_FOLLOWUP"], existingWorkflowTemplates: ["lead_qualification"] });
  add("dedup: existing mission+workflow marked exists", dedup.actions.find((a) => a.type === "mission")?.status === "exists" && dedup.actions.find((a) => a.type === "workflow")?.status === "exists");

  // Approve single
  const single = applyApproval(lead, "mission");
  add("approve single: mission approved, rest proposed, partial status", single.actions.find((a) => a.type === "mission")?.status === "approved" && single.status === "partially_approved");
  // Approve full (dedup exists stays exists)
  const full = applyApproval(dedup, "all");
  add("approve full: non-exists approved, exists untouched", full.status === "approved" && full.actions.find((a) => a.type === "mission")?.status === "exists" && full.actions.find((a) => a.type === "whatsapp_draft")?.status === "approved");
  // Reject
  const rej = applyReject(lead);
  add("reject: bundle rejected", rej.status === "rejected" && rej.actions.filter((a) => a.status === "rejected").length > 0);

  // No auto-send / publish / book — booking/fb/marketing are non-executable proposals; nothing has a sent/published/booked status
  const allActions = [lead, prop, ready, risk].flatMap((b) => b.actions);
  add("no auto-send/publish/book: booking+fb+marketing are proposals (canExecute false)", allActions.filter((a) => ["calendar_booking", "facebook_action", "marketing_action", "landing_suggestion"].includes(a.type)).every((a) => a.canExecute === false && a.requiresApproval));

  // Ask explanations
  add("ask: why + whatIf + mostUrgent non-empty", explainWhy(lead).length > 10 && /לא תישלח/.test(explainWhatIfApprove(lead)) && mostUrgent([lead, risk])?.eventType === "seller_at_risk");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
