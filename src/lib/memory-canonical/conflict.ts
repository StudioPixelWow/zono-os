// ============================================================================
// ⚖️ ZONO OS 2.0 — Stage 4 · Batch 4.4 · Canonical AI Memory · conflict (PURE).
// Decides what to do with an incoming memory vs the currently-active memory for
// the same identity:
//   create    — no active memory exists for this dimension
//   reinforce — same fact confirmed again (bump confidence/last_confirmed_at)
//   supersede — a NEW value at ≥ the existing provenance rank (old → inactive)
//   skip      — exact replay, or a lower-rank source trying to overwrite (e.g.
//               inferred can never override explicit)
// Preserves history (supersede, never hard-delete). Pure + deterministic.
// ============================================================================
import { PROVENANCE_RANK, type Provenance } from "./types";
import { normalizeFact } from "./identity";

export interface ExistingMemory {
  normalizedFact: string;
  provenance: Provenance;
  sourceEventId: string | null;
}

export interface IncomingMemory {
  fact: string;
  provenance: Provenance;
  sourceEventId: string;
}

export type MemoryAction = "create" | "reinforce" | "supersede" | "skip";
export interface MemoryDecision { action: MemoryAction; reason: string }

export function resolveMemoryConflict(existing: ExistingMemory | null, incoming: IncomingMemory): MemoryDecision {
  if (!existing) return { action: "create", reason: "no active memory for this dimension" };

  const incNorm = normalizeFact(incoming.fact);
  const incRank = PROVENANCE_RANK[incoming.provenance];
  const exRank = PROVENANCE_RANK[existing.provenance];

  // A lower-provenance source never overrides a higher one (inferred ⊀ explicit).
  if (incRank < exRank) return { action: "skip", reason: `incoming ${incoming.provenance} cannot override ${existing.provenance}` };

  if (incNorm === existing.normalizedFact) {
    if (existing.sourceEventId && existing.sourceEventId === incoming.sourceEventId) {
      return { action: "skip", reason: "exact replay of the same event" };
    }
    return { action: "reinforce", reason: "same fact confirmed again" };
  }

  // Different fact at ≥ existing rank → the new value supersedes the old.
  return { action: "supersede", reason: `newer ${incoming.provenance} value supersedes prior` };
}
