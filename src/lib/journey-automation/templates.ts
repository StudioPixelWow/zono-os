// ============================================================================
// ZONO — Production-ready default journeys (pure). Each is a graph that the
// orchestrator runs by consuming the deterministic engines. AI actions are
// optional (content only); side-effect actions create tasks/reminders/alerts.
// ============================================================================
import type { JourneyType, TriggerType, WorkflowGraph } from "./types";
import { GraphBuilder, autoLayout } from "./workflows";

export interface JourneyTemplate {
  key: string;
  name: string;
  description: string;
  journeyType: JourneyType;
  triggerType: TriggerType;
  graph: WorkflowGraph;
}

// 1) NEW PRIVATE PROPERTY → opportunity → task → AI call → wait 2h → if not contacted → reminder → wait 24h → escalate
function newPrivateProperty(): WorkflowGraph {
  const b = new GraphBuilder();
  const t = b.add({ kind: "trigger", triggerType: "property_created", title: "נכס פרטי חדש" });
  const cond = b.add({ kind: "condition", title: "נכס פרטי?", conditions: [{ field: "is_private", operator: "eq", value: true }] });
  const opp = b.add({ kind: "action", actionType: "create_alert", title: "צור הזדמנות מוכר", config: { badge: "opportunity" } });
  const task = b.add({ kind: "action", actionType: "create_task", title: "פנייה למוכר" });
  const brief = b.add({ kind: "action", actionType: "generate_ai_brief", title: "הכן שיחה (AI)" });
  const wait1 = b.add({ kind: "delay", delayMinutes: 120, title: "המתן שעתיים" });
  const cond2 = b.add({ kind: "condition", title: "לא נוצר קשר?", conditions: [{ field: "task_status", operator: "neq", value: "completed" }] });
  const rem = b.add({ kind: "action", actionType: "create_reminder", title: "תזכורת" });
  const wait2 = b.add({ kind: "delay", delayMinutes: 1440, title: "המתן 24 שעות" });
  const esc = b.add({ kind: "action", actionType: "notify_manager", title: "הסלמה למנהל" });
  const end = b.add({ kind: "end", title: "סיום" });
  b.link(t, cond); b.link(cond, opp, "true"); b.link(cond, end, "false");
  b.chain([opp, task, brief, wait1, cond2]);
  b.link(cond2, rem, "true"); b.link(cond2, end, "false");
  b.chain([rem, wait2, esc, end]);
  return autoLayout(b.build());
}

// 2) PRICE DROP → recalc buyers → notify agent → WhatsApp → follow-up
function priceDrop(): WorkflowGraph {
  const b = new GraphBuilder();
  const t = b.add({ kind: "trigger", triggerType: "price_drop", title: "ירידת מחיר" });
  const recalc = b.add({ kind: "action", actionType: "update_journey", title: "חשב מחדש קונים" });
  const notify = b.add({ kind: "action", actionType: "notify_manager", title: "עדכן סוכן מטפל" });
  const wa = b.add({ kind: "action", actionType: "generate_whatsapp", title: "הפק וואטסאפ" });
  const fu = b.add({ kind: "action", actionType: "create_task", title: "מעקב" });
  const end = b.add({ kind: "end", title: "סיום" });
  b.chain([t, recalc, notify, wa, fu, end]);
  return autoLayout(b.build());
}

// 3) BACK ON MARKET → mark urgent → task → seller brief
function backOnMarket(): WorkflowGraph {
  const b = new GraphBuilder();
  const t = b.add({ kind: "trigger", triggerType: "back_on_market", title: "חזר לשוק" });
  const urgent = b.add({ kind: "action", actionType: "create_alert", title: "סמן דחוף", config: { badge: "urgent" } });
  const task = b.add({ kind: "action", actionType: "create_task", title: "צור משימה" });
  const brief = b.add({ kind: "action", actionType: "generate_ai_brief", title: "תדריך מוכר" });
  const end = b.add({ kind: "end", title: "סיום" });
  b.chain([t, urgent, task, brief, end]);
  return autoLayout(b.build());
}

