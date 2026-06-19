/**
 * External listings service — import orchestration + promotion to CRM property.
 * Mock-safe: providers return mock data; no external API calls yet.
 * Server-only.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import type { Database } from "@/lib/supabase/types";
import { getProvider, type NormalizedExternalListing } from "./providers";
import { externalListingRepository, importJobRepository } from "./repository";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Deterministic opportunity score from listing completeness + price tier. */
function opportunityScore(n: NormalizedExternalListing): number {
  let s = 30;
  if (n.price && n.price > 0) s += 15;
  if (n.rooms) s += 10;
  if (n.sqm) s += 10;
  if ((n.images?.length ?? 0) > 0) s += 10;
  if (n.contactPhone) s += 10;
  if (!n.hasAgent) s += 15; // private seller = stronger opportunity for the office
  return clamp(s);
}

export interface ImportResult {
  jobId: string;
  provider: string;
  found: number;
  imported: number;
}

export async function runImport(provider: string): Promise<ImportResult> {
  const { user, profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  const orgId = profile.org_id;

  const job = await importJobRepository.create({ org_id: orgId, provider, status: "running", started_at: new Date().toISOString(), created_by: user?.id ?? null });
  try {
    const p = getProvider(provider);
    await importJobRepository.log(orgId, job.id, `התחלת ייבוא מ-${provider} (mock)`);
    const raws = await p.searchListings({ limit: 10 });
    const normalized = raws.map((r) => p.normalizeListing(r));

    const rows: Database["public"]["Tables"]["external_listings"]["Insert"][] = normalized.map((n) => ({
      org_id: orgId,
      source: n.source,
      source_id: n.sourceId,
      external_id: n.externalId ?? null,
      title: n.title ?? null,
      city: n.city ?? null,
      neighborhood: n.neighborhood ?? null,
      address: n.address ?? null,
      property_type: n.propertyType ?? null,
      deal_type: n.dealType ?? null,
      price: n.price ?? null,
      rooms: n.rooms ?? null,
      sqm: n.sqm ?? null,
      floor: n.floor ?? null,
      total_floors: n.totalFloors ?? null,
      parking: n.parking ?? null,
      elevator: n.elevator ?? null,
      condition: n.condition ?? null,
      description: n.description ?? null,
      images: (n.images ?? []) as never,
      contact_name: n.contactName ?? null,
      contact_phone: n.contactPhone ?? null,
      has_agent: n.hasAgent ?? null,
      listing_url: n.listingUrl ?? null,
      published_at: n.publishedAt ?? null,
      last_synced_at: new Date().toISOString(),
      status: "active",
      opportunity_score: opportunityScore(n),
    }));
    await externalListingRepository.upsertMany(rows);

    await importJobRepository.update(job.id, { status: "completed", total_found: raws.length, total_imported: rows.length, finished_at: new Date().toISOString() });
    await importJobRepository.log(orgId, job.id, `נשמרו ${rows.length} מודעות (mock)`);
    return { jobId: job.id, provider, found: raws.length, imported: rows.length };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    await importJobRepository.update(job.id, { status: "failed", error: msg, finished_at: new Date().toISOString() });
    throw e;
  }
}

/**
 * Promote an external listing into a real CRM property — explicitly, never
 * automatically. The property is marked external_imported / public-info-only
 * and is NOT exclusive or office inventory unless a user assigns it later.
 */
export async function promoteExternalListing(listingId: string): Promise<string> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const listing = await externalListingRepository.getById(listingId);
  if (!listing) throw new Error("listing not found");
  if (listing.promoted_property_id) return listing.promoted_property_id;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({
      org_id: profile.org_id,
      owner_id: user.id,
      title: listing.title ?? "נכס חיצוני",
      type: (listing.property_type as Database["public"]["Tables"]["properties"]["Row"]["type"]) ?? "apartment",
      listing_kind: listing.deal_type === "rent" ? "rent" : "sale",
      status: "draft",
      price: listing.price ?? 0,
      rooms: listing.rooms ?? null,
      size_sqm: listing.sqm ?? null,
      city: listing.city ?? null,
      description: listing.description ?? null,
      // source taxonomy
      property_origin: "external_imported",
      source_type: "external",
      external_source: listing.source,
      ownership_scope: "shared",
      exclusivity_scope: "external_unknown",
      listing_rights: "public_information_only",
      is_internal_inventory: false,
      is_external_inventory: true,
      source_listing_id: listing.source_id,
      source_listing_url: listing.listing_url,
      source_last_synced_at: listing.last_synced_at,
      uploaded_by_user_id: user.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await externalListingRepository.markPromoted(listingId, data.id);
  await logActivityEvent({ eventType: "property.created", entityType: "property", entityId: data.id, relatedEntityType: "document", relatedEntityId: listingId, title: `נכס חיצוני קודם ל-CRM (${listing.source})` });
  return data.id;
}
