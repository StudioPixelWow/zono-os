// ============================================================================
// ⚔️ Competitive Intelligence — computation (pure). Phase 26.7.
// Market snapshot, per-office aggregates + growth, competitor matrix, SWOT,
// opportunity detection and strategic insights — ALL from real attributed
// listings. Deterministic (inject nowMs for tests). No DB, no AI, no fabrication.
// ============================================================================
import type { AttributedListing } from "../territory-intelligence/types";
import type {
  OfficeAggregate, MarketSnapshot, CompetitiveMatrix, CompetitorRef, Swot, SwotItem,
  Opportunity, StrategicInsight, Momentum, ConcentrationLevel,
} from "./types";

const DAY = 86400000;
const LUX = 4_000_000;
const avg = (xs: number[]): number | null => { const a = xs.filter((x) => x > 0); return a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null; };
const pct = (n: number, d: number): number => (d > 0 ? Math.round((n / d) * 100) : 0);
const trend = (recent: number, prior: number): number => (prior > 0 ? Math.round(((recent - prior) / prior) * 100) : (recent > 0 ? 100 : 0));
const momentumOf = (recent: number, prior: number): Momentum => (recent > prior ? "growing" : recent < prior ? "declining" : "stable");

function windowOf(seenAt: string | null, nowMs: number): "recent" | "prior" | "old" | null {
  if (!seenAt) return null;
  const d = (nowMs - new Date(seenAt).getTime()) / DAY;
  if (!Number.isFinite(d) || d < 0) return null;
  if (d <= 60) return "recent";
  if (d <= 120) return "prior";
  return "old";
}

/** Per-office aggregates + growth + rank (Part 2). */
export function officeAggregates(listings: AttributedListing[], nowMs = Date.now()): OfficeAggregate[] {
  const cityActive = listings.filter((l) => l.active).length;
  const cityBrokers = new Set(listings.filter((l) => l.active).map((l) => l.brokerId).filter(Boolean)).size;
  const ids = [...new Set(listings.map((l) => l.officeId).filter((x): x is string => !!x))];
  const aggs = ids.map((id) => {
    const own = listings.filter((l) => l.officeId === id);
    const active = own.filter((l) => l.active);
    const neighborhoods = [...new Set(own.map((l) => l.neighborhood).filter((x): x is string => !!x))];
    const streets = new Set(own.map((l) => l.street).filter(Boolean)).size;
    const brokers = new Set(active.map((l) => l.brokerId).filter(Boolean)).size;
    const recent60 = own.filter((l) => windowOf(l.seenAt, nowMs) === "recent").length;
    const prior60 = own.filter((l) => windowOf(l.seenAt, nowMs) === "prior").length;
    return {
      officeId: id, officeName: own.find((l) => l.officeName)?.officeName ?? id, brand: own.find((l) => l.brand)?.brand ?? null,
      activeListings: active.length, totalListings: own.length, brokers, neighborhoods, streets,
      luxury: own.filter((l) => l.luxury).length, commercial: own.filter((l) => l.commercial).length, rental: own.filter((l) => l.rental).length,
      avgPrice: avg(own.map((l) => l.price ?? 0)), avgPricePerSqm: avg(own.filter((l) => l.price && l.sqm && l.sqm > 0).map((l) => Math.round((l.price as number) / (l.sqm as number)))),
      recent60, prior60, growthPct: trend(recent60, prior60), momentum: momentumOf(recent60, prior60),
      listingSharePct: pct(active.length, cityActive), brokerSharePct: pct(brokers, cityBrokers), brokerDensity: neighborhoods.length ? Math.round((brokers / neighborhoods.length) * 10) / 10 : brokers,
      rank: 0,
    } as OfficeAggregate;
  }).sort((a, b) => b.activeListings - a.activeListings || b.totalListings - a.totalListings);
  aggs.forEach((a, i) => { a.rank = i + 1; });
  return aggs;
}

/** City market snapshot + concentration (Part 1). */
export function marketSnapshot(city: string, listings: AttributedListing[], aggs: OfficeAggregate[], verifiedOffices: number, nowMs = Date.now()): MarketSnapshot {
  const activeListings = listings.filter((l) => l.active).length;
  const activeOffices = aggs.filter((a) => a.activeListings > 0).length;
  const activeBrokers = new Set(listings.filter((l) => l.active).map((l) => l.brokerId).filter(Boolean)).size;
  const recent = listings.filter((l) => windowOf(l.seenAt, nowMs) === "recent").length;
  const prior = listings.filter((l) => windowOf(l.seenAt, nowMs) === "prior").length;
  const hhi = Math.round(aggs.reduce((s, a) => s + Math.pow(a.listingSharePct / 100, 2), 0) * 10000);
  const concentrationLevel: ConcentrationLevel = hhi >= 2500 ? "concentrated" : hhi >= 1500 ? "moderate" : "fragmented";
  return {
    city, activeOffices, verifiedOffices, activeBrokers, activeListings,
    inventoryTrendPct: trend(recent, prior),
    avgOfficeSize: activeOffices ? Math.round(activeListings / activeOffices) : 0,
    avgBrokerActivity: activeBrokers ? Math.round((activeListings / activeBrokers) * 10) / 10 : 0,
    marketConcentration: hhi, concentrationLevel, topOfficeSharePct: aggs[0]?.listingSharePct ?? 0,
  };
}

