// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.9 · EXECUTIVE MEMORY storage (server).
//
// Append-only access to `executive_memory_snapshots`. IMMUTABLE by
// construction: this module exposes insert + read only, and the table has no
// UPDATE/DELETE RLS policies — history cannot be rewritten by any application
// path. Org scoping is RLS (current_org_id()); manager-audience rows are
// readable by managers only (policy-enforced, not UI-enforced). Retention is
// a READ WINDOW (default 90 days) — configurable per call, never destructive.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { DecisionAudience } from "@/lib/executive-decision/types";
import { DEFAULT_RETENTION_DAYS, type MemoryDecisionEntry, type MemorySnapshot } from "./types";

interface SnapshotRow {
  id: string;
  audience: string;
  taken_at: string;
  decisions: { entries: MemoryDecisionEntry[]; noActionRequired: boolean };
}

const toSnapshot = (r: SnapshotRow): MemorySnapshot => ({
  id: r.id,
  orgScoped: true,
  audience: r.audience as DecisionAudience,
  takenAt: r.taken_at,
  entries: r.decisions?.entries ?? [],
  noActionRequired: r.decisions?.noActionRequired === true,
});

/** Snapshots for the caller's org + audience within the retention window,
 *  newest first. RLS enforces org and manager-audience visibility. */
export async function listSnapshots(
  audience: DecisionAudience,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
  limit = 30,
): Promise<MemorySnapshot[]> {
  const db = await createClient();
  const since = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
  const { data } = await db
    .from("executive_memory_snapshots")
    .select("id,audience,taken_at,decisions")
    .eq("audience", audience)
    .gte("taken_at", since)
    .order("taken_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as SnapshotRow[]).map(toSnapshot);
}

/** Append one immutable snapshot for the caller's org. Never updates. */
export async function insertSnapshot(
  audience: DecisionAudience,
  entries: MemoryDecisionEntry[],
  noActionRequired: boolean,
): Promise<MemorySnapshot | null> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id;
  if (!orgId) return null;
  const db = await createClient();
  const { data, error } = await db
    .from("executive_memory_snapshots")
    .insert({ org_id: orgId, audience, decisions: { entries, noActionRequired } } as never)
    .select("id,audience,taken_at,decisions")
    .maybeSingle();
  if (error || !data) return null;
  return toSnapshot(data as unknown as SnapshotRow);
}
