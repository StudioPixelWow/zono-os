// ============================================================================
// ZONO — Agency report snapshot builder (Phase 26.7, SERVER-ONLY).
// Assembles a single, auditable source snapshot from the real intelligence
// layers (profile, scores, territory stats, signals, timeline, knowledge graph,
// agents, branches). Stored as source_snapshot for full auditability. No mock
// data — absent areas are recorded in `missing`.
// ============================================================================
import "server-only";
import { getAgencyById } from "../agencyRepository";
import { listBranches } from "../branchRepository";
import { getScore } from "../scoring/agencyScoringRepository";
import { listByAgency as listTerr } from "../territory/agencyTerritoryRepository";
import { listByAgency as listGraph } from "../graph/agencyGraphRepository";
import { listActiveSignals, listTimelineIntelligence } from "../intelligence/agencySignalRepository";
import { meanPresent } from "../scoring/agencyScoringTypes";
import { DEFAULT_TERRITORY_PERIOD } from "../territory/agencyTerritoryTypes";
import type { AgencyReportSnapshot, SnapshotSignal } from "./agencyReportTypes";

const dayIso = (ms: number) => { const d = new Date(ms); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); };

export async function buildAgencyReportSnapshot(agencyId: string, periodDays: number = DEFAULT_TERRITORY_PERIOD): Promise<AgencyReportSnapshot | null> {
  const agency = await getAgencyById(agencyId);
  if (!agency) return null;
  const nowMs = Date.now();

  const [score, terr, graph, branches, signals, events] = await Promise.all([
    getScore(agencyId),
    listTerr(agencyId, periodDays),
    listGraph(agencyId, { activeOnly: true }),
    listBranches(agencyId),
    listActiveSignals(agencyId, 100),
    listTimelineIntelligence(agencyId, 30),
  ]);

  const cityStats = terr.filter((t) => t.territoryType === "city");
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const luxuryShares = terr.map((t) => t.luxuryShare).filter((x): x is number => typeof x === "number");
  const topDominant = cityStats
    .filter((t) => t.dominanceScore != null)
    .map((t) => ({ label: t.city || t.territoryKey, dominance: Math.round(t.dominanceScore as number) }))
    .sort((a, b) => b.dominance - a.dominance).slice(0, 5);

  const snapSignals: SnapshotSignal[] = signals.map((s) => ({
    id: s.id, signalType: s.signalType, severity: s.severity, importance: s.importance,
    title: s.title, territoryLabel: s.street || s.neighborhood || s.city || null,
  }));

  const socialLinkCount = [agency.facebookUrl, agency.instagramUrl, agency.linkedinUrl, agency.youtubeUrl].filter(Boolean).length;
  const hasDigital = !!agency.website || socialLinkCount > 0 || !!agency.googlePlaceId;

  const missing: string[] = [];
  const soldCount = sum(cityStats.map((t) => t.soldCount));
  const dealsCount = sum(cityStats.map((t) => t.dealsCount));
  if (soldCount === 0 && dealsCount === 0) missing.push("נתוני עסקאות מאומתים");
  if (!hasDigital) missing.push("נתוני נוכחות דיגיטלית");
  if (terr.length === 0) missing.push("נתוני טריטוריה");
  if ((score?.dataConfidence ?? 100) < 40) missing.push("נתונים מספיקים לחישוב מהימן");

  return {
    agencyId, agencyName: agency.name,
    periodStart: dayIso(nowMs - periodDays * 86_400_000),
    periodEnd: dayIso(nowMs),
    scores: {
      overall: score?.overall ?? null, marketStrength: score?.marketStrength ?? null, growth: score?.growth ?? null,
      digital: score?.digital ?? null, luxury: score?.luxury ?? null, inventory: score?.inventory ?? null,
      coverage: score?.coverage ?? null, projects: score?.projects ?? null, reputation: score?.reputation ?? null,
      momentum: score?.momentum ?? null, competitionThreat: score?.competitionThreat ?? null, dataConfidence: score?.dataConfidence ?? null,
    },
    territory: {
      cities: [...new Set(cityStats.map((t) => t.city).filter(Boolean) as string[])],
      neighborhoods: [...new Set(terr.filter((t) => t.territoryType === "neighborhood").map((t) => t.neighborhood).filter(Boolean) as string[])],
      streets: [...new Set(terr.filter((t) => t.territoryType === "street").map((t) => t.street).filter(Boolean) as string[])],
      topDominant,
      avgDominance: meanPresent(terr.map((t) => t.dominanceScore)),
      avgMomentum: meanPresent(terr.map((t) => t.momentumScore)),
      activeListings: sum(cityStats.map((t) => t.activeListingsCount)),
      soldCount, dealsCount,
      luxuryShare: luxuryShares.length ? Math.max(...luxuryShares) : null,
    },
    graph: {
      agentCount: graph.filter((r) => r.entityType === "agent" && r.relationshipType === "agent_member").length,
      branchCount: branches.length,
      projectCount: graph.filter((r) => r.entityType === "project").length,
      developerCount: graph.filter((r) => r.entityType === "developer").length,
      propertyCount: graph.filter((r) => r.entityType === "property").length,
    },
    signals: snapSignals,
    recentEvents: events.map((e) => ({ eventType: e.eventType, title: e.title, importance: e.importance })),
    hasDigital, hasReputation: false, missing,
  };
}
