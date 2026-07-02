// ============================================================================
// 🕸️ ZONO Relationship Intelligence™ & Universal Entity Graph — public surface. 27.9.
// ONE universal entity graph connecting every entity via first-class,
// evidence-backed relationships (strength · confidence · duration · freshness ·
// verification). Network analysis, Chief-of-Staff reasoning and Decision-Engine
// influence consume it read-only. Does NOT replace Discovery or the Knowledge
// Graph; reuses Truth-Engine freshness. No modification to any protected engine.
// ============================================================================
export { buildGraph, type NodeSeed } from "./graph";
export { buildEdge, clamp } from "./edge";
export { analyzeNetwork } from "./network";
export { relationsFromLinks, relationsFromAgents, relationsFromMissions, type LinkRel, type AgentRel, type MissionRel } from "./discovery";
export { buildRelationshipAnswers } from "./chief-of-staff";
export { relationshipInfluences, applyInfluenceToDecisions } from "./decision-influence";
export { buildExecutiveGraph } from "./executive";
export { getRelationshipReport } from "./service";
export { runSelfCheck, type RGSelfCheck, type RGCheck } from "./qa";
export { RELATIONSHIP_GRAPH_VERSION, RELATION_HE } from "./types";
export type {
  EntityType, RelationType, FreshnessLevel, VerificationLevel, GraphNode, RelationshipEdge,
  EntityGraph, RawRelation, RankedNode, HiddenOpportunity, NetworkAnalysis,
  RelationshipAnswer, RelationshipInfluence, ExecutiveGraph, RelationshipReport,
} from "./types";
