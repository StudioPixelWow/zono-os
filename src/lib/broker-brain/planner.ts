// ============================================================================
// 🧠 ZONO — AI Broker Brain — plan assembler (pure & deterministic). PHASE 50.0.
// Consumes a NORMALIZED context (built by the service from existing engines) and
// composes an evidence-backed plan for the broker's goal: priorities, approval-
// gated actions (with bundle requests the service resolves), calendar proposals,
// territory targets, success metrics and a progress model. It NEVER recomputes
// engine metrics and NEVER marks anything auto-executable.
// ============================================================================
import {
  APPROVAL_ONLY_NOTE, BROKER_BRAIN_VERSION,
  type BrokerBrainContext, type BrokerPlan, type ClassifiedGoal, type CtxAcquisition,
  type CtxEntity, type CtxRec, type PlanActionKind, type PlanActionSlot,
  type PlanEntityRef, type PlanPriority, type ProgressModel, type SuccessMetric, type CalendarProposalLite,
} from "./types";

const HE_INTENT: Record<string, string> = {
  exclusive_listings: "השגת בלעדיות", free_time: "ניצול זמן פנוי", close_deal: "סגירת עסקה",
  territory_domination: "שליטה באזור", seller_risk: "שימור מוכרים בסיכון", hot_buyer: "דחיפת קונים חמים",
  stale_listing: "החייאת נכסים תקועים", general: "סדר יום אסטרטגי",
};

const targetOf = (k: PlanActionKind): string => ({
  whatsapp_draft: "whatsapp", calendar_booking: "calendar-os", facebook_assist: "facebook",
  mission: "mission-engine", territory: "territory-os", landing: "website-builder",
  marketing: "marketing-core", review: "—",
}[k]);

function entityRef(e: CtxEntity): PlanEntityRef { return { kind: e.kind, id: e.id, name: e.name, href: e.href }; }

function bundleRequestFor(e: CtxEntity): { eventType: string; entityType: string; entityId: string } | null {
  switch (e.kind) {
    case "buyer": return { eventType: "buyer_ready", entityType: "buyer", entityId: e.id };
    case "seller": return { eventType: "seller_at_risk", entityType: "seller", entityId: e.id };
    case "property": return { eventType: "listing_stale", entityType: "property", entityId: e.id };
    case "lead": return { eventType: "new_lead", entityType: "lead", entityId: e.id };
    default: return null;
  }
}

function fromRec(r: CtxRec, rank: number): PlanPriority {
  return { rank, title: r.title, why: r.why, evidence: r.evidence.slice(0, 4), confidence: r.confidence, impact: r.impact, entity: null };
}
function fromEntity(e: CtxEntity, rank: number, prefix: string): PlanPriority {
  const ev = [e.riskLabel, e.reason, e.score != null ? `ציון ${e.score}` : null].filter((x): x is string => !!x);
  return {
    rank, title: `${prefix}: ${e.name}`, why: e.reason ?? prefix, evidence: ev.slice(0, 4),
    confidence: e.score ?? 60, impact: (e.score ?? 0) >= 75 ? "high" : (e.score ?? 0) >= 50 ? "medium" : "low",
    entity: entityRef(e),
  };
}

/** Approval-gated action for a scored entity (the service resolves the bundle). */
function entityAction(e: CtxEntity, label: string, kind: PlanActionKind): PlanActionSlot {
  const br = bundleRequestFor(e);
  return {
    id: `act:${e.kind}:${e.id}`, label, kind, targetSystem: targetOf(kind),
    requiresApproval: true, canExecute: !!br, reason: e.reason ?? label,
    evidence: [e.riskLabel, e.score != null ? `ציון ${e.score}` : null].filter((x): x is string => !!x),
    href: e.href, entity: entityRef(e), bundleRequest: br, bundle: null,
  };
}
/** A non-executing suggestion (navigation / assisted flow) — labeled, no auto-run. */
function suggestAction(id: string, label: string, kind: PlanActionKind, href: string | null, reason: string, evidence: string[] = []): PlanActionSlot {
  return {
    id, label, kind, targetSystem: targetOf(kind), requiresApproval: false, canExecute: false,
    reason, evidence, href, entity: null, bundleRequest: null, bundle: null,
  };
}

