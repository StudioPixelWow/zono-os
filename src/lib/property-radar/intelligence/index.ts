// ============================================================================
// ZONO Property Radar™ — intelligence public surface + orchestrator.
// evaluateListingOpportunity ties scoring → persistence → alert-dedup → alert
// insert together. The sync engine calls it for NEW / UPDATED listings; it writes
// only through the RadarIntelligenceRepository (no direct DB access here).
// ============================================================================
import type { NormalizedListingMetadata, PropertyRadarArea } from "../providers/types";
import { calculatePropertyOpportunityScore, estimateBuyerMatchCount } from "./scoring";
import { createPropertyOpportunityAlert, shouldCreatePropertyAlert } from "./alerts";
import type {
  AgentScoringPreferences,
  OpportunityScoreResult,
  RadarIntelligenceRepository,
  RadarSettingsLite,
} from "./types";

export interface EvaluateListingInput {
  orgId: string;
  area: PropertyRadarArea;
  /** Prefer full details (carries phone / contactName) when available. */
  source: NormalizedListingMetadata;
  propertySourceId: string;
  linkedPropertyId?: string | null;
  agentId?: string | null;
  settings: RadarSettingsLite;
  agentName?: string | null;
  agentPreferences?: AgentScoringPreferences;
  marketAveragePrice?: number | null;
  /** True when this came from an UPDATED listing (vs NEW). */
  isUpdate?: boolean;
  /** True when the updated listing's price fell below the stored price. */
  priceDropped?: boolean;
}

export interface EvaluateListingResult {
  score: OpportunityScoreResult;
  alertCreated: boolean;
  alertType?: string;
  duplicateSuppressed: boolean;
}

export async function evaluateListingOpportunity(
  repo: RadarIntelligenceRepository,
  input: EvaluateListingInput,
): Promise<EvaluateListingResult> {
  const buyerMatchCount = estimateBuyerMatchCount(input.source, input.area);

  const score = calculatePropertyOpportunityScore({
    orgId: input.orgId,
    source: input.source,
    area: input.area,
    buyerMatchCount,
    marketAveragePrice: input.marketAveragePrice ?? null,
    agentPreferences: input.agentPreferences,
  });

  // Always persist the latest score.
  await repo.upsertOpportunityScore(
    input.orgId,
    input.propertySourceId,
    score,
    input.linkedPropertyId ?? null,
  );

  // Decide whether an alert is warranted.
  const create = input.isUpdate
    ? shouldCreateUpdateAlert(score, input)
    : shouldCreatePropertyAlert(score, input.source, input.settings);

  if (!create) {
    return { score, alertCreated: false, duplicateSuppressed: false };
  }

  const built = createPropertyOpportunityAlert({
    source: input.source,
    score,
    agentName: input.agentName,
    isUpdate: input.isUpdate,
    priceDropped: input.priceDropped,
  });

  // Never create a duplicate unread alert for the same source + type.
  const exists = await repo.existingUnreadAlertExists(
    input.orgId,
    input.propertySourceId,
    built.alertType,
  );
  if (exists) {
    return { score, alertCreated: false, alertType: built.alertType, duplicateSuppressed: true };
  }

  await repo.insertPropertyAlert({
    orgId: input.orgId,
    propertySourceId: input.propertySourceId,
    linkedPropertyId: input.linkedPropertyId ?? null,
    agentId: input.agentId ?? null,
    alertType: built.alertType,
    title: built.title,
    message: built.message,
    priority: built.priority,
    opportunityScore: built.opportunityScore,
    metadata: built.metadata,
  });

  return { score, alertCreated: true, alertType: built.alertType, duplicateSuppressed: false };
}

// UPDATED listings only alert on something meaningful: a price drop, a score that
// clears the popup threshold, or a private listing (dedup still prevents repeats).
function shouldCreateUpdateAlert(
  score: OpportunityScoreResult,
  input: EvaluateListingInput,
): boolean {
  if (input.priceDropped) return true;
  if (score.totalScore >= input.settings.minPopupOpportunityScore) return true;
  if (input.source.listingType === "private" && input.settings.privatePropertyAlertsEnabled) return true;
  return false;
}

// Re-exports
export {
  calculatePropertyOpportunityScore,
  estimateBuyerMatchCount,
} from "./scoring";
export { shouldCreatePropertyAlert, createPropertyOpportunityAlert } from "./alerts";
export type {
  AgentScoringPreferences,
  OpportunityScoreInput,
  OpportunityScoreResult,
  OpportunityScoreBreakdown,
  BuiltPropertyAlert,
  CreatePropertyAlertInput,
  RadarSettingsLite,
  RadarIntelligenceRepository,
  InsertPropertyAlertInput,
} from "./types";
export { DEFAULT_RADAR_SETTINGS } from "./types";
