// ============================================================================
// ✅ Local Market Domination — self-tests (pure, offline). 34.0.
// scoring bands / market share / actions with WHY / plans / dashboard / empty /
// high & low competition / missing area / large city / perf.
// ============================================================================
import { scoreArea, detectTerritoryActions, buildDomination, buildPlans, type AreaSignal } from "./domination";

export interface MDCheck { name: string; pass: boolean; detail: string }
export interface MDSelfCheck { ok: boolean; total: number; passed: number; checks: MDCheck[] }

const a = (o: Partial<AreaSignal> = {}): AreaSignal => ({
  key: "k1", name: "לב העיר", city: "תל אביב", level: "neighborhood",
  internalListings: 8, externalListings: 12, buyerDemand: 70, supply: 45, competition: 40, momentum: 60,
  opportunity: 72, priceDrops: 2, activeBuyers: 20, avgPrice: 4_000_000, luxuryShare: 10,
  groupCoverage: 3, groupLeads: 4, campaignCoverage: 1, transactions: 10, ...o,
});

export function runSelfCheck(): MDSelfCheck {
  const checks: MDCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const dom = scoreArea(a({ internalListings: 30, externalListings: 5, competition: 20, groupCoverage: 5, campaignCoverage: 2 }));
  add("high presence → dominant band", dom.band === "dominant" && dom.dominationScore >= 65 && dom.marketShare >= 80);
  add("score has breakdown + evidence + confidence", dom.breakdown.marketShare > 0 && dom.evidence.length >= 3 && dom.confidence > 0);

  const weak = scoreArea(a({ internalListings: 1, externalListings: 30, competition: 80, groupCoverage: 0, campaignCoverage: 0, buyerDemand: 30, momentum: 30 }));
  add("low presence + high competition → weak", weak.band === "weak" && weak.marketShare < 20);

  const absent = scoreArea(a({ internalListings: 0, externalListings: 25 }));
  add("no listings but market exists → absent band", absent.band === "absent" && absent.marketShare === 0);

  // Actions.
  const noListings = detectTerritoryActions(a({ internalListings: 0, externalListings: 25 }), absent);
  add("absent area → no_listings action (high priority)", noListings.some((x) => x.kind === "no_listings" && x.priority >= 90));
  const noMarketing = detectTerritoryActions(a({ campaignCoverage: 0, internalListings: 5 }), dom);
  add("no campaigns → no_marketing action", noMarketing.some((x) => x.kind === "no_marketing"));
  const noGroups = detectTerritoryActions(a({ groupCoverage: 0 }), dom);
  add("no groups → weak_groups action", noGroups.some((x) => x.kind === "weak_groups"));
  const comp = detectTerritoryActions(a({ competition: 75, internalListings: 2, externalListings: 30 }), scoreArea(a({ competition: 75, internalListings: 2, externalListings: 30 })));
  add("strong competitor action", comp.some((x) => x.kind === "strong_competitor"));
  const lux = detectTerritoryActions(a({ luxuryShare: 40 }), dom);
  add("luxury opportunity action", lux.some((x) => x.kind === "luxury_opportunity"));
  add("every action explains WHY + evidence + cta", noListings.every((x) => x.why.length > 0 && x.evidence.length > 0 && x.cta.href.startsWith("/")));

  // Plans.
  const actions = detectTerritoryActions(a({ internalListings: 0, externalListings: 25, campaignCoverage: 0, groupCoverage: 0, competition: 75 }), absent);
  const plans = buildPlans(actions);
  add("three phased plans (7/30/90) approval-gated", plans.length === 3 && plans.map((p) => p.horizon).join() === "7d,30d,90d" && plans.flatMap((p) => p.tasks).every((t) => t.requiresApproval));

  // Dashboard.
  const dash = buildDomination([
    a({ key: "x", name: "צפון", internalListings: 20, externalListings: 5, competition: 25 }),
    a({ key: "y", name: "דרום", internalListings: 0, externalListings: 30, buyerDemand: 65 }),
    a({ key: "z", name: "מרכז", internalListings: 2, externalListings: 25, competition: 70, campaignCoverage: 0, groupCoverage: 0 }),
  ]);
  add("dashboard summary + bands", dash.summary.areas === 3 && dash.summary.dominant >= 1 && dash.summary.absent >= 1 && dash.summary.coverage >= 0);
  add("dashboard ranks + opportunities + missing + queue + plans", dash.areas[0].dominationScore >= dash.areas[dash.areas.length - 1].dominationScore && dash.missingAreas.some((m) => m.name === "דרום") && dash.actionQueue.length > 0 && dash.plans.length === 3);
  add("action queue prioritized", dash.actionQueue.every((x, i, arr) => i === 0 || arr[i - 1].priority >= x.priority));

  // Empty.
  const empty = buildDomination([]);
  add("empty safe", empty.summary.areas === 0 && empty.notes.length > 0 && empty.actionQueue.length === 0);

  // Perf (large city with many neighborhoods).
  const t0 = Date.now();
  const big = Array.from({ length: 500 }, (_, i) => a({ key: `n${i}`, name: `אזור ${i}`, internalListings: i % 30, externalListings: (i % 40) + 1, competition: i % 100, buyerDemand: i % 100 }));
  for (let k = 0; k < 10; k++) buildDomination(big);
  add("500 areas × 10 < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
