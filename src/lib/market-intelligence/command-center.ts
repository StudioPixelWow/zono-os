// ============================================================================
// ZONO — Market Intelligence COMMAND CENTER · pure derivations (no I/O, no deps).
// ----------------------------------------------------------------------------
// Turns the raw external-market rows into a synthesized command-center view
// model: hero KPIs (with real day-over-day deltas), a prioritized opportunity
// queue (with disclosed reasons), neighborhood ₪/m² intelligence, a REAL
// price-drop event trend, and an HONESTLY GATED long-horizon locality trend that
// returns DATA_REQUIRED when the daily snapshot history is too thin to chart —
// never a fabricated line. Framework-agnostic + dependency-free so it is unit
// tested directly (scripts/fd-closure-tests). NEVER invents a number: an absent
// value is null and disclosed, never a fake 0.
// ============================================================================

export type DealKind = "sale" | "rent" | null;

export interface MiListing {
  id: string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  propertyType: string | null;
  dealType: string | null; // raw source value (sale / rent / rental / …)
  price: number | null;
  sqm: number | null;
  rooms: number | null;
  hasAgent: boolean | null;
  contactPhone: string | null;
  opportunityScore: number | null; // 0..100
  status: string | null;
  firstSeenMs: number | null;
  image: string | null;
  source: string | null;
  /** Optional geocode (present on the cockpit's geographic aggregation path). */
  lat?: number | null;
  lng?: number | null;
}

export interface MiSnapshot {
  date: string;            // YYYY-MM-DD
  localityName: string | null;
  avgPricePerSqm: number | null;
}

export interface CommandCenterInput {
  listings: MiListing[];
  /** All price-change event timestamps (ms) — powers the real price-drop trend. */
  priceEventMs: number[];
  /** Distinct listing ids with a price drop in the recent window (opportunity signal). */
  droppedListingIds: string[];
  /** Daily market_area_snapshots rows — for the gated long-horizon trend. */
  snapshots: MiSnapshot[];
  nowMs: number;
}

export type KpiTone = "brand" | "success" | "warning" | "danger" | "neutral";
export interface Kpi { key: string; label: string; value: number | null; unit: string; delta: number | null; deltaLabel: string | null; tone: KpiTone; hint: string | null }
export interface NeighborhoodStat { name: string; city: string | null; inventory: number; avgPricePerSqm: number | null; belowAvg: number; privateOwner: number; newToday: number }
export interface Opportunity { id: string; title: string; sub: string; reasons: string[]; score: number; price: number | null; image: string | null; href: string }
export interface TrendSeries { labels: string[]; series01: number[]; raw: number[]; total: number }
export type LocalityTrend =
  | { status: "ready"; localityName: string; points: { date: string; value: number }[]; series01: number[] }
  | { status: "data_required"; havePoints: number; needPoints: number };
export interface FeedRow { id: string; title: string; sub: string; meta: string; href: string }

export interface CommandCenter {
  hasData: boolean;
  primary: { label: string; value: number; sub: string };
  kpis: Kpi[];
  neighborhoods: NeighborhoodStat[];
  opportunities: Opportunity[];
  priceDropTrend: TrendSeries | null;
  localityTrend: LocalityTrend;
  feed: FeedRow[];
  sourceMix: { source: string; count: number }[];
  saleCount: number;
  rentCount: number;
  dataConfidence: number; // 0..100
  cities: number;
  neighborhoodsTotal: number;
  generatedAtMs: number;
}

const DAY = 86_400_000;
export const TREND_MIN_POINTS = 6;     // daily snapshots needed before a locality trend is honest
export const TREND_WINDOW_DAYS = 30;   // price-drop event trend window
const BELOW_AVG_RATIO = 0.9;           // ≤ 90% of the area ₪/m² median = "below market"
const OPP_LIMIT = 8;
const NBHD_LIMIT = 8;
const FEED_LIMIT = 16;

/** Canonical sale/rent from a raw source value. Never guesses from price. */
export function dealKind(raw: string | null | undefined): DealKind {
  if (raw == null) return null;
  const v = String(raw).toLowerCase();
  if (v === "rent" || v === "rental" || v === "lease") return "rent";
  if (v === "sale" || v === "project_sale" || v === "sell" || v === "buy") return "sale";
  return null;
}

/** ₪ per m² for a listing, or null when either side is missing/non-positive. */
export function pricePerSqm(l: { price: number | null; sqm: number | null }): number | null {
  if (l.price == null || l.price <= 0 || l.sqm == null || l.sqm <= 0) return null;
  return l.price / l.sqm;
}

