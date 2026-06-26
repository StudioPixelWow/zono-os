// ============================================================================
// ZONO — Agency Scoring service (Phase 26.5, SERVER-ONLY).
// Loads real internal evidence (profile, agents, branches, knowledge graph,
// territory stats, signals, timeline), computes the 11 scores + overall + data
// confidence, persists idempotently, and emits non-noisy signals + timeline
// events for what changed. No UI, no scraping, no mock data, no fabricated values.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { getAgencyById } from "../agencyRepository";
import { listBranches } from "../branchRepository";
import { listSignals, createSignal } from "../signalRepository";
import { listTimeline, addTimelineEvent } from "../timelineRepository";
import { listByAgency as listGraph } from "../graph/agencyGraphRepository";
import { listByAgency as listTerr } from "../territory/agencyTerritoryRepository";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import { computeAgencyScores, threatAgainstUserArea } from "./agencyScoreCalculator";
import { getScore, upsertFullScore, getTopByScore } from "./agencyScoringRepository";
import { meanPresent } from "./agencyScoringTypes";
import type { AgencyScoreInput, AgencyScoreResult } from "./agencyScoringTypes";
import type { AgencyScore } from "../types";

type Obj = Record<string, unknown>;
const GROWTH_EVENTS = new Set([
  "area_entered_city", "area_entered_neighborhood", "territory_entered_street",
  "territory_dominant", "agent_network_expanded", "territory_momentum_shift", "first_area_property",
]);

export interface AgencyScoringResult {
  agencyId: string;
  scored: boolean;
  overall: number | null;
  dataConfidence: number;
  highThreat: boolean;
  lowConfidence: boolean;
  signalsCreated: number;
  timelineEventsCreated: number;
}

/** Gather the real evidence behind one agency's scores. */
async function loadScoreInput(agencyId: string, periodDays: number): Promise<AgencyScoreInput | null> {
  const agency = await getAgencyById(agencyId);
  if (!agency) return null;
  const db = await createClient();
  const nowMs = Date.now();

  const [graph, terr, branches, signals, timeline] = await Promise.all([
    listGraph(agencyId, { activeOnly: true }),
    listTerr(agencyId, periodDays),
    listBranches(agencyId),
    listSignals(agencyId, 100),
    listTimeline(agencyId, 200),
  ]);

  // Territory aggregates (city-level for counts to avoid double-counting levels).
  const cityStats = terr.filter((t) => t.territoryType === "city");
  const avgDominance = meanPresent(terr.map((t) => t.dominanceScore));
  const avgMomentum = meanPresent(terr.map((t) => t.momentumScore));
  const luxuryShares = terr.map((t) => t.luxuryShare).filter((x): x is number => typeof x === "number");
  const luxuryShare = luxuryShares.length ? Math.max(...luxuryShares) : null;
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  // Graph entity counts.
  const agentCount = graph.filter((r) => r.entityType === "agent" && r.relationshipType === "agent_member").length;
  const projectCount = graph.filter((r) => r.entityType === "project").length;
  const developerCount = graph.filter((r) => r.entityType === "developer").length;
  const propertyIds = graph.filter((r) => r.entityType === "property").map((r) => r.entityId);

  // Property-type diversity (distinct internal property types).
  let propertyTypeDiversity = 0;
  if (propertyIds.length) {
    const { data } = await db.from("properties").select("type").in("id", propertyIds).limit(2000);
    propertyTypeDiversity = new Set(((data as Obj[] | null) ?? []).map((p) => p.type as string).filter(Boolean)).size;
  }

  // Recency.
  const recentSignalCount = signals.filter((s) => (nowMs - new Date(s.createdAt).getTime()) < 30 * 86_400_000).length;
  const growthEventCount = timeline.filter((e) => GROWTH_EVENTS.has(e.eventType) && (nowMs - new Date(e.eventDate).getTime()) < periodDays * 86_400_000).length;
  const newestEvidence = [
    ...cityStats.map((t) => t.calculatedAt),
    ...signals.map((s) => s.createdAt),
  ].filter(Boolean).sort().slice(-1)[0];
  const dataAgeDays = newestEvidence ? Math.max(0, Math.round((nowMs - new Date(newestEvidence).getTime()) / 86_400_000)) : null;

  // Digital footprint (profile fields only — null when none stored).
  const socialLinkCount = [agency.facebookUrl, agency.instagramUrl, agency.linkedinUrl, agency.youtubeUrl].filter(Boolean).length;
  const hasWebsite = !!agency.website;
  const hasGooglePlace = !!agency.googlePlaceId;
  const digitalFieldsTracked = hasWebsite || socialLinkCount > 0 || hasGooglePlace;

  return {
    avgDominance, avgMomentum,
    cities: cityStats.length,
    neighborhoods: terr.filter((t) => t.territoryType === "neighborhood").length,
    streets: terr.filter((t) => t.territoryType === "street").length,
    activeListings: sum(cityStats.map((t) => t.activeListingsCount)),
    soldCount: sum(cityStats.map((t) => t.soldCount)),
    dealsCount: sum(cityStats.map((t) => t.dealsCount)),
    luxuryShare, propertyTypeDiversity,
    exclusiveCount: sum(cityStats.map((t) => t.exclusiveCount)),
    territoryStatsCount: terr.length,
    agentCount, branchCount: branches.length, projectCount, developerCount,
    recentSignalCount, growthEventCount,
    hasWebsite, socialLinkCount, hasGooglePlace, digitalFieldsTracked,
    hasReputationData: false, rating: null, reviewCount: 0, // no real agency-review data source yet
    dataAgeDays,
  };
}

