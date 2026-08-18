/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — External Customer Communication: CONSENT model (server-only).
// The compliance gate for EVERY message sent to a real customer. Conservative,
// Israel-anti-spam-aligned policy (deterministic, unit-testable):
//   • marketing        → send ONLY to an explicit opted_in contact
//   • service_report   → send if subscribed (e.g. property_sellers.receives_reports)
//                        AND not opted_out (or explicitly opted_in)
//   • transactional    → send unless opted_out (customer-initiated context)
// A global opt-out is ALWAYS honored. Fail-CLOSED: if consent state can't be
// read (e.g. table missing), the contact is treated as NOT eligible.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type CustomerChannel = "whatsapp" | "email";
export type ContactType = "buyer" | "seller" | "lead";
export type ConsentStatus = "opted_in" | "opted_out" | "unset";
export type CommPurpose = "transactional" | "service_report" | "marketing";

export interface EligibilityInput {
  status: ConsentStatus;
  purpose: CommPurpose;
  /** External subscription signal (e.g. property_sellers.receives_reports). */
  subscribed?: boolean;
}

/** PURE conservative policy. Opt-out always wins. */
export function isEligibleByPolicy({ status, purpose, subscribed }: EligibilityInput): boolean {
  if (status === "opted_out") return false;
  switch (purpose) {
    case "marketing":       return status === "opted_in";
    case "service_report":  return status === "opted_in" || subscribed === true;
    case "transactional":   return true; // opt-out already excluded above → allowed by default
    default:                return false;
  }
}

/** Read the stored consent status for a contact+channel. Returns "unset" when no
 *  row exists, or null on a read error (caller treats null as NOT eligible). */
export async function getConsentStatus(
  db: any, orgId: string, contactType: ContactType, contactId: string, channel: CustomerChannel,
): Promise<ConsentStatus | null> {
  try {
    const { data, error } = await db.from("customer_comm_consent").select("status")
      .eq("org_id", orgId).eq("contact_type", contactType).eq("contact_id", contactId).eq("channel", channel)
      .limit(1).maybeSingle();
    if (error) return null;
    return ((data?.status as ConsentStatus) ?? "unset");
  } catch { return null; }
}

export interface EligibilityCheck {
  orgId: string; contactType: ContactType; contactId: string;
  channel: CustomerChannel; purpose: CommPurpose; subscribed?: boolean;
}

/** Full gate: read status + apply policy. Fail-closed. */
export async function checkChannelEligibility(
  input: EligibilityCheck, db?: any,
): Promise<{ eligible: boolean; status: ConsentStatus | null; reason: string }> {
  const client: any = db ?? createServiceRoleClient();
  const status = await getConsentStatus(client, input.orgId, input.contactType, input.contactId, input.channel);
  if (status === null) return { eligible: false, status: null, reason: "consent_unavailable" };
  const eligible = isEligibleByPolicy({ status, purpose: input.purpose, subscribed: input.subscribed });
  return { eligible, status, reason: eligible ? "ok" : status === "opted_out" ? "opted_out" : `needs_consent:${input.purpose}` };
}

/** Upsert a consent decision (agent action, unsubscribe link, import). Service-role safe. */
export async function setConsent(
  orgId: string, contactType: ContactType, contactId: string,
  channel: CustomerChannel, status: ConsentStatus, source: string, db?: any,
): Promise<void> {
  const client: any = db ?? createServiceRoleClient();
  await client.from("customer_comm_consent").upsert({
    org_id: orgId, contact_type: contactType, contact_id: contactId, channel, status, source,
    updated_at: new Date().toISOString(),
  }, { onConflict: "org_id,contact_type,contact_id,channel" });
}
