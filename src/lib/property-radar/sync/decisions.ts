// ============================================================================
// ZONO Property Radar™ — pure decision engine.
// Decides NEW / UPDATED / UNCHANGED for a single scanned listing vs its stored
// source, using the stable content hash. No I/O — deterministic and testable.
// MISSING / DELETED are decided by the run engine (they depend on what wasn't
// seen in the scan), not here.
// ============================================================================
import type { NormalizedListingMetadata } from "../providers/types";
import { createListingContentHash } from "../utils";
import type { PropertySyncDecision, SyncSourceRecord } from "./types";

export interface DecideListingSyncResult {
  decision: "new" | "updated" | "unchanged";
  reason: string;
  previousHash: string | null;
  nextHash: string;
}

/**
 * Core rule:
 *   A. no existing source              → NEW
 *   B. existing + same content hash    → UNCHANGED
 *   C. existing + different hash       → UPDATED
 */
export function decideListingSync(
  metadata: NormalizedListingMetadata,
  existingSource: SyncSourceRecord | null | undefined,
): DecideListingSyncResult {
  const nextHash = createListingContentHash(metadata);

  if (!existingSource) {
    return { decision: "new", reason: "no existing source for externalId", previousHash: null, nextHash };
  }

  const previousHash = existingSource.content_hash ?? null;
  if (previousHash && previousHash === nextHash) {
    return { decision: "unchanged", reason: "content hash unchanged", previousHash, nextHash };
  }

  return {
    decision: "updated",
    reason: previousHash ? "content hash changed" : "existing source had no hash",
    previousHash,
    nextHash,
  };
}

/** Convenience wrapper producing a full PropertySyncDecision record. */
export function toSyncDecision(
  metadata: NormalizedListingMetadata,
  existingSource: SyncSourceRecord | null | undefined,
): PropertySyncDecision {
  const r = decideListingSync(metadata, existingSource);
  return {
    decision: r.decision,
    provider: metadata.provider,
    externalId: metadata.externalId,
    reason: r.reason,
    existingSourceId: existingSource?.id,
    metadata,
    previousHash: r.previousHash,
    nextHash: r.nextHash,
  };
}
