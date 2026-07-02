// ============================================================================
// 🔗 ZONO CRM Relationship Graph Integration — public surface. 28.4.
// Wires the Buyer / Seller / Lead Digital Twins into the Universal Relationship
// Graph with live, evidence-backed edges, and exposes the CRM dashboard + a
// per-entity edge index the twins consume. Reuses the Digital Twin Framework,
// Relationship Graph, Truth / Mission / Decision engines and Chief of Staff.
// ============================================================================
export { relationsFromCrm, CRM_RELATION_HE, type CrmInputs } from "./discovery";
export { buildCrmDashboard, type CrmDashboard, type EdgeView, type ConversionPath, type CrmGap } from "./dashboard";
export { getCrmGraph, getCrmEdgeIndex, type CrmGraphResult, type LiteEdge } from "./service";
export { runSelfCheck, type CGSelfCheck, type CGCheck } from "./qa";
