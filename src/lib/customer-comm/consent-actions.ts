"use server";
// ============================================================================
// ZONO — External Customer Communication: agent-facing CONSENT control.
// Lets an agent record a customer's opt-in / opt-out per channel (section 20 —
// outbound customer comms must be visible and controllable by the agent). Org
// scope comes from the session; RLS enforces authorization.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { setConsent, type ContactType, type CustomerChannel, type ConsentStatus } from "./consent";

export async function setContactConsentAction(input: {
  contactType: ContactType; contactId: string; channel: CustomerChannel; status: ConsentStatus;
}): Promise<{ ok: boolean; error?: string }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!input.contactId) return { ok: false, error: "חסר מזהה איש קשר." };
  try {
    await setConsent(profile.org_id, input.contactType, input.contactId, input.channel, input.status, "agent");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "consent_update_failed" };
  }
}
