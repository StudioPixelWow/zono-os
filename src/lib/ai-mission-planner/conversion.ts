// ============================================================================
// 🔁 Mission-to-Task Conversion™ (server-only). Phase 27.5.
// ----------------------------------------------------------------------------
// Converts an ALREADY-APPROVED mission draft into a normal ZONO task — and
// nothing else. Creating the task is the ONLY side effect. No messages, no
// calendar, no CRM entity changes, no workflows, no AI calls. Idempotent: a
// second click returns the existing task. Org-scoped (RLS + explicit org on insert).
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDraftById, markConverted } from "./repository";
import { buildTaskFromDraft, evaluateConversion } from "./task-mapping";

export interface ConversionResult {
  ok: boolean;
  taskId?: string;
  alreadyConverted?: boolean;
  reason?: string;
}

export async function convertApprovedMissionDraftToTask(args: {
  organizationId: string;
  userId: string;
  draftId: string;
}): Promise<ConversionResult> {
  const { organizationId, userId, draftId } = args;

  // RLS already scopes reads to the caller's org; null = not visible/owned.
  const draft = await getDraftById(draftId);
  if (!draft) return { ok: false, reason: "not_found" };

  // Idempotency: already converted → return the existing task (no duplicate).
  if (draft.status === "converted" && draft.convertedTaskId) {
    return { ok: true, taskId: draft.convertedTaskId, alreadyConverted: true };
  }

  const verdict = evaluateConversion(draft);
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const fields = buildTaskFromDraft(draft, new Date());

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("tasks").insert({
      org_id: organizationId,
      created_by: userId,
      assignee_id: draft.userId ?? userId,
      ...fields,
    }).select("id").single();
    if (error || !data) return { ok: false, reason: `task insert failed: ${error?.message ?? "unknown"}` };
    const taskId = String(data.id);

    await markConverted(draftId, taskId, {
      ...draft.metadata,
      conversion: { convertedBy: userId, convertedAt: new Date().toISOString(), taskId },
    });

    // Best-effort audit trail (existing activities log) — never blocks conversion.
    try {
      await supabase.from("activities").insert({
        org_id: organizationId, actor_id: userId, type: "task", direction: "internal",
        subject: `טיוטת משימה מ-AI הומרה למשימה: ${draft.title}`, occurred_at: new Date().toISOString(),
      });
    } catch (e) { console.error("[mission-planner] audit log failed (non-blocking):", e); }

    return { ok: true, taskId };
  } catch (e) {
    console.error("[mission-planner] conversion error:", e);
    return { ok: false, reason: "conversion failed" };
  }
}
