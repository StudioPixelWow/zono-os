// ============================================================================
// ✅ Unified AI Workspace — self-tests (pure, offline). 30.2. Part 11.
// Verifies: large org / small org / no data / many missions / many agents /
// many opportunities / performance. Pure assembly only.
// ============================================================================
import { buildAiHome, buildContextPanel } from "./assemble";
import type { HomeInput, EntityRef, HomeChain, HomeInboxItem, MissionRef, HomeTimelineEvent } from "./types";

export interface HCheck { name: string; pass: boolean; detail: string }
export interface HSelfCheck { ok: boolean; total: number; passed: number; checks: HCheck[] }

const ent = (kind: string, i: number, tone: EntityRef["tone"]): EntityRef => ({ kind, id: `${kind}${i}`, name: `${kind} ${i}`, detail: "פרט", score: 60, tone });
const chain = (i: number, score: number, type = "potential_deal"): HomeChain => ({ id: `c${i}`, title: `הזדמנות ${i}`, type, score, impact: "high", confidence: 70, links: [`קונה ${i}`, `מוכר ${i}`], approvals: ["מתווך"] });
const inbox = (i: number): HomeInboxItem => ({ id: `i${i}`, agentName: "סוכן", recommendation: `המלצה ${i}`, reason: "סיבה", impact: "high", confidence: 70, entity: `ישות ${i}`, status: "pending", requiresApproval: true });
const mref = (i: number): MissionRef => ({ id: `m${i}`, title: `משימה ${i}`, entity: `ישות ${i}`, status: "WAITING_FOR_APPROVAL", priority: 60 });
const tl = (i: number, at: string): HomeTimelineEvent => ({ at, source: "mission", title: `אירוע ${i}`, detail: "", tone: "neutral" });

const input = (o: Partial<HomeInput> = {}): HomeInput => ({
  signals: { businessScore: 62, executionScore: 55, aiConfidence: 65, briefingSummary: "תדריך", priorities: [{ title: "עדיפות", why: "כי", urgency: 80 }], criticalRisks: [{ title: "סיכון נטישה", evidence: ["e"], severity: "high" }], briefingOpportunities: [{ title: "הזדמנות", evidence: ["e"] }], urgentMissions: [{ title: "מעקב", why: "כי" }], suggestedActions: ["פעולה"] },
  pipelines: { buyers: { total: 10, hot: 3, items: [ent("buyer", 1, "good"), ent("buyer", 2, "good")] }, sellers: { total: 8, atRisk: 2, items: [ent("seller", 1, "bad"), ent("seller", 2, "warn")] }, listings: { total: 12, critical: 2, items: [ent("property", 1, "bad")] }, leads: { total: 20, hot: 5, duplicates: 2 } },
  office: { businessHealth: 60, risks: [{ title: "סיכון עסקי", severity: "high" }], decisions: [{ title: "גייס", impact: "high" }], inactiveBrokers: ["רון", "דנה"], dataQuality: 55 },
  chains: [chain(1, 85), chain(2, 60, "reengage_stale"), chain(3, 30, "defend_market")],
  priorityQueue: [{ id: "p1", title: "פריט", score: 80, impact: "high", kind: "opportunity" }],
  missions: { waiting: 3, blocked: 1, today: 2, completed: 5, waitingItems: [mref(1), mref(2)], todayItems: [mref(3)], completedItems: [mref(4)], blockers: ["חסום"] },
  inbox: [inbox(1), inbox(2)],
  timeline: [tl(1, "2026-07-01T10:00:00Z"), tl(2, "2026-07-03T10:00:00Z"), tl(3, "2026-07-02T10:00:00Z")],
  suggestedQuestions: ["מה עליי לעשות היום?", "אילו מוכרים בסיכון?"],
  ...o,
});

