// ============================================================================
// 🧠 ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · public surface.
// ai_memory is THE canonical durable memory store. Event-driven ingestion +
// lifecycle + provenance + privacy. (Reasoning consumption is Batch 4.5.)
// ============================================================================
export type { MemoryScope, MemoryType, Provenance, Sensitivity, MemoryOpIntent, EntityRef } from "./types";
export { MEMORY_TYPES, PROVENANCE_RANK } from "./types";
export { classifyMemory } from "./salience";
export { memoryIdentityKey, normalizeFact } from "./identity";
export { resolveMemoryConflict } from "./conflict";
export type { MemoryAction, MemoryDecision, ExistingMemory, IncomingMemory } from "./conflict";
export { ingestMemoryForEvent } from "./ingest";
export type { MemoryIngestResult } from "./ingest";
export { backfillMemory } from "./backfill";
export type { MemoryBackfillResult, MemoryBackfillDiagnostics } from "./backfill";
