/**
 * External-listing deal intelligence — pure, deterministic, client-safe.
 * No server imports, no LLM calls. Powers the External Listing Details page,
 * buyer matching, market comparison and double-side deal potential.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const fmtPct = (n: number) => `${n > 0 ? "+" : ""}${Math.round(n)}%`;

// ── Shapes ───────────────────────────────────────────────────────────────────
export interface ListingForDeal {
  id: string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  price: number | null;
  sqm: number | null;
  rooms: number | null;
  hasAgent: boolean | null;
  opportunityScore: number;
}

export interface BuyerForMatch {
  id: string;
  name: string;
  budgetMin: number | null;
  budgetMax: number | null;
  roomsMin: number | null;
  roomsMax: number | null;
  areas: string[];
  readiness: number | null; // 0..100
  hasPreapproval: boolean;
  conversionProbability: number | null; // 0..100 (from buyer intelligence)
}

export interface BuyerMatch {
  buyerId: string;
  name: string;
  matchScore: number; // 0..100
  compatibilityScore: number; // 0..100
  closingProbability: number; // 0..100
  commissionOpportunity: number; // ₪ estimate
  reasons: string[];
  nextAction: string;
}

export interface MarketIntel {
  pricePerSqm: number | null;
  neighborhoodAvgSqm: number | null;
  cityAvgSqm: number | null;
  vsNeighborhoodPct: number | null; // negative = below average
  vsCityPct: number | null;
  percentile: number | null; // price-per-sqm ranking within city (0 = cheapest)
  competingCount: number;
  competitiveness: number; // 0..100 (fewer competitors / cheaper = higher)
  belowNeighborhood: boolean;
  belowCity: boolean;
}

const BROKER_FEE = 0.02; // 2% estimate per side (commission opportunity)

// ── Buyer matching ─────────────────────────────────────────────────────────
function areaMatch(listing: ListingForDeal, b: BuyerForMatch): boolean | null {
  if (!b.areas.length) return null; // no area preference → neutral
  if (!listing.city) return null;
  return b.areas.some((a) => a && (a === listing.city || a.includes(listing.city!) || listing.city!.includes(a) || (listing.neighborhood != null && a.includes(listing.neighborhood))));
}

export function matchBuyerToListing(listing: ListingForDeal, b: BuyerForMatch): BuyerMatch | null {
  const p = listing.price;
  // HARD budget gate — a buyer never matches a listing materially over their
  // max budget (allow a 10% stretch), nor one far below their min (wrong segment).
  if (p != null) {
    if (b.budgetMax != null && p > b.budgetMax * 1.1) return null;
    if (b.budgetMin != null && p < b.budgetMin * 0.6) return null;
  }

  // Budget fit (within gate)
  let budgetFit: number;
  if (p == null) budgetFit = 50;
  else if ((b.budgetMin == null || p >= b.budgetMin) && (b.budgetMax == null || p <= b.budgetMax)) budgetFit = 100; // in range
  else if (b.budgetMax != null && p > b.budgetMax) budgetFit = 55; // 0–10% stretch over max
  else budgetFit = 75; // below min but affordable

  // Rooms fit
  let roomsFit: number;
  const r = listing.rooms;
  if (r == null || (b.roomsMin == null && b.roomsMax == null)) roomsFit = 60;
  else if ((b.roomsMin == null || r >= b.roomsMin) && (b.roomsMax == null || r <= b.roomsMax)) roomsFit = 100;
  else roomsFit = 40;

  // Area fit
  const am = areaMatch(listing, b);
  const areaFit = am == null ? 60 : am ? 100 : 20;

  const compatibility = clamp(budgetFit * 0.45 + roomsFit * 0.25 + areaFit * 0.3);
  // Require a real budget/area signal to surface the match at all.
  const hasCriteria = b.budgetMin != null || b.budgetMax != null || b.areas.length > 0;
  if (!hasCriteria || compatibility < 45) return null;

  const readiness = b.readiness ?? 50;
  const conv = b.conversionProbability ?? readiness;
  const closingProbability = clamp(compatibility * 0.45 + readiness * 0.25 + conv * 0.2 + (b.hasPreapproval ? 10 : 0));
  const matchScore = clamp(compatibility * 0.6 + closingProbability * 0.4);
  const commissionOpportunity = p != null ? Math.round(p * BROKER_FEE) : 0;

  const reasons: string[] = [];
  if (budgetFit >= 100) reasons.push("בתוך תקציב הקונה");
  else if (budgetFit >= 55) reasons.push("קרוב לתקציב הקונה");
  if (am) reasons.push("באזור המבוקש");
  if (roomsFit >= 100) reasons.push("מספר חדרים מתאים");
  if (b.hasPreapproval) reasons.push("מימון מאושר");
  if (!reasons.length) reasons.push("התאמה כללית");

  const nextAction = b.hasPreapproval
    ? "תאם הצגה — הקונה מאושר מימון"
    : closingProbability >= 65
      ? "צור קשר עם הקונה ותאם ביקור"
      : "שלח פרטים ובדוק עניין";

  return { buyerId: b.id, name: b.name, matchScore, compatibilityScore: compatibility, closingProbability, commissionOpportunity, reasons, nextAction };
}

export function matchBuyersToListing(listing: ListingForDeal, buyers: BuyerForMatch[]): BuyerMatch[] {
  return buyers
    .map((b) => matchBuyerToListing(listing, b))
    .filter((m): m is BuyerMatch => m != null)
    .sort((a, b) => b.matchScore - a.matchScore);
}

// ── Market intelligence ──────────────────────────────────────────────────────
const sqmPriceOf = (l: { price: number | null; sqm: number | null }) => (l.price && l.sqm ? l.price / l.sqm : null);
function avgSqm(list: { price: number | null; sqm: number | null }[]): number | null {
  const vals = list.map(sqmPriceOf).filter((v): v is number => v != null && v > 0);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

export function marketIntel(
  listing: ListingForDeal,
  cityListings: { id: string; price: number | null; sqm: number | null }[],
  neighborhoodListings: { id: string; price: number | null; sqm: number | null }[],
): MarketIntel {
  const pricePerSqm = sqmPriceOf(listing);
  const cityAvg = avgSqm(cityListings.filter((l) => l.id !== listing.id));
  const hoodAvg = avgSqm(neighborhoodListings.filter((l) => l.id !== listing.id));

  const vsCityPct = pricePerSqm != null && cityAvg ? ((pricePerSqm - cityAvg) / cityAvg) * 100 : null;
  const vsNeighborhoodPct = pricePerSqm != null && hoodAvg ? ((pricePerSqm - hoodAvg) / hoodAvg) * 100 : null;

  // Percentile of this listing's ₪/m² within the city (0 = cheapest, 100 = priciest).
  let percentile: number | null = null;
  if (pricePerSqm != null) {
    const others = cityListings.map(sqmPriceOf).filter((v): v is number => v != null && v > 0);
    if (others.length) percentile = clamp((others.filter((v) => v < pricePerSqm).length / others.length) * 100);
  }

  const competingCount = Math.max(0, neighborhoodListings.filter((l) => l.id !== listing.id).length);
  // Fewer competitors + cheaper than market → more competitive opportunity.
  let competitiveness = 50;
  if (competingCount <= 2) competitiveness += 20;
  else if (competingCount >= 8) competitiveness -= 15;
  if (vsNeighborhoodPct != null && vsNeighborhoodPct <= -10) competitiveness += 20;
  else if (vsNeighborhoodPct != null && vsNeighborhoodPct >= 10) competitiveness -= 15;

  return {
    pricePerSqm: pricePerSqm != null ? Math.round(pricePerSqm) : null,
    neighborhoodAvgSqm: hoodAvg != null ? Math.round(hoodAvg) : null,
    cityAvgSqm: cityAvg != null ? Math.round(cityAvg) : null,
    vsNeighborhoodPct: vsNeighborhoodPct != null ? Math.round(vsNeighborhoodPct) : null,
    vsCityPct: vsCityPct != null ? Math.round(vsCityPct) : null,
    percentile,
    competingCount,
    competitiveness: clamp(competitiveness),
    belowNeighborhood: vsNeighborhoodPct != null && vsNeighborhoodPct <= -5,
    belowCity: vsCityPct != null && vsCityPct <= -5,
  };
}

// ── Double-side deal potential ───────────────────────────────────────────────
export interface DealPotentialInput {
  buyerMatches: number;
  topBuyerReadiness: number; // 0..100
  competitiveness: number; // 0..100
  privateOwner: boolean;
  localityActivity: number; // # of active listings in city
  priceDropped: boolean;
}

/** 0..100 likelihood this external listing becomes a double-side (דו״צ) deal. */
export function calculateExternalDealPotential(i: DealPotentialInput): number {
  let s = 10;
  s += Math.min(35, i.buyerMatches * 12); // matched buyers are the biggest driver
  s += i.topBuyerReadiness * 0.2;
  s += i.competitiveness * 0.15;
  if (i.privateOwner) s += 12; // private owner = easier to win the seller side
  if (i.priceDropped) s += 6;
  if (i.localityActivity >= 5) s += 6; // active market
  return clamp(s);
}

