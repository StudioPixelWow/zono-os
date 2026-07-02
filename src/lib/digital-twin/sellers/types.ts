// ============================================================================
// 🏷️ Seller Digital Twin — types (pure). 28.2. Part 1.
// The SECOND implementation of the universal Digital Twin Framework (28.1).
// Seller-specific profile payload only — the framework stays entity-agnostic.
// ============================================================================
import type { DigitalTwin } from "../types";

export type ExpectedWindow = "0-1m" | "1-3m" | "3-6m" | "6m+";

export interface SellerBehavior {
  calls: number; meetings: number; messages: number; valuationsSent: number;
  priceDiscussions: number; objections: number; documents: number; visits: number;
  agreements: number; statusChanges: number; followUps: number;
}
export interface SellerProfile {
  motivation: number;              // 0..100
  trust: number;                   // 0..100
  priceExpectation: number | null; // desired price
  priceGap: number | null;         // desired − market valuation (absolute)
  priceGapPct: number | null;      // gap vs valuation
  urgency: number;                 // 0..100
  readinessToSign: number;         // 0..100
  churnRisk: number;               // 0..100
  sellerConfidence: number;        // 0..100 (likelihood to proceed)
  communicationHealth: number;     // 0..100
  propertyLink: string | null;
  valuationLink: string | null;
  timeline: string; expectedWindow: ExpectedWindow;
  decisionStyle: string;
  objections: string[];
  nextBestAction: string;
  behavior: SellerBehavior;
  completeness: number;            // 0..100
}

// Structural seed (from the existing `sellers` read model — no coupling).
export interface SellerSeed {
  id: string; name: string;
  motivationLabel: string | null; urgencyLevel: string | null;
  desiredPrice: number | null; minimumPrice: number | null; dreamPrice: number | null;
  estimatedValue: number | null;   // valuation link (optional)
  decisionStyle: string | null; mainObjection: string | null;
  priceSensitivity: number; timeSensitivity: number; trustSensitivity: number;
  cooperation: number; negotiationFlexibility: number;
  hasSignedAgreement: boolean;
  propertyId: string | null; valuationId: string | null;
  hasPhone: boolean; hasEmail: boolean;
  mustSellBy: string | null; targetSaleDate: string | null;
  createdAt: string | null; updatedAt: string | null;
}
export interface SellerActivityInput { id: string; kind: string; at: string; summary: string }

export type SellerTwin = DigitalTwin<SellerProfile>;
