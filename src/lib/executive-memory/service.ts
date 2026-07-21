// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.9 · EXECUTIVE MEMORY service (server).
//
// One flow: read the CURRENT Executive Decisions (frozen engine, consumed
// read-only) → load the latest snapshot for this org+audience → diff (pure
// engine) → append the current snapshot ONLY when it differs from the latest
// (append-only dedup keeps history meaningful) → report.
//
// The service never recomputes priorities, never creates recommendations,
// never mutates decisions. Audience comes from the fail-closed manager check;
// snapshots and reads are RLS org-scoped.
// ============================================================================
import "server-only";
import { getExecutiveDecisions } from "@/lib/executive-decision/service";
import { diffSnapshots, entriesEqual, toMemoryEntries, toTimeline } from "./engine";
import { insertSnapshot, listSnapshots } from "./storage";
import { DEFAULT_RETENTION_DAYS, type ExecutiveMemoryReport, type MemorySnapshot } from "./types";

/** Provider failure ⇒ null — "unavailable", never an invented "no changes". */
export async function getExecutiveMemory(
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<ExecutiveMemoryReport | null> {
  const current = await getExecutiveDecisions().catch(() => null);
  if (!current) return null;

  const audience = current.audience;
  const history = await listSnapshots(audience, retentionDays).catch(() => [] as MemorySnapshot[]);
  const latest = history[0] ?? null;

  const entries = toMemoryEntries(current.decisions);

  // Append-only with dedup: a new immutable snapshot is written ONLY when the
  // remembered facts changed. Identical review ⇒ compare against the latest
  // snapshot without writing a duplicate row.
  let currentSnap: MemorySnapshot;
  let persisted = false;
  if (latest && entriesEqual(latest.entries, entries) && latest.noActionRequired === current.noActionRequired) {
    currentSnap = latest;
  } else {
    const written = await insertSnapshot(audience, entries, current.noActionRequired).catch(() => null);
    if (written) { currentSnap = written; persisted = true; }
    else {
      // Storage unavailable — still answer from a transient snapshot, honestly
      // identified as unpersisted (id "unpersisted", excluded from timeline).
      currentSnap = { id: "unpersisted", orgScoped: true, audience, takenAt: new Date().toISOString(), entries, noActionRequired: current.noActionRequired };
    }
  }

  // The previous snapshot for the diff is the latest stored state:
  //   · state changed  → latest is the OLD state → real changes reported.
  //   · state identical → latest IS the current state → an honest "אין שינוי"
  //     (changes are never re-reported on repeat visits).
  const prev = latest;

  const diff = diffSnapshots(prev, currentSnap);
  const timeline = toTimeline(persisted ? [currentSnap, ...history] : history);

  return { ...diff, timeline, audience };
}
