// ============================================================================
// 🧩 ZONO OS 2.0 — Stage 4 · Batch 4.5 · Shared AI Context · stale resolver (PURE).
// Enforces the cockpit conflict rule: CURRENT CANONICAL TRUTH > explicit memory >
// derived memory > inferred memory. When an active memory fact contradicts a
// canonical fact on the SAME dimension (e.g. a stale price), the memory must NOT
// be used as fact — it is dropped from the grounded context and returned as a
// stale record with its provenance PRESERVED (never silently deleted, never
// presented as truth). Deterministic + offline-testable; no I/O.
// ============================================================================
import type { Provenance } from "@/lib/memory-canonical/types";
import type { CtxMemory } from "./render";

/** A single dimension of current canonical truth, sourced from the entity record. */
export interface CanonicalFact {
  /** Human dimension label (e.g. "מחיר"), for diagnostics. */
  label: string;
  /** Keywords that identify memory referring to this dimension (Hebrew/EN). */
  keywords: string[];
  /** The current canonical value (string form; numbers extracted for comparison). */
  value: string;
}

/** A memory item marked stale because it conflicts with current canonical truth. */
export interface StaleMemo {
  fact: string;
  provenance: Provenance;
  reason: string;   // why it was marked stale (dimension + current value)
}

export interface StaleResult {
  fresh: CtxMemory[];   // memory safe to present (truth-consistent)
  stale: StaleMemo[];   // conflicting memory (provenance preserved, not fact)
}

/** All integer/decimal numbers in a string (commas/₪/spaces stripped). */
function numbersIn(s: string): number[] {
  const cleaned = s.replace(/[,₪\s]/g, "");
  const matches = cleaned.match(/\d+(?:\.\d+)?/g);
  return matches ? matches.map(Number).filter((n) => Number.isFinite(n)) : [];
}

/**
 * Split memory into fresh vs stale against current canonical truth.
 * Conservative + deterministic: a memory is stale ONLY when it references a
 * canonical dimension (by keyword) AND carries a number that differs from every
 * number in the canonical value. Non-numeric or non-matching memory stays fresh
 * (we never guess a conflict). Canonical truth always wins.
 */
export function detectStaleMemory(canonical: CanonicalFact[], memory: CtxMemory[]): StaleResult {
  if (!canonical.length) return { fresh: memory, stale: [] };
  const fresh: CtxMemory[] = [];
  const stale: StaleMemo[] = [];

  for (const m of memory) {
    const fact = m.fact ?? "";
    let conflicted: CanonicalFact | null = null;

    for (const c of canonical) {
      const mentions = c.keywords.some((k) => k.trim() && fact.includes(k));
      if (!mentions) continue;
      const memNums = numbersIn(fact);
      const canonNums = numbersIn(c.value);
      if (!memNums.length || !canonNums.length) continue; // no comparable value → not a conflict
      const agrees = memNums.some((mn) => canonNums.some((cn) => cn === mn));
      if (!agrees) { conflicted = c; break; }
    }

    if (conflicted) {
      stale.push({ fact, provenance: m.provenance, reason: `סותר ${conflicted.label} עדכני (${conflicted.value})` });
    } else {
      fresh.push(m);
    }
  }
  return { fresh, stale };
}
