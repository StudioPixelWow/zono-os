/**
 * Properties CRM repository — RLS-scoped authenticated access.
 *
 * All reads/writes go through the cookie-based server client, so Postgres RLS
 * enforces organization scoping automatically (a user only ever sees/edits
 * their own org's rows). Create sets org_id/owner_id from the session.
 *
 * Server-only. Never import from a Client Component.
 */
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { triggerCityLearning } from "@/lib/brokerage-data/city-learning-trigger";
import type { Database, PropertyStatus } from "@/lib/supabase/types";
import type { PropertyFilters, PropertyInput } from "./types";

export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type PropertyMediaRow = Database["public"]["Tables"]["property_media"]["Row"];
export type { PropertyFilters, PropertyInput } from "./types";

function toRecord(input: PropertyInput) {
  const location: Record<string, string | undefined> = {
    address: input.address ?? undefined,
    neighborhood: input.neighborhood ?? undefined,
    city: input.city ?? undefined,
    region: input.region ?? undefined,
  };
  return {
    title: input.title.trim() || "טיוטה ללא שם",
    description: input.description || null,
    type: input.type,
    listing_kind: input.listingKind,
    status: input.status,
    price: input.price,
    monthly_rent: input.monthlyRent ?? null,
    rooms: input.rooms ?? null,
    size_sqm: input.sizeSqm ?? null,
    outdoor_sqm: input.outdoorSqm ?? null,
    floor: input.floor ?? null,
    total_floors: input.totalFloors ?? null,
    city: input.city || null,
    region: (input.region as PropertyRow["region"]) || null,
    neighborhood: input.neighborhood || null,
    building_number: input.buildingNumber || null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    show_exact_address: input.showExactAddress,
    show_neighborhood_only: input.showNeighborhoodOnly,
    location,
    has_parking: input.hasParking,
    has_elevator: input.hasElevator,
    has_balcony: input.hasBalcony,
    has_safe_room: input.hasSafeRoom,
    has_storage: input.hasStorage,
    is_accessible: input.isAccessible,
    parking_count: input.parkingCount ?? null,
    storage_count: input.storageCount ?? null,
    balcony_count: input.balconyCount ?? null,
    features: input.features ?? [],
    listing_tag: (input.listingTag as PropertyRow["listing_tag"]) || null,
    availability_date: input.availabilityDate || null,
    price_before_discount: input.priceBeforeDiscount ?? null,
    price_per_sqm: input.pricePerSqm ?? null,
    marketing_description: input.marketingDescription || null,
    ai_description: input.aiDescription || null,
    internal_notes: input.internalNotes || null,
    target_audience: input.targetAudience || null,
    marketing_audiences: (input.marketingAudiences ?? []) as unknown as Database["public"]["Tables"]["properties"]["Row"]["marketing_audiences"],
    primary_image_url: input.primaryImageUrl || null,
    has_exclusivity: input.hasExclusivity,
    exclusivity_ends_at: input.exclusivityEndsAt || null,
    // Keep the source-taxonomy exclusivity flags in sync with has_exclusivity.
    is_exclusive: input.hasExclusivity,
    is_agent_exclusive: input.hasExclusivity,
    exclusivity_scope: input.hasExclusivity ? "agent_exclusive" : "none",
  };
}

