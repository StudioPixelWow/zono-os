// ============================================================================
// 🩺 Continuous Learning — city learning profile (server-only). 26.4.16 · Part 1/8.
// Combines the existing Census + latest Research Job + freshness into one living
// profile per city. READ-ONLY (no writes). Reuses everything already built.
// ============================================================================
import "server-only";
import { getCityBrokerageCensus } from "../brokerage-knowledge";
import { latestJobForCity } from "../research-jobs/repository";
import { freshnessScore, learningHealth } from "./freshness";
import { classifyCityPriority } from "./priority";
import { REASON_HE, type CityLearningProfile } from "./types";

/** Build the living learning profile for a city. */
export async function getCityLearningProfile(orgId: string | null, cityRaw: string): Promise<CityLearningProfile> {
  const census = await getCityBrokerageCensus(orgId ?? "", cityRaw);
  const job = await latestJobForCity(orgId, cityRaw).catch(() => null);

  const verificationPct = census.estimatedActiveOffices > 0
    ? Math.round((census.verifiedOffices / census.estimatedActiveOffices) * 100) : 0;
  const fresh = freshnessScore(census.lastResearchAt);
  const waitingCandidates = job?.candidatesWaitingForEvidence ?? census.missingKnowledge.unverifiedCandidates;
  const pendingVerification = census.missingKnowledge.unverifiedCandidates;
  const remaining = pendingVerification + census.brokersUnmatched + census.listingsUnlinked;
  const pendingRatio = census.brokersTotal + census.listingsTotal > 0
    ? Math.min(1, remaining / (census.brokersTotal + census.listingsTotal)) : (remaining > 0 ? 1 : 0);
  const health = learningHealth({ coveragePct: census.marketCoveragePct, freshnessScore: fresh, verificationPct, pendingRatio });

  const priority = classifyCityPriority({
    city: census.city, cityNormalized: census.cityNormalized,
    waitingCandidates, unmatchedBrokers: census.brokersUnmatched, unlinkedListings: census.listingsUnlinked,
    coveragePct: census.marketCoveragePct, freshnessScore: fresh, rawDataExists: census.rawDataExists,
  });
  const nextRefreshHint = priority ? `רענון הבא: ${REASON_HE[priority.reason]} (עדיפות ${priority.tier})` : "אין עבודה ממתינה — הידע מעודכן";

  const missingKnowledge: string[] = [];
  if (pendingVerification > 0) missingKnowledge.push(`${pendingVerification} מועמדים לא מאומתים`);
  if (census.brokersUnmatched > 0) missingKnowledge.push(`${census.brokersUnmatched} מתווכים ללא משרד`);
  if (census.listingsUnlinked > 0) missingKnowledge.push(`${census.listingsUnlinked} מודעות ללא משרד`);

  return {
    city: census.city, cityNormalized: census.cityNormalized,
    knownOffices: census.estimatedActiveOffices, verifiedOffices: census.verifiedOffices, researchingOffices: census.researchingOffices,
    knownBrokers: census.brokersTotal, knownListings: census.listingsTotal,
    waitingCandidates, pendingVerification,
    lastResearchAt: census.lastResearchAt, lastRefreshAt: census.lastResearchAt, lastEvidenceChangeAt: census.lastResearchAt,
    learningHealth: health, coveragePct: census.marketCoveragePct, freshnessScore: fresh, verificationPct,
    dataPresenceScore: census.dataPresenceScore, missingKnowledge, estimatedRemainingWork: remaining, nextRefreshHint,
    activeJob: job ? { id: job.id, status: job.status, stage: job.currentStage, progress: job.progressPercent } : null,
  };
}
