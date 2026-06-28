// ZONO Core Data — Brokerage Data public surface.
export * from "./types";
export * from "./normalize";
export * from "./identity";
export { getBrokerageAccess } from "./permissions";
export { brokerageRepository } from "./repository";
export {
  getBrokerageCommandCenter, resolveBrokerageLinksForOrg, type BrokerageCommandCenter, type ResolveStats,
} from "./service";

// ── Knowledge Layer (graph + data quality) — reusable single source of truth.
// Future AI agents / BI / automations consume these instead of raw tables.
export {
  recomputeBrokerageKnowledge, getKnowledgeDashboard, knowledgeRepository,
  type KnowledgeDashboard, type KnowledgeRefreshResult,
} from "./knowledge/service";
export * as brokerageKnowledgeEngines from "./knowledge/index";
