// ============================================================================
// ZONO Brokerage Knowledge Layer — pure types (client-safe DTOs).
// The structured-knowledge contract that every AI engine, BI dashboard and
// future automation reads instead of raw tables. Mirrors
// supabase/migrations/20260804120000_brokerage_knowledge.sql.
// ============================================================================

export type KnowledgeEntityType = "office" | "agent";

export type GraphNodeType =
  | "office" | "agent" | "phone" | "email" | "website" | "facebook" | "instagram" | "linkedin"
  | "city" | "neighborhood" | "street" | "listing" | "project" | "developer" | "property"
  | "transaction" | "organization" | "refresh_run" | "source";

export type GraphEdgeType =
  | "WORKS_FOR" | "ACTIVE_IN" | "PUBLISHED_BY" | "BELONGS_TO" | "USED_PHONE" | "HAS_WEBSITE"
  | "FOUND_ON_SOURCE" | "MARKETED_BY" | "CHANGED_OFFICE" | "COMPETES_WITH" | "HAS_EMAIL" | "HAS_SOCIAL";

export type HierarchyLevel = "independent" | "branch" | "regional" | "franchise" | "national_network";
export type MarketScope = "network" | "office" | "agent" | "city" | "neighborhood";
export type ClusterStatus = "open" | "merged" | "dismissed";
export type ClusterRecommendation = "merge" | "review" | "keep_separate";
export type DiscoveryType =
  | "office_change" | "new_branch" | "merge" | "partnership" | "duplicate_agent" | "shared_office" | "brand_change";
export type DiscoveryStatus = "pending" | "accepted" | "dismissed";

// ── Graph build I/O ─────────────────────────────────────────────────────────
export interface GraphNodeInput {
  nodeKey: string;
  nodeType: GraphNodeType;
  label: string;
  entityId?: string | null;
  value?: string | null;
  city?: string | null;
}
export interface GraphEdgeInput {
  srcKey: string;
  dstKey: string;
  edgeType: GraphEdgeType;
  weight?: number;
  confidence?: number;
}
export interface GraphBuildResult {
  nodes: GraphNodeInput[];
  edges: GraphEdgeInput[];
}

// ── Completeness ────────────────────────────────────────────────────────────
export interface CompletenessField { key: string; label: string; weight: number; present: boolean }
export interface CompletenessResult {
  pct: number;            // 0..100
  filledWeight: number;
  totalWeight: number;
  missing: { key: string; label: string; weight: number }[];
  suggestions: string[];
}

// ── Duplicate clusters ──────────────────────────────────────────────────────
export interface ClusterItem { id: string; label: string; masterScore: number; city?: string | null }
export interface DuplicateCluster {
  entityType: KnowledgeEntityType;
  city: string | null;
  confidence: number;
  masterId: string;
  recommendation: ClusterRecommendation;
  explanation: string;
  members: { id: string; label: string; similarity: number; isMaster: boolean; reasons: string[] }[];
}

// ── Market share ────────────────────────────────────────────────────────────
export interface MarketShareInput {
  id: string; label: string; network?: string | null; city?: string | null;
  listings: number; cities: number; neighborhoods: number; sources: number; recentListings: number;
}
export interface MarketShareRow {
  scopeType: MarketScope; scopeKey: string; scopeLabel: string; city: string | null;
  listings: number; activity: number; cities: number; neighborhoods: number;
  growth: number; visibility: number; sources: number; sharePct: number; rank: number;
}

// ── Data health ─────────────────────────────────────────────────────────────
export interface DataHealthInput {
  totalOffices: number; totalAgents: number;
  missingPhones: number; missingEmails: number; lowConfidence: number;
  duplicateClusters: number; inactiveOffices: number; needsReview: number;
  coveragePct: number; freshnessHours: number | null;
}
export interface DataHealthSnapshot extends DataHealthInput {
  healthy: number;
  healthScore: number;    // 0..100 overall
}

// ── Coverage ────────────────────────────────────────────────────────────────
export interface CoverageInput { city: string; knownOffices: number; knownAgents: number; estimatedOffices?: number | null }
export interface CoverageResult {
  city: string; estimatedOffices: number; knownOffices: number; coveragePct: number;
  knownAgents: number; missingOffices: number; missingAgents: number; confidence: number;
}

// ── Refresh diff ────────────────────────────────────────────────────────────
export interface DiffSnapshot {
  offices: number; agents: number; coveragePct: number; topShare: number;
  phoneFingerprint: number; emailFingerprint: number;
}
export interface RefreshDiff {
  newOffices: number; newAgents: number; updatedPhones: number; updatedEmails: number;
  coverageChange: number; marketShareChange: number; growth: number;
}
