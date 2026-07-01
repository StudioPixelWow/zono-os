// ============================================================================
// 🧭 Comparable Discovery Engine™ — service / official entry (server-only). VAL-QA-10.
// discoverValuationComparables(input) resolves the subject (valuationId |
// propertyId | raw fields) into a normalized subject, then runs discovery over
// the full evidence universe. READ-ONLY. Never changes any formula/schema.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeCity, normalizeNeighborhood, normalizeStreet, normalizeHouseNumber, strOf, numOf } from "./normalizers";
import { runComparableDiscovery } from "./engine";
import type { DiscoveryInput, DiscoverySubject, ComparableDiscoveryPackage } from "./types";

type Row = Record<string, unknown>;
const pick = <T>(...vals: (T | null | undefined)[]): T | null => { for (const v of vals) if (v != null && v !== "") return v; return null; };

/** Resolve a subject and run comparable discovery. */
export async function discoverValuationComparables(input: DiscoveryInput): Promise<ComparableDiscoveryPackage> {
  const { profile, user } = await getSessionContext();
  if (!profile?.org_id || !user) throw new Error("אין הרשאה.");
  const orgId = profile.org_id;
  const db = await createClient();

  let src: Row = {};
  if (input.valuationId) {
    const { data } = await db.from("property_valuations" as never).select("*").eq("id", input.valuationId).eq("organization_id", orgId).maybeSingle();
    if (data) src = data as Row;
  } else if (input.propertyId) {
    const { data } = await db.from("properties" as never).select("*").eq("id", input.propertyId).maybeSingle();
    if (data) src = data as Row;
  }

  const city = pick(input.city, strOf(src.city) || strOf(src.city_name));
  const neighborhood = pick(input.neighborhood, strOf(src.neighborhood) || strOf(src.neighborhood_name));
  const street = pick(input.street, strOf(src.street) || strOf(src.name));
  const latitude = pick(input.latitude ?? null, numOf(src.latitude) ?? numOf(src.lat));
  const longitude = pick(input.longitude ?? null, numOf(src.longitude) ?? numOf(src.lng));
  const propertyType = pick(input.propertyType, strOf(src.property_type));
  const rooms = pick(input.rooms ?? null, numOf(src.rooms));
  const sqm = pick(input.sqm ?? null, numOf(src.built_sqm) ?? numOf(src.size_sqm) ?? numOf(src.sqm));
  const floor = pick(input.floor ?? null, numOf(src.floor));
  const totalFloors = pick(input.totalFloors ?? null, numOf(src.total_floors) ?? numOf(src.building_floors));
  const buildingYear = pick(input.buildingYear ?? null, numOf(src.building_year) ?? numOf(src.built_year) ?? numOf(src.year_built));
  const parking = pick(input.parking ?? null, numOf(src.parking_count) ?? numOf(src.parking));
  const balcony = pick(input.balcony ?? null, numOf(src.balcony_sqm) ?? numOf(src.balcony));
  const houseNumber = pick(input.houseNumber, strOf(src.house_number) || strOf(src.building_number));
  const boolOf = (v: unknown): boolean | null => (typeof v === "boolean" ? v : v == null || v === "" ? null : ["true", "yes", "כן", "1"].includes(String(v).toLowerCase()) ? true : ["false", "no", "לא", "0"].includes(String(v).toLowerCase()) ? false : null);
  const storage = input.storage ?? (boolOf(src.storage) ?? boolOf(src.storeroom));
  const elevator = input.elevator ?? boolOf(src.elevator);
  const condition = pick(input.condition, strOf(src.property_condition) || strOf(src.condition) || strOf(src.renovated));
  const isNew = input.isNew ?? boolOf(src.is_new);
  const luxuryLevel = pick(input.luxuryLevel, strOf(src.luxury_level) || strOf(src.view_quality));

  const subject: DiscoverySubject = {
    city, cityNormalized: normalizeCity(city),
    neighborhood, neighborhoodNormalized: normalizeNeighborhood(neighborhood),
    street, streetNormalized: normalizeStreet(street), houseNumber: houseNumber ? normalizeHouseNumber(houseNumber) : null,
    latitude, longitude, hasCoordinates: latitude != null && longitude != null,
    propertyType, propertyTypeNormalized: (propertyType ?? "").trim().toLowerCase(),
    rooms, sqm, floor, totalFloors, buildingYear,
    parking, storage, balcony, elevator, condition, isNew, luxuryLevel,
  };

  return runComparableDiscovery(db, orgId, subject, input.maxRadiusM ? { maxRadiusM: input.maxRadiusM } : {});
}
