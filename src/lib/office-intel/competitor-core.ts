// ============================================================================
// ZONO — COMPETITOR INTELLIGENCE core (PURE, deterministic, no I/O).
//
// Answers "who actually competes with this office" from OBSERVED ACTIVITY, never
// from names. Two offices compete to the extent they fish the same ponds: the
// same neighborhoods, the same city, the same property types, at a comparable
// scale and cadence, with real brokers on the ground. A RE/MAX branch and an
// independent agency in the same three streets ARE competitors; two offices that
// happen to share the word "נדל״ן" but sit in different cities are NOT.
//
// The score is a documented weighted blend of six activity signals, each 0..1:
//
//   neighborhood overlap  0.42  — the core of local competition (distribution
//                                 overlap of where each office is actually active)
//   city overlap          0.14  — same municipal market
//   property-type overlap 0.14  — competing for the same kind of inventory
//   scale similarity      0.10  — comparable presence (not a giant vs a one-lister)
//   velocity similarity   0.10  — both currently active, at similar cadence
//   broker-activity sim   0.10  — both have real brokers producing listings
//   ───────────────────────────
//   TOTAL                 1.00
//
// TERRITORY GATE: if two offices share NO neighborhood AND NO city, they are not
// competitors — the score is forced to 0 regardless of the other signals. This is
// what makes a Rehovot office and a Kiryat-Bialik office score ~0 even if both are
// large, fast and broker-rich. A self-office can never be its own competitor.
//
// All inputs are plain footprints (already aggregated by the server selector);
// this module does zero data access so it is trivially unit-testable and cannot
// fabricate a relation that isn't in the observed data.
// ============================================================================

/** Observed activity footprint for one office, aggregated over a market locale. */
export interface OfficeFootprint {
  officeId: string;
  /** neighborhood → observed listing count (the office's presence per pond). */
  neighborhoods: Record<string, number>;
  /** normalized city → observed listing count. */
  cities: Record<string, number>;
  /** property type → observed listing count. */
  propertyTypes: Record<string, number>;
  /** total observed listings in the locale. */
  total: number;
  /** listings first seen in the last 30 days (velocity). */
  new30d: number;
  /** distinct active brokers (activity-based, e.g. distinct contact names). */
  brokers: number;
}

export const COMPETITOR_WEIGHTS = {
  neighborhood: 0.42,
  city: 0.14,
  propertyType: 0.14,
  scale: 0.1,
  velocity: 0.1,
  brokers: 0.1,
} as const;

export interface CompetitorSignal {
  neighborhoodOverlap: number; // 0..1
  cityOverlap: number;         // 0..1
  propertyTypeOverlap: number; // 0..1
  scaleSim: number;            // 0..1
  velocitySim: number;         // 0..1
  brokerSim: number;           // 0..1
}

export interface CompetitorScore {
  officeId: string;
  /** 0..100 weighted competition score. */
  score: number;
  signal: CompetitorSignal;
  /** shared neighborhoods, ranked by combined presence. */
  sharedNeighborhoods: string[];
  sharesCity: boolean;
  /** deterministic, data-backed reasons (no invented numbers). */
  reasons: string[];
}

const sum = (m: Record<string, number>): number => Object.values(m).reduce((a, b) => a + b, 0);

/**
 * Distribution overlap coefficient of two count maps: normalize each to shares,
 * then sum the min share over the shared keys. 1 = identical footprints, 0 = no
 * shared keys. Interpretable as "what fraction of their footprints coincide".
 */
export function distributionOverlap(a: Record<string, number>, b: Record<string, number>): number {
  const ta = sum(a), tb = sum(b);
  if (ta <= 0 || tb <= 0) return 0;
  let overlap = 0;
  for (const k of Object.keys(a)) {
    if (b[k] == null) continue;
    overlap += Math.min(a[k] / ta, b[k] / tb);
  }
  return Math.max(0, Math.min(1, overlap));
}