/** Calculate + persist one agency's scores, emitting changed-state signals/events. */
export async function calculateAgencyScores(agencyId: string, periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<AgencyScoringResult> {
  const nowMs = Date.now();
  const periodEnd = new Date(nowMs).toISOString();
  const periodStart = new Date(nowMs - periodDays * 86_400_000).toISOString();
  const out: AgencyScoringResult = { agencyId, scored: false, overall: null, dataConfidence: 0, highThreat: false, lowConfidence: false, signalsCreated: 0, timelineEventsCreated: 0 };

  const input = await loadScoreInput(agencyId, periodDays);
  if (!input) return out;

  const prev = await getScore(agencyId);
  const result = computeAgencyScores(input);

  await upsertFullScore({ agencyId, result, periodStart, periodEnd, calculatedAt: periodEnd });
  out.scored = true;
  out.overall = result.overall;
  out.dataConfidence = result.dataConfidence;
  out.highThreat = (result.competitionThreat ?? 0) >= 70;
  out.lowConfidence = result.dataConfidence < 30;

  const { signals, events } = deriveSignalsAndEvents(prev, result);
  for (const s of signals) {
    await createSignal({ agencyId, signalType: s.type, severity: s.severity, title: s.title, description: s.description, metadata: s.metadata })
      .then(() => { out.signalsCreated++; }).catch(() => {});
  }
  for (const e of events) {
    await addTimelineEvent({ agencyId, eventType: e.type, title: e.title, metadata: e.metadata })
      .then(() => { out.timelineEventsCreated++; }).catch(() => {});
  }
  return out;
}

interface SigSpec { type: string; severity: "info" | "warning" | "critical"; title: string; description: string | null; metadata: Obj }
interface EvtSpec { type: string; title: string; metadata: Obj }

/** Non-noisy: signals/events fire only on meaningful threshold crossings/changes. */
function deriveSignalsAndEvents(prev: AgencyScore | null, r: AgencyScoreResult): { signals: SigSpec[]; events: EvtSpec[] } {
  const signals: SigSpec[] = [];
  const events: EvtSpec[] = [];
  const newOverall = r.overall ?? null;
  const oldOverall = prev?.overall ?? null;

  if (newOverall != null && oldOverall != null) {
    const delta = newOverall - oldOverall;
    if (delta >= 15) {
      signals.push({ type: "agency_score_spike", severity: "info", title: `עלייה חדה בציון הכולל (+${Math.round(delta)})`, description: null, metadata: { from: oldOverall, to: newOverall } });
      events.push({ type: "agency_score_jump", title: `ציון הסוכנות עלה משמעותית`, metadata: { from: oldOverall, to: newOverall } });
    } else if (delta <= -15) {
      signals.push({ type: "agency_score_drop", severity: "warning", title: `ירידה חדה בציון הכולל (${Math.round(delta)})`, description: null, metadata: { from: oldOverall, to: newOverall } });
      events.push({ type: "agency_score_drop", title: `ציון הסוכנות ירד משמעותית`, metadata: { from: oldOverall, to: newOverall } });
    }
  }

  const crossedUp = (cur: number | null, old: number | null | undefined, th: number) =>
    cur != null && cur >= th && (old == null || old < th);

  if (crossedUp(r.competitionThreat, prev?.competitionThreat, 70)) {
    signals.push({ type: "high_competition_threat", severity: "critical", title: "מתחרה בסיכון תחרותי גבוה", description: null, metadata: { threat: r.competitionThreat } });
    events.push({ type: "became_high_threat", title: "הסוכנות הפכה למתחרה בסיכון גבוה", metadata: { threat: r.competitionThreat } });
  }
  if (crossedUp(r.growth, prev?.growth, 70)) {
    signals.push({ type: "rapid_growth_detected", severity: "info", title: "זוהתה צמיחה מהירה", description: null, metadata: { growth: r.growth } });
    events.push({ type: "growth_accelerated", title: "צמיחת הסוכנות מאיצה", metadata: { growth: r.growth } });
  }
  if (crossedUp(r.marketStrength, prev?.marketStrength, 75)) {
    signals.push({ type: "strong_market_position", severity: "info", title: "עמדת שוק חזקה", description: null, metadata: { marketStrength: r.marketStrength } });
    events.push({ type: "market_strength_threshold", title: "חוזק השוק של הסוכנות חצה סף גבוה", metadata: { marketStrength: r.marketStrength } });
  }
  if (r.dataConfidence < 30 && (prev?.dataConfidence == null || prev.dataConfidence >= 30)) {
    signals.push({ type: "weak_data_confidence", severity: "warning", title: "רמת ביטחון נתונים נמוכה לציון", description: null, metadata: { dataConfidence: r.dataConfidence } });
  }

  return { signals, events };
}

// ── Service API ───────────────────────────────────────────────────────────────

/** Recompute scores for every active agency in the org. Idempotent. */
export async function calculateOrganizationAgencyScores(periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<{ agencies: number; results: AgencyScoringResult[] }> {
  const org = await currentOrgId();
  const db = await createClient();
  const { data } = await db.from("agencies").select("id").eq("organization_id", org).eq("active", true).limit(2000);
  const ids = ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
  const results: AgencyScoringResult[] = [];
  for (const id of ids) {
    try { results.push(await calculateAgencyScores(id, periodDays)); }
    catch { /* isolate per-agency failure */ }
  }
  return { agencies: ids.length, results };
}

export function getAgencyScores(agencyId: string): Promise<AgencyScore | null> { return getScore(agencyId); }

export function getTopAgenciesByScore(scoreType: string, limit = 20): Promise<AgencyScore[]> { return getTopByScore(scoreType, limit); }

/**
 * Threat of a competitor agency specifically against the user agency's area,
 * blending the competitor's base threat with the territory overlap between them.
 */
export async function getAgencyThreatScoreForUserArea(userAgencyId: string, agencyId: string, periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<{ threat: number | null; overlap: number }> {
  const [userTerr, compTerr, compScore] = await Promise.all([
    listTerr(userAgencyId, periodDays),
    listTerr(agencyId, periodDays),
    getScore(agencyId),
  ]);
  const userKeys = new Set(userTerr.filter((t) => t.activeListingsCount > 0).map((t) => t.territoryKey));
  const compKeys = compTerr.filter((t) => t.activeListingsCount > 0).map((t) => t.territoryKey);
  const overlapCount = compKeys.filter((k) => userKeys.has(k)).length;
  const overlap = compKeys.length ? overlapCount / compKeys.length : 0;
  return { threat: threatAgainstUserArea(compScore?.competitionThreat ?? null, overlap), overlap };
}

export interface AgencyScoreComparison {
  a: AgencyScore | null;
  b: AgencyScore | null;
  diff: Record<string, number | null>;
}
export async function compareAgencyScores(agencyAId: string, agencyBId: string): Promise<AgencyScoreComparison> {
  const [a, b] = await Promise.all([getScore(agencyAId), getScore(agencyBId)]);
  const keys = ["marketStrength", "growth", "digital", "luxury", "inventory", "coverage", "projects", "reputation", "momentum", "competitionThreat", "overall"] as const;
  const diff: Record<string, number | null> = {};
  for (const k of keys) {
    const av = a?.[k] ?? null, bv = b?.[k] ?? null;
    diff[k] = (av != null && bv != null) ? Math.round((av - bv) * 10) / 10 : null;
  }
  return { a, b, diff };
}
