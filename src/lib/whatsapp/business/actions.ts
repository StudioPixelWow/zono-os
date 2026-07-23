// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — Message Center actions (server, Part 7).
//
// Owner/manager-gated mutations for the Message Center: select the active phone
// number, send a test message, and disconnect. Every action re-checks role
// server-side (fail-closed) and writes through the service-role store; org
// isolation is inherited. The phone number the org selects becomes the active
// sender (business/messages resolves it).
// ============================================================================
"use server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { getWaOAuthConfig, listPhoneNumbers, subscribeApp } from "./oauth";
import { getConnection, storeConnection, clearConnection, decryptToken, setStatus } from "./tokens";
import { sendText } from "./messages";

async function managerCtx(): Promise<{ orgId: string; userId: string } | null> {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  const db = await createClient();
  const { data } = await db.rpc("has_min_role", { p_min: "manager" });
  if (data !== true) return null;          // fail closed
  return { orgId: sc.profile.org_id, userId: sc.user.id };
}

/** Select the active WhatsApp phone number (after a number is connected in Meta). */
export async function selectPhoneNumberAction(phoneNumberId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  const conn = await getConnection();
  if (!conn || !conn.wabaId) return { ok: false, error: "אין חיבור WABA." };
  const token = decryptToken(conn);
  if (!token) return { ok: false, error: "אין טוקן — יש להתחבר מחדש." };
  const cfg = getWaOAuthConfig();
  const { numbers } = await listPhoneNumbers(cfg, token, conn.wabaId);
  const num = numbers.find((n) => n.id === phoneNumberId);
  if (!num) return { ok: false, error: "מספר לא נמצא ב-WABA." };
  await subscribeApp(cfg, token, conn.wabaId);           // ensure webhooks flow for this WABA
  await storeConnection({
    orgId: ctx.orgId, createdBy: ctx.userId, accessToken: token, expiresInSec: null, scopes: conn.scopes,
    businessId: conn.businessId, wabaId: conn.wabaId, phoneNumberId: num.id,
    displayPhoneNumber: num.displayPhoneNumber, verifiedName: num.verifiedName, status: "connected",
  });
  await logAudit({ action: "whatsapp.number_selected", category: "configuration", entityType: "whatsapp_connection", entityId: num.id, summary: `WhatsApp number selected: ${num.displayPhoneNumber ?? num.id}` });
  return { ok: true };
}

/** Send a test message to a phone number (owner/manager). Phone-number-dependent. */
export async function sendTestMessageAction(to: string, text: string): Promise<{ ok: boolean; error?: string; messageId?: string }> {
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  if (!to.trim() || !text.trim()) return { ok: false, error: "נדרש מספר וטקסט." };
  const r = await sendText(ctx.orgId, to.trim(), text.trim());
  if (!r.ok) return { ok: false, error: r.error };
  await logAudit({ action: "whatsapp.test_sent", category: "configuration", entityType: "whatsapp_connection", summary: "WhatsApp test message sent" });
  return { ok: true, messageId: r.messageId };
}

/** Disconnect the org's WhatsApp connection (clears the encrypted token). */
export async function disconnectAction(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await managerCtx();
  if (!ctx) return { ok: false, error: "אין הרשאה." };
  await clearConnection(ctx.orgId);
  await setStatus(ctx.orgId, "disconnected");
  await logAudit({ action: "whatsapp.disconnected", category: "configuration", entityType: "whatsapp_connection", summary: "WhatsApp Business disconnected" });
  return { ok: true };
}
