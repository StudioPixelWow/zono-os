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
import { distributionRepo } from "./repository";
import { startWorkflow } from "@/lib/workflow-builder/service";
import { pickPhone, mapCommentToLead, approvedPhoneReply } from "./comment-lead-bridge-core";
import { buildJourneyEnrichment, shouldStartJourney, deriveLifecycleStatus } from "./comment-journey-core";
import type { DistLeadRow } from "./db-types";

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

  // Read the distribution_lead (org-scoped via the repository) for source fields,
  // any stored phone, and idempotency.
  const distLead: DistLeadRow | null = distLeadId ? await distributionRepo.getLeadById(distLeadId).catch(() => null) : null;
  const meta = (distLead?.metadata as Row | undefined) ?? {};
  if (s(meta.crm_lead_id)) return { ok: true, alreadyPromoted: true, crmLeadId: s(meta.crm_lead_id)!, distributionLeadId: distLeadId ?? undefined, workflowId: s(meta.workflow_id), note: "כבר קודם ל-CRM." };

  // Capture phone (reuse extractPhone across the comment + any later messages + the distribution lead + the enriched metadata).
  const phone = opts.phone ?? pickPhone([comment.comment_text, distLead?.phone ?? null, s(meta.phone), ...(opts.extraTexts ?? [])]);

  // Create the CRM lead (approval = the broker's explicit action).
  const lean = { authorName: comment.author_name, commentText: comment.comment_text, leadIntentScore: comment.lead_intent_score, category: comment.category, suggestedReply: comment.suggested_reply, propertyId: distLead?.property_id ?? null };
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

  // Journey-once guard: start the EXISTING approval-gated lead workflow only if
  // one was never started for this suggestion.
  let workflowId: string | null = s(meta.workflow_id);
  const startJourney = opts.startWorkflow !== false && shouldStartJourney(meta);
  if (startJourney) {
    try {
      const wf = await startWorkflow(orgId, "lead_qualification", { entityKind: "lead", entityId: crmLeadId, entityName: fields.full_name });
      workflowId = wf?.workflow.id ?? workflowId;
    } catch { /* keep prior workflowId */ }
  }

  // Attach the Lead-Journey enrichment (by REFERENCE — no duplicated data) +
  // full source links + lifecycle status onto the distribution_lead metadata.
  const journey = buildJourneyEnrichment({
    workflowId, commentId, phone,
    propertyId: distLead?.property_id ?? fields.property_id ?? null,
    campaignId: distLead?.campaign_id ?? null, groupId: distLead?.group_id ?? null, postId: distLead?.post_id ?? comment.post_id,
    classification: comment.category, suggestedReply: comment.suggested_reply, confidence: comment.lead_intent_score,
    evidence: [comment.comment_text, comment.analysis_reason], now: new Date().toISOString(),
  });
  const status = deriveLifecycleStatus({ phone, isLeadCandidate: true, crmLeadId, workflowId });
  try {
    if (distLeadId) await distributionRepo.updateLead(distLeadId, { status: "converted", phone, metadata: { ...meta, crm_lead_id: crmLeadId, promoted_at: journey.startedAt, workflow_id: workflowId, status, journey: journey as unknown as Record<string, unknown> } });
    await distributionCommentsRepository.updateMetadata(commentId, { crm_lead_id: crmLeadId, workflow_id: workflowId, status }).catch(() => {});
    await distributionCommentsRepository.markHandled(commentId, true);
  } catch { /* linkage best-effort */ }

  return { ok: true, crmLeadId, phone, distributionLeadId: distLeadId ?? undefined, workflowId, note: "ליד נוצר ב-CRM והופעל תהליך ליד (דורש אישור בשלבים)." };
}

/** The approved, phone-requesting reply for a comment — DRAFT for manual posting. */
export async function getApprovedPhoneReply(commentId: string): Promise<{ ok: boolean; reply?: string; error?: string }> {
  const comment = await distributionCommentsRepository.getById(commentId).catch(() => null);
  if (!comment) return { ok: false, error: "התגובה לא נמצאה." };
  return { ok: true, reply: approvedPhoneReply({ suggestedReply: comment.suggested_reply, category: comment.category }) };
}
