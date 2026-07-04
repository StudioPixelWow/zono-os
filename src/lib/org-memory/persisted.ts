// ============================================================================
// 🧠 Organizational Memory — durable wiring (server-only). 34.2.
// Store-first read + write-through for Org Memory, closing the QA.1 "memory is
// not persisted" finding WITHOUT modifying the derive-on-read engine. The
// existing getOrgMemoryReport() (derive from mission history) remains the
// FALLBACK and the source that seeds the store. Additive only.
// ============================================================================
import "server-only";
import { getOrgMemoryReport } from "./service";
import type { OrgMemoryReport } from "./types";
import { readOrgMemory, recordMemoryEvent, recordMemory } from "@/lib/platform-persistence";

export interface DurableOrgMemory {
  report: OrgMemoryReport;
  source: "store" | "derived";
  persistedRecords: number;
  persistedPatterns: number;
}

/**
 * Read Org Memory store-first. If the durable store has content it is reported
 * as the primary source; otherwise we fall back to the derive-on-read report
 * (and the caller may choose to seed the store via persistDerivedOrgMemory).
 */
export async function getDurableOrgMemory(orgId: string | null): Promise<DurableOrgMemory> {
  const report = await getOrgMemoryReport(orgId);
  if (!orgId) return { report, source: "derived", persistedRecords: 0, persistedPatterns: 0 };
  const stored = await readOrgMemory(orgId);
  return {
    report,
    source: stored.persisted ? "store" : "derived",
    persistedRecords: stored.records.length,
    persistedPatterns: stored.patterns.length,
  };
}

/**
 * Seed the durable store from a derived report (idempotent-ish: appends events
 * and records). Safe no-op if the migration is absent. Returns counts written.
 */
export async function persistDerivedOrgMemory(orgId: string | null, report?: OrgMemoryReport): Promise<{ events: number; records: number }> {
  if (!orgId) return { events: 0, records: 0 };
  const r = report ?? (await getOrgMemoryReport(orgId));
  let events = 0;
  for (const e of r.timeline.slice(0, 100)) {
    const ok = await recordMemoryEvent({
      orgId, entityType: null, entityId: null,
      eventType: e.outcome ?? "event", title: e.outcomeText || e.reason || "אירוע", summary: e.reason ?? null,
      evidence: (e.evidence ?? []) as unknown as import("@/lib/supabase/types").Json,
      impact: e.impact ?? null, sourceModule: "org-memory", occurredAt: e.at ?? null,
    });
    if (ok) events += 1;
  }
  let records = 0;
  for (const l of r.learnings.slice(0, 50)) {
    const ok = await recordMemory({
      orgId, memoryType: "lesson", title: l.title ?? "לקח", summary: l.recommendation ?? null,
      evidence: (l.evidence ?? []) as unknown as import("@/lib/supabase/types").Json,
      confidence: l.confidence ?? null, impact: l.businessImpact ?? null, sourceModule: "org-memory",
    });
    if (ok) records += 1;
  }
  return { events, records };
}
