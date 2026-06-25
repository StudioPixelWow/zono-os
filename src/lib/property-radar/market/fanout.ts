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
import type { FanoutInput, FanoutResult, MarketRepository } from "./types";

export async function fanoutMarketSourcesToRelevantOrgs(
  repo: MarketRepository,
  input: FanoutInput,
): Promise<FanoutResult> {
  const result: FanoutResult = { affectedOrgsCount: 0, linksCreated: 0, scoresUpdated: 0, alertsCreated: 0 };
  if (input.marketSources.length === 0) return result;

  const orgs = await repo.getRelevantOrgsForMarketArea(input.city, input.neighborhood);
  if (orgs.length === 0) return result;

  const area = { city: input.city, neighborhood: input.neighborhood };
  const agentPreferences: AgentScoringPreferences = {
    expertiseCities: [input.city],
    expertiseNeighborhoods: input.neighborhood ? [input.neighborhood] : [],
  };

  for (const { orgId } of orgs) {
    result.affectedOrgsCount++;
    const settings = await repo.getOrgRadarSettings(orgId);

    for (const fs of input.marketSources) {
      const buyerMatchCount = estimateBuyerMatchCount(fs.source, area);
      const score = calculatePropertyOpportunityScore({
        orgId,
        source: fs.source,
        area,
        buyerMatchCount,
        agentPreferences,
      });

      // Personal score saved on the org's link to the shared listing.
      const { linkId, created } = await repo.upsertOrgMarketPropertyLink(orgId, fs.sourceId, {
        relevanceStatus: "relevant",
        opportunityScore: score.totalScore,
        buyerMatchCount,
        reasons: score.reasons,
        recommendation: score.recommendation,
      });
      if (created) result.linksCreated++;
      result.scoresUpdated++;

      // Alert gating — UPDATED only on meaningful change; NEW per standard rules.
      const create = fs.isUpdate
        ? fs.priceDropped ||
          score.totalScore >= settings.minPopupOpportunityScore ||
          (fs.source.listingType === "private" && settings.privatePropertyAlertsEnabled)
        : shouldCreatePropertyAlert(score, fs.source, settings);
      if (!create) continue;

      const built = createPropertyOpportunityAlert({
        source: fs.source,
        score,
        isUpdate: fs.isUpdate,
        priceDropped: fs.priceDropped,
      });

      const exists = await repo.existingUnreadMarketAlertExists(orgId, fs.sourceId, built.alertType);
      if (exists) continue;

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
      result.alertsCreated++;
    }
  }

  return result;
}
