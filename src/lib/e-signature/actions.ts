"use server";
// ============================================================================
// ZONO — Internal Remote E-Signature: broker server actions. Org scope + curator
// identity from the SESSION. Sends the secure signing link via the canonical
// Resend transport (transactional — not consent-gated marketing). Distinct from
// the manual "רישום חתימה ידנית" action, which is untouched.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchExternal } from "@/lib/communication/dispatch";
import { createSignatureRequest, getSignedArtifactUrl } from "./service";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface SignatureRequestRow {
  id: string; status: string; recipientName: string; recipientEmail: string;
  sentAt: string | null; openedAt: string | null; signedAt: string | null; expiresAt: string;
}

function esc(s: string): string {
  return (s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Broker: send a legal document for REMOTE e-signature to a recipient. */
export async function sendForRemoteSignatureAction(input: { documentId: string; recipientName: string; recipientEmail: string; recipientPhone?: string | null }): Promise<Result<{ requestId: string }>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!input.documentId) return { ok: false, error: "חסר מזהה מסמך." };
  const email = (input.recipientEmail ?? "").trim();
  if (!email.includes("@")) return { ok: false, error: "כתובת מייל לא תקינה." };

  const db = createServiceRoleClient();
  const created = await createSignatureRequest({
    orgId: profile.org_id, documentId: input.documentId,
    recipient: { name: input.recipientName?.trim() || "לקוח", email, phone: input.recipientPhone ?? null },
    createdBy: user.id,
  }, db);
  if (!created.ok) return { ok: false, error: created.error };

  const { data: org } = await db.from("organizations").select("name").eq("id", profile.org_id).maybeSingle();
  const officeName = (org?.name as string) || "ZONO";
  const agentName = (profile as { full_name?: string | null }).full_name || officeName;
  const firstName = (input.recipientName ?? "").trim().split(/\s+/)[0] || "לקוח";
  const url = created.data.signingUrl;

  const subject = "מסמך ממתין לחתימתך";
  const text = `היי ${firstName},\n${agentName} שלח/ה אליך מסמך לחתימה.\n${created.data.documentTitle}\n\nלצפייה וחתימה:\n${url}`;
  const html = `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#f6f5fb;padding:24px;font-family:Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:16px;border:1px solid #ece9f6;padding:24px">
      <p style="font-size:15px;line-height:1.6;color:#1f2430">היי ${esc(firstName)},<br>${esc(agentName)} שלח/ה אליך מסמך לחתימה.</p>
      <p style="font-size:15px;font-weight:700;color:#111827;margin:12px 0 4px">${esc(created.data.documentTitle)}</p>
      <a href="${url}" style="display:inline-block;margin-top:12px;background:#6d28d9;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:12px 24px;border-radius:12px">פתח וחתום</a>
      <p style="margin-top:16px;font-size:11px;color:#8a8fa3">${esc(officeName)} · הקישור בתוקף עד ${esc(new Date(created.data.expiresAt).toLocaleDateString("he-IL"))}</p>
    </div></body></html>`;

  try {
    await dispatchExternal(db, "email", { orgId: profile.org_id, userId: null, channel: "email", to: email, title: subject, body: text, html, dedupKey: `esign:send:${created.data.requestId}` }, { scheduledAt: null });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "email_failed" };
  }
  return { ok: true, data: { requestId: created.data.requestId } };
}

/** Broker: revoke an unsigned signing request (completed ones cannot be revoked). */
export async function revokeSignatureRequestAction(requestId: string): Promise<Result<null>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  // signature_requests is newer than the generated types — use an untyped client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = createServiceRoleClient();
  const { data: req } = await db.from("signature_requests").select("id,status").eq("id", requestId).eq("org_id", profile.org_id).maybeSingle();
  if (!req) return { ok: false, error: "הבקשה לא נמצאה." };
  if (req.status === "completed" || req.status === "signed") return { ok: false, error: "לא ניתן לבטל בקשה שכבר נחתמה." };
  await db.from("signature_requests").update({ status: "revoked", revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", requestId).eq("org_id", profile.org_id);
  return { ok: true, data: null };
}

/** Broker: list remote signing requests for one document (Documents / Property tab). */
export async function listSignatureRequestsAction(documentId: string): Promise<Result<SignatureRequestRow[]>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = createServiceRoleClient();
  const { data } = await db.from("signature_requests")
    .select("id,status,recipient_name,recipient_email,sent_at,opened_at,signed_at,expires_at")
    .eq("org_id", profile.org_id).eq("document_id", documentId).order("created_at", { ascending: false });
  type Db = { id: string; status: string; recipient_name: string; recipient_email: string; sent_at: string | null; opened_at: string | null; signed_at: string | null; expires_at: string };
  const rows: SignatureRequestRow[] = ((data ?? []) as Db[]).map((r) => ({
    id: r.id, status: r.status, recipientName: r.recipient_name, recipientEmail: r.recipient_email,
    sentAt: r.sent_at, openedAt: r.opened_at, signedAt: r.signed_at, expiresAt: r.expires_at,
  }));
  return { ok: true, data: rows };
}

/** Broker: short-lived URL to the immutable signed artifact. */
export async function getSignedArtifactUrlAction(requestId: string): Promise<Result<{ url: string }>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  const url = await getSignedArtifactUrl(requestId, profile.org_id, createServiceRoleClient());
  return url ? { ok: true, data: { url } } : { ok: false, error: "המסמך החתום לא נמצא." };
}