export function runSelfCheck(): HSelfCheck {
  const checks: HCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Standard (small/normal) org.
  const d = buildAiHome(input());
  add("today dashboard populated", d.today.businessScore === 62 && d.today.priorities.length > 0 && d.today.hotBuyers.length > 0, "");
  add("approvals + missions counts", d.today.approvalsWaiting === 2 && d.today.missionsToday === 2, `${d.today.approvalsWaiting}/${d.today.missionsToday}`);
  add("opportunities grouped by priority", d.opportunities.groups.length >= 2 && d.opportunities.groups[0].band === "high" && d.opportunities.groups[0].chains.length === 1, "");
  add("opportunity totals", d.opportunities.totals.total === 3 && d.opportunities.totals.potentialDeals === 1, "");
  add("risk center", d.risks.criticalSellers.length > 0 && d.risks.decliningBrokers.length === 2 && d.risks.score > 0, "");
  add("execution center", d.execution.totals.approvals === 2 && d.execution.waitingMissions.length === 2 && d.execution.recentlyCompleted.length === 1, "");
  add("insights", d.insights.suggestedActions.length > 0 && d.insights.suggestedQuestions.length >= 2, "");
  add("timeline sorted desc + capped", d.timeline.length === 3 && d.timeline[0].at > d.timeline[1].at && d.timeline[1].at > d.timeline[2].at, d.timeline.map((e) => e.at).join(","));
  add("not empty state", d.emptyState === false, "");

  // No data.
  const none = buildAiHome(input({
    signals: { businessScore: 0, executionScore: 0, aiConfidence: 0, briefingSummary: "", priorities: [], criticalRisks: [], briefingOpportunities: [], urgentMissions: [], suggestedActions: [] },
    pipelines: { buyers: { total: 0, hot: 0, items: [] }, sellers: { total: 0, atRisk: 0, items: [] }, listings: { total: 0, critical: 0, items: [] }, leads: { total: 0, hot: 0, duplicates: 0 } },
    office: null, chains: [], priorityQueue: [], missions: { waiting: 0, blocked: 0, today: 0, completed: 0, waitingItems: [], todayItems: [], completedItems: [], blockers: [] }, inbox: [], timeline: [],
  }));
  add("no data → empty state + note", none.emptyState === true && none.notes.length > 0 && none.opportunities.groups.length === 0, "");
  add("no data → zeroed boards don't crash", none.today.hotBuyers.length === 0 && none.execution.totals.approvals === 0 && none.timeline.length === 0, "");

  // Large org / many everything + performance.
  const bigChains = Array.from({ length: 500 }, (_, i) => chain(i, (i * 7) % 100));
  const bigInbox = Array.from({ length: 300 }, (_, i) => inbox(i));
  const bigTl = Array.from({ length: 1000 }, (_, i) => tl(i, new Date(1_700_000_000_000 + i * 60000).toISOString()));
  const t0 = Date.now();
  const big = buildAiHome(input({ chains: bigChains, inbox: bigInbox, timeline: bigTl, missions: { waiting: 200, blocked: 50, today: 120, completed: 800, waitingItems: Array.from({ length: 200 }, (_, i) => mref(i)), todayItems: Array.from({ length: 120 }, (_, i) => mref(i)), completedItems: Array.from({ length: 800 }, (_, i) => mref(i)), blockers: [] } }));
  const elapsed = Date.now() - t0;
  add("large org caps lists", big.opportunities.totals.total === 500 && big.execution.approvals.length === 10 && big.execution.waitingMissions.length === 10 && big.timeline.length === 40, "");
  add("large org grouped all bands", big.opportunities.groups.length === 3, "");
  add("performance < 150ms", elapsed < 150, `${elapsed}ms`);

  // Context panel.
  const ctx = buildContextPanel({ kind: "seller", id: "seller1", name: "seller 1" }, input());
  add("context panel from card", ctx.name === "seller 1" && ctx.health === 60 && (ctx.risks.length > 0 || ctx.summary.length > 0), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
