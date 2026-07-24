// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PROVIDER-OBJECT LIFECYCLE (PURE). Phase 3C.
// ----------------------------------------------------------------------------
// Tracks a provider object's honest lifecycle from an APPEND-ONLY evidence
// timeline. Cardinal rule: a SINGLE failed read never proves deletion — deletion
// is concluded only after a configured number of consecutive definitive "missing"
// observations, and a webhook removal is stronger evidence than a failed
// inspection. The current state is derived from the latest ACCEPTED evidence;
// transient/ambiguous reads never overwrite a stronger prior state. History is
// never rewritten. Pure: (observations + policy) → derived state.
// ============================================================================
import type { ProviderObjectState, InspectEvidenceKind } from "./provider-types";

export interface StateObservation {
  state: ProviderObjectState;
  evidenceKind: InspectEvidenceKind;
  observedAtMs: number;
  ambiguous: boolean;
}

export interface LifecyclePolicy {
  /** Consecutive definitive "missing" inspections required to conclude deleted. */
  deletionConfirmations: number;
}
export const DEFAULT_LIFECYCLE_POLICY: LifecyclePolicy = { deletionConfirmations: 2 };

const VALID_NEXT: Record<ProviderObjectState, readonly ProviderObjectState[]> = {
  unknown: ["processing", "published", "exists", "inaccessible", "deleted", "hidden", "permission_lost", "ambiguous"],
  processing: ["published", "exists", "unknown", "inaccessible", "ambiguous", "permission_lost"],
  exists: ["published", "hidden", "inaccessible", "deleted", "permission_lost", "unknown", "ambiguous"],
  published: ["hidden", "inaccessible", "deleted", "permission_lost", "unknown", "ambiguous", "published"],
  hidden: ["published", "deleted", "inaccessible", "permission_lost", "unknown", "ambiguous"],
  inaccessible: ["published", "exists", "deleted", "hidden", "permission_lost", "unknown", "ambiguous"],
  permission_lost: ["published", "exists", "inaccessible", "deleted", "unknown", "ambiguous"],
  deleted: [],
  ambiguous: ["published", "exists", "processing", "hidden", "inaccessible", "deleted", "permission_lost", "unknown"],
};

export function canTransitionObject(from: ProviderObjectState, to: ProviderObjectState): boolean {
  return from === to || (VALID_NEXT[from] ?? []).includes(to);
}

/** Is a state an inconclusive read that must not overwrite stronger evidence? */
const INCONCLUSIVE: ReadonlySet<ProviderObjectState> = new Set(["ambiguous", "unknown"]);

export interface DerivedState { state: ProviderObjectState; confidence: "high" | "medium" | "low"; consecutiveMissing: number }

/**
 * Derive the current lifecycle state from the ordered evidence timeline. A
 * definitive "missing"/inaccessible read increments a consecutive-missing counter;
 * only when it reaches the policy threshold (or a webhook removal is seen) does the
 * derived state become `deleted`. Otherwise the strongest recent definitive
 * observation wins; ambiguous reads never downgrade a confirmed state.
 */
export function deriveObjectState(observations: readonly StateObservation[], policy: LifecyclePolicy = DEFAULT_LIFECYCLE_POLICY): DerivedState {
  if (observations.length === 0) return { state: "unknown", confidence: "low", consecutiveMissing: 0 };
  const ordered = [...observations].sort((a, b) => a.observedAtMs - b.observedAtMs);
  let derived: ProviderObjectState = "unknown";
  let consecutiveMissing = 0;
  for (const o of ordered) {
    // A webhook removal is decisive.
    if (o.evidenceKind === "webhook" && o.state === "deleted") { derived = "deleted"; consecutiveMissing = policy.deletionConfirmations; continue; }
    if (o.ambiguous || o.state === "ambiguous") continue; // never overwrite on a transient read
    if (o.state === "inaccessible" || (o.state === "unknown" && o.evidenceKind === "provider_inspection")) {
      consecutiveMissing += 1;
      if (consecutiveMissing >= policy.deletionConfirmations) derived = "deleted";
      else if (derived !== "deleted") derived = "inaccessible";
      continue;
    }
    // A positive/definitive observation resets the missing streak.
    consecutiveMissing = 0;
    if (o.state !== "unknown") derived = o.state;
  }
  const last = ordered[ordered.length - 1];
  const confidence = derived === "deleted" ? "high" : INCONCLUSIVE.has(derived) ? "low" : last.ambiguous ? "low" : "high";
  return { state: derived, confidence, consecutiveMissing };
}

/** Whether the evidence is sufficient to conclude the object was deleted. */
export function canConcludeDeleted(consecutiveMissing: number, sawWebhookRemoval: boolean, policy: LifecyclePolicy = DEFAULT_LIFECYCLE_POLICY): boolean {
  return sawWebhookRemoval || consecutiveMissing >= policy.deletionConfirmations;
}
