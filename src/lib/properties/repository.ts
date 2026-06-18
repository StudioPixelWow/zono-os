/**
 * Properties CRM repository — RLS-scoped authenticated access.
 *
 * All reads/writes go through the cookie-based server client, so Postgres RLS
 * enforces organization scoping automatically (a user only ever sees/edits
 * their own org's rows). Create sets org_id/owner_id from the session.
 *
 * Server-only. Never import from a Client Component.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database, PropertyStatus } from "@/lib/supabase/types";
import type { PropertyFilters, PropertyInput } from "./types";

export type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
export type { PropertyFilters, PropertyInput } from "./types";

function toRecord(input: PropertyInput) {
  const location: Record<string, string | undefined> = {
    address: input.address ?? undefined,
    neighborhood: input.neighborhood ?? undefined,
    city: input.city ?? undefined,
    region: input.region ?? undefined,
  };
  return {
    title: input.title.trim(),
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
    location,
    has_parking: input.hasParking,
    has_elevator: input.hasElevator,
    has_balcony: input.hasBalcony,
    has_safe_room: input.hasSafeRoom,
    has_storage: input.hasStorage,
    is_accessible: input.isAccessible,
    has_exclusivity: input.hasExclusivity,
    exclusivity_ends_at: input.exclusivityEndsAt || null,
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
      listed_at: input.status === "active" ? new Date().toISOString() : null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
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
