// ============================================================================
// 🗺️ Canonical org intelligence TERRITORY resolver (server-only, service-role).
// ----------------------------------------------------------------------------
// P9.1E territory isolation: an org's CITY intelligence must contain only
// entities relevant to that org's configured operating market — NOT every entity
// that exists globally in the shared graph. This is the ONE canonical resolver;
// every city-scoped office/broker read model must use it. The pure membership
// logic lives in ./territory-logic (unit-tested); this file only resolves the
// org's territory from authoritative data. It never scopes by a single free-text
// city string alone — it resolves the org's operating localities to canonical
// He/En names AND the exact provider strings present in the org's own scanned
// data, so "רחובות" and "Rehovot" both match while "Kiryat Bialik" never does.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeCityKey, type OrgTerritory } from "./territory-logic";

export { normalizeCityKey, officeInTerritory, type OrgTerritory } from "./territory-logic";

/**
 * Resolve the org's canonical operating territory. Priority:
 *   1. organization_operating_localities → israel_localities (canonical He + En)
 *   2. the exact city strings present in the org's OWN external_listings (the
 *      provider format, e.g. "Rehovot", so the shared graph lines up with data)
 * Both are unioned into cityKeys. No free-text-only scoping; no hardcoded cities.
 */
export async function getOrgIntelligenceTerritory(orgId: string): Promise<OrgTerritory> {
  const db = createServiceRoleClient();
  const names = new Set<string>();
  const localityIds: string[] = [];

  try {
    const { data: locs } = await db
      .from("organization_operating_localities" as never)
      .select("locality_id")
      .eq("organization_id", orgId);
    for (const r of ((locs ?? []) as { locality_id: string }[])) if (r.locality_id) localityIds.push(r.locality_id);
    if (localityIds.length) {
      const { data: il } = await db
        .from("israel_localities" as never)
        .select("name_he,name_en")
        .in("id", localityIds as never);
      for (const r of ((il ?? []) as { name_he: string | null; name_en: string | null }[])) {
        if (r.name_he) names.add(r.name_he);
        if (r.name_en) names.add(r.name_en);
      }
    }
  } catch { /* fall through to data-derived cities */ }

  try {
    const { data: el } = await db
      .from("external_listings" as never)
      .select("city")
      .eq("org_id", orgId)
      .not("city", "is", null)
      .limit(2000);
    for (const r of ((el ?? []) as { city: string | null }[])) if (r.city) names.add(r.city);
  } catch { /* best-effort */ }

  const cityKeys = new Set([...names].map((n) => normalizeCityKey(n)).filter(Boolean));
  return { orgId, cityKeys, canonicalNames: [...names], localityIds, empty: cityKeys.size === 0 };
}