/** Symmetric min/max ratio, 0..1. Two equal values → 1; a 10x gap → 0.1. */
function ratioSim(a: number, b: number): number {
  if (a <= 0 && b <= 0) return 0; // neither is active on this axis → no evidence of shared competition
  if (a <= 0 || b <= 0) return 0;
  return Math.min(a, b) / Math.max(a, b);
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Neighborhoods present in BOTH footprints, ranked by combined observed count. */
export function sharedNeighborhoods(a: OfficeFootprint, b: OfficeFootprint): string[] {
  const shared: Array<[string, number]> = [];
  for (const k of Object.keys(a.neighborhoods)) {
    if (b.neighborhoods[k] != null) shared.push([k, a.neighborhoods[k] + b.neighborhoods[k]]);
  }
  return shared.sort((x, y) => y[1] - x[1]).map(([k]) => k);
}

function sharesAnyCity(a: OfficeFootprint, b: OfficeFootprint): boolean {
  return Object.keys(a.cities).some((c) => b.cities[c] != null);
}

/**
 * Score how strongly `candidate` competes with `target`. Returns null when they
 * are the same office (self can never be its own competitor). The territory gate
 * forces 0 when they share neither a neighborhood nor a city.
 */
export function scoreCompetitor(target: OfficeFootprint, candidate: OfficeFootprint): CompetitorScore | null {
  if (!target.officeId || !candidate.officeId) return null;
  if (target.officeId === candidate.officeId) return null; // self-exclusion

  const shared = sharedNeighborhoods(target, candidate);
  const sharesCity = sharesAnyCity(target, candidate);

  const signal: CompetitorSignal = {
    neighborhoodOverlap: round2(distributionOverlap(target.neighborhoods, candidate.neighborhoods)),
    cityOverlap: round2(distributionOverlap(target.cities, candidate.cities)),
    propertyTypeOverlap: round2(distributionOverlap(target.propertyTypes, candidate.propertyTypes)),
    scaleSim: round2(ratioSim(target.total, candidate.total)),
    velocitySim: round2(ratioSim(target.new30d, candidate.new30d)),
    brokerSim: round2(ratioSim(target.brokers, candidate.brokers)),
  };

  // Territory gate: no shared neighborhood AND no shared city → not a competitor.
  const inTerritory = shared.length > 0 || sharesCity;
  const raw = inTerritory
    ? COMPETITOR_WEIGHTS.neighborhood * signal.neighborhoodOverlap +
      COMPETITOR_WEIGHTS.city * signal.cityOverlap +
      COMPETITOR_WEIGHTS.propertyType * signal.propertyTypeOverlap +
      COMPETITOR_WEIGHTS.scale * signal.scaleSim +
      COMPETITOR_WEIGHTS.velocity * signal.velocitySim +
      COMPETITOR_WEIGHTS.brokers * signal.brokerSim
    : 0;
  const score = Math.round(raw * 100);

  const reasons: string[] = [];
  if (shared.length) {
    const top = shared.slice(0, 3).join(", ");
    reasons.push(`פעילות משותפת ב${shared.length === 1 ? "שכונה" : `-${shared.length} שכונות`}: ${top}`);
  }
  if (sharesCity && !shared.length) reasons.push("פעילות באותה עיר");
  if (signal.propertyTypeOverlap >= 0.5) reasons.push("סוגי נכסים דומים");
  if (signal.scaleSim >= 0.6) reasons.push("היקף מלאי דומה");
  if (signal.velocitySim >= 0.5 && candidate.new30d > 0) reasons.push("קצב פרסום דומה ב-30 הימים האחרונים");
  if (!inTerritory) reasons.push("אין חפיפה טריטוריאלית — לא מתחרה ישיר");

  return { officeId: candidate.officeId, score, signal, sharedNeighborhoods: shared, sharesCity, reasons };
}

/** Rank candidates as competitors of the target; drops self and below-threshold. */
export function rankCompetitors(
  target: OfficeFootprint,
  candidates: OfficeFootprint[],
  opts: { minScore?: number; limit?: number } = {},
): CompetitorScore[] {
  const minScore = opts.minScore ?? 8;
  const scored = candidates
    .map((c) => scoreCompetitor(target, c))
    .filter((s): s is CompetitorScore => s != null && s.score >= minScore)
    .sort((a, b) => b.score - a.score);
  return opts.limit ? scored.slice(0, opts.limit) : scored;
}

// ── Momentum ────────────────────────────────────────────────────────────────
// A single 0..100 "how hot is this office right now" score, from observed cadence
// and breadth. Documented, deterministic, no sales/performance data (ZONO only
// observes market presence). Breakdown is returned so the UI can explain it.

export interface MomentumInput {
  new7d: number;
  new30d: number;
  total: number;
  neighborhoods: number;
  activeBrokers: number;
}
export interface MomentumScore {
  score: number; // 0..100
  breakdown: { label: string; value: number; detail: string }[];
}

export function computeMomentum(m: MomentumInput): MomentumScore {
  // Recency: share of inventory that is new in the last 7d / 30d (cadence).
  const recent7 = m.total > 0 ? Math.min(1, m.new7d / Math.max(1, m.total * 0.25)) : 0;
  const recent30 = m.total > 0 ? Math.min(1, m.new30d / Math.max(1, m.total * 0.6)) : 0;
  // Breadth: how many neighborhoods the office is active in (capped at 10).
  const breadth = Math.min(1, m.neighborhoods / 10);
  // Bench: active brokers producing listings (capped at 8).
  const bench = Math.min(1, m.activeBrokers / 8);

  const parts = [
    { label: "חדשים 7 ימים", w: 0.35, v: recent7, detail: `${m.new7d} מודעות חדשות` },
    { label: "חדשים 30 יום", w: 0.3, v: recent30, detail: `${m.new30d} מודעות חדשות` },
    { label: "פריסת שכונות", w: 0.2, v: breadth, detail: `${m.neighborhoods} שכונות` },
    { label: "מתווכים פעילים", w: 0.15, v: bench, detail: `${m.activeBrokers} מתווכים` },
  ];
  const score = Math.round(parts.reduce((a, p) => a + p.w * p.v, 0) * 100);
  return { score, breakdown: parts.map((p) => ({ label: p.label, value: Math.round(p.v * 100), detail: p.detail })) };
}
