// ============================================================================
// 📸 ZONO Intelligence Store — snapshot repository (server-only). 34.2.
// Opt-in point-in-time persistence of computed intelligence (Truth scores, CoS
// org score, listing/buyer/seller/lead health, office growth, market
// domination, street/building intel, competitive position). Modules are NOT
// forced to write — they call writeSnapshot() when they want trends. Reads
// return the latest snapshot per (entity, kind). Writes run under service_role.
// Degrades gracefully if the 34.2 migration is absent. Never throws.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { normConfidence, ttlToExpiry } from "./core";

const TABLE = "zono_intelligence_snapshots";

export interface SnapshotInput {
  orgId: string;
  entityType: string;
  entityId?: string | null;
  kind: string;
  score?: number | null;
  confidence?: number | null;
  truthScore?: number | null;
  payload?: Json;
  sourceModule?: string | null;
  ttlSeconds?: number | null;
}
export interface Snapshot {
  score: number | null; confidence: number | null; truthScore: number | null;
  payload: unknown; computedAt: string; sourceModule: string | null;
}

/** Persist a snapshot. Returns true on success, false if absent/failed. */
export async function writeSnapshot(input: SnapshotInput): Promise<boolean> {
  if (!input.orgId || !input.entityType || !input.kind) return false;
  const now = Date.now();
  const db = createServiceRoleClient();
  try {
    const { error } = await db.from(TABLE).insert({
      org_id: input.orgId, entity_type: input.entityType, entity_id: input.entityId ?? null, kind: input.kind,
      score: input.score ?? null, confidence: normConfidence(input.confidence), truth_score: input.truthScore ?? null,
      payload: input.payload ?? {}, source_module: input.sourceModule ?? null,
      computed_at: new Date(now).toISOString(), expires_at: ttlToExpiry(input.ttlSeconds ?? null, now),
    });
    return !error;
  } catch { return false; }
}

/** Latest snapshot for one (entity, kind). Null on miss / absent table. */
export async function getLatestSnapshot(orgId: string, entityType: string, kind: string, entityId?: string | null): Promise<Snapshot | null> {
  if (!orgId) return null;
  const db = createServiceRoleClient();
  try {
    let q = db.from(TABLE).select("score,confidence,truth_score,payload,computed_at,source_module")
      .eq("org_id", orgId).eq("entity_type", entityType).eq("kind", kind);
    q = entityId ? q.eq("entity_id", entityId) : q.is("entity_id", null);
    const { data, error } = await q.order("computed_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return { score: data.score, confidence: data.confidence, truthScore: data.truth_score, payload: data.payload, computedAt: data.computed_at, sourceModule: data.source_module };
  } catch { return null; }
}

/** Recent snapshot history for one (entity, kind), newest first, for trending. */
export async function listSnapshots(orgId: string, entityType: string, kind: string, entityId: string | null, limit = 30): Promise<Snapshot[]> {
  if (!orgId) return [];
  const db = createServiceRoleClient();
  try {
    let q = db.from(TABLE).select("score,confidence,truth_score,payload,computed_at,source_module")
      .eq("org_id", orgId).eq("entity_type", entityType).eq("kind", kind);
    q = entityId ? q.eq("entity_id", entityId) : q.is("entity_id", null);
    const { data, error } = await q.order("computed_at", { ascending: false }).limit(limit);
    if (error || !data) return [];
    return data.map((d) => ({ score: d.score, confidence: d.confidence, truthScore: d.truth_score, payload: d.payload, computedAt: d.computed_at, sourceModule: d.source_module }));
  } catch { return []; }
}
