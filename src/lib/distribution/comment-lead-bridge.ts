// ============================================================================
// 🌉 ZONO — Facebook Comment → CRM Lead bridge · service (server-only). CHECK.
// The MISSING link: promote a classified distribution comment/lead into the CRM
// `leads` table (APPROVAL-GATED — an explicit broker action, never automatic),
// capturing the phone via the existing extractPhone(), then START the existing
// approval-gated "lead_qualification" workflow. Reuses distributionCommentService,
// createLeadFromComment, startWorkflow. No new engine, no schema, no auto-send.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { distributionCommentsRepository } from "./distribution-comments-repository";
import { distributionCommentService } from "./distribution-comment-service";
import { startWorkflow } from "@/lib/workflow-builder/service";
import { pickPhone, mapCommentToLead, approvedPhoneReply } from "./comment-lead-bridge-core";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export interface PromoteResult {
  ok: boolean;
  crmLeadId?: string;
  phone?: string | null;
  distributionLeadId?: string;
  workflowId?: string | null;
  alreadyPromoted?: boolean;
  note?: string;
  error?: string;
}

/**
 * APPROVAL-GATED promotion of a Facebook-group comment to a CRM lead + journey.
 * Idempotent (re-promotion returns the existing CRM lead). Nothing here posts to
 * Facebook or sends a message — replies remain assisted/manual.
 */
export async function promoteCommentToCrmLead(
  commentId: string,
  opts: { phone?: string | null; extraTexts?: string[]; startWorkflow?: boolean } = {},
): Promise<PromoteResult> {
  const sc = await getSessionContext();
  const orgId = sc.profile?.org_id ?? sc.organization?.id ?? null;
  const userId = sc.user?.id ?? null;
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  if (!commentId) return { ok: false, error: "לא צוינה תגובה." };

  const comment = await distributionCommentsRepository.getById(commentId).catch(() => null);
  if (!comment) return { ok: false, error: "התגובה לא נמצאה." };

  // Ensure a distribution_lead exists (reuse the existing intake) → source linkage.
  const distLeadId = comment.lead_id ?? (await distributionCommentService.createLeadFromComment(commentId).catch(() => null));
  const db = await createClient();

  // Read the distribution_lead for source fields + any stored phone + idempotency.
  let distLead: Row | null = null;
  if (distLeadId) {
    try {
      const { data } = await db.from("distribution_leads" as never).select("id,property_id,phone,name,metadata,status" as never)
        .eq("organization_id" as never, orgId as never).eq("id" as never, distLeadId as never).limit(1).maybeSingle();
      distLead = (data as Row | null) ?? null;
    } catch { distLead = null; }
  }
  const meta = (distLead?.metadata as { crm_lead_id?: string } | null) ?? null;
  if (meta?.crm_lead_id) return { ok: true, alreadyPromoted: true, crmLeadId: meta.crm_lead_id, distributionLeadId: distLeadId ?? undefined, note: "כבר קודם ל-CRM." };

  // Capture phone (reuse extractPhone across the comment + any later messages + the distribution lead).
  const phone = opts.phone ?? pickPhone([comment.comment_text, s(distLead?.phone), ...(opts.extraTexts ?? [])]);

  // Create the CRM lead (approval = the broker's explicit action).
  const lean = { authorName: comment.author_name, commentText: comment.comment_text, leadIntentScore: comment.lead_intent_score, category: comment.category, suggestedReply: comment.suggested_reply, propertyId: s(distLead?.property_id) };
  const fields = mapCommentToLead(lean, phone);
  let crmLeadId: string | null = null;
  try {
    const { data, error } = await db.from("leads").insert({
      org_id: orgId, owner_id: userId, full_name: fields.full_name, phone: fields.phone, source: "facebook",
      intent: "buyer", stage: "new", message: fields.message, score: fields.score, property_id: fields.property_id,
    } as never).select("id").maybeSingle();
    if (error) return { ok: false, error: error.message };
    crmLeadId = s((data as Row | null)?.id);
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "יצירת הליד נכשלה." }; }
  if (!crmLeadId) return { ok: false, error: "יצירת הליד נכשלה." };

  // Link back (idempotency) + mark the comment handled.
  try {
    if (distLeadId) await db.from("distribution_leads" as never).update({ metadata: { ...(distLead?.metadata as object ?? {}), crm_lead_id: crmLeadId, promoted_at: new Date().toISOString() }, status: "converted" } as never).eq("organization_id" as never, orgId as never).eq("id" as never, distLeadId as never);
    await distributionCommentsRepository.markHandled(commentId, true);
  } catch { /* linkage best-effort */ }

  // Start the EXISTING approval-gated lead journey/workflow.
  let workflowId: string | null = null;
  if (opts.startWorkflow !== false) {
    try {
      const wf = await startWorkflow(orgId, "lead_qualification", { entityKind: "lead", entityId: crmLeadId, entityName: fields.full_name });
      workflowId = wf?.workflow.id ?? null;
    } catch { workflowId = null; }
  }

  return { ok: true, crmLeadId, phone, distributionLeadId: distLeadId ?? undefined, workflowId, note: "ליד נוצר ב-CRM והופעל תהליך ליד (דורש אישור בשלבים)." };
}

/** The approved, phone-requesting reply for a comment — DRAFT for manual posting. */
export async function getApprovedPhoneReply(commentId: string): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const comment = await distributionCommentsRepository.getById(commentId).catch(() => null);
  if (!comment) return { ok: false, error: "התגובה לא נמצאה." };
  return { ok: true, reply: approvedPhoneReply({ suggestedReply: comment.suggested_reply, category: comment.category }) };
}
