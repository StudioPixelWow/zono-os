// ============================================================================
// ZONO Buyer Demand Intelligence — engine (PURE, deterministic, client-safe).
// ----------------------------------------------------------------------------
// Input: REAL buyer rows + REAL property (inventory) rows. Output: per-buyer
// demand profiles, demand clusters, inventory-gap scores, acquisition signals,
// and heatmap cells. NOTHING is invented — every count traces to a real row,
// every score to a real field. Buyers with no usable area/type are skipped
// (we never guess where someone wants to buy).
// ============================================================================
import type {
  BuyerRow, PropertyRow, BuyerDemandProfile, DemandCluster, AcquisitionSignal,
  HeatmapCell, DemandBand, GapBand, DemandReason, ClusterBuyerLink,
} from "./types";
import { PROPERTY_TYPE_HE } from "./types";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const v = xs.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const fmtMoney = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M ₪` : `₪${Math.round(n).toLocaleString("he-IL")}`);
const roundUp = (n: number, step: number) => Math.ceil(n / step) * step;

// ── Per-buyer demand profile ─────────────────────────────────────────────────
function recencyScore(iso: string | null | undefined): number {
  if (!iso) return 20;
  const days = (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
  if (days < 7) return 90;
  if (days < 30) return 70;
  if (days < 90) return 45;
  if (days < 180) return 25;
  return 10;
}

export function computeBuyerDemandProfile(b: BuyerRow): BuyerDemandProfile {
  const temp = b.temperature ?? "warm";
  const tempUrgency = temp === "hot" ? 80 : temp === "warm" ? 50 : 25;
  const readiness = b.readiness ?? 0;

  const urgencyScore = clamp(tempUrgency + readiness * 0.2);
  const financingReadinessScore = clamp((b.has_preapproval ? 70 : 30) + readiness * 0.3);
  const searchActivityScore = recencyScore(b.last_contacted_at);
  const tempEngage = temp === "hot" ? 85 : temp === "warm" ? 55 : 30;
  const engagementScore = clamp((tempEngage + searchActivityScore) / 2);

  const demandScore = clamp(
    urgencyScore * 0.35 + financingReadinessScore * 0.25 + searchActivityScore * 0.2 + engagementScore * 0.2,
  );
  const demandBand: DemandBand = demandScore >= 75 ? "hot" : demandScore >= 55 ? "strong" : demandScore >= 35 ? "active" : "low";

  const reasons: DemandReason[] = [
    { label: "דחיפות", detail: `טמפרטורה ${temp === "hot" ? "חמה" : temp === "warm" ? "פושרת" : "קרה"}${readiness ? ` · מוכנות ${readiness}%` : ""}`, weight: urgencyScore },
    { label: "מימון", detail: b.has_preapproval ? "אישור עקרוני קיים" : "ללא אישור עקרוני", weight: financingReadinessScore },
    { label: "פעילות חיפוש", detail: b.last_contacted_at ? `קשר אחרון ${new Date(b.last_contacted_at).toLocaleDateString("he-IL")}` : "אין קשר מתועד", weight: searchActivityScore },
  ];

  return {
    buyerId: b.id,
    preferredCities: (b.preferred_areas ?? []).map((s) => s.trim()).filter(Boolean),
    preferredNeighborhoods: [],
    propertyTypes: (b.preferred_types ?? []).filter(Boolean),
    roomsMin: b.rooms_min ?? null, roomsMax: b.rooms_max ?? null,
    budgetMin: b.budget_min ?? null, budgetMax: b.budget_max ?? null,
    urgencyScore, financingReadinessScore, searchActivityScore, engagementScore,
    demandScore, demandBand, reasons,
  };
}

// ── Cluster building ─────────────────────────────────────────────────────────
interface Accum {
  area: string; propertyType: string; roomsBucket: number; budgetBucket: number;
  members: { buyer: BuyerRow; profile: BuyerDemandProfile }[];
}

const BUDGET_STEP = 250_000;
const MIN_CLUSTER_BUYERS = 2;

function roomsBucketOf(b: BuyerRow): number {
  const r = b.rooms_max ?? b.rooms_min ?? null;
  return r != null && r > 0 ? Math.round(r) : 0;
}
function budgetBucketOf(b: BuyerRow): number {
  const v = b.budget_max ?? 0;
  return v > 0 ? Math.round(v / BUDGET_STEP) * BUDGET_STEP : 0;
}

/** Group real buyers into demand clusters (a buyer fans out across their areas × types). */
export function buildClusters(
  buyers: BuyerRow[], profiles: Map<string, BuyerDemandProfile>, properties: PropertyRow[],
): DemandCluster[] {
  const acc = new Map<string, Accum>();
  for (const b of buyers) {
    const profile = profiles.get(b.id);
    if (!profile) continue;
    const areas = profile.preferredCities;
    const types = profile.propertyTypes;
    if (areas.length === 0 || types.length === 0) continue; // no fake geography/type
    const roomsBucket = roomsBucketOf(b);
    const budgetBucket = budgetBucketOf(b);
    for (const area of areas) {
      for (const type of types) {
        const key = `${norm(area)}::${type}::${roomsBucket}::${budgetBucket}`;
        let a = acc.get(key);
        if (!a) { a = { area: area.trim(), propertyType: type, roomsBucket, budgetBucket, members: [] }; acc.set(key, a); }
        a.members.push({ buyer: b, profile });
      }
    }
  }

  const clusters: DemandCluster[] = [];
  for (const [, a] of acc) {
    if (a.members.length < MIN_CLUSTER_BUYERS) continue;
    const budgets = a.members.map((m) => m.buyer.budget_max ?? 0).filter((x) => x > 0);
    const budgetCeiling = a.budgetBucket > 0 ? a.budgetBucket : (budgets.length ? roundUp(median(budgets), 100_000) : 0);
    const avgBudget = Math.round(avg(budgets));
    const urgencyScore = clamp(avg(a.members.map((m) => m.profile.urgencyScore)));
    const hotMembers = a.members.filter((m) => m.profile.demandBand === "hot" || m.buyer.temperature === "hot");
    const activeBuyers = a.members.length;
    const hotBuyers = hotMembers.length;
    const hotRatio = activeBuyers ? hotBuyers / activeBuyers : 0;
    const demandStrength = clamp(Math.min(60, activeBuyers * 8) + hotRatio * 25 + urgencyScore * 0.15);
    const demandBand: DemandBand = demandStrength >= 75 ? "hot" : demandStrength >= 55 ? "strong" : demandStrength >= 35 ? "active" : "low";

    const inventoryCount = matchInventoryCount(properties, a.area, a.propertyType, a.roomsBucket, budgetCeiling);
    const { gapScore, gapBand, competition } = computeGap(activeBuyers, inventoryCount, demandStrength);

    const typeHe = PROPERTY_TYPE_HE[a.propertyType] ?? a.propertyType;
    const label = `${typeHe}${a.roomsBucket ? ` ${a.roomsBucket} חדרים` : ""} ב${a.area}${budgetCeiling ? ` עד ${fmtMoney(budgetCeiling)}` : ""}`;

    const buyerLinks: ClusterBuyerLink[] = a.members.map((m) => ({
      buyerId: m.buyer.id, fitScore: m.profile.demandScore,
      isHot: m.profile.demandBand === "hot" || m.buyer.temperature === "hot",
    }));

    const reasons: DemandReason[] = [
      { label: "קונים פעילים", detail: `${activeBuyers} קונים תואמים`, weight: demandStrength },
      { label: "קונים חמים", detail: `${hotBuyers} קונים חמים`, weight: hotRatio * 100 },
      { label: "מלאי זמין", detail: `${inventoryCount} נכסים תואמים במלאי`, weight: 100 - gapScore },
      { label: "תחרות", detail: `${competition} קונים לכל נכס זמין`, weight: gapScore },
      { label: "דחיפות ממוצעת", detail: `${urgencyScore}/100`, weight: urgencyScore },
    ];

    clusters.push({
      clusterKey: `${norm(a.area)}::${a.propertyType}::${a.roomsBucket}::${a.budgetBucket}`,
      label, area: a.area, scope: "city", propertyType: a.propertyType, roomsBucket: a.roomsBucket,
      budgetCeiling, activeBuyers, hotBuyers, avgBudget, urgencyScore, demandStrength, demandBand,
      inventoryCount, gapScore, gapBand, reasons, buyers: buyerLinks,
    });
  }
  // Strongest demand + biggest gaps first.
  clusters.sort((x, y) => y.gapScore - x.gapScore || y.demandStrength - x.demandStrength);
  return clusters;
}

/** REAL inventory count matching a cluster's area/type/rooms/budget. */
export function matchInventoryCount(
  properties: PropertyRow[], area: string, type: string, roomsBucket: number, budgetCeiling: number,
): number {
  const a = norm(area);
  const UNAVAILABLE = new Set(["sold", "rented", "withdrawn", "archived"]);
  return properties.filter((p) => {
    if (norm(p.property_type) !== norm(type)) return false;
    const areaMatch = norm(p.city) === a || norm(p.neighborhood) === a;
    if (!areaMatch) return false;
    if (roomsBucket > 0) {
      if (p.rooms == null) return false;
      if (Math.round(p.rooms) !== roomsBucket) return false;
    }
    if (budgetCeiling > 0 && p.price != null && p.price > budgetCeiling * 1.05) return false;
    if (p.status && UNAVAILABLE.has(norm(p.status))) return false;
    return true;
  }).length;
}

export function computeGap(activeBuyers: number, inventoryCount: number, demandStrength: number): { gapScore: number; gapBand: GapBand; competition: number } {
  const scarcity = activeBuyers / (inventoryCount + 1);
  const scarcityScore = Math.min(100, scarcity * 18 + (inventoryCount === 0 ? 25 : 0));
  const gapScore = clamp(demandStrength * 0.35 + scarcityScore * 0.65);
  const gapBand: GapBand = gapScore >= 80 ? "critical" : gapScore >= 60 ? "very_high" : gapScore >= 40 ? "high" : gapScore >= 20 ? "medium" : "low";
  const competition = Math.round((activeBuyers / Math.max(1, inventoryCount)) * 10) / 10;
  return { gapScore, gapBand, competition };
}

// ── Acquisition signals (shortages = "properties that should exist but don't") ─
const SIGNAL_GAP_BANDS = new Set<GapBand>(["critical", "very_high", "high"]);
const MIN_SIGNAL_BUYERS = 3;

export function buildAcquisitionSignals(clusters: DemandCluster[]): AcquisitionSignal[] {
  const out: AcquisitionSignal[] = [];
  for (const c of clusters) {
    if (!SIGNAL_GAP_BANDS.has(c.gapBand)) continue;
    if (c.activeBuyers < MIN_SIGNAL_BUYERS) continue;
    if (c.inventoryCount > Math.floor(c.activeBuyers / 2)) continue; // must be a real shortage
    const competition = Math.round((c.activeBuyers / Math.max(1, c.inventoryCount)) * 10) / 10;
    const strength = clamp(c.gapScore * 0.6 + c.demandStrength * 0.4);
    const typeHe = PROPERTY_TYPE_HE[c.propertyType] ?? c.propertyType;
    const severity = c.gapBand === "critical" ? "חוסר קריטי" : c.gapBand === "very_high" ? "מחסור חזק" : "מחסור";
    const title = `${severity}: ${typeHe}${c.roomsBucket ? ` ${c.roomsBucket} חדרים` : ""} ב${c.area}${c.budgetCeiling ? ` עד ${fmtMoney(c.budgetCeiling)}` : ""}`;
    out.push({
      clusterKey: c.clusterKey, signalType: "inventory_shortage", title,
      area: c.area, scope: c.scope, propertyType: c.propertyType, roomsBucket: c.roomsBucket, budgetCeiling: c.budgetCeiling,
      buyersCount: c.activeBuyers, hotBuyersCount: c.hotBuyers, inventoryCount: c.inventoryCount,
      gapScore: c.gapScore, urgencyScore: c.urgencyScore, strength, competition,
      reasons: [
        { label: "ביקוש", detail: `${c.activeBuyers} קונים פעילים (${c.hotBuyers} חמים)` },
        { label: "מלאי", detail: `${c.inventoryCount} נכסים זמינים` },
        { label: "דחיפות", detail: `${c.urgencyScore}/100` },
        { label: "תחרות", detail: `${competition} קונים לכל נכס` },
      ],
    });
  }
  out.sort((a, b) => b.strength - a.strength);
  return out;
}

// ── Heatmap cells (data only; map-ready, never fake coordinates) ─────────────
export function buildHeatmap(clusters: DemandCluster[]): HeatmapCell[] {
  const byKey = (scope: HeatmapCell["scope"], keyOf: (c: DemandCluster) => string, labelOf: (c: DemandCluster) => string) => {
    const map = new Map<string, { label: string; buyers: number; hot: number; budgets: number[]; strength: number[]; inv: number; gap: number[] }>();
    for (const c of clusters) {
      const k = keyOf(c);
      let m = map.get(k);
      if (!m) { m = { label: labelOf(c), buyers: 0, hot: 0, budgets: [], strength: [], inv: 0, gap: [] }; map.set(k, m); }
      m.buyers += c.activeBuyers; m.hot += c.hotBuyers;
      if (c.avgBudget > 0) m.budgets.push(c.avgBudget);
      m.strength.push(c.demandStrength); m.inv += c.inventoryCount; m.gap.push(c.gapScore);
    }
    return [...map.entries()].map(([key, m]): HeatmapCell => ({
      scope, key, label: m.label, buyersCount: m.buyers, hotBuyers: m.hot,
      avgBudget: m.budgets.length ? Math.round(avg(m.budgets)) : null,
      demandStrength: clamp(avg(m.strength)), inventoryCount: m.inv, gapScore: clamp(avg(m.gap)),
    })).sort((a, b) => b.demandStrength - a.demandStrength);
  };

  return [
    ...byKey("locality", (c) => norm(c.area), (c) => c.area),
    ...byKey("neighborhood", (c) => `${norm(c.area)}|${c.propertyType}`, (c) => `${c.area} · ${PROPERTY_TYPE_HE[c.propertyType] ?? c.propertyType}`),
    ...byKey("property_type", (c) => c.propertyType, (c) => PROPERTY_TYPE_HE[c.propertyType] ?? c.propertyType),
  ];
}
