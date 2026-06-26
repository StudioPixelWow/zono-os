// ============================================================================
// ZONO — PHASE 26.12: Learning + audit repository (SERVER-ONLY). Org-scoped.
// Every human decision is one append-only row in agency_ai_feedback — the AI
// learning signal AND the audit log (who/when/old/new/reason in metadata).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { reviewerContext } from "./_ctx";
import type { FeedbackRecord, ResolutionAction } from "./resolutionCenterFormat";

type Obj = Record<string, unknown>;
const COLS = "id,candidate_id,agency_id,action,previous_confidence,final_result,feedback_reason,reviewed_by,reviewed_at,metadata,created_at";
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (v == null ? null : Number(v));

export interface RecordFeedbackInput {
  action: ResolutionAction;
  candidateId?: string | null;
  agencyId?: string | null;
  previousConfidence?: number | null;
  finalResult?: string | null;
  reason?: string | null;
  metadata?: Obj;          // { old_value, new_value, detected_text, normalized, agency_name, alias, moved_counts }
}

export async function recordFeedback(input: RecordFeedbackInput): Promise<void> {
  const { orgId, userId } = await reviewerContext();
  const db = await createClient();
  const { error } = await db.from("agency_ai_feedback").insert({
    organization_id: orgId, candidate_id: input.candidateId ?? null, agency_id: input.agencyId ?? null,
    action: input.action, previous_confidence: input.previousConfidence ?? null, final_result: input.finalResult ?? null,
    feedback_reason: input.reason ?? null, reviewed_by: userId, metadata: input.metadata ?? {},
  } as never);
  if (error) throw new Error(error.message);
}

function toFeedback(r: Obj): FeedbackRecord {
  const meta = asObj(r.metadata);
  return {
    id: r.id as string, action: r.action as ResolutionAction, previousConfidence: num(r.previous_confidence),
    finalResult: str(r.final_result), reason: str(r.feedback_reason), reviewedAt: (r.reviewed_at as string) ?? "",
    detectedText: str(meta.detected_text), agencyName: str(meta.agency_name), alias: str(meta.alias),
  };
}

export async function listFeedback(limit = 300): Promise<FeedbackRecord[]> {
  const { orgId } = await reviewerContext();
  const db = await createClient();
  const { data } = await db.from("agency_ai_feedback").select(COLS)
    .eq("organization_id", orgId).order("reviewed_at", { ascending: false }).limit(limit);
  return ((data as Obj[] | null) ?? []).map(toFeedback);
}
