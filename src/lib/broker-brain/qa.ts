// ============================================================================
// 🧠 ZONO — AI Broker Brain — offline self-check (pure). PHASE 50.0.
// Covers the spec QA matrix: exclusive listings, free-hour, close-deal, territory
// domination, seller risk, hot buyer, stale listing, no-data, conflicting
// recommendations, approval-only actions. Runs with `node`/tsx (no DB).
// ============================================================================
import { classifyGoal } from "./router";
import { assembleBrokerPlan } from "./planner";
import type { BrokerBrainContext, CtxEntity, CtxRec, CtxAcquisition } from "./types";

const ent = (kind: CtxEntity["kind"], id: string, name: string, score = 80): CtxEntity =>
  ({ kind, id, name, score, reason: "מוכן לפעולה", riskLabel: kind === "seller" ? "churn risk" : null, href: `/${kind}/${id}` });
const rec = (id: string, title: string, impact: CtxRec["impact"] = "high"): CtxRec =>
  ({ id, title, why: "מבוסס ראיות", evidence: ["ראיה א", "ראיה ב"], confidence: 78, impact, urgency: 70, source: "chief" });
const acq = (label: string): CtxAcquisition =>
  ({ kind: "street", label, city: "רחובות", score: 82, priority: "high", why: "ביקוש גבוה, תחרות נמוכה", evidence: ["נתח שוק 12%"], href: "/territory", ctaLabel: "פתח" });

function ctx(over: Partial<BrokerBrainContext> = {}): BrokerBrainContext {
  return {
    orgScore: 72, hotBuyers: [], sellersAtRisk: [], staleListings: [], leadFollowUps: [],
    priorities: [rec("p1", "עדיפות מובילה")], risks: [], opportunities: [],
    territory: null, calendar: null, marketing: { scheduledToday: 3, commentsWaiting: 1, leadApprovals: 0, groupsToPublish: 4 },
    ...over,
  };
}
const empty: BrokerBrainContext = {
  orgScore: null, hotBuyers: [], sellersAtRisk: [], staleListings: [], leadFollowUps: [],
  priorities: [], risks: [], opportunities: [], territory: null, calendar: null, marketing: null,
};

export interface Check { name: string; pass: boolean }
export interface SelfCheck { ok: boolean; total: number; passed: number; checks: Check[] }

export function runSelfCheck(): SelfCheck {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });

  // 1. Exclusive listings goal → territory targets + metric.
  const g1 = classifyGoal("הבא לי 10 נכסים בלעדיים החודש ברחובות");
  const p1 = assembleBrokerPlan(g1, ctx({ territory: { city: "רחובות", score: 60, band: "contested", acquisition: [acq("הרצל"), acq("ויצמן")], recommendations: [] }, opportunities: [rec("o1", "הזדמנות")] }));
  add("exclusive: intent classified", g1.intent === "exclusive_listings" && g1.count === 10);
  add("exclusive: territory targets present", p1.territoryTargets.length === 2 && p1.metrics.some((m) => m.label.includes("בלעדיות")));

  // 2. Free-hour goal → calendar proposals / entity actions.
  const g2 = classifyGoal("יש לי שעתיים פנויות מה כדאי לעשות");
  const p2 = assembleBrokerPlan(g2, ctx({ hotBuyers: [ent("buyer", "b1", "דנה")], calendar: { date: "2026-07-06", freeAfter: "14:00", slots: [{ title: "סיור", when: "15:00", reason: "קרוב אליך" }], overdue: 1 } }));
  add("free_time: intent + hours", g2.intent === "free_time" && g2.hours === 2);
  add("free_time: calendar proposals present", p2.calendarProposals.length > 0 && p2.actions.length > 0);

  // 3. Close-deal goal → hot buyer + seller risk priorities.
  const g3 = classifyGoal("איך אני מגדיל סיכוי לסגור עסקה השבוע");
  const p3 = assembleBrokerPlan(g3, ctx({ hotBuyers: [ent("buyer", "b1", "דנה")], sellersAtRisk: [ent("seller", "s1", "יוסי")] }));
  add("close_deal: intent + timeframe", g3.intent === "close_deal" && g3.timeframe === "this_week");
  add("close_deal: surfaces hot buyer + seller risk", p3.priorities.some((x) => x.entity?.kind === "buyer") && p3.priorities.some((x) => x.entity?.kind === "seller"));

  // 4. Territory domination goal.
  const g4 = classifyGoal("איך אני שולט ברחובות מערב");
  const p4 = assembleBrokerPlan(g4, ctx({ territory: { city: "רחובות", score: 44, band: "weak", acquisition: [acq("הרצל")], recommendations: [rec("r1", "הרחב נוכחות")] } }));
  add("territory: intent classified", g4.intent === "territory_domination");
  add("territory: score + recommendations in plan", p4.priorities.some((x) => x.title.includes("שליטה")) && p4.territoryTargets.length === 1);

  // 5. Seller risk.
  const p5 = assembleBrokerPlan(classifyGoal("יש לי מוכרים בסיכון נטישה"), ctx({ sellersAtRisk: [ent("seller", "s1", "יוסי"), ent("seller", "s2", "רון")] }));
  add("seller_risk: surfaces sellers", p5.priorities.filter((x) => x.entity?.kind === "seller").length === 2);

  // 6. Hot buyer.
  const p6 = assembleBrokerPlan(classifyGoal("מי הקונים החמים שלי"), ctx({ hotBuyers: [ent("buyer", "b1", "דנה")] }));
  add("hot_buyer: surfaces buyer + action", p6.priorities.some((x) => x.entity?.kind === "buyer") && p6.actions.some((a) => a.bundleRequest?.entityType === "buyer"));

  // 7. Stale listing.
  const p7 = assembleBrokerPlan(classifyGoal("יש לי נכס תקוע שלא זז"), ctx({ staleListings: [ent("property", "pr1", "דירה בהרצל")] }));
  add("stale_listing: surfaces property + action", p7.priorities.some((x) => x.entity?.kind === "property") && p7.actions.some((a) => a.bundleRequest?.entityType === "property"));

  // 8. No data → honest empty plan.
  const p8 = assembleBrokerPlan(classifyGoal("איך אני שולט באזור"), empty);
  add("no_data: hasPlan false + empty note", p8.hasPlan === false && p8.confidence === 0 && p8.notes.some((n) => n.includes("אין")));

  // 9. Conflicting recommendations → both surfaced.
  const p9 = assembleBrokerPlan(classifyGoal("סדר יום"), ctx({ priorities: [rec("a", "העלה מחיר נכס X"), rec("b", "הורד מחיר נכס X", "medium")] }));
  add("conflict: both recommendations surfaced", p9.priorities.some((x) => x.title.includes("העלה מחיר")) && p9.priorities.some((x) => x.title.includes("הורד מחיר")));

  // 10. Approval-only: every executable action requires approval; nothing auto-runs.
  const p10 = assembleBrokerPlan(classifyGoal("סגור לי עסקה"), ctx({ hotBuyers: [ent("buyer", "b1", "דנה")], sellersAtRisk: [ent("seller", "s1", "יוסי")] }));
  add("approval-only: executable ⇒ requiresApproval", p10.actions.every((a) => !a.canExecute || a.requiresApproval));
  add("approval-only: note present", p10.notes.some((n) => n.includes("אישור")));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
