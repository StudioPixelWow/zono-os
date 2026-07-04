// ============================================================================
// 🏘️ ZONO — Street & Building Intelligence (pure). 34.1.
// The MISSING geographic granularity for inventory acquisition: it aggregates
// PUBLIC transaction activity (from property_transactions) down to the STREET and
// BUILDING level and ranks recruitment opportunities. It does NOT duplicate the
// existing Seller Intelligence / Exclusive Acquisition engine (which owns seller
// scoring, pipeline, playbooks, touchpoints) — it feeds it finer targets. Every
// recommendation explains WHY; read-only; nothing executes.
// ============================================================================

export interface TxInput {
  city: string | null; street: string | null; gush: string | null; helka: string | null;
  address: string | null; price: number | null; ppsqm: number | null; date: string | null;
  rooms: number | null; area: number | null;
}

export interface StreetIntel {
  key: string; city: string | null; street: string;
  transactions: number; recentDeals: number; avgPrice: number | null; avgPpsqm: number | null;
  lastDealDate: string | null; luxuryShare: number; ourListings: number | null; marketShare: number | null;
  recruitmentScore: number; opportunity: "high" | "medium" | "low"; aiRecommendation: string; evidence: string[];
}

export interface BuildingIntel {
  key: string; label: string; city: string | null;
  transactions: number; avgPrice: number | null; luxuryScore: number; opportunityScore: number;
  recruitmentPriority: "high" | "medium" | "low"; evidence: string[];
}

export interface StreetBuildingIntelligence {
  streets: StreetIntel[]; buildings: BuildingIntel[];
  summary: { streets: number; buildings: number; activeStreets: number; highOpportunity: number; avgRecruitment: number };
  notes: string[];
}

const DAY = 86_400_000;
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const nf = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);

function opportunityBand(score: number): "high" | "medium" | "low" { return score >= 65 ? "high" : score >= 40 ? "medium" : "low"; }

/** Build street + building intelligence. `ourByStreet` (optional) maps a
 *  normalized "city|street" key → our active listings there (for market share). */
export function buildStreetBuildingIntel(txs: TxInput[], ourByStreet: Map<string, number> = new Map()): StreetBuildingIntelligence {
  const now = Date.now();
  const luxThreshold = (() => { const prices = txs.map((t) => t.price).filter((p): p is number => p != null).sort((a, b) => a - b); return prices.length ? prices[Math.floor(prices.length * 0.8)] : Infinity; })();
  const norm = (s: string) => s.trim().toLowerCase();
  const streetKey = (t: TxInput) => `${norm(t.city ?? "")}|${norm(t.street ?? "")}`;

  // ── Streets ─────────────────────────────────────────────────────────────────
  const byStreet = new Map<string, TxInput[]>();
  for (const t of txs) { if (!t.street) continue; const k = streetKey(t); (byStreet.get(k) ?? byStreet.set(k, []).get(k)!).push(t); }

  const streets: StreetIntel[] = [...byStreet.entries()].map(([key, list]) => {
    const city = list[0].city, street = list[0].street ?? "";
    const prices = list.map((t) => t.price).filter((p): p is number => p != null);
    const ppsqm = list.map((t) => t.ppsqm).filter((p): p is number => p != null && p > 0);
    const dates = list.map((t) => t.date).filter((d): d is string => !!d).sort();
    const recentDeals = list.filter((t) => t.date && now - new Date(t.date).getTime() <= 180 * DAY).length;
    const luxuryShare = prices.length ? (prices.filter((p) => p >= luxThreshold).length / prices.length) * 100 : 0;
    const ourListings = ourByStreet.has(key) ? ourByStreet.get(key)! : null;
    const marketShare = ourListings != null ? clamp((ourListings / (ourListings + list.length)) * 100) : null;

    // Recruitment = market activity + recency + luxury − our presence.
    const recruitmentScore = clamp(Math.min(60, list.length * 6) + Math.min(25, recentDeals * 8) + Math.min(15, luxuryShare * 0.3) - (marketShare ?? 0) * 0.4);
    const opportunity = opportunityBand(recruitmentScore);
    const aiRecommendation = ourListings === 0 || ourListings == null
      ? `${street} פעיל (${list.length} עסקאות) ואין לנו נוכחות — יעד גיוס מלאי מוביל.`
      : marketShare != null && marketShare < 30
        ? `אחיזה נמוכה (${marketShare}%) ברחוב פעיל — כדאי לחזק גיוס בעלים.`
        : `רחוב פעיל — המשיכו לגייס ולשמר נוכחות.`;
    const evidence = [`${list.length} עסקאות`, recentDeals ? `${recentDeals} ב-180 ימים` : "", mean(prices) != null ? `ממוצע ${nf(mean(prices))}` : "", luxuryShare >= 20 ? `${Math.round(luxuryShare)}% יוקרה` : ""].filter(Boolean);
    return { key, city, street, transactions: list.length, recentDeals, avgPrice: mean(prices), avgPpsqm: mean(ppsqm), lastDealDate: dates[dates.length - 1] ?? null, luxuryShare, ourListings, marketShare, recruitmentScore, opportunity, aiRecommendation, evidence };
  }).sort((a, b) => b.recruitmentScore - a.recruitmentScore);

  // ── Buildings (gush/helka, else street+number-ish via address) ──────────────
  const buildingKey = (t: TxInput) => (t.gush && t.helka ? `${t.gush}-${t.helka}` : t.address ? norm(t.address) : null);
  const byBuilding = new Map<string, TxInput[]>();
  for (const t of txs) { const k = buildingKey(t); if (!k) continue; (byBuilding.get(k) ?? byBuilding.set(k, []).get(k)!).push(t); }

  const buildings: BuildingIntel[] = [...byBuilding.entries()].filter(([, l]) => l.length >= 2).map(([key, list]) => {
    const prices = list.map((t) => t.price).filter((p): p is number => p != null);
    const luxuryScore = clamp(prices.length ? (prices.filter((p) => p >= luxThreshold).length / prices.length) * 100 : 0);
    const opportunityScore = clamp(Math.min(70, list.length * 12) + luxuryScore * 0.3);
    const label = list[0].gush && list[0].helka ? `גוש ${list[0].gush} חלקה ${list[0].helka}` : (list[0].address ?? key);
    const evidence = [`${list.length} עסקאות בבניין`, mean(prices) != null ? `ממוצע ${nf(mean(prices))}` : "", luxuryScore >= 40 ? "בניין יוקרה" : ""].filter(Boolean);
    return { key, label, city: list[0].city, transactions: list.length, avgPrice: mean(prices), luxuryScore, opportunityScore, recruitmentPriority: opportunityBand(opportunityScore), evidence };
  }).sort((a, b) => b.opportunityScore - a.opportunityScore);

  const activeStreets = streets.filter((s) => s.recentDeals > 0).length;
  const highOpportunity = streets.filter((s) => s.opportunity === "high").length;
  const avgRecruitment = streets.length ? clamp(streets.reduce((s, x) => s + x.recruitmentScore, 0) / streets.length) : 0;
  const notes: string[] = [];
  if (!streets.length) notes.push("אין עדיין נתוני עסקאות ברמת רחוב — נדרשים נתוני עסקאות ציבוריים.");

  return { streets, buildings, summary: { streets: streets.length, buildings: buildings.length, activeStreets, highOpportunity, avgRecruitment }, notes };
}
