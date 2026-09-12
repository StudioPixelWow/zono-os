// ============================================================================
// ZONO — LISTING DEDUP · service (server-only). Loads an org's active listings,
// runs the pure dedup core (blocking → scoring → union of HIGH pairs), and — unless
// dryRun — persists the result NON-DESTRUCTIVELY: it stamps duplicate_group_id on
// every group member (canonical listing id = the group id) and records the pairs
// in external_listing_duplicates. It NEVER deletes a source listing — provenance
// (each source row + its `source`) is always kept. Idempotent: re-running restamps
// the same deterministic groups.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { dedupeWithinBlocks, type DedupListing } from "./dedup-core";

export interface DedupRunResult {
  orgId: string; dryRun: boolean;
  total: number; comparisons: number; highPairs: number; mediumPairs: number;
  groups: number; groupedListings: number; ungrouped: number; wroteGroups: number;
  duplicateRatePct: number;
}

function mapRow(r: Record<string, unknown>): DedupListing {
  const imgs = r.images;
  const imageCount = Array.isArray(imgs) ? imgs.length : 0;
  const ms = (v: unknown) => { if (!v) return null; const t = Date.parse(String(v)); return Number.isFinite(t) ? t : null; };
  const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : null; };
  const addr = (r.address as string | null) ?? null;
  return {
    id: String(r.id), source: (r.source as string | null) ?? null,
    city: (r.city as string | null) ?? null, neighborhood: (r.neighborhood as string | null) ?? null,
    street: (r.street as string | null) ?? null, streetNumber: (r.street_number as string | null) ?? null,
    rooms: n(r.rooms), sqm: n(r.sqm), floor: n(r.floor), price: n(r.price),
    propertyType: (r.property_type as string | null) ?? null, contactPhone: (r.contact_phone as string | null) ?? null,
    lat: n(r.lat), lng: n(r.lng), imageCount,
    hasAddress: !!(addr && addr.trim()) || !!((r.street as string | null) && (r.street_number as string | null)),
    firstSeenMs: ms(r.first_seen_at) ?? ms(r.imported_at),
  };
}

export async function dedupeOrgListings(orgId: string, opts: { dryRun?: boolean } = {}): Promise<DedupRunResult> {
  const dryRun = opts.dryRun ?? false;
  const db = createServiceRoleClient();
  const { data } = await db.from("external_listings" as never)
    .select("id,source,city,neighborhood,street,street_number,rooms,sqm,floor,price,property_type,contact_phone,lat,lng,images,address,first_seen_at,imported_at")
    .eq("org_id", orgId).neq("status", "removed").limit(20000) as unknown as { data: Array<Record<string, unknown>> | null };
  const listings = (data ?? []).map(mapRow);
  const result = dedupeWithinBlocks(listings);

  let wroteGroups = 0;
  if (!dryRun) {
    for (const g of result.groups) {
      const gid = g.canonicalId; // stable, deterministic group id = canonical listing id
      await db.from("external_listings" as never)
        .update({ duplicate_group_id: gid } as never).in("id", g.memberIds)
        .then(() => undefined, () => undefined);
      const dupRows = g.memberIds.filter((id) => id !== gid).map((id) => ({
        org_id: orgId, listing_id: id, duplicate_of_listing_id: gid,
        confidence_score: 90, reason: "קבוצת כפילות (dedup engine)", status: "confirmed",
      }));
      if (dupRows.length) {
        // Refresh this group's pair rows (non-destructive: only the dup-pair rows,
        // never the listings themselves).
        await db.from("external_listing_duplicates" as never)
          .delete().eq("org_id", orgId).eq("duplicate_of_listing_id", gid)
          .then(() => undefined, () => undefined);
        await db.from("external_listing_duplicates" as never).insert(dupRows as never)
          .then(() => undefined, () => undefined);
      }
      wroteGroups++;
    }
  }

  const s = result.stats;
  const duplicateRatePct = s.total ? Math.round(((s.groupedListings - s.groups) / s.total) * 1000) / 10 : 0;
  return { orgId, dryRun, wroteGroups, duplicateRatePct, total: s.total, comparisons: s.comparisons, highPairs: s.highPairs, mediumPairs: s.mediumPairs, groups: s.groups, groupedListings: s.groupedListings, ungrouped: s.ungrouped };
}

/** Dedup every org that has active listings (scheduled backfill / maintenance). */
export async function dedupeAllOrganizations(opts: { dryRun?: boolean } = {}): Promise<DedupRunResult[]> {
  const db = createServiceRoleClient();
  const { data } = await db.from("external_listings" as never)
    .select("org_id").neq("status", "removed").limit(50000) as unknown as { data: Array<{ org_id: string }> | null };
  const orgIds = [...new Set((data ?? []).map((r) => r.org_id).filter(Boolean))];
  const out: DedupRunResult[] = [];
  for (const orgId of orgIds) out.push(await dedupeOrgListings(orgId, opts));
  return out;
}
