// ============================================================================
// Market Acceptance Intelligence™ — Signal QA (PURE, client-safe).
//
// Validates a computed signal-set: structural completeness, confidence bounds,
// and the "no fabricated values" rule (a value may be null, but it may not be
// NaN or an out-of-range confidence). No DB, no side effects.
// ============================================================================
import { SIGNAL_NAMES, type Signal, type SignalSet } from "./types";

export interface SignalQaResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  signalCount: number;
  fullyObserved: number; // signals with confidence === 1
  nullValues: number;    // honest nulls (missing data)
}

function validateOne(name: string, s: Signal | undefined, errors: string[]): { isNull: boolean; full: boolean } {
  if (!s) { errors.push(`missing signal: ${name}`); return { isNull: true, full: false }; }
  if (typeof s.name !== "string" || s.name !== name) errors.push(`${name}: name mismatch`);
  if (typeof s.source !== "string" || !s.source) errors.push(`${name}: missing source`);
  if (typeof s.lastUpdated !== "string" || !s.lastUpdated) errors.push(`${name}: missing lastUpdated`);
  if (typeof s.confidence !== "number" || s.confidence < 0 || s.confidence > 1 || Number.isNaN(s.confidence)) {
    errors.push(`${name}: confidence out of range`);
  }
  const isNull = s.value === null;
  if (typeof s.value === "number" && Number.isNaN(s.value)) errors.push(`${name}: NaN value (fabrication guard)`);
  return { isNull, full: s.confidence === 1 };
}

/** Validate one listing's signal-set against the MAI-2 contract. */
export function validateSignalSet(set: SignalSet): SignalQaResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let fullyObserved = 0;
  let nullValues = 0;

  for (const name of SIGNAL_NAMES) {
    const { isNull, full } = validateOne(name, set[name], errors);
    if (isNull) nullValues++;
    if (full) fullyObserved++;
  }
  // A null value with confidence > 0 is contradictory (claims certainty about nothing).
  for (const name of SIGNAL_NAMES) {
    const s = set[name];
    if (s && s.value === null && s.confidence > 0) warnings.push(`${name}: null value but confidence ${s.confidence}`);
  }

  return {
    ok: errors.length === 0,
    errors, warnings,
    signalCount: SIGNAL_NAMES.length,
    fullyObserved, nullValues,
  };
}
