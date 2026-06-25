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
import type { FanoutInput, FanoutResult, FanoutSource, MarketRepository } from "./types";

interface OrgFanoutCounts { linksCreated: number; scoresUpdated: number; alertsCreated: number }

/** Evaluate one org against a set of shared sources: link + personal score + alert. */
export async function fanoutSourcesToOrg(
  repo: MarketRepository,
  orgId: string,
  area: { city: string; neighborhood: string | null },
  sources: FanoutSource[],
): Promise<OrgFanoutCounts> {
  const counts: OrgFanoutCounts = { linksCreated: 0, scoresUpdated: 0, alertsCreated: 0 };
  const settings = await repo.getOrgRadarSettings(orgId);
  const agentPreferences: AgentScoringPreferences = {
    expertiseCities: [area.city],
    expertiseNeighborhoods: area.neighborhood ? [area.neighborhood] : [],
  };

  for (const fs of sources) {
    const buyerMatchCount = estimateBuyerMatchCount(fs.source, area);
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
): Promise<FanoutResult> {
  const result: FanoutResult = { affectedOrgsCount: 0, linksCreated: 0, scoresUpdated: 0, alertsCreated: 0 };
  if (input.marketSources.length === 0) return result;

  const orgs = await repo.getRelevantOrgsForMarketArea(input.city, input.neighborhood);
  if (orgs.length === 0) return result;

  const area = { city: input.city, neighborhood: input.neighborhood };
  for (const { orgId } of orgs) {
    result.affectedOrgsCount++;
    const c = await fanoutSourcesToOrg(repo, orgId, area, input.marketSources);
    result.linksCreated += c.linksCreated;
    result.scoresUpdated += c.scoresUpdated;
    result.alertsCreated += c.alertsCreated;
  }
  return result;
}
