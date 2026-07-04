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
  const body = s(draft.body) ?? "";
  const r = await sendText(to, body);
  if (!r.ok) {
    await db.from("whatsapp_drafts").update({ send_status: "failed" } as never).eq("organization_id", orgId).eq("id", input.draftId);
    return { ok: false, error: `${r.error ?? "השליחה נכשלה."}${r.errorKind ? ` (${r.errorKind})` : ""}` };
  }
  // Record the sent message as an outbound row so status webhooks can track it (provider_message_id).
  await db.from("whatsapp_drafts").update({ send_status: r.mock ? "sent_manual" : "sent_api", sent_at: new Date().toISOString() } as never).eq("organization_id", orgId).eq("id", input.draftId);
  await db.from("whatsapp_messages").insert({
    organization_id: orgId, conversation_id: convId, direction: "outbound", source: "meta_api", body, status: "sent",
    metadata: { provider_message_id: r.providerMessageId, wa_message_id: r.providerMessageId, to, mock: r.mock },
  } as never).then(() => {}, () => {});
  await markDraftSent(input.draftId).catch(() => {});
  revalidatePath("/whatsapp/inbox");
  return { ok: true, mock: r.mock };
}
