import { NextResponse } from "next/server";
import { after } from "next/server";
import { getOfficeActivation } from "@/lib/activation/activation-server";
import { getCityDiscovery } from "@/lib/activation/city-discovery-server";
import { getZoneSnapshot } from "@/lib/activation/zone-snapshot";
import { propertyTypeHe } from "@/lib/valuation/property-type";
import { localityHe } from "@/lib/geo/locality";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The first poll KICKS a real scan in the background (see below); give that work
// room to actually finish for one city instead of being cut off mid-scrape.
export const maxDuration = 300;

interface LiveFeedItem {
  id: string;
  listingId: string | null;
  kind: "property" | "agent";
  title: string;
  sub: string | null;
  tag: string | null;
  imageUrl: string | null;
}

const firstImage = (imgs: unknown): string | null => {
  if (!Array.isArray(imgs)) return null;
  for (const v of imgs) {
    if (typeof v === "string" && v.trim()) return v;
    if (v && typeof v === "object" && typeof (v as { url?: string }).url === "string") return (v as { url: string }).url;
  }
  return null;
};

/** Newest scanned rows → a live "just discovered" feed the modal drips out one
 *  by one. A no-broker listing yields only a property card; an agency listing
 *  also yields an agent card, so the feed alternates property → agent naturally. */
async function recentFeed(orgId: string): Promise<LiveFeedItem[]> {
  try {
    const db = createServiceRoleClient();
    const { data } = await db
      .from("external_listings" as never)
      .select("id,title,property_type,rooms,sqm,price,neighborhood,city,has_agent,contact_name,images,created_at")
      .eq("org_id" as never, orgId as never)
      .order("created_at" as never, { ascending: false })
      .limit(14);
    const rows = (data ?? []) as Array<{
      id: string; title: string | null; property_type: string | null; rooms: number | null;
      sqm: number | null; price: number | null; neighborhood: string | null; city: string | null;
      has_agent: boolean | null; contact_name: string | null; images: unknown;
    }>;
    const ILS = new Intl.NumberFormat("he-IL");
    const priceShort = (p: number | null): string | null => {
      if (p == null || p <= 0) return null;
      if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(p >= 10_000_000 ? 0 : 1)}M`;
      if (p >= 1000) return `₪${Math.round(p / 1000)}K`;
      return `₪${ILS.format(p)}`;
    };
    const out: LiveFeedItem[] = [];
    for (const r of rows) {
      const bits = [
        propertyTypeHe(r.property_type),
        r.rooms ? `${r.rooms} חד׳` : null,
        r.sqm ? `${r.sqm} מ״ר` : null,
      ].filter(Boolean).join(" · ");
      out.push({
        id: r.id,
        listingId: r.id,
        kind: "property",
        title: bits || (r.title ?? "נכס"),
        sub: [r.neighborhood || localityHe(r.city), priceShort(r.price)].filter(Boolean).join(" · ") || null,
        tag: r.has_agent === false ? "ללא מתווך" : null,
        imageUrl: firstImage(r.images),
      });
      if (r.has_agent && r.contact_name) {
        out.push({
          id: `${r.id}-a`,
          listingId: r.id,
          kind: "agent",
          title: r.contact_name,
          sub: r.neighborhood || localityHe(r.city) || null,
          tag: "מתווך פעיל",
          imageUrl: null,
        });
      }
    }
    return out.slice(0, 18);
  } catch {
    return [];
  }
}

/**
 * Live zone snapshot for the first-login WOW modal to POLL while the onboarding
 * scan (and its full intelligence chain) populates the office's city. Everything
 * is REAL and org-scoped: the org is resolved from the SESSION (never a
 * client-supplied id), so a signed-in owner only ever sees their own zone.
 *
 * SELF-STARTING: a brand-new office often lands with NO scan yet (the onboarding
 * `after()` bootstrap can be dropped by the platform after the redirect). So when
 * this endpoint sees a never-scanned city (phase "not_started"), it kicks a real
 * QUICK sync in the background (idempotent-in-practice: once the sync writes its
 * running import_job the next poll reports phase "scanning" and does NOT re-kick;
 * the hourly cron still backstops). The modal reveals the numbers live and drips
 * out each freshly scanned item. Honest throughout — any failure returns an empty
 * snapshot, never demo data.
 */
export async function GET() {
  const empty = { ok: false, scanRunning: false, phase: "not_started", stats: null, privateOwners: [], insight: null, feed: [], scanKicked: false };
  try {
    const act = await getOfficeActivation();
    if (!act) return NextResponse.json(empty);
    const { orgId, city, localityCode } = act.identity;
    const discovery = await getCityDiscovery(orgId, city, localityCode);

    // Self-start: never-scanned city → kick a real quick scan in the background.
    // ALSO re-scan a city stuck at "no_results" whose last scan is stale (>20 min):
    // an org scanned empty during a provider outage (e.g. before Apify credits were
    // topped up) would otherwise stay at 0 forever. The 20-minute floor stops a
    // genuinely-empty city from re-scanning on every load.
    const lastScanMs = discovery.lastScanAt ? new Date(discovery.lastScanAt).getTime() : 0;
    const staleNoResults = discovery.phase === "no_results" && (Date.now() - lastScanMs > 20 * 60_000);
    let scanKicked = false;
    if (discovery.phase === "not_started" || staleNoResults) {
      scanKicked = true;
      after(async () => {
        try {
          const { syncExternalListingsForOrganization } = await import("@/lib/external-listings/service");
          await syncExternalListingsForOrganization(orgId, { mode: "quick" });
        } catch (e) {
          console.error("[zone-live] auto-kick scan failed:", e);
        }
      });
    }

    const [zone, feed] = await Promise.all([
      getZoneSnapshot(orgId, city, discovery).catch(() => null),
      recentFeed(orgId),
    ]);
    return NextResponse.json({
      ok: true,
      scanRunning: discovery.scanRunning || scanKicked,
      phase: scanKicked ? "scanning" : discovery.phase,
      scanKicked,
      stats: {
        discoveredListings: discovery.discoveredListings,
        noBrokerCount: discovery.noBrokerCount,
        neighborhoods: discovery.neighborhoods,
        mapPoints: discovery.mapPoints,
        brokersTotal: zone?.census?.brokersTotal ?? 0,
        verifiedOffices: zone?.census?.verifiedOffices ?? 0,
        listingsTotal: zone?.census?.listingsTotal ?? 0,
      },
      privateOwners: zone?.privateOwners ?? [],
      insight: zone?.insights?.[0] ?? null,
      feed,
    });
  } catch {
    return NextResponse.json(empty);
  }
}
