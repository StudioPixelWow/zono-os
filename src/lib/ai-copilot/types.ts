// ============================================================================
// ZONO — AI Copilot & Communication Intelligence types (Phase 15, client-safe).
// The AI is an AUGMENTATION layer: it explains / recommends / generates /
// summarizes / prioritizes. It NEVER decides who matches whom and never replaces
// the deterministic engines (Property Radar, Buyer Matching, Seller Intelligence,
// Opportunity Scores) — those remain the single source of truth.
// ============================================================================

export type AiKind =
  | "seller_call_brief"
  | "buyer_call_brief"
  | "whatsapp"
  | "email"
  | "explain_opportunity"
  | "meeting_brief"
  | "after_call_summary"
  | "morning_brief"
  | "office_brief"
  | "property_summary"
  | "seller_summary"
  | "buyer_summary";

export type WhatsappMessageType =
  | "new_property" | "price_drop" | "back_on_market" | "hot_deal" | "private_listing"
  | "follow_up" | "appointment_reminder" | "exclusive_meeting" | "buyer_recommendation"
  | "missed_call" | "meeting_summary";

export type EmailType =
  | "property_presentation" | "meeting_follow_up" | "exclusive_proposal" | "market_update"
  | "weekly_summary" | "price_update" | "buyer_opportunity";

export type AiTone = "professional" | "luxury" | "friendly" | "short" | "urgent";

export type NextBestActionKind =
  | "call" | "whatsapp" | "wait" | "schedule_meeting" | "reduce_price" | "invite_buyer" | "create_reminder";

// ── Messages + provider abstraction (vendor-neutral) ─────────────────────────
export interface AiMessage { role: "system" | "user" | "assistant"; content: string }

export interface AiCompleteOptions { temperature?: number; maxTokens?: number; signal?: AbortSignal }

/** A pluggable text provider. Implementations: OpenAI, Anthropic, future. */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(messages: AiMessage[], opts?: AiCompleteOptions): Promise<string>;
}

// ── Generate request / result ────────────────────────────────────────────────
export interface AiGenerateRequest {
  kind: AiKind;
  entityId: string | null;
  /** Fingerprint of the structured context — drives cache invalidation. */
  dataHash: string;
  cacheKey: string;
  messages: AiMessage[];
  /** Deterministic, ready-to-use content used when no provider is available. */
  fallback: string;
  temperature?: number;
}

export interface AiResult {
  content: string;
  source: "ai" | "fallback" | "cache";
  model: string | null;
  cached: boolean;
}

// ── Structured, sanitized context (NEVER raw DB payloads / secrets / ids) ────
export interface SellerCallContext {
  city: string | null;
  neighborhood: string | null;
  addressText: string | null;
  listingType: string | null;
  price: number | null;
  daysOnMarket: number | null;
  priceDropCount: number;
  buyerMatchCount: number;
  sellerScore: number;
  exclusiveProbability: number;
  exclusiveBand: string;
  recommendedAction: string;
  recommendedActionReason: string;
  scoreReasons: string[];
  lifecycleStage: string;
  lastContactAt: string | null;
  contactSummary: string | null;
}

export interface MorningBriefContext {
  topPriorities: { label: string; probability: number; action: string }[];
  hotOpportunities: { label: string; probability: number }[];
  totals: { profiles: number; veryHigh: number; high: number; contactedToday: number; signed: number };
  pendingTasks: number;
  completedYesterday: number;
}

export interface OfficeBriefContext {
  totals: { profiles: number; veryHigh: number; high: number; signed: number };
  funnel: { stage: string; count: number }[];
  topOpportunities: { label: string; probability: number }[];
}

export type AnyAiContext = SellerCallContext | MorningBriefContext | OfficeBriefContext | Record<string, unknown>;