const ref = (a: OfficeAggregate, value: number, note: string): CompetitorRef => ({ officeId: a.officeId, officeName: a.officeName, brand: a.brand, value, note });

/** Competitor matrix for one office (Part 3). */
export function competitiveMatrix(target: OfficeAggregate, aggs: OfficeAggregate[]): CompetitiveMatrix {
  const others = aggs.filter((a) => a.officeId !== target.officeId);
  const overlap = (a: OfficeAggregate) => a.neighborhoods.filter((n) => target.neighborhoods.includes(n)).length;
  return {
    mainCompetitors: others.slice(0, 5).map((a) => ref(a, a.activeListings, `${a.activeListings} מודעות פעילות`)),
    closestCompetitors: [...others].sort((a, b) => overlap(b) - overlap(a)).filter((a) => overlap(a) > 0).slice(0, 5).map((a) => ref(a, overlap(a), `${overlap(a)} שכונות משותפות`)),
    fastestGrowing: [...others].filter((a) => a.growthPct > 0).sort((a, b) => b.growthPct - a.growthPct).slice(0, 5).map((a) => ref(a, a.growthPct, `+${a.growthPct}% ב-60 יום`)),
    largestInventory: [...others].sort((a, b) => b.activeListings - a.activeListings).slice(0, 5).map((a) => ref(a, a.activeListings, `${a.activeListings} מודעות`)),
    highestLuxury: [...others].filter((a) => a.luxury > 0).sort((a, b) => b.luxury - a.luxury).slice(0, 5).map((a) => ref(a, a.luxury, `${a.luxury} מודעות יוקרה`)),
    highestCommercial: [...others].filter((a) => a.commercial > 0).sort((a, b) => b.commercial - a.commercial).slice(0, 5).map((a) => ref(a, a.commercial, `${a.commercial} מסחרי`)),
    highestCoverage: [...others].sort((a, b) => b.neighborhoods.length - a.neighborhoods.length).slice(0, 5).map((a) => ref(a, a.neighborhoods.length, `${a.neighborhoods.length} שכונות`)),
    highestBrokerDensity: [...others].sort((a, b) => b.brokerDensity - a.brokerDensity).slice(0, 5).map((a) => ref(a, a.brokerDensity, `${a.brokerDensity} מתווכים/שכונה`)),
  };
}

/** SWOT from evidence (Part 5). */
export function swot(target: OfficeAggregate, aggs: OfficeAggregate[], listings: AttributedListing[]): Swot {
  const cityLuxury = listings.filter((l) => l.luxury).length;
  const cityCommercial = listings.filter((l) => l.commercial).length;
  const avgBrokers = aggs.length ? aggs.reduce((s, a) => s + a.brokers, 0) / aggs.length : 0;
  const avgCoverage = aggs.length ? aggs.reduce((s, a) => s + a.neighborhoods.length, 0) / aggs.length : 0;
  const strengths: SwotItem[] = [], weaknesses: SwotItem[] = [], opportunities: SwotItem[] = [], threats: SwotItem[] = [];

  const luxShare = pct(target.luxury, cityLuxury);
  if (luxShare >= 40) strengths.push({ text: "דומיננטיות יוקרה גבוהה", evidence: `${luxShare}% ממודעות היוקרה בעיר שייכות למשרד` });
  if (target.brokers >= Math.max(3, avgBrokers * 1.5)) strengths.push({ text: "רשת מתווכים גדולה", evidence: `${target.brokers} מתווכים פעילים (ממוצע ${Math.round(avgBrokers)})` });
  if (target.neighborhoods.length >= Math.max(3, avgCoverage * 1.3)) strengths.push({ text: "כיסוי שכונתי מצוין", evidence: `נוכחות ב-${target.neighborhoods.length} שכונות` });

  if (cityCommercial > 0 && pct(target.commercial, cityCommercial) < 5) weaknesses.push({ text: "נוכחות מסחרית חלשה מאוד", evidence: `${pct(target.commercial, cityCommercial)}% מהשוק המסחרי בעיר` });
  if (target.brokerDensity < (aggs.reduce((s, a) => s + a.brokerDensity, 0) / Math.max(1, aggs.length)) * 0.5) weaknesses.push({ text: "צפיפות מתווכים נמוכה", evidence: `${target.brokerDensity} מתווכים/שכונה` });

  const growingComp = aggs.find((a) => a.officeId !== target.officeId && a.growthPct >= 30);
  if (growingComp) threats.push({ text: "מתחרה בצמיחה מהירה", evidence: `${growingComp.officeName} +${growingComp.growthPct}% ב-60 יום` });
  if (target.momentum === "declining") threats.push({ text: "אובדן דומיננטיות", evidence: `ירידה ב-${Math.abs(target.growthPct)}% במודעות אחרונות` });

  const weakComp = aggs.find((a) => a.officeId !== target.officeId && a.momentum === "declining" && a.rank <= 3);
  if (weakComp) opportunities.push({ text: "מתחרה נחלש", evidence: `${weakComp.officeName} בירידה (${weakComp.growthPct}%)` });

  return { strengths, weaknesses, opportunities, threats };
}

