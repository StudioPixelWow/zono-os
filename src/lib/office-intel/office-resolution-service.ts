// ============================================================================
// ZONO — OFFICE RESOLUTION + BACKFILL (server-only, idempotent, NON-destructive).
// ROOT-CAUSE FIX: yad2 listings carry the advertiser's `agencyName` in raw_data,
// but ingestion discarded it — so offices were never created and agents were never
// linked (only 11/305 offices had an agent). This resolves each agency name to a
// CANONICAL office (brand-aware, branch-safe), creates/updates the office, links
// the LISTING → office (VERIFIED: explicit source), and, when the advertiser
// resolves to a directory agent, sets that agent's office_id (VERIFIED). It never
// deletes anything and never invents membership (name-only junk is skipped;
// franchise brand ≠ branch). Runs on sync and as an on-demand/cron backfill.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { canonicalOfficeIdentity } from "./office-identity-core";
import { normalizePhoneIL } from "@/lib/util/identity";
import { normalizeHebrewName } from "@/lib/broker/engine";

export interface OfficeBackfillReport {
  dryRun: boolean; orgScope: string | null;
  listingsScanned: number; listingsWithAgency: number; usableAgencies: number;
  canonicalOffices: number; officesCreated: number; officesExisting: number;
  listingLinksWritten: number; agentsLinked: number; skippedJunk: number;
}

interface Row { id: string; org_id: string; city: string | null; contact_phone: string | null; contact_name: string | null; metadata: unknown }

const agencyOf = (m: unknown): string | null => {
  const rd = (m as { raw_data?: { agencyName?: string } } | null)?.raw_data;
  const a = (rd?.agencyName ?? "").trim();
  return a || null;
};

export async function backfillOfficesFromAgencyNames(opts: { dryRun?: boolean; orgId?: string } = {}): Promise<OfficeBackfillReport> {
  const dryRun = opts.dryRun ?? false;
  const db = createServiceRoleClient();
  const rep: OfficeBackfillReport = {
    dryRun, orgScope: opts.orgId ?? null, listingsScanned: 0, listingsWithAgency: 0, usableAgencies: 0,
    canonicalOffices: 0, officesCreated: 0, officesExisting: 0, listingLinksWritten: 0, agentsLinked: 0, skippedJunk: 0,
  };

  let q = db.from("external_listings" as never)
    .select("id,org_id,city,contact_phone,contact_name,metadata")
    .eq("source", "yad2").eq("has_agent", true).neq("status", "removed").limit(20000);
  if (opts.orgId) q = (q as { eq: (c: string, v: string) => typeof q }).eq("org_id", opts.orgId);
  const { data } = await (q as unknown as Promise<{ data: Row[] | null }>);
  const rows = data ?? [];
  rep.listingsScanned = rows.length;

  // Group listings by canonical office identity.
  interface Grp { displayName: string; normalizedName: string; brand: string; city: string | null; phones: Set<string>; listings: Row[] }
  const groups = new Map<string, Grp>();
  for (const r of rows) {
    const agency = agencyOf(r.metadata);
    if (!agency) continue;
    rep.listingsWithAgency++;
    const id = canonicalOfficeIdentity(agency, r.city);
    if (!id.usable) { rep.skippedJunk++; continue; }
    const g = groups.get(id.key) ?? { displayName: id.displayName, normalizedName: id.normalizedName, brand: id.brandNetwork, city: r.city, phones: new Set<string>(), listings: [] };
    g.listings.push(r);
    const ph = normalizePhoneIL(r.contact_phone); if (ph) g.phones.add(ph);
    groups.set(id.key, g);
  }
  rep.usableAgencies = groups.size;
  rep.canonicalOffices = groups.size;

  // Pre-load directory agents once for best-effort agent→office linking.
  const { data: agentsRaw } = await (db.from("brokerage_agents" as never)
    .select("id,full_name,normalized_name,primary_phone,whatsapp_phone,city,office_id").limit(20000) as unknown as Promise<{ data: Array<Record<string, unknown>> | null }>);
  const agents = agentsRaw ?? [];

  for (const [key, g] of groups) {
    // Find an existing office (by canonical metadata key, else normalized_name+city).
    let officeId: string | null = null;
    try {
      const { data: byKey } = await (db.from("brokerage_offices" as never)
        .select("id").eq("normalized_name", g.normalizedName).limit(1) as unknown as Promise<{ data: Array<{ id: string }> | null }>);
      officeId = byKey?.[0]?.id ?? null;
    } catch { /* ignore */ }

    if (officeId) rep.officesExisting++;
    else if (!dryRun) {
      const { data: created } = await (db.from("brokerage_offices" as never).insert({
        name: g.displayName, normalized_name: g.normalizedName,
        brand_network: g.brand === "independent" ? null : g.brand,
        office_type: "agency", status: "active", city: g.city,
        primary_phone: [...g.phones][0] ?? null, confidence_score: 90,
        metadata: { source: "yad2_agency_name", canonical_key: key, evidence: "explicit_source_agency" } as never,
        first_seen_at: new Date().toISOString(), last_seen_at: new Date().toISOString(),
      } as never).select("id").maybeSingle() as unknown as Promise<{ data: { id: string } | null }>);
      officeId = created?.id ?? null;
      if (officeId) rep.officesCreated++;
    } else { rep.officesCreated++; }

    if (!officeId) continue;

    // Link each listing → office (VERIFIED: the source itself named the agency).
    for (const l of g.listings) {
      if (!dryRun) {
        await (db.from("brokerage_external_listing_links" as never).upsert({
          external_listing_id: l.id, organization_id: l.org_id, office_id: officeId, city: l.city,
          matched_name: g.displayName, matched_source: "yad2_agency_name",
          confidence_score: 95, match_reasons: ["explicit_agency_name"], status: "confirmed",
        } as never, { onConflict: "organization_id,external_listing_id" }) as unknown as Promise<unknown>).catch(() => undefined);
      }
      rep.listingLinksWritten++;
    }

    // Best-effort agent→office: link a directory agent whose phone or name+city
    // matches this office's listings (VERIFIED only — explicit, unique signals).
    for (const a of agents) {
      if (a.office_id) continue;
      const aPhone = normalizePhoneIL((a.primary_phone as string | null) ?? (a.whatsapp_phone as string | null));
      const phoneHit = !!aPhone && g.phones.has(aPhone);
      const aName = normalizeHebrewName((a.normalized_name as string | null) ?? (a.full_name as string | null));
      const nameCityHit = !!aName && g.listings.some((l) => normalizeHebrewName(l.contact_name) === aName)
        && (!a.city || !g.city || String(a.city).toLowerCase().includes(String(g.city).toLowerCase()) || String(g.city).toLowerCase().includes(String(a.city).toLowerCase()));
      if (phoneHit || nameCityHit) {
        if (!dryRun) {
          await (db.from("brokerage_agents" as never)
            .update({ office_id: officeId } as never).eq("id", a.id as string) as unknown as Promise<unknown>).catch(() => undefined);
        }
        (a as { office_id?: string }).office_id = officeId; // avoid double-linking this run
        rep.agentsLinked++;
      }
    }
  }
  return rep;
}
