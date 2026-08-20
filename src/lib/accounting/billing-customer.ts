// ============================================================================
// ZONO — Morning billing-customer resolution (server-only). Derives the billing
// recipient for an accounting document ONLY from server-side ZONO data — never
// from anything a browser supplied. Preference order for identity:
//   1. the registration draft linked to the payment (companyName + taxId + address)
//   2. the organization record + owner user (name + email)
// The Morning client should represent the subscribing BUSINESS, not an arbitrary
// agent display name. Missing tax id is surfaced (not fabricated).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { MorningClientInput } from "./morning-client";
import type { RegistrationData } from "@/lib/commercial/types";

export interface ResolvedBillingCustomer {
  client: MorningClientInput;
  /** Fields we could not resolve (e.g. "taxId") — for operator visibility. */
  missing: string[];
}

/** Resolve the billing customer for a payment's org. Service-role, server-only. */
export async function resolveBillingCustomer(input: {
  orgId: string; draftId: string | null;
}): Promise<ResolvedBillingCustomer | null> {
  const db = createServiceRoleClient();

  // 1. Draft-sourced billing details (the self-service paid flow collects these).
  let draftData: RegistrationData | null = null;
  if (input.draftId) {
    const { data } = await db.from("registration_drafts" as never)
      .select("data").eq("id", input.draftId).maybeSingle();
    draftData = (data as { data?: RegistrationData } | null)?.data ?? null;
  }

  // 2. Org record (canonical name) + an owner email as the billing contact.
  const { data: orgRow } = await db.from("organizations" as never)
    .select("id,name").eq("id", input.orgId).maybeSingle();
  const orgName = (orgRow as { name?: string } | null)?.name ?? null;

  let ownerEmail: string | null = draftData?.ownerEmail ?? null;
  if (!ownerEmail) {
    const { data: owner } = await db.from("users" as never)
      .select("email").eq("org_id", input.orgId).order("created_at", { ascending: true }).limit(1).maybeSingle();
    ownerEmail = (owner as { email?: string } | null)?.email ?? null;
  }

  const companyName = (draftData?.companyName || draftData?.officeName || orgName || "").trim();
  if (!companyName) return null; // cannot issue a document without a customer name

  const missing: string[] = [];
  const taxId = (draftData?.taxId ?? "").trim() || null;
  if (!taxId) missing.push("taxId");
  if (!ownerEmail) missing.push("email");

  const client: MorningClientInput = {
    name: companyName,
    taxId,
    emails: ownerEmail ? [ownerEmail] : [],
    phone: (draftData?.phone ?? "").trim() || null,
    address: (draftData?.address ?? "").trim() || null,
    city: (draftData?.city ?? "").trim() || null,
    country: "IL",
  };
  return { client, missing };
}
