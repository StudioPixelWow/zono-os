// ============================================================================
// 🧹 Deduplication (pure). VAL-QA-10.
// ----------------------------------------------------------------------------
// Merge duplicate candidates ACROSS sources. Duplicate keys:
//   • same source table + source id
//   • same listing URL
//   • same address + price + sqm
//   • same coordinates + price + rooms
// The STRONGEST traceable candidate is kept; the dropped duplicates' references
// are retained in the survivor's `duplicateRefs` (nothing silently vanishes).
// ============================================================================
import { addressKey } from "./normalizers";
import type { Candidate } from "./types";

function keysOf(c: Candidate): string[] {
  const keys: string[] = [];
  if (c.sourceId) keys.push(`id:${c.sourceTable}:${c.sourceId}`);
  if (c.originalUrl) keys.push(`url:${c.originalUrl.trim().toLowerCase()}`);
  if (c.price && c.sqm) keys.push(`addr:${addressKey(c.city, c.street)}:${Math.round(c.price)}:${Math.round(c.sqm)}`);
  if (c.latitude != null && c.longitude != null && c.price && c.rooms != null) {
    keys.push(`geo:${c.latitude.toFixed(5)}:${c.longitude.toFixed(5)}:${Math.round(c.price)}:${c.rooms}`);
  }
  return keys;
}

/** Strength ranking: traceable first, then higher similarity, then priced+sized. */
function stronger(a: Candidate, b: Candidate): Candidate {
  if (a.isTraceable !== b.isTraceable) return a.isTraceable ? a : b;
  if (a.similarityScore !== b.similarityScore) return a.similarityScore > b.similarityScore ? a : b;
  const ac = (a.price ? 1 : 0) + (a.sqm ? 1 : 0), bc = (b.price ? 1 : 0) + (b.sqm ? 1 : 0);
  return ac >= bc ? a : b;
}

export interface DedupeResult { kept: Candidate[]; duplicatesRemoved: number }

/** Deduplicate candidates, keeping the strongest and recording dropped refs. */
export function dedupeCandidates(cands: Candidate[]): DedupeResult {
  const byKey = new Map<string, Candidate>();   // key → survivor
  const survivors: Candidate[] = [];
  let removed = 0;

  for (const c of cands) {
    const keys = keysOf(c);
    // Find an existing survivor sharing any key.
    let existing: Candidate | undefined;
    for (const k of keys) { const hit = byKey.get(k); if (hit) { existing = hit; break; } }

    if (!existing) {
      survivors.push(c);
      for (const k of keys) byKey.set(k, c);
      continue;
    }
    // Merge: pick the stronger, fold the weaker's ref into duplicateRefs.
    removed++;
    const winner = stronger(existing, c);
    const loser = winner === existing ? c : existing;
    winner.duplicateRefs.push({ sourceTable: loser.sourceTable, sourceId: loser.sourceId });
    for (const r of loser.duplicateRefs) winner.duplicateRefs.push(r);
    if (winner !== existing) {
      // Replace the survivor reference in the list + key map.
      const idx = survivors.indexOf(existing);
      if (idx >= 0) survivors[idx] = winner;
    }
    for (const k of new Set([...keys, ...keysOf(existing)])) byKey.set(k, winner);
  }
  return { kept: survivors, duplicatesRemoved: removed };
}
