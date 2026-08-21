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
