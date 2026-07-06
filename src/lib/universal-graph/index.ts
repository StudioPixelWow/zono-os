// ============================================================================
// 🌐 ZONO — Universal Knowledge Graph — barrel. PHASE 51.0.
// Extends the Relationship Graph (27.9) into a platform-wide, evidence-backed
// graph over the persisted entity_relationships store. Reuses buildGraph +
// Truth-Engine edge scoring. Query helpers, context packs, entity summaries.
// ============================================================================
export {
  UNIVERSAL_GRAPH_VERSION, KIND_HE, NO_FABRICATION_NOTE, normalizeKind, entityHref,
  type UniversalKind, type SummaryConnection, type RelationshipSummary,
  type EntityContextPack, type UniversalGraphOverview, type RelationshipTypeGroup,
} from "./types";
export { relationsFromEntityRelationshipRows, type EntityRelationshipRow } from "./discovery";
export { edgesOf, neighborsOf, pathBetween, subgraph, relationshipSummary, buildContextPack } from "./query";
export { getEntityRelationships, getUniversalGraphOverview, answerRelationshipQuestion, countEntityEdges } from "./service";
export { runSelfCheck } from "./qa";
