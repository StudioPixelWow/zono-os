// ============================================================================
// ZONO Property Radar™ — fan-out shared market sources to relevant orgs.
// The raw listing is shared (market_property_sources); the opportunity score +
// alert are PERSONAL per org. Reuses the Phase-4 intelligence engine for scoring
// + alert building, writes through the MarketRepository, and dedups unread alerts.
// ============================================================================
import {
  calculatePropertyOpportunityScore,
  estimateBuyerMatchCount,
} from "../intelligence/scoring";
import { createPropertyOpportunityAlert, shouldCreatePropertyAlert } from "../intelligence/alerts";
import type { AgentScoringPreferences } from "../intelligence/types";
import { matchPropertyToBuyers, normalizeListingForMatching } from "../matching/engine";
import type {
  FastFilterConfig,
  MatchEngineResult,
  MatchableBuyer,
  MatchWeights,
  MatchingPort,
} from "../matching/types";
import { endOfTodayIso } from "../matching/util";
import type { FanoutInput, FanoutResult, FanoutSource, MarketRepository } from "./types";

interface OrgFanoutCounts { linksCreated: number; scoresUpdated: number; alertsCreated: number; matchesUpserted: number; tasksCreated: number }

/** Optional deterministic buyer-matching dependency (injected by the engine/dev-check). */
export interface FanoutMatchingDeps {
  matching?: MatchingPort | null;
  weights?: MatchWeights;
  filterConfig?: FastFilterConfig;
}

/** Persist the matches for one source against one org, returning relevant count + tasks. */
async function persistMatchesForSource(
  matching: MatchingPort,
  orgId: string,
  sourceId: string,
  linkedPropertyId: string | null,
  result: MatchEngineResult,
): Promise<{ matchesUpserted: number; tasksCreated: number }> {
  let matchesUpserted = 0;
  let tasksCreated = 0;
  for (const m of result.matches) {
    const up = await matching.upsertBuyerPropertyMatch({
      orgId,
      buyerId: m.buyerId,
      marketPropertySourceId: sourceId,
      linkedPropertyId,
      matchScore: m.matchScore,
      matchLevel: m.matchLevel,
      breakdown: m.breakdown,
      manualBonus: m.manualBonus,
      manualPenalty: m.manualPenalty,
      explanation: m.explanation,
    });
    matchesUpserted++;
    // Auto-task only for PERFECT matches that are new or just upgraded — never duplicate.
    if (m.matchLevel === "perfect" && (up.created || up.scoreChanged)) {
      if (!(await matching.perfectMatchTaskExists(orgId, m.buyerId, sourceId))) {
        await matching.createPerfectMatchTask({
          orgId,
          buyerId: m.buyerId,
          marketPropertySourceId: sourceId,
          buyerName: m.buyer.fullName,
          dueAtIso: endOfTodayIso(),
          matchScore: m.matchScore,
        });
        tasksCreated++;
      }
    }
  }
  return { matchesUpserted, tasksCreated };
}

/** Evaluate one org against a set of shared sources: matches + link + personal score + alert. */
export async function fanoutSourcesToOrg(
  repo: MarketRepository,
  orgId: string,
  area: { city: string; neighborhood: string | null },
  sources: FanoutSource[],
  deps?: FanoutMatchingDeps,
): Promise<OrgFanoutCounts> {
  const counts: OrgFanoutCounts = { linksCreated: 0, scoresUpdated: 0, alertsCreated: 0, matchesUpserted: 0, tasksCreated: 0 };
  const settings = await repo.getOrgRadarSettings(orgId);
  const agentPreferences: AgentScoringPreferences = {
    expertiseCities: [area.city],
    expertiseNeighborhoods: area.neighborhood ? [area.neighborhood] : [],
  };

  // Load this org's active buyers ONCE (deterministic matching reuses them per source).
  const matching = deps?.matching ?? null;
  let buyers: MatchableBuyer[] | null = null;
  if (matching) {
    try {
      buyers = await matching.getActiveBuyersForOrg(orgId);
    } catch {
      buyers = null; // matching failure must never break fan-out
    }
  }

  for (const fs of sources) {
    // Real deterministic buyer matching drives the buyer count (no AI, scales).
    let buyerMatchCount: number;
    if (matching && buyers) {
      const property = normalizeListingForMatching(fs.source, fs.sourceId);
      const matchResult = matchPropertyToBuyers({ property, buyers, weights: deps?.weights, filterConfig: deps?.filterConfig });
      buyerMatchCount = matchResult.relevantCount;
      try {
        const persisted = await persistMatchesForSource(matching, orgId, fs.sourceId, null, matchResult);
        counts.matchesUpserted += persisted.matchesUpserted;
        counts.tasksCreated += persisted.tasksCreated;
      } catch {
        /* persistence failure is non-fatal — the count still feeds scoring */
      }
    } else {
      buyerMatchCount = estimateBuyerMatchCount(fs.source, area); // placeholder fallback
    }

    const score = calculatePropertyOpportunityScore({ orgId, source: fs.source, area, buyerMatchCount, agentPreferences });

    const { linkId, created } = await repo.upsertOrgMarketPropertyLink(orgId, fs.sourceId, {
      relevanceStatus: "relevant",
      opportunityScore: score.totalScore,
      buyerMatchCount,
      reasons: score.reasons,
      recommendation: score.recommendation,
    });
    if (created) counts.linksCreated++;
    counts.scoresUpdated++;

    const create = fs.isUpdate
      ? fs.priceDropped ||
        score.totalScore >= settings.minPopupOpportunityScore ||
        (fs.source.listingType === "private" && settings.privatePropertyAlertsEnabled)
      : shouldCreatePropertyAlert(score, fs.source, settings);
    if (!create) continue;

    const built = createPropertyOpportunityAlert({ source: fs.source, score, isUpdate: fs.isUpdate, priceDropped: fs.priceDropped });
    if (await repo.existingUnreadMarketAlertExists(orgId, fs.sourceId, built.alertType)) continue;

    await repo.insertMarketAlert({
      orgId,
      marketPropertySourceId: fs.sourceId,
      orgMarketPropertyLinkId: linkId,
      alertType: built.alertType,
      title: built.title,
      message: built.message,
      priority: built.priority,
      opportunityScore: built.opportunityScore,
      metadata: built.metadata,
    });
    counts.alertsCreated++;
  }
  return counts;
}

export async function fanoutMarketSourcesToRelevantOrgs(
  repo: MarketRepository,
  input: FanoutInput,
  deps?: FanoutMatchingDeps,
): Promise<FanoutResult> {
  const result: FanoutResult = { affectedOrgsCount: 0, linksCreated: 0, scoresUpdated: 0, alertsCreated: 0, matchesUpserted: 0, tasksCreated: 0 };
  if (input.marketSources.length === 0) return result;

  const orgs = await repo.getRelevantOrgsForMarketArea(input.city, input.neighborhood);
  if (orgs.length === 0) return result;

  const area = { city: input.city, neighborhood: input.neighborhood };
  for (const { orgId } of orgs) {
    result.affectedOrgsCount++;
    const c = await fanoutSourcesToOrg(repo, orgId, area, input.marketSources, deps);
    result.linksCreated += c.linksCreated;
    result.scoresUpdated += c.scoresUpdated;
    result.alertsCreated += c.alertsCreated;
    result.matchesUpserted += c.matchesUpserted;
    result.tasksCreated += c.tasksCreated;
  }
  return result;
}
