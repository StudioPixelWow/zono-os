// ============================================================================
// 🧭 ZONO Unified Customer Journey™ & Lifecycle Intelligence — types (pure). 28.5.
// ----------------------------------------------------------------------------
// One CUSTOMER — no longer isolated Lead / Buyer / Seller. A single person can
// hold multiple roles simultaneously and move through lifecycle stages. This
// layer REUSES the existing Buyer / Seller / Lead Digital Twins (their built
// outputs are summarised into members) and merges them — it does NOT create a
// new twin and does NOT modify any engine. Evidence-only.
// ============================================================================
import type { TwinActivity, TwinDecisionSignal, TwinMissionSignal, TwinLearning } from "../types";

export const CUSTOMER_JOURNEY_VERSION = "28.5";

export type MemberKind = "lead" | "buyer" | "seller";
export type CustomerRole = "lead" | "buyer" | "seller" | "investor" | "referral" | "former_client" | "repeat_client";
export const ROLE_HE: Record<CustomerRole, string> = {
  lead: "ליד", buyer: "קונה", seller: "מוכר", investor: "משקיע",
  referral: "מקור הפניה", former_client: "לקוח עבר", repeat_client: "לקוח חוזר",
};

// Part 2 — lifecycle stages.
export type LifecycleStage =
  | "new_lead" | "qualified" | "buyer_viewing" | "negotiation" | "purchase"
  | "owner" | "seller" | "repeat_buyer" | "investor" | "referral_source" | "dormant" | "lost";
export const STAGE_HE: Record<LifecycleStage, string> = {
  new_lead: "ליד חדש", qualified: "מוסמך", buyer_viewing: "קונה — צפייה", negotiation: "משא ומתן",
  purchase: "רכישה", owner: "בעלים", seller: "מוכר", repeat_buyer: "רוכש חוזר",
  investor: "משקיע", referral_source: "מקור הפניה", dormant: "רדום", lost: "אבוד",
};

// Normalized summary the pure journey logic reads (extracted from a built twin).
export interface MemberSummary {
  kind: MemberKind; id: string; name: string;
  healthScore: number; healthLabel: string;
  activities: TwinActivity[]; recencyScore: number; engagementScore: number;
  trust: number; intentScore: number;        // probabilityToBuy / readinessToSign / conversionProbability
  value: number | null;                       // budget.max (buyer) / desiredPrice (seller)
  classification: string[];
  decisions: TwinDecisionSignal[]; missions: TwinMissionSignal[]; learnings: TwinLearning[];
  relationshipDegree: number;
  sourceReferral: boolean;                    // lead came from a referral
  dealSignal: boolean;                        // signed / offer / converted
  createdAt: string | null; updatedAt: string | null;
}

export interface StageTransition {
  from: LifecycleStage; to: LifecycleStage; at: string | null;
  why: string; evidence: string[]; confidence: number;
}

export interface CustomerIdentity {
  id: string; name: string;
  roles: CustomerRole[]; members: { kind: MemberKind; id: string }[];
}

export interface CustomerHealth {
  relationshipHealth: number; activity: number; trust: number;
  lifetimeValue: number; futureValue: number; retentionRisk: number; referralPotential: number;
  ltvEstimate: number | null;                 // rough ₪ estimate (evidence-based, may be null)
  basis: string[];
}

export interface JourneyTimelineEntry { at: string; kind: string; label: string; role: MemberKind | "transition" }

export interface CustomerJourney {
  identity: CustomerIdentity;
  currentStage: LifecycleStage;
  stageHistory: LifecycleStage[];
  transitions: StageTransition[];
  memory: { totalActivities: number; counts: Record<string, number>; lastActivityAt: string | null; recencyScore: number; engagementScore: number };
  timeline: JourneyTimelineEntry[];
  health: CustomerHealth;
  decisions: TwinDecisionSignal[];
  missions: TwinMissionSignal[];
  classification: string[];                   // CoS tags
  notes: string[];
}
