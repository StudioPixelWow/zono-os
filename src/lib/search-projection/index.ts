// ============================================================================
// 🔎 ZONO OS 2.0 — Stage 4 · Canonical Search Projection · public surface.
// One event-driven search_documents projection every major entity feeds into.
// ============================================================================
export { normalizeText, normalizePhone, phoneTail, tokenize, foldForMatch, buildKeywords, buildNormalizedText } from "./normalize";
export { buildSearchDocument, SEARCH_CONFIG, SEARCHABLE_ENTITY_TYPES, pick, pickAll } from "./document";
export type { SearchDocument } from "./document";
export { buildJourneySearchDocument } from "./journey-document";
export type { JourneyDocumentResult, JourneySkipReason } from "./journey-document";
export { classifyEventForSearch } from "./subscriber";
export type { SearchIndexIntent } from "./subscriber";
export { indexEntity, indexJourney, softDeleteEntity, SEARCH_TABLE_MAP } from "./indexer";
export type { IndexStatus, IndexOutcome } from "./indexer";
export { backfillSearch, backfillJourneys } from "./backfill";
export type { SearchBackfillResult, SearchBackfillDiagnostics } from "./backfill";
export { rankSearchDocs, prepareQuery } from "./rank";
export type { RankableDoc, RankedHit, RankResult } from "./rank";
