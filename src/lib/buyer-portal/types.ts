// ============================================================================
// 🛒 ZONO — Buyer Portal™ (Personal Buyer Experience) — types (pure). 32.3.
// ----------------------------------------------------------------------------
// The buyer's own authenticated AI workspace. REUSES the Buyer Agent scorecard
// (twin + matches + journey + risks + strategy), the Buyer Digital Twin, the
// AI Brokerage Website framework (property view), Ask ZONO and the buyers read
// model. Public/buyer-safe: NEVER exposes internal CRM notes, private scores,
// missions, workflows, other buyers or private office data. Evidence-only —
// no fabricated matches/appointments/messages/documents.
// ============================================================================
import type { PropertyAI } from "@/lib/brokerage-site/types";

export const BUYER_PORTAL_VERSION = "32.3";

export type MatchTier = "perfect" | "emerging" | "hidden" | "future";
export type JourneyStage = "discovery" | "active_search" | "evaluating" | "offer" | "closing" | "dormant" | "new";

// A recommended property, buyer-facing (why it fits YOU).
export interface RecoProperty {
  id: string; title: string; price: number | null; image: string | null;
  city: string | null; neighborhood: string | null; rooms: number | null; area: number | null;
  matchScore: number; tier: MatchTier; why: string[];
}

// Buyer profile (editable), from the buyers read model — evidence-only.
export interface BuyerProfile {
  name: string; firstName: string;
  budgetMin: number | null; budgetMax: number | null;
  roomsMin: number | null; roomsMax: number | null; sizeMin: number | null; sizeMax: number | null;
  preferredCities: string[]; preferredAreas: string[]; preferredTypes: string[];
  timeline: string | null; languages: string[]; preferredChannel: string | null;
  hasPreapproval: boolean; investmentGoal: string | null;
  mustHaveParking: boolean; mustHaveElevator: boolean; mustHaveSafeRoom: boolean;
}

export interface Appointment {
  id: string; title: string; startAt: string; endAt: string | null;
  kind: string; status: string; locationText: string | null; propertyId: string | null;
}

export interface Conversation { at: string; kind: string; summary: string; fromBroker: boolean }
export interface PortalDraft { id: string; channel: string; subject: string | null; preview: string; reason: string }
export interface PortalDoc { id: string; title: string; category: "guide" | "education" | "offer" | "document"; body: string | null; url: string | null }
export interface PortalNotification { id: string; type: "new_match" | "price_drop" | "sold" | "appointment" | "message" | "opportunity"; title: string; detail: string; at: string | null; requiresApproval: boolean }
export interface PortalInsight { title: string; body: string; evidence: string[] }
export interface PortalAction { order: number; title: string; why: string; requiresApproval: boolean }

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface BuyerDashboard {
  welcome: { greeting: string; returning: boolean; resume: string | null };
  stage: JourneyStage; stageLabel: string;
  readiness: number; readinessLabel: string; healthLabel: string; confidence: number;
  aiSummary: string;
  recommendedActions: PortalAction[];
  recommendations: { perfect: RecoProperty[]; emerging: RecoProperty[]; hidden: RecoProperty[]; future: RecoProperty[] };
  upcomingAppointments: Appointment[];
  recentConversations: Conversation[];
  openItems: PortalAction[];              // open workflows/missions (buyer-facing, approval-gated)
  marketUpdates: PortalInsight[];
  savedSearches: { label: string; criteria: string }[];
  insights: PortalInsight[];
  notifications: PortalNotification[];
}

// ── Favorites ─────────────────────────────────────────────────────────────────
export interface BuyerFavorites {
  saved: RecoProperty[]; recentlyViewed: RecoProperty[];
  updates: { propertyId: string; kind: "price_drop" | "status" | "new_match"; detail: string }[];
  aiRanking: { propertyId: string; rank: number; why: string }[];
}

// ── The normalized input the pure assembler consumes (built by the server) ─────
export interface PortalListingFacts {
  id: string; title: string; price: number | null; image: string | null;
  city: string | null; neighborhood: string | null; rooms: number | null; area: number | null;
  priceDropPct: number | null; sold: boolean;
}
export interface PortalMatchFacts { listingId: string; score: number; tier: MatchTier; why: string[] }

export interface BuyerPortalInput {
  buyerId: string;
  profile: BuyerProfile;
  // from the Buyer Agent scorecard (twin + matches + journey + strategy + risks/opps)
  stage: JourneyStage; readiness: number; healthLabel: string; confidence: number;
  momentum: number; classification: string[];
  strategyPlaybook: { order: number; action: string; why: string }[];
  risks: { title: string; evidence: string[] }[];
  opportunities: { title: string; evidence: string[] }[];
  matches: PortalMatchFacts[];
  // real records (public/buyer-safe subsets)
  listings: Record<string, PortalListingFacts>;  // by listingId — for reco/favorites cards
  appointments: Appointment[];
  conversations: Conversation[];
  drafts: PortalDraft[];
  savedListingIds: string[];
  viewedListingIds: string[];
  hasActivity: boolean; lastActivityAt: string | null;
  docs: PortalDoc[];
}

export interface BuyerPortalPropertyView {
  property: PropertyAI;
  match: { score: number; tier: MatchTier | null; why: string[] } | null;
}

export type { PropertyAI } from "@/lib/brokerage-site/types";
