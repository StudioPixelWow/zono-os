// ============================================================================
// 🌉 ZONO — Facebook Comment → CRM Lead bridge · server actions. CHECK.
// APPROVAL-GATED: a broker explicitly promotes a comment to a CRM lead + starts
// the lead journey. No auto-lead, no auto-reply, no Facebook posting here.
// ============================================================================
"use server";
import { revalidatePath } from "next/cache";
import { promoteCommentToCrmLead, getApprovedPhoneReply, type PromoteResult } from "./comment-lead-bridge";

/** Promote a classified comment to a CRM lead + start the approval-gated journey. */
export async function promoteCommentToCrmLeadAction(input: { commentId: string; phone?: string; extraTexts?: string[] }): Promise<PromoteResult> {
  const r = await promoteCommentToCrmLead(input.commentId, { phone: input.phone ?? null, extraTexts: input.extraTexts });
  if (r.ok) { revalidatePath("/distribution"); revalidatePath("/today"); }
  return r;
}

/** Get the approved, phone-requesting reply text for a comment (assisted/manual posting). */
export async function getApprovedPhoneReplyAction(commentId: string): Promise<{ ok: boolean; reply?: string; error?: string }> {
  return getApprovedPhoneReply(commentId);
}
