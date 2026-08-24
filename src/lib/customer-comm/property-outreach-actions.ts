"use server";
// ============================================================================
// ZONO — Property → Matched-Buyers bulk outreach: server actions.
// Org scope comes from the SESSION (never the client). The client sends only a
// property id + a selection; the server re-resolves matches, re-checks consent,
// sends through the canonical transport, and records CRM activity for BOTH the
// property timeline (one grouped event) and each buyer's history.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { assertProviderSpendAllowed } from "@/lib/commercial/billing-access";
import { logActivityEvent } from "@/lib/activity/service";
import { EVENT_TYPES } from "@/lib/activity/types";
import {
  getMatchedBuyersForOutreach,
  sendPropertyToSelectedBuyers,
  type MatchedBuyersOutreach,
  type SendOutreachResult,
} from "./property-outreach";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Load the matched-buyers outreach model for a property (org-scoped). */
export async function getPropertyOutreachAction(propertyId: string): Promise<Result<MatchedBuyersOutreach>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!propertyId) return { ok: false, error: "חסר מזהה נכס." };
  try {
    const data = await getMatchedBuyersForOutreach(profile.org_id, propertyId);
    if (!data) return { ok: false, error: "הנכס לא נמצא." };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "outreach_load_failed" };
  }
}

interface SendOutreachActionInput {
  propertyId: string;
  recipientIds: string[];
  channels: { whatsapp: boolean; email: boolean };
  allowResend?: boolean;
  emailSubject?: string;
  emailBody?: string;
}

/** Send the property to the selected matched buyers, then record CRM activity. */
export async function sendPropertyOutreachAction(input: SendOutreachActionInput): Promise<Result<SendOutreachResult>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  const orgId = profile.org_id;
  // 8.3 — outbound send is a paid provider action → billing-gated (fail-closed).
  try { await assertProviderSpendAllowed(orgId); }
  catch { return { ok: false, error: "המנוי ממתין להסדרת תשלום" }; }
  if (!input.propertyId) return { ok: false, error: "חסר מזהה נכס." };
  if (!input.recipientIds?.length) return { ok: false, error: "לא נבחרו קונים." };
  if (!input.channels?.whatsapp && !input.channels?.email) return { ok: false, error: "לא נבחר ערוץ שליחה." };

  let result: SendOutreachResult;
  try {
    result = await sendPropertyToSelectedBuyers({
      orgId,
      propertyId: input.propertyId,
      recipientIds: input.recipientIds,
      channels: input.channels,
      allowResend: input.allowResend,
      emailSubject: input.emailSubject,
      emailBody: input.emailBody,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "outreach_send_failed" };
  }

  // Record CRM activity — one grouped property-timeline event + per-buyer history.
  if (result.delivered > 0) {
    const parts: string[] = [];
    if (result.viaWhatsapp) parts.push(`WhatsApp: ${result.viaWhatsapp}`);
    if (result.viaEmail) parts.push(`מייל: ${result.viaEmail}`);
    if (result.deferred) parts.push(`מתוזמן: ${result.deferred}`);
    await logActivityEvent({
      eventType: EVENT_TYPES.propertyFileSent,
      entityType: "property",
      entityId: input.propertyId,
      title: `הנכס נשלח ל־${result.delivered} קונים מתאימים`,
      description: parts.join(" · ") || null,
      channel: result.viaWhatsapp && result.viaEmail ? "multi" : result.viaWhatsapp ? "whatsapp" : "email",
      direction: "outbound",
      metadata: { propertyId: input.propertyId, viaWhatsapp: result.viaWhatsapp, viaEmail: result.viaEmail, deferred: result.deferred, buyerIds: result.sentBuyerIds },
    });
    for (const r of result.recipients.filter((x) => x.delivered)) {
      const chans = r.outcomes.filter((o) => o.state === "sent" || o.state === "deferred").map((o) => o.channel);
      await logActivityEvent({
        eventType: EVENT_TYPES.buyerPropertyFileSent,
        entityType: "buyer",
        entityId: r.buyerId,
        relatedEntityType: "property",
        relatedEntityId: input.propertyId,
        title: "נשלח נכס מתאים",
        description: chans.length ? `דרך ${chans.map((c) => (c === "whatsapp" ? "WhatsApp" : "מייל")).join(" + ")}` : null,
        channel: chans.includes("whatsapp") && chans.includes("email") ? "multi" : chans[0] ?? null,
        direction: "outbound",
        metadata: { propertyId: input.propertyId, channels: chans },
      });
    }
  }

  return { ok: true, data: result };
}