function dedupePriorities(items: PlanPriority[]): PlanPriority[] {
  const seen = new Set<string>();
  const out: PlanPriority[] = [];
  for (const p of items) {
    const key = p.entity ? `${p.entity.kind}:${p.entity.id}` : p.title;
    if (seen.has(key)) continue;
    seen.add(key); out.push(p);
  }
  return out.map((p, i) => ({ ...p, rank: i + 1 }));
}

function calendarProposals(ctx: BrokerBrainContext, hours: number | null): CalendarProposalLite[] {
  if (!ctx.calendar) return [];
  const out: CalendarProposalLite[] = [];
  if (ctx.calendar.freeAfter) out.push({ title: "חלון זמן פנוי", suggestion: `פנוי מ־${ctx.calendar.freeAfter}`, when: ctx.calendar.freeAfter, note: "הצעה בלבד — לא נקבע כלום ביומן." });
  for (const s of ctx.calendar.slots.slice(0, hours ? Math.max(1, hours) : 3)) {
    out.push({ title: s.title, suggestion: s.reason, when: s.when, note: "דורש אישור לפני קביעה ביומן." });
  }
  return out;
}

function progressFrom(goalKey: string, actions: PlanActionSlot[], intent: string): ProgressModel {
  const steps = actions.slice(0, 6).map((a) => ({ label: a.label, done: false }));
  if (steps.length === 0) steps.push({ label: HE_INTENT[intent] ?? "התחל", done: false });
  return { goalKey, steps, completionPct: 0, note: "ההתקדמות תתעדכן לפי הפעולות שתאשר ותבצע." };
}

