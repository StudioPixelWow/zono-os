// ============================================================================
// 🎯 Lead Digital Twin — types (pure). 28.3. Part 1.
// The THIRD implementation of the universal Digital Twin Framework (28.1).
// Lead-specific profile payload only — the framework stays entity-agnostic.
// ============================================================================
import type { DigitalTwin } from "../types";

export type LeadIntent = "buyer" | "seller" | "both" | "investor" | "renter" | "unknown";

export interface LeadBehavior {
  calls: number; messages: number; emails: number; meetings: number;
  visits: number; statusChanges: number; followUps: number;
}
export interface LeadProfile {
  source: string | null; sourceQuality: number;   // 0..100
  leadQuality: number;                              // 0..100
  intent: LeadIntent; intentConfidence: number;    // 0..100
  buyerSellerFit: string;
  urgency: number;                                  // 0..100
  conversionProbability: number;                    // 0..100
  duplicateRisk: number; contactRisk: number;       // 0..100
  communicationHealth: number;                      // 0..100
  relationshipPath: string[];
  stage: string;
  nextBestAction: string;
  behavior: LeadBehavior;
  completeness: number;                             // 0..100
}

// Structural seed (from the existing `leads` read model — no coupling).
export interface LeadSeed {
  id: string; name: string;
  source: string | null; intent: LeadIntent; stage: string;
  score: number | null; message: string | null;
  hasPhone: boolean; hasEmail: boolean;
  propertyId: string | null; projectId: string | null;
  convertedBuyerId: string | null; convertedSellerId: string | null;
  lostReason: string | null;
  duplicateContacts: number;                        // matching phone/email among org leads
  lastActivityAt: string | null;
  createdAt: string | null; updatedAt: string | null;
}
export interface LeadActivityInput { id: string; kind: string; at: string; summary: string }

export type LeadTwin = DigitalTwin<LeadProfile>;
