/**
 * Transactions Intelligence Engine — deterministic, client-safe, NO LLM,
 * no server imports. Hebrew-aware normalization of real sold transactions plus
 * comparable-based valuation, building/street aggregation, confidence scoring
 * and the opportunity radar. Uses ONLY real transaction inputs — never invents
 * missing data; returns an explicit "insufficient" signal instead.
 */

export const TRANSACTIONS_SOURCE = "govmap_transactions";
export const TRANSACTIONS_ACTOR_NAME = "Israel Real Estate Transactions - Official Sold Prices";

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, Math.round(n)));

// ── Normalization utilities (Hebrew-aware) ───────────────────────────────────

/** Collapse Hebrew/Latin punctuation, geresh/gershayim and whitespace. */
function cleanText(v: string): string {
  return v
    .replace(/[׳״'"`׳״]/g, "") // gershayim/geresh + quotes
    .replace(/[.,/\\()[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STREET_PREFIXES = ["רחוב", "רח", "שדרות", "שד", "סמטת", "סמ", "דרך", "שכונת", "כיכר"];

export function normalizeStreetName(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = cleanText(String(v));
  // Strip a leading street prefix word.
  for (const p of STREET_PREFIXES) {
    if (s.startsWith(p + " ")) { s = s.slice(p.length + 1).trim(); break; }
    if (s === p) return null;
  }
  // Drop a trailing house number (we track it separately).
  s = s.replace(/\s+\d+[א-ת]?$/u, "").trim();
  return s || null;
}

export function normalizeCityName(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = cleanText(String(v));
  return s || null;
}

export function normalizeNeighborhoodName(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = cleanText(String(v));
  if (s.startsWith("שכונת ")) s = s.slice("שכונת ".length).trim();
  return s || null;
}

/** Extract a house number from a free-form Hebrew address. */
export function extractHouseNumber(address: string | null | undefined): string | null {
  if (!address) return null;
  const m = String(address).match(/(\d+[א-ת]?)/u);
  return m ? m[1] : null;
}

/** Stable normalized address key: "street houseNumber" (lowercased, cleaned). */
export function normalizeTransactionAddress(input: { address?: string | null; street?: string | null; streetNumber?: string | null }): string | null {
  const street = normalizeStreetName(input.street ?? input.address ?? null);
  const houseNumber = (input.streetNumber && String(input.streetNumber).trim())
    || extractHouseNumber(input.address ?? input.street ?? null);
  if (!street) return input.address ? cleanText(input.address) || null : null;
  return houseNumber ? `${street} ${houseNumber}` : street;
}

export function normalizeTransactionRooms(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 30) return null;
  return Math.round(n * 2) / 2; // nearest half-room
}

export function normalizeTransactionArea(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 100_000) return null;
  return Math.round(n);
}

export function normalizeDealAmount(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export function calculatePricePerSqm(dealAmount: number | null, area: number | null, provided?: unknown): number | null {
  const p = provided == null ? null : (typeof provided === "number" ? provided : parseFloat(String(provided).replace(/[^\d.]/g, "")));
  if (p != null && Number.isFinite(p) && p > 0) return Math.round(p);
  if (dealAmount && area && area > 0) return Math.round(dealAmount / area);
  return null;
}

export function normalizeDealDate(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  // ISO-ish
  const iso = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  // DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
}

// ── Transaction shape used by aggregation/valuation ──────────────────────────
export interface TxnComparable {
  id: string;
  deal_date: string | null;
  deal_amount: number | null;
  price_per_sqm: number | null;
  address: string | null;
  normalized_address: string | null;
  city_name: string | null;
  neighborhood_name: string | null;
  street: string | null;
  rooms: number | null;
  area: number | null;
  property_type: string | null;
}

/** In-memory dedup by asset/fallback key (defensive; DB also enforces). */
export function deduplicateTransactions<T extends { asset_id?: string | null; organization_id?: string; city_name?: string | null; normalized_address?: string | null; deal_date?: string | null; deal_amount?: number | null; area?: number | null }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = r.asset_id
      ? `a:${r.asset_id}`
      : `f:${r.city_name ?? ""}|${r.normalized_address ?? ""}|${r.deal_date ?? ""}|${r.deal_amount ?? ""}|${r.area ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

// ── Statistics ───────────────────────────────────────────────────────────────
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const avg = (xs: number[]): number | null => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

export interface PriceStats { count: number; avgPpsqm: number | null; medianPpsqm: number | null; minPpsqm: number | null; maxPpsqm: number | null; avgDeal: number | null }

export function priceStats(txns: TxnComparable[]): PriceStats {
  const pp = txns.map((t) => t.price_per_sqm).filter((n): n is number => !!n && n > 0);
  const amt = txns.map((t) => t.deal_amount).filter((n): n is number => !!n && n > 0);
  return { count: txns.length, avgPpsqm: avg(pp), medianPpsqm: median(pp), minPpsqm: pp.length ? Math.min(...pp) : null, maxPpsqm: pp.length ? Math.max(...pp) : null, avgDeal: avg(amt) };
}

/** Percent price trend: recent-window avg ppsqm vs the prior window. */
export function priceTrend(txns: TxnComparable[], months: number, now = new Date()): number | null {
  const recentFrom = new Date(now); recentFrom.setMonth(recentFrom.getMonth() - months);
  const priorFrom = new Date(now); priorFrom.setMonth(priorFrom.getMonth() - months * 2);
  const recent: number[] = []; const prior: number[] = [];
  for (const t of txns) {
    if (!t.deal_date || !t.price_per_sqm) continue;
    const d = new Date(t.deal_date);
    if (d >= recentFrom) recent.push(t.price_per_sqm);
    else if (d >= priorFrom) prior.push(t.price_per_sqm);
  }
  const r = avg(recent); const p = avg(prior);
  if (!r || !p) return null;
  return Math.round(((r - p) / p) * 1000) / 10; // one decimal percent
}

// ── Comparable selection + valuation ─────────────────────────────────────────
export interface ResearchInput {
  cityName: string | null;
  neighborhoodName: string | null;
  normalizedAddress: string | null;
  street: string | null;
  rooms: number | null;
  area: number | null;
  askingPrice: number | null;
}

export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient";

export interface ResearchResult {
  comparables: TxnComparable[];
  comparableScope: "address" | "street" | "neighborhood" | "city" | "none";
  avgPpsqm: number | null;
  medianPpsqm: number | null;
  minPpsqm: number | null;
  maxPpsqm: number | null;
  estimatedMarketValue: number | null;
  askingPpsqm: number | null;
  gapFromMarketPercent: number | null;
  confidenceScore: number;
  confidenceLevel: ConfidenceLevel;
  explanationHebrew: string;
}

const roomsClose = (a: number | null, b: number | null) => a == null || b == null || Math.abs(a - b) <= 0.5;
const areaClose = (a: number | null, b: number | null) => a == null || b == null || Math.abs(a - b) <= b * 0.2;

/** Select comparables narrowing widest→narrowest, then value the property. */
export function researchProperty(input: ResearchInput, pool: TxnComparable[]): ResearchResult {
  const city = input.cityName ? normalizeCityName(input.cityName) : null;
  const hood = input.neighborhoodName ? normalizeNeighborhoodName(input.neighborhoodName) : null;
  const street = input.street ? normalizeStreetName(input.street) : (input.normalizedAddress ? normalizeStreetName(input.normalizedAddress) : null);

  const sameCity = pool.filter((t) => !city || normalizeCityName(t.city_name) === city);
  const byAddress = input.normalizedAddress ? sameCity.filter((t) => t.normalized_address === input.normalizedAddress) : [];
  const byStreet = street ? sameCity.filter((t) => normalizeStreetName(t.street ?? t.normalized_address) === street) : [];
  const byHood = hood ? sameCity.filter((t) => normalizeNeighborhoodName(t.neighborhood_name) === hood) : [];

  // Similarity filter (rooms/area) applied within the chosen scope.
  const similar = (xs: TxnComparable[]) => xs.filter((t) => roomsClose(input.rooms, t.rooms) && areaClose(input.area, t.area));

  let scope: ResearchResult["comparableScope"] = "none";
  let comparables: TxnComparable[] = [];
  if (similar(byAddress).length >= 1) { scope = "address"; comparables = similar(byAddress); }
  else if (similar(byStreet).length >= 3) { scope = "street"; comparables = similar(byStreet); }
  else if (similar(byHood).length >= 3) { scope = "neighborhood"; comparables = similar(byHood); }
  else if (similar(sameCity).length >= 3) { scope = "city"; comparables = similar(sameCity); }
  else if (byHood.length >= 1) { scope = "neighborhood"; comparables = byHood; }
  else if (sameCity.length >= 1) { scope = "city"; comparables = sameCity; }

  // Prefer recent — sort by date desc and cap.
  comparables = [...comparables].sort((a, b) => (b.deal_date ?? "").localeCompare(a.deal_date ?? "")).slice(0, 40);

  const stats = priceStats(comparables);
  const estimatedMarketValue = stats.medianPpsqm && input.area ? Math.round(stats.medianPpsqm * input.area) : (stats.avgDeal ?? null);
  const askingPpsqm = input.askingPrice && input.area ? Math.round(input.askingPrice / input.area) : null;
  const gapFromMarketPercent = input.askingPrice && estimatedMarketValue && estimatedMarketValue > 0
    ? Math.round(((input.askingPrice - estimatedMarketValue) / estimatedMarketValue) * 1000) / 10
    : null;

  const { score, level } = confidence(scope, comparables.length, input);
  return {
    comparables, comparableScope: scope,
    avgPpsqm: stats.avgPpsqm, medianPpsqm: stats.medianPpsqm, minPpsqm: stats.minPpsqm, maxPpsqm: stats.maxPpsqm,
    estimatedMarketValue, askingPpsqm, gapFromMarketPercent,
    confidenceScore: score, confidenceLevel: level,
    explanationHebrew: explainResearch(scope, comparables.length, estimatedMarketValue, gapFromMarketPercent, level),
  };
}

function confidence(scope: ResearchResult["comparableScope"], n: number, input: ResearchInput): { score: number; level: ConfidenceLevel } {
  if (scope === "none" || n < 1) return { score: 0, level: "insufficient" };
  let s = 0;
  s += Math.min(50, n * 6);
  s += scope === "address" ? 40 : scope === "street" ? 30 : scope === "neighborhood" ? 22 : 10;
  if (input.rooms != null) s += 5;
  if (input.area != null) s += 5;
  const score = clamp(s);
  const high = n >= 8 && (scope === "address" || scope === "street" || scope === "neighborhood");
  const medium = n >= 4 && (scope === "neighborhood" || scope === "street" || scope === "address");
  const level: ConfidenceLevel = n < 4 || scope === "city" ? (n < 4 ? "low" : "low") : high ? "high" : medium ? "medium" : "low";
  // City-only fallback is never high.
  return { score, level: scope === "city" && level === "high" ? "medium" : (n < 3 ? "insufficient" : level) };
}

const SCOPE_LABEL: Record<ResearchResult["comparableScope"], string> = {
  address: "אותו בניין/כתובת", street: "אותו רחוב", neighborhood: "אותה שכונה", city: "אותה עיר", none: "—",
};

function explainResearch(scope: ResearchResult["comparableScope"], n: number, value: number | null, gap: number | null, level: ConfidenceLevel): string {
  if (level === "insufficient" || n < 1) return "אין מספיק עסקאות דומות כדי לקבוע בביטחון גבוה.";
  const parts = [`נמצאו ${n} עסקאות אמת ב${SCOPE_LABEL[scope]}.`];
  if (value) parts.push(`שווי שוק משוער: ${value.toLocaleString("he-IL")}₪.`);
  if (gap != null) parts.push(gap <= -5 ? `המחיר המבוקש כ-${Math.abs(gap)}% מתחת לשוק.` : gap >= 8 ? `המחיר המבוקש כ-${gap}% מעל השוק.` : "המחיר המבוקש קרוב לשוק.");
  parts.push(`רמת ביטחון: ${level === "high" ? "גבוהה" : level === "medium" ? "בינונית" : "נמוכה"}.`);
  return parts.join(" ");
}

// ── Building intelligence ────────────────────────────────────────────────────
export interface BuildingResult {
  transactionsCount: number;
  lastTransactionDate: string | null;
  avgPpsqm: number | null; medianPpsqm: number | null; minPpsqm: number | null; maxPpsqm: number | null;
  avgDeal: number | null; trend12m: number | null; trend24m: number | null;
  confidenceScore: number; summaryHebrew: string;
}

export function buildingIntelligence(txns: TxnComparable[]): BuildingResult {
  const stats = priceStats(txns);
  const last = txns.map((t) => t.deal_date).filter(Boolean).sort().slice(-1)[0] ?? null;
  const trend12 = priceTrend(txns, 12); const trend24 = priceTrend(txns, 24);
  const score = clamp(Math.min(60, txns.length * 10) + (stats.medianPpsqm ? 25 : 0) + (trend12 != null ? 15 : 0));
  const summary = txns.length
    ? `${txns.length} עסקאות בבניין · מחיר חציוני למ״ר ${stats.medianPpsqm?.toLocaleString("he-IL") ?? "—"}₪${trend12 != null ? ` · מגמה 12ח׳ ${trend12 > 0 ? "+" : ""}${trend12}%` : ""}.`
    : "אין עסקאות מתועדות בבניין זה.";
  return { transactionsCount: txns.length, lastTransactionDate: last, avgPpsqm: stats.avgPpsqm, medianPpsqm: stats.medianPpsqm, minPpsqm: stats.minPpsqm, maxPpsqm: stats.maxPpsqm, avgDeal: stats.avgDeal, trend12m: trend12, trend24m: trend24, confidenceScore: score, summaryHebrew: summary };
}

// ── Street intelligence ──────────────────────────────────────────────────────
export interface StreetResult {
  transactionsCount: number;
  avgPpsqm: number | null; medianPpsqm: number | null; minPpsqm: number | null; maxPpsqm: number | null; avgDeal: number | null;
  trend6m: number | null; trend12m: number | null; trend24m: number | null;
  liquidityScore: number | null; streetScore: number | null; confidenceScore: number; summaryHebrew: string;
}

export function streetIntelligence(txns: TxnComparable[], now = new Date()): StreetResult {
  const stats = priceStats(txns);
  const t6 = priceTrend(txns, 6, now); const t12 = priceTrend(txns, 12, now); const t24 = priceTrend(txns, 24, now);
  // Liquidity: deals in last 12 months relative to a 12-deal ideal.
  const yearAgo = new Date(now); yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const recent = txns.filter((t) => t.deal_date && new Date(t.deal_date) >= yearAgo).length;
  const liquidity = clamp(Math.min(100, recent * 8));
  // Street score blends liquidity + positive trend + sample size.
  const trendComponent = t12 != null ? clamp(50 + t12 * 2) : 50;
  const streetScore = txns.length ? clamp(liquidity * 0.45 + trendComponent * 0.35 + Math.min(100, txns.length * 5) * 0.2) : null;
  const score = clamp(Math.min(60, txns.length * 8) + (stats.medianPpsqm ? 25 : 0) + (t12 != null ? 15 : 0));
  const summary = txns.length
    ? `${txns.length} עסקאות ברחוב · חציון למ״ר ${stats.medianPpsqm?.toLocaleString("he-IL") ?? "—"}₪ · נזילות ${liquidity}${t12 != null ? ` · מגמה 12ח׳ ${t12 > 0 ? "+" : ""}${t12}%` : ""}.`
    : "אין עסקאות מתועדות ברחוב זה.";
  return { transactionsCount: txns.length, avgPpsqm: stats.avgPpsqm, medianPpsqm: stats.medianPpsqm, minPpsqm: stats.minPpsqm, maxPpsqm: stats.maxPpsqm, avgDeal: stats.avgDeal, trend6m: t6, trend12m: t12, trend24m: t24, liquidityScore: liquidity, streetScore, confidenceScore: score, summaryHebrew: summary };
}

// ── Opportunity radar ────────────────────────────────────────────────────────
export type OpportunityType = "below_market" | "above_market" | "fair_market" | "price_drop" | "hot_street" | "needs_review" | "not_enough_data";

export interface RadarResult {
  opportunityType: OpportunityType;
  opportunityScore: number;
  reasonHebrew: string;
  recommendedActionHebrew: string;
}

export function detectOpportunity(research: ResearchResult, streetTrend12m: number | null): RadarResult {
  if (research.confidenceLevel === "insufficient" || research.comparableScope === "none") {
    return { opportunityType: "not_enough_data", opportunityScore: 0, reasonHebrew: "אין מספיק עסקאות אמת לקביעת הזדמנות.", recommendedActionHebrew: "הרחב כיסוי דאטה בשכונה זו." };
  }
  const gap = research.gapFromMarketPercent;
  const hotStreet = (streetTrend12m ?? 0) >= 6;
  if (gap != null && gap <= -5) {
    const score = clamp(40 + Math.min(40, Math.abs(gap) * 2) + research.confidenceScore * 0.2 + (hotStreet ? 10 : 0));
    return { opportunityType: "below_market", opportunityScore: score, reasonHebrew: `מחיר מבוקש כ-${Math.abs(gap)}% מתחת לשווי השוק לפי ${research.comparables.length} עסקאות אמת.`, recommendedActionHebrew: "בדוק לגיוס/הצגה לקונה — תמחור אטרקטיבי לפי עסקאות." };
  }
  if (gap != null && gap >= 8) {
    const score = clamp(35 + Math.min(35, gap) + research.confidenceScore * 0.15);
    return { opportunityType: "above_market", opportunityScore: score, reasonHebrew: `מחיר מבוקש כ-${gap}% מעל השוק לפי עסקאות אמת.`, recommendedActionHebrew: "שיחת תמחור עם המוכר מגובה בעסקאות דומות." };
  }
  if (hotStreet) {
    return { opportunityType: "hot_street", opportunityScore: clamp(50 + (streetTrend12m ?? 0) * 2 + research.confidenceScore * 0.2), reasonHebrew: `רחוב מתחזק — מגמת מחירים ${streetTrend12m}% ב-12 חודשים.`, recommendedActionHebrew: "מיקוד גיוס ברחוב המתחזק." };
  }
  if (research.confidenceLevel === "low") {
    return { opportunityType: "needs_review", opportunityScore: clamp(30 + research.confidenceScore * 0.2), reasonHebrew: "פוטנציאל קיים אך מעט עסקאות תומכות.", recommendedActionHebrew: "סקור ידנית והרחב כיסוי עסקאות." };
  }
  return { opportunityType: "fair_market", opportunityScore: clamp(20 + research.confidenceScore * 0.1), reasonHebrew: "המחיר תואם את השוק לפי עסקאות אמת.", recommendedActionHebrew: "אין פעולה נדרשת כעת." };
}

/** Known large cities where one city-wide pull is insufficient. */
export const LARGE_CITIES = ["חיפה", "תל אביב", "תל אביב יפו", "ירושלים", "ראשון לציון", "פתח תקווה", "באר שבע", "נתניה", "אשדוד", "חולון", "רמת גן"];
export const isLargeCity = (city: string | null | undefined) => !!city && LARGE_CITIES.some((c) => normalizeCityName(c) === normalizeCityName(city));
