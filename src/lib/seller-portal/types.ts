// ============================================================================
// 🏷️ ZONO — Seller Portal™ (Personal Seller Experience) — types (pure). 32.4.
// ----------------------------------------------------------------------------
// The seller's own authenticated AI workspace. REUSES the Seller Agent scorecard
// (twin + listing/valuation + market performance + buyer matching + journey +
// strategy + risks/opps), the AI Brokerage Website framework (property view),
// Ask ZONO and the sellers read model. Seller/public-safe: NEVER exposes internal
// CRM notes, private scores, missions, workflows, OTHER buyers' identities, other
// sellers or private office data. Evidence-only — no fabricated data.
// ============================================================================
import type { PropertyAI } from "@/lib/brokerage-site/types";

export const SELLER_PORTAL_VERSION = "32.4";

export type BuyerTier = "perfect" | "emerging" | "waiting";
export type ValuationPosition = "above" | "within" | "below" | "unknown";

// Anonymized buyer interest — a seller never sees a buyer's identity.
export interface BuyerInterest { rank: number; score: number; tier: BuyerTier; label: string; why: string[] }

export interface SellerProfile {
  name: string; firstName: string;
  city: string | null; address: string | null;
  expectedPrice: number | null; desiredPrice: number | null; targetSaleDate: string | null;
  urgency: string | null; motivation: string | null; sellerType: string | null;
  preferredChannel: string | null; timeline: string | null;
}

export interface PropertyPerformance {
  hasProperty: boolean; propertyId: string | null; status: string | null;
  askingPrice: number | null; estimatedValue: number | null; priceGapPct: number | null;
  valuationPosition: ValuationPosition; valuationConfidence: string | null;
  marketScore: number | null; pricingHealth: number | null; competitionPressure: number | null;
  buyerDemandScore: number | null; daysOnMarket: number | null; campaignActive: boolean | null;
  truthTier: "verified" | "reviewed" | "listed"; strategyLabel: string;
}

export interface Appointment { id: string; title: string; startAt: string; endAt: string | null; kind: string; status: string; locationText: string | null }
export interface Conversation { at: string; kind: string; summary: string; fromBroker: boolean }
export interface ActivityEvent { at: string; kind: "view" | "favorite" | "inquiry" | "appointment" | "message" | "price" | "recommendation" | "marketing"; title: string; detail: string }
export interface PortalDoc { id: string; title: string; category: "agreement" | "valuation" | "marketing" | "guide" | "offer"; body: string | null; url: string | null; available: boolean }
export interface PortalNotification { id: string; type: "new_buyer" | "viewing" | "price_reco" | "market" | "valuation" | "message" | "workflow"; title: string; detail: string; at: string | null; requiresApproval: boolean }
export interface PortalInsight { title: string; body: string; evidence: string[] }
export interface PortalAction { order: number; title: string; why: string; requiresApproval: boolean }

// ── Dashboard ────────────────────────────────────────────────────────────────
export interface SellerDashboard {
  welcome: { greeting: string; returning: boolean; resume: string | null };
  aiSummary: string;
  todayActivity: ActivityEvent[];
  propertyHealth: { score: number | null; label: string };
  marketPerformance: { marketScore: number | null; competitionPressure: number | null; daysOnMarket: number | null; demandScore: number | null };
  buyerDemand: { perfect: BuyerInterest[]; emerging: BuyerInterest[]; waiting: BuyerInterest[]; total: number };
  valuation: { asking: number | null; estimated: number | null; gapPct: number | null; position: ValuationPosition };
  recommendation: { title: string; why: string; requiresApproval: boolean } | null;
  recommendedActions: PortalAction[];
  upcomingAppointments: Appointment[];
  recentConversations: Conversation[];
  openItems: PortalAction[];
  notifications: PortalNotification[];
  insights: PortalInsight[];
}

// ── Normalized input the pure assembler consumes (built by the server) ─────────
export interface SellerPortalInput {
  sellerId: string;
  profile: SellerProfile;
  property: PropertyPerformance;
  healthScore: number | null; healthLabel: string; confidence: number; churnRisk: number;
  classification: string[];
  strategyPlaybook: { order: number; action: string; why: string }[];
  strategyLabel: string; aiRecommendation: string;
  risks: { title: string; evidence: string[] }[];
  opportunities: { title: string; evidence: string[] }[];
  buyerInterest: BuyerInterest[];
  appointments: Appointment[];
  conversations: Conversation[];
  activity: ActivityEvent[];
  hasActivity: boolean; lastActivityAt: string | null;
  hasValuation: boolean;
  docs: PortalDoc[];
}

export interface SellerPortalPropertyView { property: PropertyAI; performance: PropertyPerformance }

export type { PropertyAI } from "@/lib/brokerage-site/types";
