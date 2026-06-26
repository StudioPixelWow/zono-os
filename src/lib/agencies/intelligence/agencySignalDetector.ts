// ============================================================================
// ZONO — Agency signal detector (Phase 26.6, PURE, client-safe).
// Compares an agency's current snapshot to its previously-known metric values
// and emits typed, deduped, importance-scored signals — ONLY for real, measured
// movement. No DB, no IO; the server layer supplies prevMetrics + persists.
// ============================================================================
import {
  severityFor, importanceFor, isRiskSignal, SIGNAL_LABEL,
} from "./agencySignalTypes";
import type {
  AgencySnapshot, DetectedAgencySignal, AgencyIntelSignalType, TerritorySnapshot,
} from "./agencySignalTypes";
import { classifyScoreChange, classifyCountChange, crossedUp, crossedDown } from "./agencyChangeDetector";
import { dedupeKey, metricKey, dedupeDetectedBatch } from "./agencySignalDedupe";

export interface DetectInput {
  snapshot: AgencySnapshot;
  /** Last known numeric value per metric key (built from prior signals). */
  prevMetrics: Record<string, number | undefined>;
  /** Territory keys the agency was already known to operate in. */
  knownAreaKeys?: Set<string>;
  /** Territory keys the USER agency specializes in (raises importance/overlap). */
  userAreaKeys?: Set<string>;
}

const OPP_TYPES = new Set(["territory_opportunity", "user_weak_area", "low_competition_area"]);

