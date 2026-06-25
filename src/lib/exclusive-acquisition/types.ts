// ============================================================================
// ZONO — Seller Intelligence™ & Exclusive Opportunity Engine types (Phase 14).
// Client-safe, no I/O. The engine is DETERMINISTIC + explainable (no AI): it
// scores which market property owners are most likely to sign an exclusive
// listing, who to contact first, and why. A future AI Copilot may ENRICH
// explanations/strategy without replacing these deterministic outputs.
// ============================================================================
import type { PropertyProviderName } from "../property-radar/types";

export type SellerLifecycleStage =
  | "new_opportunity"
  | "contact_recommended"
  | "contacted"
  | "follow_up"
  | "negotiating"
  | "exclusive_signed"
  | "lost"
  | "archived";

export type ExclusiveBand = "very_high" | "high" | "medium" | "low";
export type RecommendedActionKind = "call_today" | "send_whatsapp" | "schedule_meeting" | "follow_up_tomorrow" | "wait";
export type TouchpointChannel = "call" | "whatsapp" | "meeting" | "note" | "email";
export type FollowupReason = "no_response" | "price_drop" | "buyer_found" | "scheduled_followup";
export type SellerOutcome = "exclusive_signed" | "lost" | "declined" | "no_answer" | "not_interested";

// ── Deterministic scoring input (all real, measurable features) ──────────────
export interface SellerScoreInput {
  daysOnMarket: number | null;
  priceDropCount: number;
  returnedToMarket: boolean;
  removedAndRepublished: boolean;
  isPrivateListing: boolean;
  marketExposureDays: number | null;
  buyerDemandIndex: number; // 0..1 area demand (optional, 0 when unknown)
  matchingBuyerCount: number;
  previousContactCount: number;
  marketTrendDelta: number; // -1..1 (price momentum; negative favors seller motivation)
  respondedBefore: boolean;
  recentActivity: boolean; // listing touched recently (re-posted / edited)
}

export interface ScoreReason {
  code: string;
  label: string;
  points: number;
}

export interface SellerScoreResult {
  score: number; // 0..100
  reasons: ScoreReason[];
}

export interface ExclusiveProbabilityResult {
  probability: number; // 0..100
  band: ExclusiveBand;
  bandLabel: string;
  reasons: ScoreReason[];
}

export interface RecommendedAction {
  kind: RecommendedActionKind;
  label: string;
  reason: string;
  /** Suggested due offset in hours (for follow-ups), if any. */
  dueOffsetHours: number | null;
}

// ── Contact history ───────────────────────────────────────────────────────────
export interface Touchpoint {
  id: string;
  channel: TouchpointChannel;
  direction: "outbound" | "inbound" | string;
  outcome: string | null;
  occurredAt: string;
}

export interface ContactHistorySummary {
  calls: number;
  whatsapps: number;
  meetings: number;
  notes: number;
  emails: number;
  total: number;
  lastContactAt: string | null;
  lastResponseAt: string | null;
  respondedBefore: boolean;
}

// ── Smart follow-up ───────────────────────────────────────────────────────────
export interface FollowupSuggestion {
  reason: FollowupReason;
  action: "call" | "whatsapp" | "schedule_showing" | "followup";
  title: string;
  priority: "low" | "medium" | "high" | "urgent";
  dueAtIso: string;
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
export interface LifecycleContext {
  score: number;
  exclusiveProbability: number;
  contactAttempts: number;
  hoursSinceLastContact: number | null;
  lastOutcome: SellerOutcome | null;
  hasPositiveResponse: boolean;
  removed: boolean;
}

// ── Profile + ranking DTOs ────────────────────────────────────────────────────
export interface SellerProfile {
  id: string;
  marketPropertySourceId: string | null;
  linkedPropertyId: string | null;
  provider: PropertyProviderName | string;
  city: string | null;
  neighborhood: string | null;
  addressText: string | null;
  listingType: string | null;
  price: number | null;
  sellerScore: number;
  exclusiveProbability: number;
  exclusiveBand: ExclusiveBand;
  scoreReasons: ScoreReason[];
  probabilityReasons: ScoreReason[];
  recommendedAction: RecommendedActionKind;
  recommendedActionReason: string;
  priorityRank: number;
  buyerMatchCount: number;
  daysOnMarket: number | null;
  priceDropCount: number;
  lifecycleStage: SellerLifecycleStage;
  lastContactAt: string | null;
  nextFollowupAt: string | null;
}

export interface ContactPriorityItem {
  profileId: string;
  marketPropertySourceId: string | null;
  addressText: string | null;
  city: string | null;
  exclusiveProbability: number;
  exclusiveBand: ExclusiveBand;
  sellerScore: number;
  buyerMatchCount: number;
  recommendedAction: RecommendedActionKind;
  priorityScore: number;
  reasonsShort: string[];
}

// ── Executive dashboard ────────────────────────────────────────────────────────
export interface ExclusiveDashboard {
  topOpportunities: SellerProfile[];
  probabilityDistribution: { band: ExclusiveBand; count: number }[];
  todaysPriorities: ContactPriorityItem[];
  funnel: { stage: SellerLifecycleStage; count: number }[];
  averageDaysUntilExclusive: number | null;
  totals: { profiles: number; veryHigh: number; high: number; contactedToday: number; signed: number };
}
