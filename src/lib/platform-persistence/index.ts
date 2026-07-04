// ============================================================================
// 🧱 ZONO Platform Persistence — barrel. 34.2.
// Durable substrate closing the QA.1 persistence gaps: compute cache,
// intelligence snapshots, org-memory store, Ask ZONO log. Pure helpers in
// ./core; server-only repositories degrade gracefully if migrations are absent.
// ============================================================================
export { buildCacheKey, ttlToExpiry, isExpired, freshnessSeconds, normConfidence, assertOrgScoped } from "./core";
export { getCache, setCache, invalidateCache, type CacheHit } from "./compute-cache";
export { writeSnapshot, getLatestSnapshot, listSnapshots, type SnapshotInput, type Snapshot } from "./intelligence-store";
export { recordMemory, recordMemoryEvent, readOrgMemory, type MemoryRecord, type MemoryEventRecord, type ReadMemoryResult } from "./org-memory-store";
export { logAskExchange, getAskConversation, type AskExchange, type AskMessage } from "./ask-log";
export { runSelfCheck } from "./qa";
