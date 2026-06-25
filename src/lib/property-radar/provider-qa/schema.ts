// ============================================================================
// ZONO Property Radar™ — provider schema fingerprint + drift detection (pure).
// Builds a {field: type} fingerprint from a batch of RAW provider payloads and
// diffs it against the previously-stored fingerprint to detect schema changes
// (renamed/removed/type-changed fields) — e.g. yesterday `listingId`, today `id`.
// ============================================================================
import type { PropertyProviderName } from "../types";
import type { SchemaChange, SchemaFieldType, SchemaFingerprint } from "./types";

function typeOf(v: unknown): SchemaFieldType {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return "array";
  const t = typeof v;
  if (t === "number") return "number";
  if (t === "boolean") return "boolean";
  if (t === "object") return "object";
  return "string";
}

/** Build a field→type fingerprint from raw payloads (most common non-null type wins). */
export function buildSchemaFingerprint(rawPayloads: Record<string, unknown>[]): SchemaFingerprint {
  const counts: Record<string, Record<SchemaFieldType, number>> = {};
  for (const raw of rawPayloads) {
    if (!raw || typeof raw !== "object") continue;
    for (const [k, v] of Object.entries(raw)) {
      const t = typeOf(v);
      if (t === "null") continue; // null tells us nothing about the schema
      (counts[k] ??= { string: 0, number: 0, boolean: 0, object: 0, array: 0, null: 0 })[t]++;
    }
  }
  const fp: SchemaFingerprint = {};
  for (const [field, byType] of Object.entries(counts)) {
    let best: SchemaFieldType = "string";
    let bestN = -1;
    for (const t of Object.keys(byType) as SchemaFieldType[]) {
      if (byType[t] > bestN) { best = t; bestN = byType[t]; }
    }
    fp[field] = best;
  }
  return fp;
}

/**
 * Diff a new fingerprint against the previous one. Emits:
 *  - removed field (was present, now absent)        → high
 *  - new field (absent before, present now)         → low
 *  - type changed (string→number, etc.)             → medium
 * The FIRST observation (no previous) yields no changes.
 */
export function detectSchemaChanges(
  provider: PropertyProviderName,
  previous: SchemaFingerprint | null,
  next: SchemaFingerprint,
): SchemaChange[] {
  if (!previous || Object.keys(previous).length === 0) return [];
  const changes: SchemaChange[] = [];
  const fields = new Set([...Object.keys(previous), ...Object.keys(next)]);
  for (const field of fields) {
    const prevT = previous[field] ?? null;
    const nextT = next[field] ?? null;
    if (prevT && !nextT) {
      changes.push({ provider, field, previousType: prevT, newType: null, severity: "high" });
    } else if (!prevT && nextT) {
      changes.push({ provider, field, previousType: null, newType: nextT, severity: "low" });
    } else if (prevT && nextT && prevT !== nextT) {
      changes.push({ provider, field, previousType: prevT, newType: nextT, severity: "medium" });
    }
  }
  return changes;
}
