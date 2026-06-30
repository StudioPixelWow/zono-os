// ============================================================================
// Evidence Search Engine™ — service / official entry point (server-only).
// getPropertyEvidence(input) resolves the input (propertyId | valuationId | raw
// fields) into a normalized address + subject, then runs the progressive search.
// READ-ONLY. Never changes valuation/MAI/confidence formulas.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { normalizeCity, normalizeNeighborhood, normalizeStreet, normalizeHouseNumber, strOf, numOf } from "./normalizers";
import { runEvidenceSearch, type EvidenceSubject } from "./engine";
import type { EvidenceSearchInput, EvidencePackage, ResolvedAddress } from "./types";
import { MIN_TOTAL_COMPARABLES } from "./types";

type Row = Record<string, unknown>;
const pick = <T>(...vals: (T | null | undefined)[]): T | null => { for (const v of vals) if (v != null && v !== "") return v; return null; };

/** Official entry point — find/normalize/rank/explain evidence for one property. */
export async function getPropertyEvidence(input: EvidenceSearchInput): Promise<EvidencePackage> {
  const { profile, user } = await getSessionContext();
  if (!profile?.org_id || !user) throw new Error("אין הרשאה.");
  const orgId = profile.org_id;
  const db = await createClient();

  // ── Resolve the subject row from valuationId / propertyId (explicit wins) ───
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
  const houseNumber = pick(input.houseNumber, strOf(src.house_number) || strOf(src.building_number));
  const rawAddress = pick(input.rawAddress, strOf(src.address) || strOf(src.full_address));
  const latitude = pick(input.latitude ?? null, numOf(src.latitude) ?? numOf(src.lat));
  const longitude = pick(input.longitude ?? null, numOf(src.longitude) ?? numOf(src.lng));
  const propertyType = pick(input.propertyType, strOf(src.property_type));
  const rooms = pick(input.rooms ?? null, numOf(src.rooms));
  const sqm = pick(input.sqm ?? null, numOf(src.built_sqm) ?? numOf(src.size_sqm) ?? numOf(src.sqm));

  const resolvedAddress: ResolvedAddress = {
    rawAddress, city, cityNormalized: normalizeCity(city),
    neighborhood, neighborhoodNormalized: normalizeNeighborhood(neighborhood),
    street, streetNormalized: normalizeStreet(street),
    houseNumber: houseNumber ? normalizeHouseNumber(houseNumber) : null,
    latitude, longitude, hasCoordinates: latitude != null && longitude != null,
  };
  const subject: EvidenceSubject = { propertyType, rooms, sqm };

  // Market-radius mode: caller may force conservative/expanded; otherwise the
  // engine starts at "standard" (3km) and only widens when evidence is thin.
  const requested = input.marketRadiusMode ?? "standard";
  let pkg = await runEvidenceSearch(db, orgId, resolvedAddress, subject, {
    allowNearbyCities: input.allowNearbyCities === true, marketRadiusMode: requested,
  });
  // Auto-escalate to the expanded 4km band ONLY when the standard search did not
  // reach the minimum usable evidence — never to inflate, only to fill a gap.
  if (requested === "standard" && pkg.comparablesForValuation.length < MIN_TOTAL_COMPARABLES) {
    const widened = await runEvidenceSearch(db, orgId, resolvedAddress, subject, {
      allowNearbyCities: input.allowNearbyCities === true, marketRadiusMode: "expanded",
    });
    if (widened.comparablesForValuation.length > pkg.comparablesForValuation.length) pkg = widened;
  }
  return pkg;
}
