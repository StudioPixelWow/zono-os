// ============================================================================
// 🪄 Lazy City Brokerage Learning™ (Phase 26.4.9). Server-only.
// ZONO learns a city ONLY when it becomes relevant (new user/broker/listing/lead
// in that city, or the knowledge is missing/weak/stale). This is NOT a national
// crawler — it is on-demand bootstrap + incremental refresh on top of the
// persistent Brokerage Knowledge Base and the City-First discovery engine.
// Never blocks the user; reuses healthy knowledge; never fakes coverage.
// Does NOT touch BIE / MAI / valuation / confidence formulas / schema.
// ============================================================================
import "server-only";
import { getCityKnowledgeStatus, CITY_FRESHNESS, type CityKnowledgeStatus } from "./brokerage-knowledge";
import { discoverBrokerageOfficesForCity, type CityDiscoveryResult } from "./city-discovery";

export type EnsureDecision = "bootstrapped" | "refreshed" | "reused" | "insufficient_data";
export interface EnsureCityResult {
  city: string; reason: string;
  decision: EnsureDecision;
  statusBefore: { recommendedAction: CityKnowledgeStatus["recommendedAction"]; coverageScore: number; confidenceScore: number; freshnessScore: number; existsInKnowledgeBase: boolean; stalenessReason: string | null };
  discovery: CityDiscoveryResult | null;
  explanation: { whyRan: string; knownBefore: string; newlyLearned: string; researchAvoided: string; remainingUnknown: string; nextRefresh: string };
}

/**
 * Ensure the org's brokerage knowledge of a city is present and fresh enough.
 * Called from relevant triggers (onboarding city, broker/property/lead creation,
 * external-listing sync, or a manual "learn city" button). Best-effort, resumable.
 * opts.force overrides the recommended action (for the manual buttons).
 */
export async function ensureCityBrokerageKnowledge(
  orgId: string, city: string, reason: string,
  opts: { force?: "bootstrap" | "refresh" | "reuse" } = {},
): Promise<EnsureCityResult> {
  const status = await getCityKnowledgeStatus(orgId, city);

  let decision: EnsureDecision;
  if (opts.force === "bootstrap") decision = "bootstrapped";
  else if (opts.force === "refresh") decision = "refreshed";
  else if (opts.force === "reuse") decision = "reused";
  else decision = status.recommendedAction === "BOOTSTRAP_CITY" ? "bootstrapped"
    : status.recommendedAction === "REFRESH_CITY" ? "refreshed"
      : status.recommendedAction === "INSUFFICIENT_DATA" ? "insufficient_data" : "reused";

  let discovery: CityDiscoveryResult | null = null;
  if (decision === "bootstrapped") {
    // Full bootstrap: deep public research + broker match + listing relink.
    discovery = await discoverBrokerageOfficesForCity(orgId, city, { depth: "deep", includePublicResearch: true, includeBrokerRematch: true, includeListingRelink: true });
  } else if (decision === "refreshed") {
    // Light incremental refresh: reuse knowledge, no full public research.
    discovery = await discoverBrokerageOfficesForCity(orgId, city, { depth: "quick", includePublicResearch: false, includeBrokerRematch: true, includeListingRelink: true });
  }

  const whyRan = decision === "reused" ? `הידע על ${city} בריא — נעשה שימוש חוזר ללא מחקר.`
    : decision === "insufficient_data" ? `אין מספיק נתונים פנימיים או ספק חיפוש כדי ללמוד את ${city} כעת.`
      : `${reason}. סיבת הפעולה: ${status.stalenessReason ?? status.recommendedAction}.`;
  const known = discovery?.knownBefore;
  const learned = discovery?.newlyLearned;
  const avoided = discovery?.researchAvoided;

  return {
    city: status.city, reason, decision,
    statusBefore: { recommendedAction: status.recommendedAction, coverageScore: status.coverageScore, confidenceScore: status.confidenceScore, freshnessScore: status.freshnessScore, existsInKnowledgeBase: status.existsInKnowledgeBase, stalenessReason: status.stalenessReason },
    discovery,
    explanation: {
      whyRan,
      knownBefore: known ? `${known.offices} משרדים · ${known.brokersLinked}/${known.brokers} מתווכים משויכים · ${known.listingsLinked} מודעות` : `${status.verifiedOffices} משרדים · ${status.linkedListings} מודעות`,
      newlyLearned: learned ? `${learned.offices} משרדים · ${learned.brokers} מתווכים · ${learned.listings} מודעות` : "—",
      researchAvoided: avoided ? `${avoided.officesReused} משרדים מהידע · ${avoided.brokersFromKnowledge} מתווכים · ${avoided.listingsFromKnowledge} מודעות` : "—",
      remainingUnknown: discovery ? `${discovery.brokersResearching} מתווכים עדיין במחקר` : `${status.knownBrokers - 0} ידועים · גודל שוק כולל אינו ידוע`,
      nextRefresh: `מומלץ לרענן בעוד ${CITY_FRESHNESS.refreshStaleDays} יום או כשמופיעים מתווכים/מודעות חדשים.`,
    },
  };
}