/** Org-scoped list with filters (RLS guarantees the org boundary). */
export async function listProperties(
  filters: PropertyFilters = {},
): Promise<PropertyRow[]> {
  const supabase = await createClient();
  let q = supabase
    .from("properties")
    .select("*")
    .order("created_at", { ascending: false });

  if (!filters.includeArchived) q = q.neq("status", "archived");
  // Drafts are wizard-internal (in-progress) and must never appear as a saved
  // property in inventory — only show them when explicitly queried.
  if (filters.status !== "draft") q = q.neq("status", "draft");
  if (filters.city) q = q.ilike("city", `%${filters.city}%`);
  if (filters.type) q = q.eq("type", filters.type);
  if (filters.status) q = q.eq("status", filters.status);
  if (filters.minPrice != null) q = q.gte("price", filters.minPrice);
  if (filters.maxPrice != null) q = q.lte("price", filters.maxPrice);
  if (filters.minRooms != null) q = q.gte("rooms", filters.minRooms);
  if (filters.maxRooms != null) q = q.lte("rooms", filters.maxRooms);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getPropertyById(id: string): Promise<PropertyRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("properties")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function createProperty(input: PropertyInput): Promise<PropertyRow> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({
      ...toRecord(input),
      org_id: profile.org_id,
      owner_id: user.id,
      uploaded_by_user_id: user.id,
      assigned_agent_id: user.id,
      listed_at: input.status === "active" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  // Fire-and-forget: learn the city's brokerage market if it's new/weak/stale.
  // Never awaited → property creation is never blocked or failed by learning.
  void triggerCityLearning(profile.org_id, (data as { city?: string | null }).city, "property_created").catch(() => {});
  return data;
}

export async function updateProperty(
  id: string,
  input: PropertyInput,
): Promise<PropertyRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .update(toRecord(input))
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setPropertyStatus(
  id: string,
  status: PropertyStatus,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function archiveProperty(id: string): Promise<void> {
  await setPropertyStatus(id, "archived");
}

/** Remove the caller's untouched empty drafts (service-role, owner-scoped). */
async function cleanupAbandonedDrafts(userId: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    // Candidate empty drafts (untitled, no price).
    const { data: candidates } = await supabase
      .from("properties")
      .select("id")
      .eq("owner_id", userId)
      .eq("status", "draft")
      .eq("price", 0)
      .eq("title", "טיוטה ללא שם");
    const ids = (candidates ?? []).map((r) => r.id as string);
    if (!ids.length) return;
    // NEVER delete a draft that already has uploaded media — that would wipe
    // images the agent uploaded before filling title/price (data loss bug).
    const { data: withMedia } = await supabase
      .from("property_media")
      .select("property_id")
      .in("property_id", ids);
    const protectedIds = new Set((withMedia ?? []).map((m) => m.property_id as string));
    const deletable = ids.filter((id) => !protectedIds.has(id));
    if (deletable.length) {
      await supabase.from("properties").delete().in("id", deletable);
    }
  } catch {
    /* best-effort cleanup */
  }
}

/** Discard a draft explicitly (cancel). Never deletes a published listing. */
export async function discardDraft(id: string): Promise<void> {
  const { user } = await getSessionContext();
  if (!user) return;
  const supabase = createServiceRoleClient();
  await supabase
    .from("properties")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id)
    .neq("status", "published");
}

/** Create an empty draft so media + autosave have a property id to attach to. */
export async function createDraftProperty(): Promise<PropertyRow> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  await cleanupAbandonedDrafts(user.id);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .insert({
      org_id: profile.org_id,
      owner_id: user.id,
      uploaded_by_user_id: user.id,
      assigned_agent_id: user.id,
      title: "טיוטה ללא שם",
      type: "apartment",
      listing_kind: "sale",
      status: "draft",
      price: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

/** Resume the caller's in-progress draft if one exists, otherwise create a fresh
 *  one. This prevents the "saved twice" bug: previously every visit to
 *  /properties/new inserted a NEW draft row, so if a draft already held uploaded
 *  images, the next visit stranded them on that orphan draft while the published
 *  property had none. We deterministically reuse a single draft per session and
 *  PREFER a draft that already has media so images + publish stay on one row. */
export async function getOrCreateDraftProperty(): Promise<PropertyRow> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  await cleanupAbandonedDrafts(user.id); // drop truly-empty, media-less drafts
  const supabase = await createClient();
  const { data: drafts } = await supabase
    .from("properties")
    .select("*")
    .eq("owner_id", user.id)
    .eq("status", "draft")
    .order("updated_at", { ascending: false });
  const rows = (drafts ?? []) as PropertyRow[];
  if (rows.length) {
    // Prefer a draft that already has uploaded media (never strand images).
    const ids = rows.map((r) => r.id);
    const { data: media } = await supabase.from("property_media").select("property_id").in("property_id", ids);
    const withMedia = new Set((media ?? []).map((m) => m.property_id as string));
    return rows.find((r) => withMedia.has(r.id)) ?? rows[0];
  }
  return createDraftProperty();
}

/** Autosave the full form into an existing draft/property. */
export async function saveDraft(id: string, input: PropertyInput): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("properties")
    .update(toRecord(input))
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/** Mark a property as published (sets published_at + primary image). */
export async function markPublished(
  id: string,
  primaryImageUrl: string | null,
): Promise<void> {
  const supabase = await createClient();

  // Fallback: if no primary image was passed, use the property's primary media
  // row, or the first image in the gallery — so cards/details never show a
  // broken/placeholder image when the gallery actually has photos.
  let cover = primaryImageUrl;
  if (!cover) {
    const { data: imgs } = await supabase
      .from("property_media")
      .select("url,is_primary,sort_order")
      .eq("property_id", id)
      .eq("type", "image")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(1);
    cover = (imgs?.[0]?.url as string) ?? null;
  }

  const { error } = await supabase
    .from("properties")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      primary_image_url: cover,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listPropertyMedia(
  propertyId: string,
): Promise<PropertyMediaRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", propertyId)
    .order("sort_order", { ascending: true });
  return data ?? [];
}

export interface PropertyMediaResult {
  media: PropertyMediaRow[];
  images: PropertyMediaRow[];
  primary: PropertyMediaRow | null;
  /** Best cover URL: primary image → first image → null. */
  coverUrl: string | null;
  diagnostics: { propertyId: string; mediaCount: number; imageCount: number; primaryMediaId: string | null };
}
/**
 * Canonical property-media reader. ONE source of truth for the detail page,
 * cards and ZONO Creative — ordered media, primary, and a guaranteed cover
 * fallback (primary image → first image). Includes diagnostics for debugging.
 */
export async function getPropertyMedia(propertyId: string): Promise<PropertyMediaResult> {
  const media = await listPropertyMedia(propertyId);
  const images = media.filter((m) => m.type === "image");
  const primary = images.find((m) => m.is_primary) ?? null;
  const cover = primary ?? images[0] ?? null;
  return {
    media,
    images,
    primary,
    coverUrl: cover?.url ?? null,
    diagnostics: { propertyId, mediaCount: media.length, imageCount: images.length, primaryMediaId: primary?.id ?? null },
  };
}

/**
 * Batch cover resolver — ONE query for many properties. Returns property_id →
 * best cover url (primary image → first image). Lets list/pipeline/cards show a
 * property's real image consistently instead of relying on the denormalized
 * primary_image_url column (which may be null even when media exists).
 */
export async function listPropertyCovers(propertyIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(propertyIds)].filter(Boolean);
  if (!ids.length) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("property_media")
    .select("property_id,url,type,is_primary,sort_order")
    .in("property_id", ids)
    .eq("type", "image")
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  const out: Record<string, string> = {};
  for (const m of (data ?? []) as { property_id: string; url: string }[]) {
    if (!out[m.property_id] && m.url) out[m.property_id] = m.url; // first row per property = best cover
  }
  return out;
}

// ── Related records for the details page (read-only this phase) ──────────────
type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];

export async function getPropertyActivities(id: string): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("activities")
    .select("*")
    .eq("property_id", id)
    .order("occurred_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getPropertyNotes(id: string): Promise<NoteRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notes")
    .select("*")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}

export async function getPropertyDocuments(id: string): Promise<DocumentRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("documents")
    .select("*")
    .eq("property_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  return data ?? [];
}
