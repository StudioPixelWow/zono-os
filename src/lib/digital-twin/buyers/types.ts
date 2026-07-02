// ============================================================================
// 👤 Buyer Digital Twin — types (pure). 28.1. Part 3.
// The first implementation of the universal Digital Twin Framework. Buyer-
// specific profile payload only — the framework itself stays entity-agnostic.
// ============================================================================
import type { DigitalTwin } from "../types";

export type BuyerTemp = "hot" | "warm" | "cold";
export type ExpectedWindow = "0-1m" | "1-3m" | "3-6m" | "6m+";

export interface BuyerBehavior {
  views: number; saves: number; rejects: number; visits: number; offers: number;
  calls: number; meetings: number; messages: number; searches: number;
}
export interface BuyerPreferencesT {
  areas: string[]; types: string[]; roomsMin: number | null; roomsMax: number | null; mustHave: string[];
}
export interface BuyerProfile {
  budget: { min: number | null; max: number | null };
  budgetConfidence: number;        // 0..100
  motivation: string;
  readiness: number;               // 0..100
  timeline: string;
  urgency: number;                 // 0..100
  risk: number;                    // 0..100
  trust: number;                   // 0..100
  decisionStyle: string;
  communicationHealth: number;     // 0..100
  probabilityToBuy: number;        // 0..100
  expectedWindow: ExpectedWindow;
  preferences: BuyerPreferencesT;
  behavior: BuyerBehavior;
  completeness: number;            // 0..100
}

// Structural seed (from the existing `buyers` read model — no coupling).
export interface BuyerSeed {
  id: string; name: string; temperature: BuyerTemp | null;
  budgetMin: number | null; budgetMax: number | null;
  roomsMin: number | null; roomsMax: number | null;
  preferredAreas: string[]; preferredTypes: string[];
  mustHaveParking: boolean; mustHaveElevator: boolean; mustHaveSafeRoom: boolean;
  hasPhone: boolean; hasEmail: boolean;
  createdAt: string | null; updatedAt: string | null;
}
export interface BuyerActivityInput { id: string; kind: string; at: string; summary: string }

// Matching (Part 9).
export interface ListingCandidate { id: string; price: number | null; area: string | null; type: string | null; rooms: number | null; title: string }
export interface BuyerMatch { listingId: string; title: string; score: number; reasons: string[]; missing: string[] }
export interface BuyerMatches {
  perfect: BuyerMatch[]; near: BuyerMatch[]; hidden: BuyerMatch[]; future: BuyerMatch[];
  notes: string[];
}

export type BuyerTwin = DigitalTwin<BuyerProfile>;
