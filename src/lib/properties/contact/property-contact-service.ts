// ============================================================================
// ZONO — Property Contact CTA: server resolver (server-only).
// ----------------------------------------------------------------------------
// Gathers the CANONICAL contact inputs using EXISTING data only, every read
// org-scoped through the authed Supabase client (RLS) — so a contact from
// another org is never visible here. No duplicate contact records are created.
// Delegates the actual decision + link/message building to the pure core.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { PropertyRow } from "@/lib/properties/repository";
import { resolvePropertyContact, type ResolvedPropertyContact } from "./property-contact-core";

const PRIVATE_SELLER_CONTACT = /private|owner|seller/i;

/** Best available human label for the property, used in the message body. */
function propertyLabelOf(p: PropertyRow): string {
  return (
    p.formatted_address?.trim() ||
    p.title?.trim() ||
    [p.neighborhood, p.city].filter(Boolean).join(", ").trim() ||
    "הנכס"
  );
}

/**
 * Resolve the Property Contact CTA view-model for a property the caller is
 * authorized to see. Reads the primary private-seller phone and the linked
 * external listing's broker/seller contact — nothing cross-org.
 */
export async function resolvePropertyContactForView(property: PropertyRow): Promise<ResolvedPropertyContact> {
  const supabase = await createClient();
  const { profile } = await getSessionContext();
  const agentName = (profile as { full_name?: string | null } | null)?.full_name ?? "";

  // ── Owner / private-seller phone — the primary property_sellers link ─────────
  let ownerPhone: string | null = null;
  let ownerName: string | null = null;
  const { data: links } = await supabase
    .from("property_sellers")
    .select("seller_id,is_primary")
    .eq("property_id", property.id);
  const linkRows = (links ?? []) as { seller_id: string; is_primary: boolean }[];
  const primaryLink = linkRows.find((l) => l.is_primary) ?? linkRows[0] ?? null;
  if (primaryLink) {
    const { data: seller } = await supabase
      .from("sellers")
      .select("full_name,phone")
      .eq("id", primaryLink.seller_id)
      .maybeSingle();
    const s = seller as { full_name: string | null; phone: string | null } | null;
    ownerPhone = s?.phone ?? null;
    ownerName = s?.full_name ?? null;
  }

  // ── Other-broker / source contact — the linked external listing ─────────────
  let brokerPhone: string | null = null;
  let brokerName: string | null = null;
  let externalHasAgent: boolean | null = null;
  let externalContactType: string | null = null;
  const { data: ext } = await supabase
    .from("external_listings")
    .select("contact_name,contact_phone,contact_type,has_agent")
    .or(`primary_property_id.eq.${property.id},promoted_property_id.eq.${property.id}`)
    .limit(1)
    .maybeSingle();
  const e = ext as
    | { contact_name: string | null; contact_phone: string | null; contact_type: string | null; has_agent: boolean | null }
    | null;
  if (e) {
    externalHasAgent = e.has_agent;
    externalContactType = e.contact_type;
    brokerPhone = e.contact_phone;
    brokerName = e.contact_name;
    // If the source contact is a private seller and the CRM has no seller phone,
    // use the listing contact as the owner phone (still the same authorized org).
    if (!ownerPhone && (e.contact_type == null || PRIVATE_SELLER_CONTACT.test(e.contact_type))) {
      ownerPhone = e.contact_phone;
      ownerName = ownerName ?? e.contact_name;
    }
  }

  return resolvePropertyContact({
    ownershipScope: property.ownership_scope,
    sourceType: property.source_type,
    exclusivityScope: property.exclusivity_scope,
    isExclusive: property.is_exclusive,
    isAgentExclusive: property.is_agent_exclusive,
    isOfficeExclusive: property.is_office_exclusive,
    externalHasAgent,
    externalContactType,
    ownerPhone,
    ownerName,
    brokerPhone,
    brokerName,
    agentName,
    propertyLabel: propertyLabelOf(property),
  });
}

/** The external-listing fields needed to build the same owner/broker CTA. */
export interface ExternalListingContactInput {
  title: string | null;
  neighborhood: string | null;
  city: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_type: string | null;
  has_agent: boolean | null;
}

/**
 * Resolve the SAME representation-aware contact CTA (owner vs broker, Hebrew
 * outreach text, honest disabled state) for a discovered EXTERNAL listing. The
 * listing already carries a single public contact (name + phone) plus has_agent /
 * contact_type; the detail was loaded org-scoped, so no extra read is needed. The
 * one contact is fed as both owner and broker input so the correct number is
 * present whichever branch the classifier picks.
 */
export async function resolveExternalListingContactForView(
  listing: ExternalListingContactInput,
): Promise<ResolvedPropertyContact> {
  const { profile } = await getSessionContext();
  const agentName = (profile as { full_name?: string | null } | null)?.full_name ?? "";
  const label =
    listing.title?.trim() ||
    [listing.neighborhood, listing.city].filter(Boolean).join(", ").trim() ||
    "הנכס";

  return resolvePropertyContact({
    ownershipScope: null,
    sourceType: null,
    exclusivityScope: null,
    isExclusive: false,
    isAgentExclusive: false,
    isOfficeExclusive: false,
    externalHasAgent: listing.has_agent,
    externalContactType: listing.contact_type,
    ownerPhone: listing.contact_phone,
    ownerName: listing.contact_name,
    brokerPhone: listing.contact_phone,
    brokerName: listing.contact_name,
    agentName,
    propertyLabel: label,
  });
}
