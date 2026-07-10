// ============================================================================
// 🔎 ZONO OS 2.0 — Stage 4 · Canonical Search Projection · public surface.
// One event-driven search_documents projection every major entity feeds into.
// ============================================================================
export { normalizeText, normalizePhone, phoneTail, tokenize, buildKeywords, buildNormalizedText } from "./normalize";
export { buildSearchDocument, SEARCH_CONFIG, SEARCHABLE_ENTITY_TYPES } from "./document";
export type { SearchDocument } from "./document";
export { classifyEventForSearch } from "./subscriber";
export type { SearchIndexIntent } from "./subscriber";
export { indexEntity, softDeleteEntity, SEARCH_TABLE_MAP } from "./indexer";
export type { IndexStatus } from "./indexer";
export { backfillSearch } from "./backfill";
export type { SearchBackfillResult, SearchBackfillDiagnostics } from "./backfill";
