// ============================================================================
// ZONO — Explainability repository (server-only).
// Optional persistence of score explanations into explainability_events.
// Reasons are produced by deterministic engines from real data — stored only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { ScoreExplanation, ScoreReason } from "./types";

const TABLE = "explainability_events";

/** Append one explanation (one row per reason) for the current org. Best-effort. */
export async function logExplanation(e: ScoreExplanation): Promise<{ ok: boolean; rows: number }> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return { ok: false, rows: 0 };
  if (!e.reasons.length) return { ok: true, rows: 0 };
  const db = await createClient();
  const rows = e.reasons.map((r: ScoreReason) => ({
    org_id: profile.org_id, entity_type: e.entityType ?? e.scoreType, entity_id: e.entityId ?? null,
    score_type: e.scoreType, score_value: e.score, band: e.band ?? null,
    reason: r.label, impact: r.impact, evidence: r.evidence ?? null, source: r.source ?? null,
  }));
  const { error } = await db.from(TABLE as never).insert(rows as never);
  return { ok: !error, rows: error ? 0 : rows.length };
}

export interface ExplainabilityEvent {
  scoreType: string; scoreValue: number; band: string | null;
  reason: string; impact: string; evidence: string | null; source: string | null; createdAt: string;
}

/** Read stored explanations for an entity (most recent first). */
export async function getExplanationEvents(entityType: string, entityId: string | null, limit = 50): Promise<ExplainabilityEvent[]> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return [];
  const db = await createClient();
  let q = db.from(TABLE as never).select("score_type,score_value,band,reason,impact,evidence,source,created_at")
    .eq("org_id", profile.org_id).eq("entity_type", entityType).order("created_at", { ascending: false }).limit(limit);
  if (entityId) q = q.eq("entity_id", entityId);
  const { data } = await q;
  return ((data ?? []) as unknown as Array<{ score_type: string; score_value: number; band: string | null; reason: string; impact: string; evidence: string | null; source: string | null; created_at: string }>)
    .map((r) => ({ scoreType: r.score_type, scoreValue: r.score_value, band: r.band, reason: r.reason, impact: r.impact, evidence: r.evidence, source: r.source, createdAt: r.created_at }));
}
