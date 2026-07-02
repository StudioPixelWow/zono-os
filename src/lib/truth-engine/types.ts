// ============================================================================
// 🛡️ ZONO Truth Engine™ & Data Reliability Framework — types (pure). 27.7.
// ----------------------------------------------------------------------------
// The single truth layer for the whole platform. EVERY entity, relationship,
// recommendation and insight gets ONE measurable reliability score derived from
// real evidence — never fabricated. The Truth Engine is the authority for data
// quality, evidence quality, freshness, verification and trustworthiness. It
// reuses existing modules (continuous-learning freshness) and does NOT modify
// Discovery / Knowledge Graph / Decision / Mission / Chief of Staff / Valuation.
// ============================================================================
export const TRUTH_ENGINE_VERSION = "27.7";

// Part 2 — entity-agnostic: the known set plus any future string.
export type TruthEntityType =
  | "organization" | "office" | "broker" | "property" | "listing" | "seller"
  | "buyer" | "lead" | "territory" | "neighborhood" | "street" | "market"
  | "mission" | "decision" | "valuation" | "campaign" | (string & {});

export type FreshnessLevel = "fresh" | "recent" | "stale" | "expired" | "unknown";
export const FRESHNESS_HE: Record<FreshnessLevel, string> = {
  fresh: "טרי", recent: "עדכני", stale: "מתיישן", expired: "פג תוקף", unknown: "לא ידוע",
};

export type VerificationLevel = "unverified" | "single_source" | "corroborated" | "verified";
export const VERIFICATION_HE: Record<VerificationLevel, string> = {
  unverified: "לא מאומת", single_source: "מקור יחיד", corroborated: "מאושש", verified: "מאומת",
};

export type Severity = "low" | "moderate" | "high";
export type ContradictionField =
  | "phone" | "office" | "address" | "owner" | "broker" | "valuation" | "outdated" | "source";
export const CONTRADICTION_HE: Record<ContradictionField, string> = {
  phone: "טלפון שונה", office: "משרד שונה", address: "כתובת שונה", owner: "בעלים שונה",
  broker: "מתווך שונה", valuation: "הערכת שווי שונה", outdated: "מידע מיושן", source: "מקורות סותרים",
};

// Part 3 — evidence graph: where a fact came from, when, who supports/contradicts.
export interface EvidenceItem {
  source: string;                  // provider / table / origin
  sourceType: string;              // category of source (for diversity)
  at: string | null;              // ISO timestamp of the evidence
  stance?: "support" | "contradict" | "neutral";
  field?: string | null;
  value?: string | number | null;
  weight?: number;                // optional trust weight of the source (0..1)
}
export interface EvidenceGraph {
  count: number; diversity: number;          // distinct sourceTypes
  supporting: number; contradicting: number;
  sources: string[]; sourceTypes: string[];
  latestAt: string | null; oldestAt: string | null;
}

export interface Contradiction {
  id: string; field: ContradictionField; severity: Severity;
  values: string[]; note: string; evidence: string[];
}

// Part 7 — trust explainability.
export interface TrustExplanation {
  why: string;
  evidence: string[];
  missingData: string[];
  contradictions: string[];
  freshness: string;
}

// Part 1 — the Universal Truth Score.
export interface TruthScore {
  entityType: TruthEntityType; entityId: string; entityName: string | null;
  truthScore: number;              // 0..100 overall reliability
  confidence: number;              // 0..100 — never exceeds evidence support
  freshness: number;               // 0..100
  freshnessLevel: FreshnessLevel;
  verificationLevel: VerificationLevel;
  evidenceCount: number;
  evidenceDiversity: number;       // distinct source types
  contradictions: number;
  contradictionDetail: Contradiction[];
  missingInfo: string[];
  dataQuality: number;             // 0..100 (field completeness)
  graph: EvidenceGraph;
  explanation: TrustExplanation;
}

// Part 4 — raw values to compare for contradictions.
export interface ContradictionSignals {
  phones?: (string | null | undefined)[];
  offices?: (string | null | undefined)[];
  addresses?: (string | null | undefined)[];
  owners?: (string | null | undefined)[];
  brokers?: (string | null | undefined)[];
  valuations?: (number | null | undefined)[];
}

export interface TruthInput {
  entityType: TruthEntityType; entityId: string; entityName?: string | null;
  evidence: EvidenceItem[];
  lastSeenAt?: string | null;
  requiredFields?: string[];
  presentFields?: string[];
  contradictionSignals?: ContradictionSignals;
  baseConfidence?: number | null;   // e.g. an existing confidence_score (0..100)
  now?: number;
}

// Part 6 — data health aggregate over a set of entities.
export interface DataHealth {
  scope: string;                   // organization / office / broker / property / market
  entities: number;
  score: number;                   // 0..100 mean truth, evidence-weighted
  avgConfidence: number;
  avgFreshness: number;
  verifiedPct: number;
  contradictionRatePct: number;
  staleCount: number;
  missingHeavyCount: number;       // entities with heavy missing info
  notes: string[];
}

// Part 8 — the executive integration (Chief of Staff consumes Truth, read-only).
export interface ExecutiveTrust {
  cosBusinessScore: number;
  cosAiConfidence: number;
  orgTruthScore: number;
  truthAdjustedConfidence: number; // low trust lowers CoS confidence
  note: string;
}

export interface OrgTruthReport {
  version: string; orgId: string | null; generatedAt: string;
  organization: TruthScore;
  dataHealth: { organization: DataHealth; office: DataHealth; broker: DataHealth; property: DataHealth; market: DataHealth };
  lowestTrust: TruthScore[];       // entities most in need of verification
  topContradictions: Contradiction[];
  staleEntities: TruthScore[];
  executive: ExecutiveTrust | null;
  sampleOffices: TruthScore[];
  sampleBrokers: TruthScore[];
  notes: string[];
}
