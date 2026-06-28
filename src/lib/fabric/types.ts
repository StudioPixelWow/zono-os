// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — shared contracts (client-safe, pure).
// ----------------------------------------------------------------------------
// One vocabulary every ZONO intelligence engine speaks. The Fabric is an
// ORCHESTRATION layer: engines publish/consume through these shapes and never
// call each other directly. Nothing here duplicates business logic — it only
// defines the envelope that existing engines fill. Deterministic + explainable.
//
//        Engine ─▶ Intelligence Fabric ─▶ Other Engines / AI Agents
//
// The Fabric is the Single Source of Truth interface: future AI agents query
// these objects, never raw database tables.
// ============================================================================
import type { ScoreExplanation } from "@/lib/explainability/types";

// ── Entity identity ─────────────────────────────────────────────────────────
/** Every node the Fabric can reason about. Extend the union, never fork it. */
export type FabricEntityType =
  | "property" | "listing" | "broker" | "office" | "agent" | "neighborhood"
  | "market" | "seller" | "buyer" | "developer" | "project" | "transaction"
  | "opportunity" | "competition" | "deal" | "lead" | "territory";

export interface EntityRef {
  type: FabricEntityType;
  id: string;
  /** Optional human label for explainability / search results. */
  label?: string;
  /** City scope — drives RLS-aligned visibility + cache keys. */
  city?: string | null;
}

export function entityKey(ref: Pick<EntityRef, "type" | "id">): string {
  return `${ref.type}:${ref.id}`;
}

// ── Shared metrics vocabulary (one definition, reused everywhere) ────────────
export type MetricName =
  | "activity" | "growth" | "confidence" | "trust" | "competition"
  | "influence" | "relationship" | "coverage" | "completeness" | "freshness";

export type MetricSet = Partial<Record<MetricName, number>>; // each 0..100

// ── Composable confidence ───────────────────────────────────────────────────
export type ConfidenceTier = "verified" | "high" | "medium" | "low" | "insufficient";
export interface ConfidenceSignal {
  /** What produced this confidence (e.g. "listings", "transactions", "graph"). */
  source: string;
  /** 0..100. */
  value: number;
  /** Relative importance when composing. Default 1. */
  weight?: number;
  /** Sample size behind the value (downgrades thin evidence). */
  sampleSize?: number;
}
export interface ComposedConfidence {
  value: number;            // 0..100
  tier: ConfidenceTier;
  signals: ConfidenceSignal[];
  explanation: string;      // Hebrew, data-derived
}

// ── Universal explainability envelope (SUPERSET of ScoreExplanation) ─────────
/** Never a black box: every Fabric output can expose all of this. */
export interface FabricExplanation {
  /** Reuses the existing ZONO explainability contract for the score reasons. */
  score: ScoreExplanation;
  confidence: ComposedConfidence;
  /** Named data sources behind the result. */
  sources: string[];
  /** One-line reasoning summary (Hebrew). */
  reasoning: string;
  /** Other Fabric entities this result depends on. */
  dependencies: EntityRef[];
  /** ISO timestamp of the freshest input. */
  lastUpdate: string | null;
  /** Related entities surfaced for drill-in. */
  relatedEntities: EntityRef[];
}

// ── Knowledge object (what the Knowledge API returns) ───────────────────────
export interface KnowledgeObject<T = Record<string, unknown>> {
  ref: EntityRef;
  /** Domain payload assembled from the owning engine(s). Never raw rows. */
  data: T;
  metrics: MetricSet;
  confidence: ComposedConfidence;
  explanation: FabricExplanation | null;
  relationships: RelationshipEdge[];
  timeline: TimelineEntry[];
  /** Which producers contributed (provenance, for debugging + AI). */
  producers: string[];
  /** ISO timestamp this object was assembled. */
  assembledAt: string;
}

// ── Unified relationship layer ──────────────────────────────────────────────
export type RelationshipType =
  | "works_at" | "manages" | "lists" | "owns" | "represents" | "located_in"
  | "operates_in" | "competes_with" | "developed_by" | "part_of" | "transacted"
  | "matched_with" | "interacted_with" | "related_to";

export interface RelationshipEdge {
  from: EntityRef;
  to: EntityRef;
  type: RelationshipType;
  /** 0..100 relationship strength (shared metric). */
  strength: number;
  /** 0..100 confidence the edge is real. */
  confidence: number;
  /** Data-derived reasons (no fabrication). */
  reasons: string[];
  source: string;
}

// ── Unified timeline stream ─────────────────────────────────────────────────
export type TimelineEventType =
  | "property_updated" | "office_changed" | "agent_changed" | "listing_created"
  | "market_changed" | "neighborhood_updated" | "seller_interaction"
  | "buyer_interaction" | "opportunity_created" | "recommendation_accepted"
  | "refresh_completed" | "conflict_resolved" | "relationship_discovered";

export interface TimelineEntry {
  id: string;
  at: string;               // ISO
  type: TimelineEventType;
  title: string;
  detail: string | null;
  entity: EntityRef;
  city: string | null;
  source: string;
}

// ── Intelligence events (event-driven reactions) ────────────────────────────
export type IntelligenceEventType =
  | "listing.published" | "broker.identified" | "market.updated"
  | "knowledge.updated" | "opportunity.updated" | "matching.updated"
  | "recommendation.updated" | "context.invalidated" | "refresh.completed";

export interface IntelligenceEvent<P = Record<string, unknown>> {
  type: IntelligenceEventType;
  /** The entity the event is about (drives cache invalidation). */
  subject: EntityRef;
  payload: P;
  at: string;               // ISO
  /** Optional org scope (never used to bypass RLS — informational). */
  orgId?: string | null;
}

// ── Unified recommendation ──────────────────────────────────────────────────
export type RecommendationCategory =
  | "acquisition" | "pricing" | "marketing" | "matching" | "outreach"
  | "retention" | "growth" | "risk" | "coverage" | "competition" | "operations";
export type RecommendationPriority = "critical" | "high" | "medium" | "low";

export interface FabricRecommendation {
  id: string;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  title: string;
  /** 0..100. */
  confidence: number;
  /** Entities this recommendation affects/targets. */
  affectedEntities: EntityRef[];
  /** Hebrew reasoning (data-derived). */
  reasoning: string;
  /** Supporting evidence labels. */
  evidence: string[];
  /** Concrete next steps. */
  suggestedActions: string[];
  /** Other recommendations/entities this depends on. */
  dependencies: EntityRef[];
  /** ISO expiry — recommendations are perishable. */
  expiresAt: string | null;
  source: string;
}

// ── Search (AI-agent entrypoint) ────────────────────────────────────────────
export interface FabricAnswer<T = unknown> {
  question: string;
  answer: T;
  explanation: FabricExplanation | null;
  relatedEntities: EntityRef[];
  producers: string[];
}
