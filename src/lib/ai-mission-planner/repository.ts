// ============================================================================
// 🗄️ Mission drafts repository (server-only). Phase 27.4.
// Reads/writes ai_mission_drafts under RLS (org-scoped). Defensive: returns
// [] / null on failure (e.g. before the migration is applied) so the UI never
// crashes. No execution — only draft rows.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import type { MissionDraft, MissionDraftInput, MissionEvidence, MissionGeneratedFrom, MissionStatus } from "./types";

const ACTIVE: MissionStatus[] = ["draft", "ready_for_review", "approved"];

type Row = Record<string, unknown>;
function arr<T>(v: unknown): T[] { return Array.isArray(v) ? (v as T[]) : []; }

function rowToDraft(row: Row): MissionDraft {
  return {
    id: String(row.id),
    sourceType: row.source_type as MissionDraft["sourceType"],
    sourceId: (row.source_id as string) ?? null,
    brokerId: (row.broker_id as string) ?? null,
    priority: row.priority as MissionDraft["priority"],
    category: row.category as MissionDraft["category"],
    title: String(row.title ?? ""),
    summary: (row.summary as string) ?? null,
    recommendedAction: (row.recommended_action as string) ?? null,
    expectedOutcome: (row.expected_outcome as string) ?? null,
    estimatedImpact: (row.estimated_impact as number) ?? null,
    confidence: Number(row.confidence ?? 0),
    relatedEntity: { type: (row.related_entity_type as string) ?? null, id: (row.related_entity_id as string) ?? null },
    evidence: arr<MissionEvidence>(row.evidence),
    generatedFrom: arr<MissionGeneratedFrom>(row.generated_from),
    blockedBy: arr<string>(row.blocked_by),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    status: row.status as MissionStatus,
    userId: (row.user_id as string) ?? null,
    reviewedAt: (row.reviewed_at as string) ?? null,
    reviewedBy: (row.reviewed_by as string) ?? null,
    convertedTaskId: (row.converted_task_id as string) ?? null,
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? ""),
  };
}

export async function listMissionDrafts(): Promise<MissionDraft[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ai_mission_drafts").select("*").order("created_at", { ascending: false }).limit(200);
    if (error) { console.error("[mission-planner] list failed:", error.message); return []; }
    return (data ?? []).map((r) => rowToDraft(r as Row));
  } catch (e) { console.error("[mission-planner] list error:", e); return []; }
}

export async function getDraftById(id: string): Promise<MissionDraft | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("ai_mission_drafts").select("*").eq("id", id).maybeSingle();
    return data ? rowToDraft(data as Row) : null;
  } catch (e) { console.error("[mission-planner] get error:", e); return null; }
}

export async function findActiveDuplicate(sourceType: string, category: string, relatedEntityId: string | null): Promise<boolean> {
  try {
    const supabase = await createClient();
    let q = supabase.from("ai_mission_drafts").select("id").eq("source_type", sourceType).eq("category", category).in("status", ACTIVE);
    q = relatedEntityId ? q.eq("related_entity_id", relatedEntityId) : q.is("related_entity_id", null);
    const { data } = await q.limit(1);
    return (data ?? []).length > 0;
  } catch (e) { console.error("[mission-planner] dup check error:", e); return false; }
}

export async function insertMissionDraft(orgId: string, userId: string | null, input: MissionDraftInput): Promise<MissionDraft | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ai_mission_drafts").insert({
      organization_id: orgId, user_id: userId, broker_id: input.brokerId ?? null,
      source_type: input.sourceType, source_id: input.sourceId ?? null,
      status: "ready_for_review", priority: input.priority, category: input.category,
      title: input.title, summary: input.summary ?? null, recommended_action: input.recommendedAction ?? null,
      expected_outcome: input.expectedOutcome ?? null, estimated_impact: input.estimatedImpact ?? null,
      confidence: input.confidence,
      related_entity_type: input.relatedEntity.type, related_entity_id: input.relatedEntity.id,
      evidence: input.evidence as unknown as Json, generated_from: input.generatedFrom as unknown as Json, blocked_by: input.blockedBy as unknown as Json,
      metadata: (input.metadata ?? {}) as unknown as Json,
    }).select("*").single();
    if (error) { console.error("[mission-planner] insert failed:", error.message); return null; }
    return data ? rowToDraft(data as Row) : null;
  } catch (e) { console.error("[mission-planner] insert error:", e); return null; }
}

export async function markConverted(id: string, taskId: string, metadata: Record<string, unknown>): Promise<MissionDraft | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ai_mission_drafts")
      .update({ status: "converted", converted_task_id: taskId, metadata: metadata as unknown as Json, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").single();
    if (error) { console.error("[mission-planner] mark converted failed:", error.message); return null; }
    return data ? rowToDraft(data as Row) : null;
  } catch (e) { console.error("[mission-planner] mark converted error:", e); return null; }
}

export async function updateDraftStatus(id: string, status: MissionStatus, reviewerId: string | null): Promise<MissionDraft | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ai_mission_drafts")
      .update({ status, reviewed_at: new Date().toISOString(), reviewed_by: reviewerId, updated_at: new Date().toISOString() })
      .eq("id", id).select("*").single();
    if (error) { console.error("[mission-planner] status update failed:", error.message); return null; }
    return data ? rowToDraft(data as Row) : null;
  } catch (e) { console.error("[mission-planner] status update error:", e); return null; }
}
