// ============================================================================
// ✅ Street & Building Intelligence — self-tests (pure, offline). 34.1.
// street aggregation / recruitment score / market share / luxury / recency /
// building grouping (gush-helka) / opportunity bands / empty / large / perf.
// ============================================================================
import { buildStreetBuildingIntel, type TxInput } from "./intel";

export interface SBCheck { name: string; pass: boolean; detail: string }
export interface SBSelfCheck { ok: boolean; total: number; passed: number; checks: SBCheck[] }

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString().slice(0, 10);
const tx = (o: Partial<TxInput> = {}): TxInput => ({ city: "חיפה", street: "הרצל", gush: "10", helka: "5", address: "הרצל 10 חיפה", price: 2_000_000, ppsqm: 25000, date: ago(30), rooms: 4, area: 90, ...o });

export function runSelfCheck(): SBSelfCheck {
  const checks: SBCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });

  const txs: TxInput[] = [
    tx({ street: "הרצל", price: 2_000_000, date: ago(20) }),
    tx({ street: "הרצל", price: 2_400_000, date: ago(60) }),
    tx({ street: "הרצל", price: 9_000_000, date: ago(400) }),           // luxury, old
    tx({ street: "ביאליק", gush: "11", helka: "3", price: 1_500_000, date: ago(400) }),
  ];
  const r = buildStreetBuildingIntel(txs);

  add("streets aggregated + sorted by recruitment", r.streets.length === 2 && r.streets[0].recruitmentScore >= r.streets[1].recruitmentScore);
  const herzl = r.streets.find((s) => s.street === "הרצל")!;
  add("street transactions + recent + avg price", herzl.transactions === 3 && herzl.recentDeals === 2 && herzl.avgPrice != null);
  add("luxury share detected", herzl.luxuryShare > 0);
  add("recruitment score in range + opportunity band", herzl.recruitmentScore >= 0 && herzl.recruitmentScore <= 100 && ["high", "medium", "low"].includes(herzl.opportunity));
  add("AI recommendation + evidence", herzl.aiRecommendation.length > 0 && herzl.evidence.length > 0);
  add("no-coverage street → recruit target wording", herzl.ourListings == null && herzl.aiRecommendation.includes("גיוס"));

  // Market share when our coverage provided.
  const withOurs = buildStreetBuildingIntel([tx({ street: "הרצל" }), tx({ street: "הרצל" })], new Map([["חיפה|הרצל", 2]]));
  add("market share computed from our listings", withOurs.streets[0].marketShare === 50 && withOurs.streets[0].ourListings === 2);

  // Buildings: only groups with >=2 transactions.
  const bldTx: TxInput[] = [tx({ gush: "10", helka: "5", price: 5_000_000 }), tx({ gush: "10", helka: "5", price: 5_400_000 }), tx({ gush: "10", helka: "5", price: 6_000_000 }), tx({ gush: "99", helka: "1" })];
  const rb = buildStreetBuildingIntel(bldTx);
  add("buildings grouped by gush-helka (>=2 tx)", rb.buildings.some((b) => b.key === "10-5" && b.transactions === 3) && !rb.buildings.some((b) => b.key === "99-1"));
  add("building label + opportunity + evidence", rb.buildings[0].label.includes("גוש") && ["high", "medium", "low"].includes(rb.buildings[0].recruitmentPriority) && rb.buildings[0].evidence.length > 0);

  add("summary counts", r.summary.streets === 2 && r.summary.buildings >= 0 && r.summary.activeStreets >= 1);

  // Empty.
  const empty = buildStreetBuildingIntel([]);
  add("empty safe", empty.streets.length === 0 && empty.buildings.length === 0 && empty.notes.length > 0);

  // Transactions without street are skipped for streets but may still form buildings.
  add("tx without street skipped for streets", buildStreetBuildingIntel([tx({ street: null })]).streets.length === 0);

  // Perf.
  const t0 = Date.now();
  const big = Array.from({ length: 4000 }, (_, i) => tx({ street: `רחוב ${i % 200}`, gush: `${i % 300}`, helka: `${i % 50}`, price: 1_000_000 + i * 1000, date: ago(i % 400) }));
  for (let k = 0; k < 5; k++) buildStreetBuildingIntel(big);
  add("4000 tx × 5 < 300ms", Date.now() - t0 < 300, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
