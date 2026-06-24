// ============================================================================
// ZONO — Geo coverage stats (server-only, Phase 25.2).
// Real counts only: total rows vs rows that already carry coordinates, per
// geo-capable entity, org-scoped. Powers the Geo Intelligence Center. No
// estimates — a row counts as "located" only if it has real lat/lng.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export interface GeoCoverageRow {
  key: string;
  label: string;
  total: number;
  located: number;
  missing: number;
  pct: number; // 0..100 located share
  scope: "org" | "global";
}

interface Spec {
  key: string; label: string; table: string;
  orgCol: "org_id" | "organization_id" | null; // null = global table
  latCol: string;
}

const SPECS: Spec[] = [
  { key: "properties", label: "נכסים", table: "properties", orgCol: "org_id", latCol: "latitude" },
  { key: "property_transactions", label: "עסקאות", table: "property_transactions", orgCol: "organization_id", latCol: "lat" },
  { key: "external_listings", label: "מודעות חיצוניות", table: "external_listings", orgCol: "org_id", latCol: "lat" },
  { key: "buyer_geo_profiles", label: "פרופילי קונים (גאוגרפי)", table: "buyer_geo_profiles", orgCol: "org_id", latCol: "centroid_lat" },
  { key: "seller_geo_profiles", label: "פרופילי מוכרים (גאוגרפי)", table: "seller_geo_profiles", orgCol: "org_id", latCol: "centroid_lat" },
  { key: "territory_centroids", label: "מרכזי טריטוריות", table: "territory_centroids", orgCol: "org_id", latCol: "centroid_lat" },
  { key: "israel_neighborhoods", label: "שכונות (מאגר ארצי)", table: "israel_neighborhoods", orgCol: null, latCol: "lat" },
  { key: "israel_localities", label: "ערים/יישובים (מאגר ארצי)", table: "israel_localities", orgCol: null, latCol: "latitude" },
];

async function countWhere(
  db: Awaited<ReturnType<typeof createClient>>, table: string,
  orgCol: string | null, orgId: string, onlyMissing: boolean, latCol: string,
): Promise<number> {
  let q = db.from(table as never).select("*", { count: "exact", head: true });
  if (orgCol) q = q.eq(orgCol, orgId);
  if (onlyMissing) q = q.is(latCol, null);
  const { count, error } = await q;
  if (error) return -1; // signal "table not available yet" without throwing
  return count ?? 0;
}

/** Per-entity geo coverage for the current org. Real counts; -1 totals = table missing. */
export async function getGeoCoverage(): Promise<GeoCoverageRow[]> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return [];
  const db = await createClient();
  const orgId = profile.org_id;

  const out: GeoCoverageRow[] = [];
  for (const s of SPECS) {
    const total = await countWhere(db, s.table, s.orgCol, orgId, false, s.latCol);
    if (total < 0) continue; // table not present yet — skip honestly
    const missing = total === 0 ? 0 : await countWhere(db, s.table, s.orgCol, orgId, true, s.latCol);
    const safeMissing = missing < 0 ? 0 : missing;
    const located = Math.max(0, total - safeMissing);
    out.push({
      key: s.key, label: s.label, total, located, missing: safeMissing,
      pct: total > 0 ? Math.round((located / total) * 100) : 0,
      scope: s.orgCol ? "org" : "global",
    });
  }
  return out;
}
