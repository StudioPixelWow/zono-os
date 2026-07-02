// ============================================================================
// ✅ Multi-Agent Orchestrator — self-tests (pure, offline). 29.8. Part 10.
// Scenarios: hot buyer + ready seller / hot buyer + stale listing / conflicting
// recommendations / multiple agents / no events / opportunity chains / priority
// ordering. Everything is recommendation-only (nothing auto-executes).
// ============================================================================
import { buildOrchestratorDashboard } from "./orchestrator";
import { deriveEvents, EVENT_SUBSCRIPTIONS } from "./events";
import type { OrchestratorInput, OBuyer, OSeller, OListing, OLead, OOffice } from "./types";

export interface MOCheck { name: string; pass: boolean; detail: string }
export interface MOSelfCheck { ok: boolean; total: number; passed: number; checks: MOCheck[] }

const buyer = (o: Partial<OBuyer> = {}): OBuyer => ({ id: "B1", name: "קונה א", hot: true, closing: false, strategy: "קבע ביקור", stance: "proceed", impact: "high", confidence: 80, truth: 70, matchListingIds: ["P1"], ...o });
const seller = (o: Partial<OSeller> = {}): OSeller => ({ id: "S1", name: "מוכר א", ready: true, atRisk: false, priceIssue: false, strategy: "החתמת הסכם", stance: "sell_now", impact: "high", confidence: 78, truth: 72, propertyId: "P1", propertyHealthy: true, marketScore: 70, matchingBuyerIds: ["B1"], ...o });
const listing = (o: Partial<OListing> = {}): OListing => ({ id: "P1", name: "דירה ברחוב הרצל", city: "תל אביב", stale: false, critical: false, healthy: true, overpriced: false, strategy: "שמור מחיר", stance: "keep", impact: "medium", confidence: 70, truth: 68, ...o });
const lead = (o: Partial<OLead> = {}): OLead => ({ id: "L1", name: "ליד א", duplicate: false, hot: false, convertReady: false, routing: "buyer", ...o });
const office = (o: Partial<OOffice> = {}): OOffice => ({ name: "תיווך זונו", strategy: "GROW_TERRITORY", strategyHe: "הרחבת טריטוריה", confidence: 65, marketShiftPct: 3, territoryChanged: false, inactiveBrokers: [], decisions: [{ type: "RECRUIT", title: "גייס מתווכים", impact: "high", why: "עומס" }], risks: [], missionsCompleted: 2, ...o });
const input = (o: Partial<OrchestratorInput> = {}): OrchestratorInput => ({ buyers: [], sellers: [], listings: [], leads: [], office: null, ...o });

export function runSelfCheck(): MOSelfCheck {
  const checks: MOCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // 1. Hot buyer + ready seller + healthy listing → potential deal chain.
  const deal = buildOrchestratorDashboard(input({ buyers: [buyer()], sellers: [seller()], listings: [listing()] }));
  const dealChain = deal.opportunities.find((c) => c.type === "potential_deal");
  add("hot buyer + ready seller → potential deal", !!dealChain && dealChain.links.length >= 3 && dealChain.businessImpact === "high", dealChain ? `score ${dealChain.opportunityScore}` : "none");
  add("potential deal requires approvals", !!dealChain && dealChain.requiredApprovals.length > 0, "");
  add("deal has merged execution plan", deal.executionPlans.some((p) => p.chainId === dealChain?.id && p.steps.length > 0 && p.steps.every((s, i) => s.order === i + 1)), "");

  // 2. Hot buyer + stale listing → buyer_listing_match chain.
  const staleMatch = buildOrchestratorDashboard(input({ buyers: [buyer({ matchListingIds: ["P1"] })], listings: [listing({ stale: true, healthy: false, strategy: "הורדת מחיר" })] }));
  add("hot buyer + stale listing → match chain", staleMatch.opportunities.some((c) => c.type === "buyer_listing_match"), "");

  // 3. Conflicting recommendations (buyer wait vs seller sell_now vs listing reduce_price on P1).
  const conflict = buildOrchestratorDashboard(input({
    buyers: [buyer({ stance: "wait", strategy: "המתן", matchListingIds: ["P1"] })],
    sellers: [seller({ stance: "sell_now" })],
    listings: [listing({ stance: "reduce_price", strategy: "הורדת מחיר", overpriced: true })],
  }));
  const conf = conflict.conflicts.find((c) => c.propertyId === "P1");
  add("conflicting recs detected", !!conf && conf.positions.length >= 2, conf ? `${conf.positions.length} positions` : "none");
  add("conflict resolved + explained", !!conf && !!conf.resolution.winner && conf.resolution.why.length > 0, conf?.resolution.action ?? "");

  // 4. Multiple agents produce events + reactions.
  const multi = buildOrchestratorDashboard(input({ buyers: [buyer()], sellers: [seller({ atRisk: true, ready: false, stance: "hold" })], listings: [listing({ stale: true })], leads: [lead({ duplicate: true })], office: office({ marketShiftPct: -12 }) }));
  add("multiple agents → many events", multi.events.length >= 4 && new Set(multi.events.map((e) => e.source)).size >= 3, `${multi.events.length} events`);
  add("events routed to subscribers", multi.reactions.length > 0 && multi.reactions.every((r) => (EVENT_SUBSCRIPTIONS[r.eventType] ?? []).includes(r.subscriber)), "");
  add("market shift → defend chain", multi.opportunities.some((c) => c.type === "defend_market"), "");

  // 5. No events (all stable, empty).
  const none = buildOrchestratorDashboard(input({}));
  add("no data → no events/opportunities", none.events.length === 0 && none.opportunities.length === 0 && none.notes.length > 0, "");
  const stable = buildOrchestratorDashboard(input({ buyers: [buyer({ hot: false, closing: false })], listings: [listing()] }));
  add("stable agents → no events", stable.events.length === 0, `${stable.events.length}`);

  // 6. Opportunity chains carry evidence + score.
  add("chains carry evidence + score", deal.opportunities.every((c) => c.evidence.length > 0 && typeof c.opportunityScore === "number" && c.opportunityScore >= 0), "");

  // 7. Priority ordering — descending priorityScore, deal on top.
  const pq = multi.priorityQueue;
  add("priority queue sorted desc", pq.every((p, i) => i === 0 || pq[i - 1].priorityScore >= p.priorityScore), "");
  add("priority considers impact/urgency/confidence/deps", pq.length > 0 && pq[0].dependencies !== undefined && typeof pq[0].urgency === "number" && typeof pq[0].truth === "number", "");

  // Event bus sanity: types + subscriptions coverage.
  const ev = deriveEvents(input({ sellers: [seller({ atRisk: true })], listings: [listing({ critical: true })] }));
  add("event bus emits typed events", ev.length >= 2 && ev.every((e) => !!EVENT_SUBSCRIPTIONS[e.type]), "");
  add("dashboard totals coherent", deal.totals.opportunities === deal.opportunities.length && deal.totals.events === deal.events.length, "");
  add("no auto execution (plans are proposals)", deal.executionPlans.every((p) => p.note.includes("ללא ביצוע אוטומטי")), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
