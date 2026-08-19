"use server";
// ============================================================================
// ZONO — Buyer portal AGENT actions (server-only). Let an agent copy the customer's
// persistent portal link and revoke/rotate it. Org-scoped via the session; the
// helpers filter by org, so a link can never be minted for another org's contact.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getPortalLink, revokePortalAccess } from "./buyer-portal";

export interface PortalLinkResult { ok: boolean; url?: string; error?: string }

/** The persistent portal URL for a buyer (or lead). Session-scoped. */
export async function getBuyerPortalLinkAction(contactId: string, contactType: "buyer" | "lead" = "buyer"): Promise<PortalLinkResult> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = createServiceRoleClient();
  const url = await getPortalLink(db, orgId, contactType, contactId);
  return url ? { ok: true, url } : { ok: false, error: "לא נמצא לקוח." };
}

/** Revoke + rotate a buyer's portal access (old links stop working immediately). */
export async function revokeBuyerPortalAction(buyerId: string): Promise<PortalLinkResult> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  if (!orgId) return { ok: false, error: "אין הרשאה." };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db: any = createServiceRoleClient();
  const r = await revokePortalAccess(db, orgId, buyerId);
  return r.ok ? { ok: true, url: r.newUrl } : { ok: false, error: "הפעולה נכשלה." };
}