/** Detect all supported signals for one agency snapshot. */
export function detectAgencySignals(input: DetectInput): DetectedAgencySignal[] {
  const { snapshot: s, prevMetrics } = input;
  const userAreas = input.userAreaKeys ?? new Set<string>();
  const knownAreas = input.knownAreaKeys ?? inferKnownAreas(prevMetrics);
  const out: DetectedAgencySignal[] = [];

  const label = (t: AgencySnapshot["territories"][number] | null) =>
    t ? (t.street || t.neighborhood || t.city || "—") : "—";

  const build = (
    type: AgencyIntelSignalType, magnitude: number, mKey: string,
    scoreBefore: number | null, scoreAfter: number | null,
    territory: TerritorySnapshot | null, extra: Partial<DetectedAgencySignal> = {},
  ): DetectedAgencySignal => {
    const overlap = !!territory && userAreas.has(territory.territoryKey);
    const confidence = extra.confidence ?? 0.7;
    const severity = severityFor(type, magnitude, { userOverlap: overlap });
    const importance = importanceFor({ type, magnitude, territoryType: territory?.territoryType ?? null, userOverlap: overlap, confidence, isRisk: isRiskSignal(type) });
    return {
      agencyId: s.agencyId, signalType: type, severity, importance, confidence,
      title: extra.title ?? `${SIGNAL_LABEL[type]}${territory ? ` — ${label(territory)}` : ""}`,
      description: extra.description ?? null,
      territoryType: territory?.territoryType ?? null,
      city: territory?.city ?? null, neighborhood: territory?.neighborhood ?? null, street: territory?.street ?? null,
      entityType: extra.entityType ?? null, entityId: extra.entityId ?? null,
      scoreBefore, scoreAfter,
      dedupeKey: dedupeKey(s.agencyId, type, territory?.territoryKey),
      metricKey: mKey,
      metadata: { ...(extra.metadata ?? {}), magnitude: Math.round(magnitude * 100) / 100 },
    };
  };

  // ── Agency-level score signals ──────────────────────────────────────────────
  if (s.overall != null) {
    const mk = metricKey(s.agencyId, "overall");
    const c = classifyScoreChange(prevMetrics[mk] ?? null, s.overall, { deltaThreshold: 15 });
    if (c.direction === "up") out.push(build("agency_score_spike", c.magnitude, mk, c.prev, c.curr, null));
    else if (c.direction === "down") out.push(build("agency_score_drop", c.magnitude, mk, c.prev, c.curr, null));
  }
  if (s.momentum != null) {
    const mk = metricKey(s.agencyId, "momentum");
    const c = classifyScoreChange(prevMetrics[mk] ?? null, s.momentum, { deltaThreshold: 15 });
    if (c.direction === "up") out.push(build("agency_momentum_spike", c.magnitude, mk, c.prev, c.curr, null));
    else if (c.direction === "down") out.push(build("agency_momentum_drop", c.magnitude, mk, c.prev, c.curr, null));
  }
  if (s.competitionThreat != null) {
    const mk = metricKey(s.agencyId, "threat");
    const prev = prevMetrics[mk] ?? null;
    if (crossedUp(prev, s.competitionThreat, 70)) {
      out.push(build("high_competition_threat", (s.competitionThreat - 70) / 30, mk, prev, s.competitionThreat, null, { confidence: 0.8 }));
    }
  }
  if (s.dataConfidence != null) {
    const mk = metricKey(s.agencyId, "confidence");
    const prev = prevMetrics[mk] ?? null;
    if (crossedDown(prev, s.dataConfidence, 30) || (prev == null && s.dataConfidence < 30)) {
      out.push(build("weak_data_confidence", 0.4, mk, prev, s.dataConfidence, null, { confidence: 0.9, description: "הציונים מבוססים על מעט נתונים — להתייחס בזהירות." }));
    }
  }

  // ── Graph signals ───────────────────────────────────────────────────────────
  pushCount(out, build, prevMetrics, s.agencyId, "agents", s.agentCount, "agent_network_expanded", "agent_network_shrunk", { deltaThreshold: 2, pctThreshold: 0.2, magnitudeScale: 5 });
  pushIncrease(out, build, prevMetrics, s.agencyId, "projects", s.projectCount, "project_connection_detected");
  pushIncrease(out, build, prevMetrics, s.agencyId, "developers", s.developerCount, "developer_connection_detected");

  // ── Agency-level activity (total active listings) ───────────────────────────
  const totalActive = s.territories.filter((t) => t.territoryType === "city").reduce((a, t) => a + t.activeListings, 0);
  {
    const mk = metricKey(s.agencyId, "activity");
    const c = classifyCountChange(prevMetrics[mk] ?? null, totalActive, { deltaThreshold: 4, pctThreshold: 0.3, magnitudeScale: 15 });
    if (c.direction === "up") out.push(build("agency_activity_spike", c.magnitude, mk, c.prev, c.curr, null, { metadata: { totalActive } }));
    else if (c.direction === "down") out.push(build("agency_activity_drop", c.magnitude, mk, c.prev, c.curr, null, { metadata: { totalActive } }));
  }

  // ── Per-territory signals ───────────────────────────────────────────────────
  const currentKeys = new Set<string>();
  for (const t of s.territories) {
    currentKeys.add(t.territoryKey);

    // New area.
    if (!knownAreas.has(t.territoryKey) && t.activeListings > 0) {
      out.push(build("agency_entered_new_area", clamp01(t.activeListings / 10), metricKey(s.agencyId, "inv", t.territoryKey), null, t.activeListings, t));
    }
    // Dominance.
    if (t.dominance != null) {
      const mk = metricKey(s.agencyId, "dom", t.territoryKey);
      const c = classifyScoreChange(prevMetrics[mk] ?? null, t.dominance, { deltaThreshold: 12, newSignificantAt: 60 });
      if (c.direction === "up" || c.direction === "new") out.push(build("agency_dominance_gained", c.magnitude, mk, c.prev, c.curr, t));
      else if (c.direction === "down") out.push(build("agency_dominance_lost", c.magnitude, mk, c.prev, c.curr, t));
    }
    // Territory momentum.
    if (t.momentum != null) {
      const mk = metricKey(s.agencyId, "mom", t.territoryKey);
      const c = classifyScoreChange(prevMetrics[mk] ?? null, t.momentum, { deltaThreshold: 20 });
      if (c.direction === "up") out.push(build("agency_momentum_spike", c.magnitude, mk, c.prev, c.curr, t));
      else if (c.direction === "down") out.push(build("agency_momentum_drop", c.magnitude, mk, c.prev, c.curr, t));
    }
    // Inventory.
    {
      const mk = metricKey(s.agencyId, "inv", t.territoryKey);
      const c = classifyCountChange(prevMetrics[mk] ?? null, t.activeListings, { deltaThreshold: 3, pctThreshold: 0.3, magnitudeScale: 10 });
      if (c.direction === "up") out.push(build("agency_inventory_growth", c.magnitude, mk, c.prev, c.curr, t));
      else if (c.direction === "down") out.push(build("agency_inventory_loss", c.magnitude, mk, c.prev, c.curr, t));
    }
    // Opportunities surfaced by Phase 26.4.
    for (const op of t.opportunityTypes) {
      if (OPP_TYPES.has(op)) {
        out.push(build(op as AgencyIntelSignalType, 0.5, metricKey(s.agencyId, `opp:${op}`, t.territoryKey), null, null, t, { confidence: 0.6 }));
      }
    }
  }

  // Left area: previously had inventory, now absent / zero.
  for (const key of knownAreas) {
    if (currentKeys.has(key)) continue;
    const mk = metricKey(s.agencyId, "inv", key);
    const prev = prevMetrics[mk];
    if (prev != null && prev > 0) {
      out.push({
        agencyId: s.agencyId, signalType: "agency_left_area",
        severity: severityFor("agency_left_area", clamp01(prev / 10)),
        importance: importanceFor({ type: "agency_left_area", magnitude: clamp01(prev / 10), isRisk: true }),
        confidence: 0.7, title: SIGNAL_LABEL.agency_left_area, description: null,
        territoryType: null, city: null, neighborhood: null, street: null, entityType: null, entityId: null,
        scoreBefore: prev, scoreAfter: 0, dedupeKey: dedupeKey(s.agencyId, "agency_left_area", key), metricKey: mk,
        metadata: { territoryKey: key },
      });
    }
  }

  return dedupeDetectedBatch(out);
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function inferKnownAreas(prevMetrics: Record<string, number | undefined>): Set<string> {
  const set = new Set<string>();
  for (const k of Object.keys(prevMetrics)) {
    // metric keys look like "<agency>|dom|<territoryKey>" or "|inv|".
    const parts = k.split("|");
    if (parts.length === 3 && (parts[1] === "dom" || parts[1] === "inv" || parts[1] === "mom")) set.add(parts[2]);
  }
  return set;
}

function pushCount(
  out: DetectedAgencySignal[], build: BuildFn, prevMetrics: Record<string, number | undefined>,
  agencyId: string, metric: string, curr: number, upType: AgencyIntelSignalType, downType: AgencyIntelSignalType,
  opts: { deltaThreshold: number; pctThreshold: number; magnitudeScale: number },
): void {
  const mk = metricKey(agencyId, metric);
  const c = classifyCountChange(prevMetrics[mk] ?? null, curr, opts);
  if (c.direction === "up") out.push(build(upType, c.magnitude, mk, c.prev, c.curr, null, { metadata: { [metric]: curr } }));
  else if (c.direction === "down") out.push(build(downType, c.magnitude, mk, c.prev, c.curr, null, { metadata: { [metric]: curr } }));
}

function pushIncrease(
  out: DetectedAgencySignal[], build: BuildFn, prevMetrics: Record<string, number | undefined>,
  agencyId: string, metric: string, curr: number, type: AgencyIntelSignalType,
): void {
  const mk = metricKey(agencyId, metric);
  const prev = prevMetrics[mk] ?? null;
  if ((prev == null && curr > 0) || (prev != null && curr - prev >= 1)) {
    const delta = prev == null ? curr : curr - prev;
    out.push(build(type, clamp01(delta / 3), mk, prev, curr, null, { metadata: { [metric]: curr, added: delta }, confidence: 0.75 }));
  }
}

type BuildFn = (
  type: AgencyIntelSignalType, magnitude: number, mKey: string,
  scoreBefore: number | null, scoreAfter: number | null,
  territory: TerritorySnapshot | null, extra?: Partial<DetectedAgencySignal>,
) => DetectedAgencySignal;
