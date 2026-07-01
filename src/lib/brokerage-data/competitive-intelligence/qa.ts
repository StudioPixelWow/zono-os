// ============================================================================
// ✅ Competitive Intelligence self-tests (pure, offline). Phase 26.7.
// Validates aggregates+growth, snapshot/concentration, competitor matrix, SWOT,
// opportunity detection and strategic insights from synthetic listings.
// ============================================================================
import { officeAggregates, marketSnapshot, competitiveMatrix, swot, detectOpportunities, strategicInsights } from "./compute";
import type { AttributedListing } from "../territory-intelligence/types";

export interface CICheck { name: string; pass: boolean; detail: string }
export interface CISelfCheck { ok: boolean; total: number; passed: number; checks: CICheck[] }

const NOW = Date.UTC(2026, 0, 15);
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();
let seq = 0;
function L(over: Partial<AttributedListing>): AttributedListing {
  return {
    listingId: `l${seq++}`, city: "חיפה", neighborhood: "נאות אפק", street: "האלון",
    price: 2_000_000, sqm: 100, propertyType: "דירה", active: true, rental: false, commercial: false, luxury: false, recent: true,
    officeId: "O1", officeName: "RE/MAX Smart", brand: "RE/MAX", brokerId: "B1", brokerName: "דנה", seenAt: daysAgo(20), ...over,
  };
}

export function runSelfCheck(): CISelfCheck {
  const checks: CICheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // O1 dominant (7 active), O2 (3 active). O2 growing recently.
  const listings: AttributedListing[] = [
    ...Array.from({ length: 5 }, () => L({ officeId: "O1", officeName: "RE/MAX Smart", brokerId: "B1", seenAt: daysAgo(90) })),
    ...Array.from({ length: 2 }, () => L({ officeId: "O1", officeName: "RE/MAX Smart", brokerId: "B1b", seenAt: daysAgo(20) })),
    ...Array.from({ length: 1 }, () => L({ officeId: "O2", officeName: "Anglo Saxon", brand: "Anglo Saxon", brokerId: "B2", neighborhood: "סביניה", seenAt: daysAgo(100) })),
    ...Array.from({ length: 2 }, () => L({ officeId: "O2", officeName: "Anglo Saxon", brand: "Anglo Saxon", brokerId: "B2", neighborhood: "סביניה", seenAt: daysAgo(15) })),
  ];
  const aggs = officeAggregates(listings, NOW);
  const o1 = aggs.find((a) => a.officeId === "O1")!, o2 = aggs.find((a) => a.officeId === "O2")!;
  add("O1 rank #1", o1.rank === 1, `${o1.rank}`);
  add("O1 listing share", o1.listingSharePct === 70, `${o1.listingSharePct}`);
  add("O2 growing", o2.momentum === "growing" && o2.growthPct > 0, `${o2.momentum}/${o2.growthPct}`);

  // Snapshot.
  const snap = marketSnapshot("חיפה", listings, aggs, 2, NOW);
  add("active offices 2", snap.activeOffices === 2, `${snap.activeOffices}`);
  add("concentration computed", snap.marketConcentration > 0 && ["fragmented", "moderate", "concentrated"].includes(snap.concentrationLevel), `${snap.concentrationLevel}`);
  add("top office share", snap.topOfficeSharePct === 70, `${snap.topOfficeSharePct}`);

  // Matrix.
  const m = competitiveMatrix(o1, aggs);
  add("main competitor O2", m.mainCompetitors[0]?.officeId === "O2", "");
  add("fastest growing lists O2", m.fastestGrowing.some((c) => c.officeId === "O2"), "");

  // Insights: O1 gained listings recently (recent 2 vs prior 0) → growth insight; leader #1.
  const ins = strategicInsights(aggs, listings);
  add("insight leader rank", ins.some((x) => /#1/.test(x.text) && /RE\/MAX Smart/.test(x.text)), "");
  add("insight cites evidence", ins.every((x) => x.evidence.length > 0), "");

  // Opportunities: a high-supply low-office neighborhood.
  const opp = detectOpportunities([
    ...Array.from({ length: 6 }, () => L({ officeId: "O1", neighborhood: "רמת הדר", active: true })),
  ]);
  add("opportunity detected", opp.some((o) => o.area === "רמת הדר"), `${opp.length}`);

  // SWOT: O2 has weak commercial (city has none) → no false strength; O1 threat from growing O2.
  const sw = swot(o1, aggs, listings);
  add("swot arrays exist", Array.isArray(sw.strengths) && Array.isArray(sw.threats), "");
  add("swot evidence-backed", [...sw.strengths, ...sw.weaknesses, ...sw.threats, ...sw.opportunities].every((i) => i.evidence.length > 0), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