// ── "Why this listing matters" + deterministic AI-ready text ─────────────────
export interface WhyInput {
  market: MarketIntel;
  privateOwner: boolean;
  priceDropCount: number;
  buyerMatches: number;
  duplicate: boolean;
}

export function whyItMatters(i: WhyInput): string[] {
  const out: string[] = [];
  if (i.market.vsNeighborhoodPct != null && i.market.vsNeighborhoodPct <= -5)
    out.push(`${Math.abs(i.market.vsNeighborhoodPct)}% מתחת לממוצע השכונה`);
  else if (i.market.vsCityPct != null && i.market.vsCityPct <= -5)
    out.push(`${Math.abs(i.market.vsCityPct)}% מתחת לממוצע העיר`);
  if (i.privateOwner) out.push("מודעת בעלים פרטי");
  if (i.priceDropCount >= 2) out.push(`המחיר ירד ${i.priceDropCount} פעמים`);
  else if (i.priceDropCount === 1) out.push("ירידת מחיר לאחרונה");
  if (i.buyerMatches > 0) out.push(`תואם ${i.buyerMatches} קונים פעילים`);
  if (i.market.competingCount <= 2) out.push("מעט מודעות מתחרות באזור");
  if (i.duplicate) out.push("חשד לכפילות מול מודעה אחרת");
  if (!out.length) out.push("מודעה למעקב — אין סיגנל חזק כרגע");
  return out;
}

