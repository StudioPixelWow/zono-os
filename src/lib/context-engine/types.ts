// ============================================================================
// 🧩 Universal Context Engine™ — types (client-safe, pure). Phase 27.2.
// ----------------------------------------------------------------------------
// The single contract every future AI capability consumes. NO AI here — these
// are the structured shapes of a deterministic context package built ONLY from
// existing intelligence. Nothing is fabricated; every block is optional.
// AI providers (OpenAI / Claude / Gemini / local) all receive THIS shape.
// ============================================================================

export const CONTEXT_ENGINE_VERSION = "27.2.0";

export type ContextType =
  | "organization" | "office" | "broker" | "property" | "lead" | "seller"
  | "buyer" | "deal" | "task" | "journey" | "neighborhood" | "market"
  | "valuation" | "action-center" | "mission-control" | "communication"
  | "calendar";

export type ContextSize = "small" | "medium" | "large" | "enterprise";

export interface ContextRequest {
  type: ContextType;
  entityId?: string | null;
  /** Location hints used to pull existing territory/market intelligence. */
  city?: string | null;
  neighborhood?: string | null;
  /** Where the user is + what they are doing (surfaced, never interpreted). */
  screen?: string | null;
  workflow?: string | null;
  size?: ContextSize;          // default "medium"
  /** Optional explicit scope; otherwise resolved from the session. */
  orgId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
}

/** A single, attributable piece of supporting evidence (never fabricated). */
export interface Evidence {
  source: string;              // repository/service that produced it
  detail: string;              // human-readable note
  confidence?: number | null;  // 0–100 when the source provides one
}

/** One priority-ranked, permission-checked unit of context. */
export interface ContextBlock {
  key: string;
  label: string;
  priority: number;            // Context Priority™ score
  data: unknown;               // structured payload from existing reads
  evidence: Evidence[];
  confidence: number | null;   // 0–100, or null when unknown ("—")
  source: string;             // primary repository/service
  managerOnly?: boolean;       // stripped for non-managers by the permission engine
  truncated?: boolean;         // set by the compression engine
}

export interface ContextIdentity {
  orgId: string | null;
  orgName: string | null;
  userId: string | null;
  userName: string | null;
  isManager: boolean;
}

export interface ContextPermissions {
  isManager: boolean;
  removedBlocks: string[];     // block keys removed for this viewer
  redactedFields: string[];    // field names stripped from payloads
}

export interface ContextExplain {
  repositoriesUsed: string[];
  entitiesCollected: string[];
  confidence: number | null;   // aggregate (mean of block confidences), or null
  missing: string[];           // information that was not available
  prioritySummary: { key: string; priority: number }[];
  size: ContextSize;
  blockCount: number;
  approxChars: number;
  timestamp: string;           // ISO — metadata only (excluded from cache key)
  version: string;
}

export interface ContextPackage {
  request: ContextRequest;
  identity: ContextIdentity;
  screen: string | null;
  workflow: string | null;
  blocks: ContextBlock[];
  permissions: ContextPermissions;
  explain: ContextExplain;
  cacheKey: string;
}

// ── Lightweight source shapes (decoupled from heavy DTOs; mapped by repository) ──
export interface SourceListing {
  id: string; title: string | null; city: string | null; neighborhood: string | null;
  price: number | null; opportunityScore: number; hasAgent: boolean | null;
}
export interface SourceBroker {
  id: string; name: string; office: string | null; city: string | null;
  confidence: number; listingsCount: number;
}
export interface SourceOffice {
  id: string; name: string; city: string | null;
  overall: number | null; growth: number | null; momentum: number | null; threat: number | null;
}
export interface SourceTerritory {
  city: string | null; neighborhood: string | null; leaderOfficeId: string | null;
  leaderOfficeName: string | null; dominance: number | null; competitionLevel: string | null;
  confidence: number | null; missing: string[];
}
export interface SourceRecommendation { id: string; title: string; reason: string | null; urgency: number }

export interface SourceActionCenter {
  recommendations: SourceRecommendation[];
  opportunities: SourceListing[];
  newListings: SourceListing[];
  brokers: SourceBroker[];
  offices: SourceOffice[];
  priceDrops: number;
  totalListings: number;
}
export interface SourceLocation {
  territory: SourceTerritory | null;
  opportunities: SourceListing[];
  newListings: SourceListing[];
  counts: { opportunities: number; offMarket: number; recent: number; total: number };
}

/**
 * The ONLY way the engine reaches data. Future AI providers never read
 * repositories directly — they call the engine, which calls these adapters.
 * Each returns null on failure (everything optional, nothing fabricated).
 */
export interface ContextSources {
  identity(req: ContextRequest): Promise<ContextIdentity | null>;
  actionCenter(): Promise<SourceActionCenter | null>;
  location(city: string | null, neighborhood: string | null): Promise<SourceLocation | null>;
}

/** Output of a context builder before permissions/compression. */
export interface BuilderResult { blocks: ContextBlock[]; missing: string[]; repositories: string[] }
