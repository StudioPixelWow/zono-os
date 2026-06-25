// ============================================================================
// ZONO Property Radar™ — opportunity intelligence types (client-safe, no I/O).
// Scoring input/output, the built-alert shape, the lite radar settings the alert
// rules read, and the RadarIntelligenceRepository the sync engine writes through.
// This module never imports the sync layer (avoids a cycle).
// ============================================================================
import type { NormalizedListingMetadata } from "../providers/types";
import type { PropertyRadarArea } from "../providers/types";

// ── Scoring ──────────────────────────────────────────────────────────────────
export interface AgentScoringPreferences {
  expertiseCities?: string[];
  expertiseNeighborhoods?: string[];
}

export interface OpportunityScoreInput {
  orgId: string;
  source: NormalizedListingMetadata;
  area: PropertyRadarArea;
  buyerMatchCount?: number;
  marketAveragePrice?: number | null;
  agentPreferences?: AgentScoringPreferences;
}

export interface OpportunityScoreBreakdown {
  privateListing: number;
  expertiseArea: number;
  buyerMatches: number;
  freshness: number;
  marketPrice: number;
  rarity: number;
  hasPhone: number;
  hasImage: number;
}

export interface OpportunityScoreResult {
  totalScore: number;
  breakdown: OpportunityScoreBreakdown;
  reasons: string[];
  recommendation: string;
  /** Echoed back so alert rules can branch on buyer demand without recomputing. */
  buyerMatchCount: number;
}

// ── Alerts ───────────────────────────────────────────────────────────────────
export type PropertyAlertPriorityValue = "low" | "medium" | "high" | "urgent";

export interface BuiltPropertyAlert {
  alertType: string;
  title: string;
  message: string;
  priority: PropertyAlertPriorityValue;
  opportunityScore: number;
  metadata: Record<string, unknown>;
}

export interface CreatePropertyAlertInput {
  source: NormalizedListingMetadata;
  score: OpportunityScoreResult;
  agentName?: string | null;
  isUpdate?: boolean;
  priceDropped?: boolean;
}

// ── Radar settings (subset the alert rules need) ─────────────────────────────
export interface RadarSettingsLite {
  privatePropertyAlertsEnabled: boolean;
  popupAlertsEnabled: boolean;
  onlyPrivatePopups: boolean;
  minPopupOpportunityScore: number;
}

export const DEFAULT_RADAR_SETTINGS: RadarSettingsLite = {
  privatePropertyAlertsEnabled: true,
  popupAlertsEnabled: true,
  onlyPrivatePopups: true,
  minPopupOpportunityScore: 70,
};

// ── Repository contract for intelligence writes ──────────────────────────────
export interface InsertPropertyAlertInput {
  orgId: string;
  propertySourceId: string;
  linkedPropertyId?: string | null;
  agentId?: string | null;
  alertType: string;
  title: string;
  message: string;
  priority: string;
  opportunityScore: number;
  metadata: Record<string, unknown>;
}

export interface RadarIntelligenceRepository {
  getRadarSettings(orgId: string): Promise<RadarSettingsLite>;
  upsertOpportunityScore(
    orgId: string,
    propertySourceId: string,
    score: OpportunityScoreResult,
    linkedPropertyId?: string | null,
  ): Promise<void>;
  existingUnreadAlertExists(
    orgId: string,
    propertySourceId: string,
    alertType: string,
  ): Promise<boolean>;
  insertPropertyAlert(input: InsertPropertyAlertInput): Promise<void>;
}
