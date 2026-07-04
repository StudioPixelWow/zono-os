"use server";
// ============================================================================
// 💬 ZONO — WhatsApp Cloud API · send action. PHASE 48.0.
// Sends an APPROVED draft through the Cloud API (or mock when unconfigured).
// This is the ONLY outbound path and it is APPROVAL-GATED: a draft that is not
// approved cannot be sent. Reuses the existing whatsapp_drafts + markDraftSent.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendText, recipientForConversation } from "./service";
import { markDraftSent } from "@/lib/whatsapp/service";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function sendApprovedWhatsappDraftAction(input: { draftId: string }): Promise<{ ok: boolean; mock?: boolean; error?: string }> {
  const sc = await getSessionContext();
  const orgId = sc.profile?.org_id ?? sc.organization?.id ?? null;
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  const db = await createClient();
  const { data } = await db.from("whatsapp_drafts").select("id,conversation_id,body,approval_status").eq("organization_id", orgId).eq("id", input.draftId).limit(1).maybeSingle();
  const draft = data as Row | null;
  if (!draft) return { ok: false, error: "טיוטה לא נמצאה." };
  // ── APPROVAL GATE — nothing is sent unless explicitly approved ──
  if (s(draft.approval_status) !== "approved") return { ok: false, error: "הטיוטה דורשת אישור לפני שליחה." };
  const convId = s(draft.conversation_id);
  if (!convId) return { ok: false, error: "אין שיחה משויכת לטיוטה." };
  const to = await recipientForConversation(orgId, convId);
  if (!to) return { ok: false, error: "מספר הנמען אינו ידוע (אין הודעה נכנסת בשיחה)." };
  const r = await sendText(to, s(draft.body) ?? "");
  if (!r.ok) return { ok: false, error: r.error ?? "השליחה נכשלה." };
  await markDraftSent(input.draftId).catch(() => {});
  revalidatePath("/whatsapp/inbox");
  return { ok: true, mock: r.mock };
}
