"use server";
// ============================================================================
// ZONO — PLATFORM SUPPORT VIEW server actions (P5.8, Path A). "use server":
// exports ONLY async functions. Start/exit delegate to the audited Support View
// DAL (capability + tenancy + audit live there). These are the ONLY mutations
// in P5.8 and they mutate ONLY support_impersonation_log — never customer data.
// ============================================================================
import { revalidatePath } from "next/cache";
import { startSupportView, endSupportView, SupportViewError } from "./support-view";

function fail(e: unknown): { ok: false; error: string } {
  if (e instanceof SupportViewError) return { ok: false, error: e.message };
  return { ok: false, error: "הפעולה נכשלה או שאין לך הרשאה" };
}

export async function supportViewStartAction(input: { orgId: string; targetUserId: string; reason: string; reasonDetail?: string | null; ticketId?: string | null }): Promise<{ ok: boolean; error?: string; sessionId?: string }> {
  try {
    const r = await startSupportView(input);
    revalidatePath(`/platform/support-view/${input.orgId}/${input.targetUserId}`);
    return { ok: true, sessionId: r.sessionId };
  } catch (e) { return fail(e); }
}

export async function supportViewEndAction(orgId: string, targetUserId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await endSupportView(orgId, targetUserId);
    revalidatePath(`/platform/support-view/${orgId}/${targetUserId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
