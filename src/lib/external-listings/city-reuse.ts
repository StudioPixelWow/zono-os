// ============================================================================
// ZONO — CITY LISTING REUSE (server-only). Saves real Apify credits by NOT
// re-scraping a city that another office already scanned recently.
//
// external_listings is per-org (each office holds its own physical copy of the
// same market ad). When a NEW office registers in a city that ZONO already knows
// — because another office in that city was scanned within the freshness window —
// we CLONE those fresh rows into the new org instead of paying Apify to fetch the
// exact same listings again. Cross-org reads of city data are already an accepted
// pattern here (the first-login market feed reads other orgs' rows the same way);
// this simply reuses them to avoid the scan.
//
// Fully defensive: any failure returns { reused:false } so the caller falls back
// to a normal scan — reuse can only ever SAVE a scan, never block or corrupt one.
// Identity + org-specific columns are stripped/rebound so a clone can never point
// at the donor org's property rows or dedupe groups.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { cityIlikeTerms, makeCityMatch } from "@/lib/brokerage-data/brokerage-knowledge";

/* eslint-disable @typescript-eslint/no-explicit-any -- external_listings lives outside generated types; row shape comes from the DB via select("*"). */

const FRESH_WINDOW_MS = 6 * 3_600_000; // a city scanned within 6h by ANY org is "fresh"
const MAX_CLONE = 1500;

export interface CityReuseResult { reused: boolean; copied: number; }

/** Columns that must NOT be carried across orgs (identity/audit) or that point at
 *  the DONOR org's own rows (property FKs, dedupe grouping). Everything else —
 *  including the expensive geocode columns — is cloned as-is. */
const STRIP = new Set([
  "id", "created_at", "updated_at", "imported_at",
  "primary_property_id", "promoted_property_id",
  "duplicate_group_id", "duplicate_confidence_score", "removed_at",
]);

/**
 * Clone fresh external_listings for `city` from other orgs into `orgId`.
 * Returns { reused:true, copied } only when fresh donor rows existed and were
 * written; otherwise { reused:false } (caller should scan normally).
 */
export async function reuseCityListingsForOrg(
  orgId: string,
  city: string | null | undefined,
  opts?: { freshWindowMs?: number; limit?: number },
): Promise<CityReuseResult> {
  if (!orgId || !city) return { reused: false, copied: 0 };
  try {
    const db = createServiceRoleClient();
    const sinceIso = new Date(Date.now() - (opts?.freshWindowMs ?? FRESH_WINDOW_MS)).toISOString();
    const terms = cityIlikeTerms(city);
    const orExpr = terms.length
      ? terms.flatMap((t) => [`city.ilike.%${t}%`, `city_name.ilike.%${t}%`]).join(",")
      : `city.ilike.%${city}%`;
    const inCity = makeCityMatch(city);

    // Donor rows: same city, from OTHER orgs, scanned recently, still active.
    const { data: donors, error } = await (db.from("external_listings" as never)
      .select("*").neq("org_id", orgId).or(orExpr)
      .gte("last_synced_at", sinceIso).neq("status", "removed").limit(5000) as any);
    if (error || !donors?.length) return { reused: false, copied: 0 };

    // Confirm city match + dedupe by source+source_id (keep the freshest copy).
    const seen = new Map<string, any>();
    for (const r of donors as any[]) {
      if (!(inCity(r.city) || inCity(r.city_name))) continue;
      const key = `${r.source}|${r.source_id}`;
      const prev = seen.get(key);
      if (!prev || String(r.last_synced_at ?? "") > String(prev.last_synced_at ?? "")) seen.set(key, r);
    }
    const donorRows = [...seen.values()].slice(0, opts?.limit ?? MAX_CLONE);
    if (!donorRows.length) return { reused: false, copied: 0 };

    const now = new Date().toISOString();
    const payload = donorRows.map((r) => {
      const c: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) if (!STRIP.has(k)) c[k] = v;
      c.org_id = orgId;
      c.last_synced_at = now;
      c.first_seen_at = (r as any).first_seen_at ?? now;
      return c;
    });

    let copied = 0;
    for (let i = 0; i < payload.length; i += 500) {
      const chunk = payload.slice(i, i + 500);
      const { error: upErr } = await (db.from("external_listings" as never)
        .upsert(chunk as never, { onConflict: "org_id,source,source_id", ignoreDuplicates: true } as never) as any);
      if (!upErr) copied += chunk.length;
    }
    return { reused: copied > 0, copied };
  } catch (e) {
    console.error("[city-reuse] skipped:", e);
    return { reused: false, copied: 0 };
  }
}