/** Median of a numeric list (already finite), or null when empty. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function areaKey(l: MiListing): string { return (l.neighborhood || l.city || "").trim(); }

/** Per-area (neighborhood→city fallback) median ₪/m², from listings that have it. */
function areaMedianPPS(listings: MiListing[]): Map<string, number> {
  const buckets = new Map<string, number[]>();
  for (const l of listings) {
    const pps = pricePerSqm(l);
    const k = areaKey(l);
    if (pps == null || !k) continue;
    (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(pps);
  }
  const out = new Map<string, number>();
  for (const [k, arr] of buckets) { const m = median(arr); if (m != null) out.set(k, m); }
  return out;
}

function normalize01(raw: number[]): number[] {
  const max = raw.reduce((a, b) => Math.max(a, b), 0);
  return max <= 0 ? raw.map(() => 0) : raw.map((v) => v / max);
}

function isoDay(ms: number): string { return new Date(ms).toISOString().slice(0, 10); }

function relTime(ms: number | null, nowMs: number): string {
  if (ms == null) return "";
  const d = Math.max(0, Math.floor((nowMs - ms) / DAY));
  if (d <= 0) return "היום";
  if (d === 1) return "אתמול";
  if (d < 7) return `לפני ${d} ימים`;
  if (d < 30) return `לפני ${Math.floor(d / 7)} שבועות`;
  return `לפני ${Math.floor(d / 30)} חודשים`;
}

/** Build the whole command-center view model from real rows. Pure + deterministic. */
export function buildCommandCenter(input: CommandCenterInput): CommandCenter {
  const { listings, priceEventMs, droppedListingIds, snapshots, nowMs } = input;
  const dropped = new Set(droppedListingIds);
  const areaMed = areaMedianPPS(listings);

  const cities = new Set<string>();
  const nbhds = new Set<string>();
  const sourceCount = new Map<string, number>();
  let saleCount = 0, rentCount = 0, withPPS = 0;
  const allPPS: number[] = [];
  let newToday = 0, newYesterday = 0;

  const belowAvg = (l: MiListing): boolean => {
    const pps = pricePerSqm(l);
    const med = areaMed.get(areaKey(l));
    return pps != null && med != null && med > 0 && pps <= med * BELOW_AVG_RATIO;
  };
  const isPrivateSale = (l: MiListing): boolean =>
    dealKind(l.dealType) === "sale" && l.hasAgent !== true && (l.contactPhone ?? "").trim().length > 0;

  for (const l of listings) {
    if (l.city) cities.add(l.city.trim());
    if (l.neighborhood) nbhds.add(l.neighborhood.trim());
    if (l.source) sourceCount.set(l.source, (sourceCount.get(l.source) ?? 0) + 1);
    const k = dealKind(l.dealType);
    if (k === "sale") saleCount++; else if (k === "rent") rentCount++;
    const pps = pricePerSqm(l);
    if (pps != null) { allPPS.push(pps); withPPS++; }
    if (l.firstSeenMs != null) {
      const age = nowMs - l.firstSeenMs;
      if (age >= 0 && age < DAY) newToday++;
      else if (age >= DAY && age < 2 * DAY) newYesterday++;
    }
  }

  const belowAvgCount = listings.filter(belowAvg).length;
  const privateTargets = listings.filter(isPrivateSale).length;
  const priceDrops7d = priceEventMs.filter((t) => t >= nowMs - 7 * DAY).length;
  const marketPPS = median(allPPS);

  // ── Opportunity queue: prioritized, with disclosed reasons (sale-side). ──────
  // Only listings with ≥1 real signal qualify; ranked by a composite score.
  const opportunities: Opportunity[] = listings
    .map((l): { opp: Opportunity; rank: number } => {
      const reasons: string[] = [];
      let score = l.opportunityScore ?? 0;
      const pps = pricePerSqm(l);
      const med = areaMed.get(areaKey(l));
      if (pps != null && med != null && med > 0 && pps <= med * BELOW_AVG_RATIO) {
        const pctBelow = Math.round((1 - pps / med) * 100);
        reasons.push(`${pctBelow}% מתחת לממוצע ה${l.neighborhood ? "שכונה" : "עיר"}`);
        score += Math.min(40, pctBelow);
      }
      if (isPrivateSale(l)) { reasons.push("בעלים פרטי — פוטנציאל גיוס"); score += 20; }
      if (dropped.has(l.id)) { reasons.push("ירידת מחיר לאחרונה"); score += 15; }
      if ((l.opportunityScore ?? 0) >= 70) reasons.push("ציון הזדמנות גבוה");
      const loc = [l.neighborhood, l.city].filter(Boolean).join(", ");
      const opp: Opportunity = {
        id: l.id, title: (l.title && l.title.trim()) || loc || "נכס", sub: loc,
        reasons, score, price: l.price, image: l.image, href: `/external-listings/${l.id}`,
      };
      return { opp, rank: reasons.length ? score : -1 };
    })
    .filter((x) => x.rank >= 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, OPP_LIMIT)
    .map((x) => x.opp);

  // ── Neighborhood intelligence: real per-area stats, ranked by inventory. ─────
  const areaGroups = new Map<string, MiListing[]>();
  for (const l of listings) { const k = areaKey(l); if (!k) continue; (areaGroups.get(k) ?? areaGroups.set(k, []).get(k)!).push(l); }
  const neighborhoods: NeighborhoodStat[] = [...areaGroups.entries()]
    .map(([name, rows]) => ({
      name,
      city: rows.find((r) => r.city)?.city ?? null,
      inventory: rows.length,
      avgPricePerSqm: median(rows.map(pricePerSqm).filter((x): x is number => x != null)),
      belowAvg: rows.filter(belowAvg).length,
      privateOwner: rows.filter(isPrivateSale).length,
      newToday: rows.filter((r) => r.firstSeenMs != null && nowMs - r.firstSeenMs >= 0 && nowMs - r.firstSeenMs < DAY).length,
    }))
    .sort((a, b) => b.inventory - a.inventory)
    .slice(0, NBHD_LIMIT);

  // ── REAL price-drop event trend (last 30 days), or null when too few events. ─
  let priceDropTrend: TrendSeries | null = null;
  {
    const start = nowMs - TREND_WINDOW_DAYS * DAY;
    const events = priceEventMs.filter((t) => t >= start && t <= nowMs);
    if (events.length >= 3) {
      const raw = new Array(TREND_WINDOW_DAYS).fill(0);
      const labels: string[] = [];
      for (let i = 0; i < TREND_WINDOW_DAYS; i++) labels.push(isoDay(start + i * DAY));
      for (const t of events) {
        const idx = Math.min(TREND_WINDOW_DAYS - 1, Math.max(0, Math.floor((t - start) / DAY)));
        raw[idx]++;
      }
      priceDropTrend = { labels, raw, series01: normalize01(raw), total: events.length };
    }
  }

  // ── Long-horizon locality trend — HONESTLY GATED (DATA_REQUIRED when thin). ──
  let localityTrend: LocalityTrend;
  {
    const byLoc = new Map<string, { date: string; value: number }[]>();
    for (const s of snapshots) {
      const name = (s.localityName ?? "").trim();
      if (!name || s.avgPricePerSqm == null || s.avgPricePerSqm <= 0) continue;
      (byLoc.get(name) ?? byLoc.set(name, []).get(name)!).push({ date: s.date, value: s.avgPricePerSqm });
    }
    let best: { name: string; points: { date: string; value: number }[] } | null = null;
    for (const [name, pts] of byLoc) {
      const sorted = [...pts].sort((a, b) => a.date.localeCompare(b.date));
      if (!best || sorted.length > best.points.length) best = { name, points: sorted };
    }
    if (best && best.points.length >= TREND_MIN_POINTS) {
      localityTrend = { status: "ready", localityName: best.name, points: best.points, series01: normalize01(best.points.map((p) => p.value)) };
    } else {
      localityTrend = { status: "data_required", havePoints: best?.points.length ?? 0, needPoints: TREND_MIN_POINTS };
    }
  }

  // ── Live feed — newest listings first. ──────────────────────────────────────
  const feed: FeedRow[] = [...listings]
    .filter((l) => l.firstSeenMs != null)
    .sort((a, b) => (b.firstSeenMs ?? 0) - (a.firstSeenMs ?? 0))
    .slice(0, FEED_LIMIT)
    .map((l) => {
      const loc = [l.neighborhood, l.city].filter(Boolean).join(", ");
      const price = l.price != null && l.price > 0 ? `₪${Math.round(l.price).toLocaleString("he-IL")}` : "מחיר לא פורסם";
      return { id: l.id, title: (l.title && l.title.trim()) || loc || "נכס", sub: [loc, price].filter(Boolean).join(" · "), meta: relTime(l.firstSeenMs, nowMs), href: `/external-listings/${l.id}` };
    });

  const sourceMix = [...sourceCount.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count);
  const dataConfidence = listings.length ? Math.round((withPPS / listings.length) * 100) : 0;

  const kpis: Kpi[] = [
    { key: "inventory", label: "נכסים במעקב", value: listings.length, unit: "", delta: null, deltaLabel: null, tone: "brand", hint: `${saleCount} למכירה · ${rentCount} להשכרה` },
    { key: "new_today", label: "מודעות חדשות היום", value: newToday, unit: "", delta: newToday - newYesterday, deltaLabel: deltaLabelOf(newToday - newYesterday, "מאתמול"), tone: "success", hint: null },
    { key: "price_drops", label: "ירידות מחיר (7 ימים)", value: priceDrops7d, unit: "", delta: null, deltaLabel: null, tone: "warning", hint: null },
    { key: "below_avg", label: "מתחת למחיר השוק", value: belowAvgCount, unit: "", delta: null, deltaLabel: null, tone: "danger", hint: "≤90% מ-₪/מ״ר האזורי" },
    { key: "private", label: "בעלים פרטי לגיוס", value: privateTargets, unit: "", delta: null, deltaLabel: null, tone: "brand", hint: "למכירה, ללא מתווך" },
    { key: "pps", label: "חציון ₪ למ״ר", value: marketPPS, unit: "", delta: null, deltaLabel: null, tone: "neutral", hint: null },
  ];

  const opportunitiesCount = opportunities.length;
  return {
    hasData: listings.length > 0,
    primary: { label: "הזדמנויות מזוהות היום", value: opportunitiesCount, sub: `מתוך ${listings.length.toLocaleString("he-IL")} נכסים ב-${nbhds.size} שכונות` },
    kpis,
    neighborhoods,
    opportunities,
    priceDropTrend,
    localityTrend,
    feed,
    sourceMix,
    saleCount,
    rentCount,
    dataConfidence,
    cities: cities.size,
    neighborhoodsTotal: nbhds.size,
    generatedAtMs: nowMs,
  };
}

function deltaLabelOf(delta: number, suffix: string): string | null {
  if (delta === 0) return `ללא שינוי ${suffix}`;
  return `${delta > 0 ? "+" : ""}${delta} ${suffix}`;
}

// ============================================================================
// ── COCKPIT LAYER — the full "מרכז מודיעין שוק" model, in this SAME dependency-
//    free module so it stays directly unit-testable. Adds ONE filter scope, a
//    market PULSE (real period-over-period change), switchable time-series (REAL
//    where history supports it — new listings / price reductions; DATA_REQUIRED
//    for inventory & median-₪/m², which the point-in-time data cannot honestly
//    reconstruct), evidence-gated ZONO insights (≤3), neighbourhood comparison,
//    honest geographic aggregation (neighbourhood centroids — never fake
//    polygons), a price-distribution histogram and listing-age (ותק מודעה — NOT
//    time-to-sale). Never fabricates a series, trend, demand or comparison.
// ============================================================================
export const PERIODS = [7, 30, 90] as const;
export type Period = (typeof PERIODS)[number];
const SERIES_WINDOW = 90;          // max daily window computed; the UI slices per period
const DOM_STALE_DAYS = 60;         // "ותק חריג" baseline (listing age, not time-to-sale)
const HISTOGRAM_MIN = 20;          // min priced listings before a distribution is meaningful
const HISTOGRAM_BANDS = 8;
const INSIGHT_MIN_REDUCTIONS = 4;
const INSIGHT_BELOW_PCT = 12;
const INSIGHT_MOMENTUM_MIN = 5;

export interface CockpitFilters {
  city: string | null; neighborhood: string | null; propertyType: string | null;
  deal: "sale" | "rent" | null; roomsMin: number | null; priceMin: number | null; priceMax: number | null; period: Period;
}
export interface PriceEvent { tsMs: number; listingId: string; oldPrice: number | null; newPrice: number | null }
export interface CockpitInput { listings: MiListing[]; priceEvents: PriceEvent[]; snapshots: MiSnapshot[]; filters: CockpitFilters; nowMs: number }

export interface DailyPoint { date: string; value: number }
export interface MetricSeries { key: string; label: string; unit: string; status: "ready" | "data_required"; points: DailyPoint[]; current: number | null; previous: number | null; deltaPct: number | null; note: string | null }
export interface DomBucket { key: string; label: string; count: number }
export interface HistogramBand { lo: number; hi: number; label: string; count: number; isMedianBand: boolean }
export interface PriceHistogram { status: "ready" | "data_required"; bands: HistogramBand[]; median: number | null; scopeCount: number }
export type InsightKind = "reductions_concentration" | "below_benchmark" | "inventory_momentum" | "stale_inventory";
export interface ZonoInsight { id: string; kind: InsightKind; what: string; why: string; action: string | null; href: string; tone: "warning" | "success" | "brand" | "danger" }
export interface CockpitPulse { periodDays: number; newThisPeriod: number; newDeltaPct: number | null; reductionsThisPeriod: number; reductionsDeltaPct: number | null; hottestArea: { name: string; count: number } | null; opportunities: number; headline: string }
export interface AreaGeo { name: string; city: string | null; lat: number | null; lng: number | null; inventory: number; reductions: number; newInPeriod: number; avgPricePerSqm: number | null }
export interface Facets { cities: string[]; neighborhoods: string[]; propertyTypes: string[]; roomsOptions: number[]; priceMin: number; priceMax: number }
export interface DataQuality { sources: { source: string; count: number }[]; geocodedPct: number; priceSqmPct: number; freshnessDays: number | null; warnings: string[] }
export interface MarketCockpit {
  hasData: boolean; totalCount: number; scopedCount: number; filters: CockpitFilters; facets: Facets;
  pulse: CockpitPulse; kpis: Kpi[]; series: MetricSeries[]; zonoInsights: ZonoInsight[];
  neighborhoods: NeighborhoodStat[]; geo: AreaGeo[]; opportunities: Opportunity[]; opportunitiesTotal: number;
  priceHistogram: PriceHistogram; dom: { buckets: DomBucket[]; total: number }; feed: FeedRow[];
  dataQuality: DataQuality; localityTrend: LocalityTrend; generatedAtMs: number;
}

function startOfDay(ms: number): number { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
function avg(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length; }

/** Apply the ONE filter state to the listing set (server-side scope). */
export function applyFilters(listings: MiListing[], f: CockpitFilters): MiListing[] {
  return listings.filter((l) => {
    if (f.city && (l.city ?? "").trim() !== f.city) return false;
    if (f.neighborhood && (l.neighborhood ?? "").trim() !== f.neighborhood) return false;
    if (f.propertyType && (l.propertyType ?? "").trim() !== f.propertyType) return false;
    if (f.deal && dealKind(l.dealType) !== f.deal) return false;
    if (f.roomsMin != null && !(l.rooms != null && l.rooms >= f.roomsMin)) return false;
    if (f.priceMin != null && !(l.price != null && l.price >= f.priceMin)) return false;
    if (f.priceMax != null && !(l.price != null && l.price <= f.priceMax)) return false;
    return true;
  });
}

/** Filter facets from the FULL set (so options never disappear as you narrow). */
export function computeFacets(listings: MiListing[]): Facets {
  const cities = new Set<string>(), nbhds = new Set<string>(), types = new Set<string>(), rooms = new Set<number>();
  let priceMin = Infinity, priceMax = 0;
  for (const l of listings) {
    if (l.city?.trim()) cities.add(l.city.trim());
    if (l.neighborhood?.trim()) nbhds.add(l.neighborhood.trim());
    if (l.propertyType?.trim()) types.add(l.propertyType.trim());
    if (l.rooms != null && l.rooms > 0) rooms.add(l.rooms);
    if (l.price != null && l.price > 0) { priceMin = Math.min(priceMin, l.price); priceMax = Math.max(priceMax, l.price); }
  }
  return {
    cities: [...cities].sort((a, b) => a.localeCompare(b, "he")),
    neighborhoods: [...nbhds].sort((a, b) => a.localeCompare(b, "he")),
    propertyTypes: [...types].sort((a, b) => a.localeCompare(b, "he")),
    roomsOptions: [...rooms].sort((a, b) => a - b),
    priceMin: Number.isFinite(priceMin) ? priceMin : 0, priceMax,
  };
}

/** Daily counts over the last `windowDays` (oldest→newest). Pure. */
export function buildDailySeries(tsMs: number[], nowMs: number, windowDays = SERIES_WINDOW): DailyPoint[] {
  const start = startOfDay(nowMs) - (windowDays - 1) * DAY;
  const raw = new Array(windowDays).fill(0);
  for (const t of tsMs) {
    if (t < start || t > nowMs) continue;
    const idx = Math.min(windowDays - 1, Math.max(0, Math.floor((startOfDay(t) - start) / DAY)));
    raw[idx]++;
  }
  return raw.map((value, i) => ({ date: isoDay(start + i * DAY), value }));
}

/** Sum the current period vs the immediately-preceding one, from a daily series. */
export function periodCompare(points: DailyPoint[], periodDays: number): { current: number; previous: number; deltaPct: number | null } {
  const n = points.length;
  const cur = points.slice(Math.max(0, n - periodDays)).reduce((a, p) => a + p.value, 0);
  const prev = points.slice(Math.max(0, n - 2 * periodDays), Math.max(0, n - periodDays)).reduce((a, p) => a + p.value, 0);
  return { current: cur, previous: prev, deltaPct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null };
}

/** Listing-age buckets ("ותק מודעה / זמן בשוק" — NOT time-to-sale). */
export function domBuckets(listings: MiListing[], nowMs: number): { buckets: DomBucket[]; total: number } {
  const defs = [
    { key: "0_14", label: "0–14 ימים", lo: 0, hi: 14 },
    { key: "15_30", label: "15–30", lo: 15, hi: 30 },
    { key: "31_60", label: "31–60", lo: 31, hi: 60 },
    { key: "60_plus", label: "60+ ימים", lo: 61, hi: Infinity },
  ];
  const buckets = defs.map((d) => ({ key: d.key, label: d.label, count: 0 }));
  let total = 0;
  for (const l of listings) {
    if (l.firstSeenMs == null) continue;
    const age = Math.floor((nowMs - l.firstSeenMs) / DAY);
    if (age < 0) continue;
    total++;
    const i = defs.findIndex((d) => age >= d.lo && age <= d.hi);
    if (i >= 0) buckets[i].count++;
  }
  return { buckets, total };
}

/** Equal-width price-distribution histogram over the scoped priced listings. */
export function buildPriceHistogram(prices: number[], bandCount = HISTOGRAM_BANDS): PriceHistogram {
  const valid = prices.filter((p) => p > 0).sort((a, b) => a - b);
  if (valid.length < HISTOGRAM_MIN) return { status: "data_required", bands: [], median: null, scopeCount: valid.length };
  const lo = valid[Math.floor(valid.length * 0.05)];
  const hi = valid[Math.min(valid.length - 1, Math.floor(valid.length * 0.95))];
  const width = Math.max(1, hi - lo) / bandCount;
  const med = median(valid);
  const bands: HistogramBand[] = Array.from({ length: bandCount }, (_, i) => {
    const bl = lo + i * width, bhExcl = i === bandCount - 1 ? Infinity : lo + (i + 1) * width;
    return { lo: Math.round(bl), hi: i === bandCount - 1 ? Math.round(hi) : Math.round(bhExcl), label: "", count: 0, isMedianBand: med != null && med >= bl && med < bhExcl };
  });
  for (const p of valid) { let i = Math.floor((p - lo) / width); if (i < 0) i = 0; if (i >= bandCount) i = bandCount - 1; bands[i].count++; }
  return { status: "ready", bands, median: med, scopeCount: valid.length };
}

/** Evidence-gated ZONO insights (≤3). No evidence ⇒ no insight. Pure. */
export function buildZonoInsights(scoped: MiListing[], events: PriceEvent[], nowMs: number, filters: CockpitFilters): ZonoInsight[] {
  const out: ZonoInsight[] = [];
  const period = filters.period * DAY;
  const listingById = new Map(scoped.map((l) => [l.id, l]));
  const areaMed = areaMedianPPS(scoped);

  const redByArea = new Map<string, number>();
  for (const e of events) {
    if (e.tsMs < nowMs - period) continue;
    const l = listingById.get(e.listingId); if (!l) continue;
    const k = areaKey(l); if (!k) continue;
    redByArea.set(k, (redByArea.get(k) ?? 0) + 1);
  }
  const topRed = [...redByArea.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topRed && topRed[1] >= INSIGHT_MIN_REDUCTIONS) {
    out.push({ id: `red-${topRed[0]}`, kind: "reductions_concentration", tone: "warning",
      what: `${topRed[0]}: ${topRed[1]} ירידות מחיר`,
      why: `ריכוז גבוה של ירידות מחיר ב-${filters.period} הימים האחרונים — סימן ללחץ מחיר או להזדמנויות מיקוח.`,
      action: "צפה בנכסים", href: `/market-intelligence/listings` });
  }

  let below: { l: MiListing; pct: number } | null = null;
  for (const l of scoped) {
    const pps = pricePerSqm(l); const med = areaMed.get(areaKey(l));
    if (pps == null || med == null || med <= 0) continue;
    const pct = Math.round((1 - pps / med) * 100);
    if (pct >= INSIGHT_BELOW_PCT && (!below || pct > below.pct)) below = { l, pct };
  }
  if (below) {
    const loc = [below.l.neighborhood, below.l.city].filter(Boolean).join(", ");
    out.push({ id: `below-${below.l.id}`, kind: "below_benchmark", tone: "success",
      what: `${(below.l.title && below.l.title.trim()) || loc || "נכס"} — ${below.pct}% מתחת למחיר האזור`,
      why: `מחיר למ״ר נמוך משמעותית מהחציון ב${below.l.neighborhood ? "שכונה" : "עיר"} — הזדמנות פוטנציאלית.`,
      action: "פתח נכס", href: `/external-listings/${below.l.id}` });
  }

  const newThis = new Map<string, number>(), newPrev = new Map<string, number>();
  for (const l of scoped) {
    if (l.firstSeenMs == null) continue; const age = nowMs - l.firstSeenMs; const k = areaKey(l); if (!k) continue;
    if (age >= 0 && age < period) newThis.set(k, (newThis.get(k) ?? 0) + 1);
    else if (age >= period && age < 2 * period) newPrev.set(k, (newPrev.get(k) ?? 0) + 1);
  }
  let momentum: { k: string; now: number; pct: number } | null = null;
  for (const [k, now] of newThis) {
    const prev = newPrev.get(k) ?? 0;
    if (now >= INSIGHT_MOMENTUM_MIN && prev > 0) { const pct = Math.round(((now - prev) / prev) * 100); if (pct >= 30 && (!momentum || pct > momentum.pct)) momentum = { k, now, pct }; }
  }
  if (momentum) {
    out.push({ id: `mom-${momentum.k}`, kind: "inventory_momentum", tone: "brand",
      what: `${momentum.k}: המלאי החדש עלה ${momentum.pct}%`,
      why: `${momentum.now} מודעות חדשות ב-${filters.period} הימים האחרונים לעומת התקופה הקודמת — פעילות מתגברת.`,
      action: "התמקד באזור", href: `/market-intelligence/listings` });
  }

  if (out.length < 3) {
    const staleByArea = new Map<string, number>();
    for (const l of scoped) {
      if (l.firstSeenMs == null) continue; const age = Math.floor((nowMs - l.firstSeenMs) / DAY);
      if (age > DOM_STALE_DAYS) { const k = areaKey(l); if (k) staleByArea.set(k, (staleByArea.get(k) ?? 0) + 1); }
    }
    const topStale = [...staleByArea.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topStale && topStale[1] >= 8) {
      out.push({ id: `stale-${topStale[0]}`, kind: "stale_inventory", tone: "danger",
        what: `${topStale[0]}: ${topStale[1]} מודעות ותיקות (60+ ימים)`,
        why: `מלאי ששוהה זמן רב בשוק — לרוב מתומחר גבוה מדי, פוטנציאל לפנייה יזומה לבעלים.`,
        action: "צפה בנכסים", href: `/market-intelligence/listings` });
    }
  }
  return out.slice(0, 3);
}

/** True count of listings that qualify as an opportunity (≥1 real signal). */
export function countOpportunities(scoped: MiListing[], droppedIds: Set<string>): number {
  const areaMed = areaMedianPPS(scoped);
  let n = 0;
  for (const l of scoped) {
    const pps = pricePerSqm(l); const med = areaMed.get(areaKey(l));
    const below = pps != null && med != null && med > 0 && pps <= med * BELOW_AVG_RATIO;
    const priv = dealKind(l.dealType) === "sale" && l.hasAgent !== true && (l.contactPhone ?? "").trim().length > 0;
    if (below || priv || droppedIds.has(l.id) || (l.opportunityScore ?? 0) >= 70) n++;
  }
  return n;
}

function buildGeo(scoped: MiListing[], events: PriceEvent[], nowMs: number, period: number): AreaGeo[] {
  const redByArea = new Map<string, number>();
  const listingById = new Map(scoped.map((l) => [l.id, l]));
  for (const e of events) { if (e.tsMs < nowMs - period * DAY) continue; const l = listingById.get(e.listingId); const k = l ? areaKey(l) : ""; if (k) redByArea.set(k, (redByArea.get(k) ?? 0) + 1); }
  const groups = new Map<string, MiListing[]>();
  for (const l of scoped) { const k = areaKey(l); if (!k) continue; (groups.get(k) ?? groups.set(k, []).get(k)!).push(l); }
  return [...groups.entries()].map(([name, rows]) => {
    const withGeo = rows.filter((r) => r.lat != null && r.lng != null);
    return {
      name, city: rows.find((r) => r.city)?.city ?? null,
      lat: withGeo.length ? avg(withGeo.map((r) => r.lat as number)) : null,
      lng: withGeo.length ? avg(withGeo.map((r) => r.lng as number)) : null,
      inventory: rows.length, reductions: redByArea.get(name) ?? 0,
      newInPeriod: rows.filter((r) => r.firstSeenMs != null && nowMs - r.firstSeenMs < period * DAY).length,
      avgPricePerSqm: median(rows.map(pricePerSqm).filter((x): x is number => x != null)),
    };
  }).sort((a, b) => b.inventory - a.inventory);
}

function pulseHeadline(newCmp: { current: number; deltaPct: number | null }, redCmp: { current: number }, hottest: { name: string; count: number } | null, period: number): string {
  const parts: string[] = [`${newCmp.current} מודעות חדשות ב-${period} ימים`];
  if (newCmp.deltaPct != null) parts.push(`${newCmp.deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(newCmp.deltaPct)}% מהתקופה הקודמת`);
  if (redCmp.current > 0) parts.push(`${redCmp.current} ירידות מחיר`);
  if (hottest) parts.push(`${hottest.name} הכי פעילה`);
  return parts.join(" · ");
}

/** Assemble the whole cockpit view model. Pure + deterministic. */
export function buildMarketCockpit(input: CockpitInput): MarketCockpit {
  const { listings, priceEvents, snapshots, filters, nowMs } = input;
  const facets = computeFacets(listings);
  const scoped = applyFilters(listings, filters);
  const scopedIds = new Set(scoped.map((l) => l.id));
  const scopedEvents = priceEvents.filter((e) => scopedIds.has(e.listingId));
  const droppedIds = [...new Set(scopedEvents.filter((e) => e.tsMs >= nowMs - 30 * DAY).map((e) => e.listingId))];
  const base = buildCommandCenter({ listings: scoped, priceEventMs: scopedEvents.map((e) => e.tsMs), droppedListingIds: droppedIds, snapshots, nowMs });

  const newSeries = buildDailySeries(scoped.map((l) => l.firstSeenMs).filter((t): t is number => t != null), nowMs);
  const redSeries = buildDailySeries(scopedEvents.map((e) => e.tsMs), nowMs);
  const newCmp = periodCompare(newSeries, filters.period);
  const redCmp = periodCompare(redSeries, filters.period);
  const series: MetricSeries[] = [
    { key: "new_listings", label: "מודעות חדשות", unit: "", status: "ready", points: newSeries, current: newCmp.current, previous: newCmp.previous, deltaPct: newCmp.deltaPct, note: null },
    { key: "price_reductions", label: "ירידות מחיר", unit: "", status: "ready", points: redSeries, current: redCmp.current, previous: redCmp.previous, deltaPct: redCmp.deltaPct, note: null },
    { key: "inventory", label: "מלאי פעיל", unit: "", status: "data_required", points: [], current: null, previous: null, deltaPct: null, note: "אין חותמות הסרה (removed_at) — לא ניתן לשחזר מלאי פעיל לאורך זמן ביושר." },
    { key: "median_ppsqm", label: "₪ למ״ר חציוני", unit: "₪", status: "data_required", points: [], current: null, previous: null, deltaPct: null, note: "נדרשים צילומי שוק יומיים מצטברים — ההיסטוריה הנוכחית דלילה מדי." },
  ];

  const hottestArea = ((): { name: string; count: number } | null => {
    const m = new Map<string, number>();
    for (const l of scoped) { if (l.firstSeenMs != null && nowMs - l.firstSeenMs < filters.period * DAY) { const k = areaKey(l); if (k) m.set(k, (m.get(k) ?? 0) + 1); } }
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return top && top[1] > 0 ? { name: top[0], count: top[1] } : null;
  })();
  const pulse: CockpitPulse = {
    periodDays: filters.period, newThisPeriod: newCmp.current, newDeltaPct: newCmp.deltaPct,
    reductionsThisPeriod: redCmp.current, reductionsDeltaPct: redCmp.deltaPct,
    hottestArea, opportunities: base.opportunities.length, headline: pulseHeadline(newCmp, redCmp, hottestArea, filters.period),
  };

  const geocoded = scoped.filter((l) => l.lat != null).length;
  const freshest = scoped.reduce((mx, l) => Math.max(mx, l.firstSeenMs ?? 0), 0);
  const warnings: string[] = [];
  if (scoped.length && geocoded / scoped.length < 0.8) warnings.push("חלק מהמודעות ללא מיקום גאוגרפי");
  if (scoped.length && base.dataConfidence < 80) warnings.push("חלק מהמודעות ללא מחיר/שטח");

  return {
    hasData: listings.length > 0, totalCount: listings.length, scopedCount: scoped.length, filters, facets, pulse,
    kpis: base.kpis, series, zonoInsights: buildZonoInsights(scoped, scopedEvents, nowMs, filters),
    neighborhoods: base.neighborhoods, geo: buildGeo(scoped, scopedEvents, nowMs, filters.period),
    opportunities: base.opportunities.slice(0, 3), opportunitiesTotal: countOpportunities(scoped, new Set(droppedIds)),
    priceHistogram: buildPriceHistogram(scoped.filter((l) => dealKind(l.dealType) === "sale" && l.price != null).map((l) => l.price as number)),
    dom: domBuckets(scoped, nowMs), feed: base.feed.slice(0, 7),
    dataQuality: { sources: base.sourceMix, geocodedPct: scoped.length ? Math.round((geocoded / scoped.length) * 100) : 0, priceSqmPct: base.dataConfidence, freshnessDays: freshest ? Math.floor((nowMs - freshest) / DAY) : null, warnings },
    localityTrend: base.localityTrend, generatedAtMs: nowMs,
  };
}