export interface AiFieldsInput {
  listing: ListingForDeal;
  market: MarketIntel;
  buyerMatches: BuyerMatch[];
  dealPotential: number;
  privateOwner: boolean;
  priceDropCount: number;
}

export interface AiFields {
  ai_summary: string;
  ai_opportunity_summary: string;
  ai_buyer_strategy: string;
  ai_acquisition_strategy: string;
}

/** Deterministic, template-based text (no LLM). Field names are AI-ready. */
export function buildAiFields(i: AiFieldsInput): AiFields {
  const l = i.listing;
  const loc = [l.neighborhood, l.city].filter(Boolean).join(", ") || "מיקום לא ידוע";
  const priceTxt = l.price ? `${l.price.toLocaleString("he-IL")} ₪` : "ללא מחיר";
  const sqmTxt = l.sqm ? `${l.sqm} מ״ר` : "שטח לא ידוע";
  const roomsTxt = l.rooms ? `${l.rooms} חד׳` : "";

  const vs = i.market.vsNeighborhoodPct ?? i.market.vsCityPct;
  const priceStance = vs == null ? "במחיר תואם שוק" : vs <= -5 ? `אטרקטיבי (${fmtPct(vs)} מול הממוצע)` : vs >= 5 ? `מעל הממוצע (${fmtPct(vs)})` : "תואם שוק";

  const ai_summary = `${roomsTxt ? roomsTxt + ", " : ""}${sqmTxt} ב${loc}. מחיר ${priceTxt} — ${priceStance}. מקור חיצוני, מידע ציבורי בלבד.`;

  const drivers = whyItMatters({ market: i.market, privateOwner: i.privateOwner, priceDropCount: i.priceDropCount, buyerMatches: i.buyerMatches.length, duplicate: false });
  const ai_opportunity_summary = `פוטנציאל דו״צ ${i.dealPotential}/100. ${drivers.slice(0, 3).join(" · ")}.`;

  const top = i.buyerMatches[0];
  const ai_buyer_strategy = i.buyerMatches.length
    ? `${i.buyerMatches.length} קונים מתאימים. הקונה החזק: ${top.name} (התאמה ${top.matchScore}, סגירה ${top.closingProbability}%). ${top.nextAction}.`
    : "אין כרגע קונים פעילים תואמים. שמור למעקב והרץ התאמה מחדש לאחר עדכון מאגר הקונים.";

  const ai_acquisition_strategy = i.privateOwner
    ? `בעלים פרטי — הזדמנות גיוס בלעדיות. צור קשר, הצג ערך (חשיפה + קונים תואמים), והצע ייצוג. ${i.buyerMatches.length ? `יש כבר ${i.buyerMatches.length} קונים פוטנציאליים — מנוף לשיחה.` : ""}`
    : `מודעת מתווך — אפשר לפנות לבדיקת שיתוף פעולה / קונה. אין לפרסם כנכס בבלעדיות המשרד.`;

  return { ai_summary, ai_opportunity_summary, ai_buyer_strategy, ai_acquisition_strategy };
}