/** Compose the full plan for a classified goal against the normalized context. */
export function assembleBrokerPlan(goal: ClassifiedGoal, ctx: BrokerBrainContext): BrokerPlan {
  const priorities: PlanPriority[] = [];
  const actions: PlanActionSlot[] = [];
  const metrics: SuccessMetric[] = [];
  let territoryTargets: CtxAcquisition[] = [];
  const reasons: string[] = [];

  const topHot = ctx.hotBuyers.slice(0, 3);
  const topRisk = ctx.sellersAtRisk.slice(0, 3);
  const topStale = ctx.staleListings.slice(0, 3);

  switch (goal.intent) {
    case "exclusive_listings": {
      territoryTargets = (ctx.territory?.acquisition ?? []).slice(0, 8);
      for (const a of territoryTargets.slice(0, 5)) priorities.push({ rank: 0, title: `יעד בלעדיות: ${a.label}`, why: a.why, evidence: a.evidence.slice(0, 3), confidence: a.score, impact: a.priority, entity: null });
      for (const o of ctx.opportunities.slice(0, 3)) priorities.push(fromRec(o, 0));
      for (const a of territoryTargets.slice(0, 4)) actions.push(suggestAction(`terr:${a.label}`, `פתח יעד רכישה: ${a.label}`, "territory", a.href, a.why, a.evidence.slice(0, 2)));
      if (territoryTargets.length) actions.push(suggestAction("marketing:acq", "בנה קמפיין החתמת בלעדיות", "marketing", "/marketing", "מיקוד קהל מוכרים באזורי היעד"));
      metrics.push({ label: "בלעדיות חדשות", target: `${goal.count ?? Math.max(3, territoryTargets.length)} מנדטים החודש`, basis: `${territoryTargets.length} יעדי רכישה מזוהים` });
      reasons.push("היעדים נגזרים ממודיעין הטריטוריה (נתח שוק, ביקוש, תחרות) — לא מחושבים מחדש כאן.");
      break;
    }
    case "free_time": {
      // Fill the free window with the highest-leverage ready actions.
      for (const e of topHot) priorities.push(fromEntity(e, 0, "קונה חם לקידום"));
      for (const e of topRisk) priorities.push(fromEntity(e, 0, "מוכר בסיכון"));
      for (const p of ctx.priorities.slice(0, 3)) priorities.push(fromRec(p, 0));
      for (const e of topHot) actions.push(entityAction(e, `הכן פנייה לקונה ${e.name}`, "whatsapp_draft"));
      for (const e of topRisk) actions.push(entityAction(e, `טפל במוכר ${e.name}`, "whatsapp_draft"));
      if (ctx.marketing && ctx.marketing.groupsToPublish > 0) actions.push(suggestAction("fb:daily", `פרסם ${ctx.marketing.groupsToPublish} פוסטים בקבוצות פייסבוק`, "facebook_assist", "/facebook", "פרסום מסייע — אתה מפרסם ידנית"));
      metrics.push({ label: "ניצול הזמן", target: goal.hours ? `${goal.hours} שעות → ${Math.max(1, goal.hours) * 2} פעולות ערך` : "מקסום פעולות ערך", basis: `${topHot.length + topRisk.length} ישויות בשלות לפעולה` });
      reasons.push("הפעולות מסודרות לפי מוכנות לסגירה וסיכון — מהמנועים הקיימים.");
      break;
    }
    case "close_deal": {
      for (const e of topHot) priorities.push(fromEntity(e, 0, "קונה קרוב לסגירה"));
      for (const e of topRisk) priorities.push(fromEntity(e, 0, "מוכר לשמר לקראת חתימה"));
      for (const p of ctx.priorities.slice(0, 2)) priorities.push(fromRec(p, 0));
      for (const e of topHot) actions.push(entityAction(e, `דחוף לסגירה: ${e.name}`, "whatsapp_draft"));
      for (const e of topRisk) actions.push(entityAction(e, `שמר מוכר: ${e.name}`, "whatsapp_draft"));
      metrics.push({ label: "עסקאות", target: `${goal.count ?? 1} עסקה ${goal.timeframe === "this_week" ? "השבוע" : ""}`.trim(), basis: `${topHot.length} קונים חמים · ${topRisk.length} מוכרים בסיכון` });
      reasons.push("קונים חמים ומוכרים בסיכון הם המנוף המהיר ביותר לעסקה — מדורגים לפי המנועים.");
      break;
    }
    case "territory_domination": {
      const terr = ctx.territory;
      territoryTargets = (terr?.acquisition ?? []).slice(0, 8);
      if (terr) {
        priorities.push({ rank: 0, title: `ציון שליטה ${terr.city ?? "האזור"}: ${terr.score ?? "—"}`, why: `רמת שליטה: ${terr.band ?? "לא ידוע"}`, evidence: [`ציון ${terr.score ?? "—"}`], confidence: terr.score ?? 50, impact: "high", entity: null });
        for (const r of terr.recommendations.slice(0, 4)) priorities.push(fromRec(r, 0));
      }
      for (const a of territoryTargets.slice(0, 5)) actions.push(suggestAction(`terr:${a.label}`, `פעל ביעד: ${a.label}`, "territory", a.href, a.why, a.evidence.slice(0, 2)));
      if (terr) actions.push(suggestAction("marketing:terr", "בנה קמפיין שליטה אזורי", "marketing", "/marketing", "מיקוד לפי שכונות היעד"));
      metrics.push({ label: "שליטה באזור", target: `העלאת ציון שליטה מ־${terr?.score ?? "—"}`, basis: `${territoryTargets.length} יעדי רכישה · ${terr?.recommendations.length ?? 0} המלצות` });
      reasons.push("הכל נגזר ממודיעין הטריטוריה הקיים — נתח שוק, שכונות והזדמנויות רכישה.");
      break;
    }
    case "seller_risk": {
      for (const e of topRisk) { priorities.push(fromEntity(e, 0, "מוכר בסיכון")); actions.push(entityAction(e, `שמר מוכר: ${e.name}`, "whatsapp_draft")); }
      for (const r of ctx.risks.slice(0, 3)) priorities.push(fromRec(r, 0));
      metrics.push({ label: "שימור מוכרים", target: `טיפול ב־${topRisk.length} מוכרים בסיכון`, basis: "רשימת סיכון מהמנוע" });
      reasons.push("המוכרים בסיכון מזוהים ע״י מנוע המוכרים — כאן רק מסודרת הפעולה.");
      break;
    }
    case "hot_buyer": {
      for (const e of topHot) { priorities.push(fromEntity(e, 0, "קונה חם")); actions.push(entityAction(e, `קדם קונה: ${e.name}`, "whatsapp_draft")); }
      for (const o of ctx.opportunities.slice(0, 3)) priorities.push(fromRec(o, 0));
      metrics.push({ label: "קונים חמים", target: `קידום ${topHot.length} קונים לסגירה`, basis: "רשימת קונים חמים מהמנוע" });
      reasons.push("הקונים החמים מדורגים לפי מוכנות מהמנוע — פעולה בכפוף לאישור.");
      break;
    }
    case "stale_listing": {
      for (const e of topStale) { priorities.push(fromEntity(e, 0, "נכס תקוע")); actions.push(entityAction(e, `החייאת נכס: ${e.name}`, "marketing")); }
      for (const r of ctx.risks.slice(0, 2)) priorities.push(fromRec(r, 0));
      if (ctx.marketing && ctx.marketing.groupsToPublish > 0) actions.push(suggestAction("fb:daily", "רענן חשיפה בקבוצות פייסבוק", "facebook_assist", "/facebook", "פרסום מסייע"));
      metrics.push({ label: "החייאת נכסים", target: `טיפול ב־${topStale.length} נכסים תקועים`, basis: "רשימת נכסים קריטיים מהמנוע" });
      reasons.push("הנכסים התקועים מזוהים ע״י מנוע הליסטינגים — כאן מוצעת פעולת החייאה.");
      break;
    }
    default: {
      for (const p of ctx.priorities.slice(0, 5)) priorities.push(fromRec(p, 0));
      for (const e of topHot) actions.push(entityAction(e, `קדם קונה: ${e.name}`, "whatsapp_draft"));
      for (const e of topRisk) actions.push(entityAction(e, `שמר מוכר: ${e.name}`, "whatsapp_draft"));
      metrics.push({ label: "סדר יום", target: "ביצוע העדיפויות המובילות", basis: `${ctx.priorities.length} עדיפויות מ־Chief of Staff` });
      reasons.push("סדר היום נגזר מ־Chief of Staff ומ־Daily OS — ללא חישוב מחדש.");
    }
  }

  const cleanPriorities = dedupePriorities(priorities).slice(0, 8);
  const calProps = goal.intent === "free_time" || goal.intent === "close_deal" || goal.intent === "general"
    ? calendarProposals(ctx, goal.hours) : calendarProposals(ctx, null).slice(0, 1);

  const hasPlan = cleanPriorities.length > 0 || actions.length > 0 || territoryTargets.length > 0;
  const goalKey = `${goal.intent}:${goal.timeframe}`;
  const confidence = Math.min(95, Math.round((goal.confidence * 0.4) + (cleanPriorities.reduce((s, p) => s + p.confidence, 0) / Math.max(1, cleanPriorities.length)) * 0.6));

  const notes = [APPROVAL_ONLY_NOTE];
  if (!hasPlan) notes.push("אין כרגע נתונים מספיקים לבניית תוכנית ליעד הזה — הוסף לקוחות/נכסים/קהילות כדי לקבל המלצות מבוססות ראיות.");
  if (ctx.orgScore == null) notes.push("ציון הארגון אינו זמין עדיין — ההמלצות מבוססות על הנתונים הקיימים בלבד.");

  return {
    version: BROKER_BRAIN_VERSION,
    goal: goal.matched.length ? goal.matched.join(" · ") : goal.intent,
    intent: goal.intent,
    timeframe: goal.timeframe,
    generatedAt: null,
    headline: hasPlan ? `תוכנית ל${HE_INTENT[goal.intent]}` : `אין עדיין נתונים ל${HE_INTENT[goal.intent]}`,
    summary: hasPlan
      ? `${cleanPriorities.length} עדיפויות · ${actions.length} פעולות מוצעות${territoryTargets.length ? ` · ${territoryTargets.length} יעדי טריטוריה` : ""}. הכול בכפוף לאישור.`
      : "לא נמצאו מספיק אותות לבניית תוכנית מבוססת ראיות.",
    confidence: hasPlan ? confidence : 0,
    priorities: cleanPriorities,
    actions,
    calendarProposals: calProps,
    territoryTargets,
    metrics,
    progress: progressFrom(goalKey, actions, goal.intent),
    reasons,
    hasPlan,
    notes,
  };
}