/** Opportunity detector (Part 6). */
export function detectOpportunities(listings: AttributedListing[]): Opportunity[] {
  const out: Opportunity[] = [];
  const byNbr = new Map<string, AttributedListing[]>();
  for (const l of listings) { if (!l.neighborhood) continue; (byNbr.get(l.neighborhood) ?? byNbr.set(l.neighborhood, []).get(l.neighborhood)!).push(l); }
  for (const [nbr, ls] of byNbr) {
    const active = ls.filter((l) => l.active).length;
    const offices = new Set(ls.map((l) => l.officeId).filter(Boolean)).size;
    if (active >= 5 && offices <= 2) out.push({ title: "היצע גבוה, מעט משרדים", area: nbr, reason: "ביקוש/היצע גבוה עם תחרות נמוכה", evidence: `${active} מודעות פעילות · ${offices} משרדים` });
    const luxury = ls.filter((l) => l.luxury).length;
    if (luxury >= 3 && Math.round((luxury / Math.max(1, ls.length)) * 100) >= 40) out.push({ title: "שוק יוקרה צומח", area: nbr, reason: "ריכוז יוקרה גבוה", evidence: `${luxury} מודעות יוקרה ב${nbr}` });
    const commercial = ls.filter((l) => l.commercial).length;
    const brokers = new Set(ls.map((l) => l.brokerId).filter(Boolean)).size;
    if (commercial >= 3 && brokers <= 2) out.push({ title: "אזור מסחרי עם מעט מתווכים", area: nbr, reason: "מסחר עם תחרות מתווכים נמוכה", evidence: `${commercial} מסחרי · ${brokers} מתווכים` });
  }
  return out.slice(0, 8);
}

/** Strategic insights, each citing evidence (Parts 7/10). */
export function strategicInsights(aggs: OfficeAggregate[], listings: AttributedListing[]): StrategicInsight[] {
  const out: StrategicInsight[] = [];
  for (const a of aggs.slice(0, 6)) {
    const delta = a.recent60 - a.prior60;
    if (delta >= 3) out.push({ text: `${a.officeName} הוסיף ${delta} מודעות פעילות ב-60 הימים האחרונים.`, evidence: `${a.recent60} לעומת ${a.prior60} בתקופה הקודמת` });
    else if (delta <= -3) out.push({ text: `${a.officeName} בירידה — פחות ${Math.abs(delta)} מודעות ב-60 יום.`, evidence: `${a.recent60} לעומת ${a.prior60}` });
  }
  const cityLuxury = listings.filter((l) => l.luxury).length;
  const luxLeader = [...aggs].sort((x, y) => y.luxury - x.luxury)[0];
  if (luxLeader && cityLuxury > 0 && pct(luxLeader.luxury, cityLuxury) >= 50) out.push({ text: `${luxLeader.officeName} שולט ביוקרה — ${pct(luxLeader.luxury, cityLuxury)}% מהמודעות מעל ₪${LUX / 1_000_000}M שייכות לו.`, evidence: `${luxLeader.luxury}/${cityLuxury} מודעות יוקרה` });
  const leader = aggs[0];
  if (leader) out.push({ text: `${leader.officeName} מדורג #1 כי הוא מחזיק ${leader.listingSharePct}% מהמלאי הפעיל ב-${leader.neighborhoods.length} שכונות.`, evidence: `${leader.activeListings} מודעות פעילות` });
  return out.slice(0, 10);
}

export { momentumOf, trend };
