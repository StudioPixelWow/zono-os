// ============================================================================
// ✅ Territory Intelligence self-tests (pure, offline). Phase 26.6.
// Verifies stats/median, market share, dominance score+band, and insights —
// all from synthetic attributed listings. No DB/AI.
// ============================================================================
import { territoryStats, officeDominance, territoryInsights, bandFor, median, isLuxury, isCommercial } from "./aggregate";
import type { AttributedListing } from "./types";

export interface TICheck { name: string; pass: boolean; detail: string }
export interface TISelfCheck { ok: boolean; total: number; passed: number; checks: TICheck[] }

let seq = 0;
function L(over: Partial<AttributedListing>): AttributedListing {
  return {
    listingId: `l${seq++}`, city: "חיפה", neighborhood: "נאות אפק", street: "האלון",
    price: 2_000_000, sqm: 100, propertyType: "דירה", active: true, rental: false, commercial: false, luxury: false, recent: true,
    officeId: "O1", officeName: "RE/MAX Smart", brand: "RE/MAX", brokerId: "B1", brokerName: "דנה", seenAt: new Date().toISOString(), ...over,
  };
}

export function runSelfCheck(): TISelfCheck {
  const checks: TICheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Median.
  add("median odd", median([1, 3, 2]) === 2, `${median([1, 3, 2])}`);
  add("median even", median([1, 2, 3, 4]) === 3, `${median([1, 2, 3, 4])}`);
  add("median empty null", median([]) === null, "");

  // Classification helpers.
  add("luxury flag", isLuxury(5_000_000) && !isLuxury(1_000_000), "");
  add("commercial flag", isCommercial("חנות מסחרית") && !isCommercial("דירה"), "");

  // Territory stats: O1 has 7 of 10 active listings → leader share 70%.
  const listings = [
    ...Array.from({ length: 7 }, () => L({ officeId: "O1", officeName: "RE/MAX Smart", brokerId: "B1" })),
    ...Array.from({ length: 3 }, () => L({ officeId: "O2", officeName: "Anglo Saxon", brand: "Anglo Saxon", brokerId: "B2", brokerName: "רון" })),
  ];
  const st = territoryStats(listings);
  add("active total", st.activeListings === 10, `${st.activeListings}`);
  add("top office share 70", st.topOffices[0].id === "O1" && st.topOffices[0].sharePct === 70, `${st.topOffices[0].sharePct}`);
  add("two brokers ranked", st.topBrokers.length === 2, `${st.topBrokers.length}`);

  // Dominance: O1 dominant → Leader; O2 minority → not leader.
  const dom = officeDominance(listings);
  add("O1 leader band", dom[0].officeId === "O1" && (dom[0].band === "Leader" || dom[0].band === "Strong"), `${dom[0].band}`);
  add("O1 score high", dom[0].dominanceScore >= 40, `${dom[0].dominanceScore}`);

  // Band thresholds.
  add("band leader", bandFor(60, false) === "Leader", "");
  add("band strong", bandFor(40, false) === "Strong", "");
  add("band growing", bandFor(25, true) === "Growing", "");
  add("band average", bandFor(20, false) === "Average", "");
  add("band weak", bandFor(5, false) === "Weak", "");

  // Insight names the leader + share.
  const ins = territoryInsights("נאות אפק", st, dom);
  add("insight leader share", ins.some((x) => /RE\/MAX Smart/.test(x) && /70%/.test(x)), `${ins[0] ?? ""}`);

  // Luxury neighborhood insight.
  const lux = Array.from({ length: 5 }, () => L({ price: 6_000_000, luxury: true }));
  add("luxury insight", territoryInsights("סביוני חיפה", territoryStats(lux), officeDominance(lux)).some((x) => /יוקרה/.test(x)), "");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
