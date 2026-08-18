/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — External Customer Communication: SEND (server-only). The single, safe
// entry point for messaging a real customer. It (1) checks the consent gate,
// (2) sends via the EXISTING external dispatch (idempotent per (org, dedup_key)
// on notification_deliveries — no second ledger), (3) never fabricates a send.
// Email is the working channel today (Resend); WhatsApp business-initiated sends
// require an approved per-org template and are added on top of this same gate.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { dispatchExternal } from "@/lib/communication/dispatch";
import { checkChannelEligibility, type CommPurpose, type ContactType } from "./consent";

export interface CustomerEmailInput {
  orgId: string;
  contact: { type: ContactType; id: string; name?: string | null; email: string | null };
  purpose: CommPurpose;
  subscribed?: boolean;      // e.g. property_sellers.receives_reports
  subject: string;
  text: string;              // plain-text fallback (always required)
  html?: string | null;      // optional branded HTML
  dedupKey: string;          // idempotency + "already sent" dedup
}

export interface CustomerSendResult { sent: boolean; skipped?: boolean; reason: string }

export async function sendCustomerEmail(input: CustomerEmailInput, db?: any): Promise<CustomerSendResult> {
  const email = (input.contact.email ?? "").trim();
  if (!email || !email.includes("@")) return { sent: false, skipped: true, reason: "no_email" };

  const client: any = db ?? createServiceRoleClient();
  const gate = await checkChannelEligibility({
    orgId: input.orgId, contactType: input.contact.type, contactId: input.contact.id,
    channel: "email", purpose: input.purpose, subscribed: input.subscribed,
  }, client);
  if (!gate.eligible) return { sent: false, skipped: true, reason: gate.reason };

  const res = await dispatchExternal(client, "email", {
    orgId: input.orgId, userId: null, channel: "email",
    to: email, title: input.subject, body: input.text, html: input.html ?? null,
    dedupKey: input.dedupKey,
  }, { scheduledAt: null });

  if (res.skipped) return { sent: false, skipped: true, reason: "already_sent" };
  return { sent: res.sent, reason: res.sent ? "sent" : "delivery_failed" };
}