// 4) BUYER PERFECT MATCH → task → buyer brief → WhatsApp → wait → meeting reminder
function buyerPerfectMatch(): WorkflowGraph {
  const b = new GraphBuilder();
  const t = b.add({ kind: "trigger", triggerType: "buyer_match", title: "התאמה מושלמת" });
  const cond = b.add({ kind: "condition", title: "התאמה גבוהה?", conditions: [{ field: "opportunity_score", operator: "gte", value: 85 }] });
  const task = b.add({ kind: "action", actionType: "create_task", title: "צור משימה" });
  const brief = b.add({ kind: "action", actionType: "generate_ai_brief", title: "תדריך קונה" });
  const wa = b.add({ kind: "action", actionType: "generate_whatsapp", title: "הפק וואטסאפ" });
  const wait = b.add({ kind: "delay", delayMinutes: 1440, title: "המתן 24 שעות" });
  const rem = b.add({ kind: "action", actionType: "create_reminder", title: "תזכורת פגישה" });
  const end = b.add({ kind: "end", title: "סיום" });
  b.link(t, cond); b.link(cond, task, "true"); b.link(cond, end, "false");
  b.chain([task, brief, wa, wait, rem, end]);
  return autoLayout(b.build());
}

// 5) EXCLUSIVE SIGNED → congrats → marketing checklist → photo reminder → publish checklist → buyer campaign
function exclusiveSigned(): WorkflowGraph {
  const b = new GraphBuilder();
  const t = b.add({ kind: "trigger", triggerType: "exclusive_signed", title: "בלעדיות נחתמה" });
  const congrats = b.add({ kind: "action", actionType: "notify_manager", title: "ברכות 🎉" });
  const split = b.add({ kind: "split", title: "במקביל" });
  const mkt = b.add({ kind: "action", actionType: "create_task", title: "צ׳קליסט שיווק" });
  const photo = b.add({ kind: "action", actionType: "create_reminder", title: "תזכורת צילום" });
  const pub = b.add({ kind: "action", actionType: "create_task", title: "צ׳קליסט פרסום" });
  const campaign = b.add({ kind: "action", actionType: "update_journey", title: "קמפיין קונים" });
  const merge = b.add({ kind: "merge", title: "מיזוג" });
  const end = b.add({ kind: "end", title: "סיום" });
  b.chain([t, congrats, split]);
  b.link(split, mkt); b.link(split, photo); b.link(split, pub); b.link(split, campaign);
  b.link(mkt, merge); b.link(photo, merge); b.link(pub, merge); b.link(campaign, merge);
  b.link(merge, end);
  return autoLayout(b.build());
}

export const DEFAULT_JOURNEYS: JourneyTemplate[] = [
  { key: "new_private_property", name: "נכס פרטי חדש", description: "פתיחת הזדמנות, פנייה, תזכורת והסלמה לפי SLA.", journeyType: "property", triggerType: "property_created", graph: newPrivateProperty() },
  { key: "price_drop", name: "ירידת מחיר", description: "חישוב קונים מחדש, עדכון סוכן, וואטסאפ ומעקב.", journeyType: "property", triggerType: "price_drop", graph: priceDrop() },
  { key: "back_on_market", name: "חזר לשוק", description: "סימון דחיפות, משימה ותדריך מוכר.", journeyType: "property", triggerType: "back_on_market", graph: backOnMarket() },
  { key: "buyer_perfect_match", name: "התאמת קונה מושלמת", description: "משימה, תדריך, וואטסאפ ותזכורת פגישה.", journeyType: "buyer", triggerType: "buyer_match", graph: buyerPerfectMatch() },
  { key: "exclusive_signed", name: "בלעדיות נחתמה", description: "ברכות, צ׳קליסט שיווק/פרסום, צילום וקמפיין — במקביל.", journeyType: "seller", triggerType: "exclusive_signed", graph: exclusiveSigned() },
];

export const templateByKey = (key: string): JourneyTemplate | null => DEFAULT_JOURNEYS.find((t) => t.key === key) ?? null;
