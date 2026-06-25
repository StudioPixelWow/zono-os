// ============================================================================
// ZONO Property Radar™ — sync engine public surface.
// ============================================================================

// Engine
export { runPropertyAreaSync } from "./engine";
export type { RunSyncDeps } from "./engine";
export { runMissingValidation } from "./missing-validation";

// Decisions (pure)
export { decideListingSync, toSyncDecision } from "./decisions";
export type { DecideListingSyncResult } from "./decisions";

// Repository (server-only Supabase impl + factory)
export { createSyncRepository } from "./repository";

// Types / contracts
export type {
  SyncDecision,
  PropertySyncDecision,
  RunPropertyAreaSyncInput,
  RunPropertyAreaSyncResult,
  RunMissingValidationInput,
  RunMissingValidationResult,
  SyncRepository,
  SyncSourceRecord,
  SyncWatermarkRecord,
  CreateSyncRunInput,
  FinishSyncRunPatch,
  UpsertWatermarkPatch,
} from "./types";
