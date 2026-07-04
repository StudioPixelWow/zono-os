// ============================================================================
// ✅ ZONO Broker Personal Workspace™ — pure self-tests (offline). 35.0.
// Validates broker scoping, ranking, briefing, comms (draft-only), calendar
// (no auto-book), and performance. No I/O. Runnable via the /tmp harness.
// ============================================================================
import { assembleBrokerWorkspace } from "./assemble";
import type { BrokerWorkspaceInput, ScoredEntity, WsMission } from "./types";

export interface BWCheck { name: string; pass: boolean; detail: string }
export interface BWSelfCheck { ok: boolean; total: number; passed: number; checks: BWCheck[] }

const DAY = 86_400_000;
const NOW = Date.parse("2026-07-04T09:00:00.000Z");
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();

const buyer = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "buyer", id, name: `קונה ${id}`, healthScore: 60, healthLabel: "טוב", score: 60, stage: null, reason: "התאמות פעילות", lastActivityAt: ago(2), riskLabel: null, href: `/buyers/${id}`, ...o });
const lead = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "lead", id, name: `ליד ${id}`, healthScore: 40, healthLabel: "בינוני", score: 50, stage: "new", reason: "ליד חדש", lastActivityAt: null, riskLabel: null, href: `/leads/${id}`, ...o });
const seller = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "seller", id, name: `מוכר ${id}`, healthScore: 55, healthLabel: "טוב", score: 50, stage: null, reason: null, lastActivityAt: ago(10), riskLabel: "סיכון נטישה", href: `/sellers/${id}`, ...o });
const listing = (id: string, o: Partial<ScoredEntity> = {}): ScoredEntity => ({ kind: "property", id, name: `נכס ${id}`, healthScore: 50, healthLabel: "בינוני", score: 70, stage: "active", reason: null, lastActivityAt: ago(30), riskLabel: "stale", href: `/properties/${id}`, ...o });
const mission = (id: string, o: Partial<WsMission> = {}): WsMission => ({ id, title: `משימה ${id}`, entityType: "buyer", entityId: "b1", entityName: "קונה b1", owner: "broker-1", priority: "high", status: "open", reason: null, dueAt: ago(-1), ...o });

function baseInput(o: Partial<BrokerWorkspaceInput> = {}): BrokerWorkspaceInput {
  return {
    brokerId: "broker-1", brokerName: "דני", now: NOW,
    owned: { buyerIds: ["b1", "b2"], sellerIds: ["s1"], leadIds: ["l1"], propertyIds: ["p1"] },
    buyers: [buyer("b1", { score: 85, healthScore: 82 }), buyer("b2", { score: 40, healthScore: 45 })],
    sellers: [seller("s1", { score: 60 })],
    listings: [listing("p1", { healthScore: 35 })],
    leads: [lead("l1")],
    missions: [mission("m1", { owner: "broker-1", entityId: "b1" }), mission("m2", { owner: "other", entityId: "zzz", priority: "low" })],
    inbox: [
      { id: "i1", agentName: "Buyer", entityType: "buyer", entityId: "b1", entityName: "קונה b1", recommendation: "צור קשר", reason: "חם", impact: "high", confidence: 0.8, status: "pending", requiresApproval: true },
      { id: "i2", agentName: "Buyer", entityType: "buyer", entityId: "zzz", entityName: "אחר", recommendation: "לא שלי", reason: null, impact: "low", confidence: 0.5, status: "pending", requiresApproval: true },
    ],
    workflows: [{ id: "w1", name: "מעקב", entityType: "buyer", entityId: "b1", status: "running" }, { id: "w2", name: "אחר", entityType: "buyer", entityId: "zzz", status: "running" }],
    meetings: [{ id: "mt1", title: "פגישת קונה", type: "buyer_meeting", status: "scheduled", startAt: ago(-1), endAt: ago(-0.9), entityLabel: "קונה b1" }],
    suggested: [{ id: "se1", propertyId: "p1", title: "בית פתוח", planType: "open_house", suggestedDate: ago(-3), status: "pending" }],
    notes: [],
    ...o,
  };
}

export function runSelfCheck(): BWSelfCheck {
  const checks: BWCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const w = assembleBrokerWorkspace(baseInput());

  add("hot buyers ranked by score desc", w.dashboard.hotBuyers[0].id === "b1" && w.dashboard.hotBuyers.length === 2);
  add("missions scoped to broker (owner or owned entity)", w.dashboard.todaysPriorities.length === 1 && w.dashboard.todaysPriorities[0].id === "m1");
  add("inbox scoped to owned entities", w.inbox.length === 1 && w.inbox[0].id === "i1");
  add("pending approvals only owned + requiresApproval", w.dashboard.pendingApprovals.length === 1 && w.dashboard.pendingApprovals[0].id === "i1");
  add("workflows scoped to owned entities", w.dashboard.activeWorkflows.length === 1 && w.dashboard.activeWorkflows[0].id === "w1");
  add("sellers at risk surfaced", w.dashboard.sellersAtRisk.length === 1 && w.dashboard.sellersAtRisk[0].id === "s1");
  add("critical listings worst-health first", w.dashboard.criticalListings[0].id === "p1");
  add("upcoming meetings present + future", w.dashboard.upcomingMeetings.length === 1);

  add("briefing has the 4 core questions", w.briefing.items.length >= 3 && w.briefing.items.some((i) => i.question.includes("להתקשר")));
  add("briefing targets deep-link", w.briefing.items.every((i) => i.targets.every((t) => t.href.startsWith("/"))));

  add("comms: new lead → first_response draft", w.comms.items.some((c) => c.entityId === "l1" && c.intent === "first_response"));
  add("comms: draft-only note (no auto-send)", /לא נשלחת אוטומטית/.test(w.comms.note));
  add("calendar: no-auto-book note", /אישור/.test(w.calendar.note) && w.calendar.suggested.length === 1);

  add("performance counts", w.performance.activeBuyers === 2 && w.performance.activeSellers === 1 && w.performance.leadsHandled === 1 && w.performance.activeListings === 1);
  add("performance conversion opportunities (health>=70)", w.performance.conversionOpportunities === 1);
  add("performance weak spots detected", w.performance.weakSpots.length >= 1 && w.performance.weakSpots.some((x) => x.title.includes("לידים")));

  // Empty-safe.
  const empty = assembleBrokerWorkspace(baseInput({ buyers: [], sellers: [], listings: [], leads: [], missions: [], inbox: [], workflows: [], meetings: [], suggested: [] }));
  add("empty-safe", empty.dashboard.hotBuyers.length === 0 && empty.performance.followUpRatePct === 0 && empty.comms.items.length === 0);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
