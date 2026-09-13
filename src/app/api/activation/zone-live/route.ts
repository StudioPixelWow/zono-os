import { NextResponse } from "next/server";
import { after } from "next/server";
import { getOfficeActivation } from "@/lib/activation/activation-server";
import { getCityDiscovery } from "@/lib/activation/city-discovery-server";
import { getZoneSnapshot, type ZonePrivateListing } from "@/lib/activation/zone-snapshot";
import { makeCityMatch, cityIlikeTerms } from "@/lib/brokerage-data/brokerage-knowledge";
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
  /** true = this org's own freshly-scanned row ("נסרק עכשיו"); false = already-known
   *  shared-market row in the same city (revealed instantly, honestly labeled). */
  fresh: boolean;
}

const ILS_FMT = new Intl.NumberFormat("he-IL");
const priceShortStr = (p: number | null): string | null => {
  if (p == null || p <= 0) return null;
  if (p >= 1_000_000) return `₪${(p / 1_000_000).toFixed(p >= 10_000_000 ? 0 : 1)}M`;
  if (p >= 1000) return `₪${Math.round(p / 1000)}K`;
  return `₪${ILS_FMT.format(p)}`;
};

type MarketRow = {
  id: string; title: string | null; property_type: string | null; rooms: number | null;
  sqm: number | null; price: number | null; neighborhood: string | null; city: string | null;
  has_agent: boolean | null; contact_name: string | null; contact_phone: string | null; images: unknown;
};

const feedItemFromRow = (r: MarketRow, fresh: boolean): LiveFeedItem[] => {
  const bits = [propertyTypeHe(r.property_type), r.rooms ? `${r.rooms} חד׳` : null, r.sqm ? `${r.sqm} מ״ר` : null]
    .filter(Boolean).join(" · ");
  const out: LiveFeedItem[] = [{
    id: fresh ? r.id : `m-${r.id}`,
    listingId: r.id,
    kind: "property",
    title: bits || (r.title ?? "נכס"),
    sub: [r.neighborhood || localityHe(r.city), priceShortStr(r.price)].filter(Boolean).join(" · ") || null,
    tag: r.has_agent === false ? "ללא מתווך" : fresh ? null : "באזור שלך",
    imageUrl: firstImage(r.images),
    fresh,
  }];
  if (r.has_agent && r.contact_name) {
    out.push({
      id: `${fresh ? r.id : "m-" + r.id}-a`,
      listingId: r.id,
      kind: "agent",
      title: r.contact_name,
      sub: r.neighborhood || localityHe(r.city) || null,
      tag: fresh ? "מתווך פעיל" : "מתווך באזור",
      imageUrl: null,
      fresh,
    });
  }
  return out;
};

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
      .select("id,title,property_type,rooms,sqm,price,neighborhood,city,has_agent,contact_name,contact_phone,images,created_at")
      .eq("org_id" as never, orgId as never)
      .order("created_at" as never, { ascending: false })
      .limit(14);
    const rows = (data ?? []) as MarketRow[];
    const out: LiveFeedItem[] = [];
    for (const r of rows) out.push(...feedItemFromRow(r, true));
    return out.slice(0, 18);
  } catch {
    return [];
  }
}

/**
 * SHARED-MARKET feed — real listings the WHOLE ZONO graph already knows in this
 * city (any org), so a brand-new office sees properties/brokers INSTANTLY instead
 * of waiting for its own first scan. Honest: these are real rows in the same city,
 * labeled "באזור שלך" (not "נסרק עכשיו"). Excludes the caller's own rows (those are
 * the fresh feed). City match bridges Hebrew office city ↔ scraped English city.
 */
async function marketFeed(orgId: string, city: string | null): Promise<LiveFeedItem[]> {
  if (!city || !city.trim()) return [];
  try {
    const db = createServiceRoleClient();
    const terms = cityIlikeTerms(city);
    let q = db
      .from("external_listings" as never)
      .select("id,title,property_type,rooms,sqm,price,neighborhood,city,has_agent,contact_name,contact_phone,images,created_at,org_id")
      .neq("org_id" as never, orgId as never)
      .neq("status" as never, "removed" as never)
      .order("created_at" as never, { ascending: false })
      .limit(120);
    if (terms.length) q = q.or(terms.map((t) => `city.ilike.%${t}%`).join(",")) as typeof q;
    const { data } = await q;
    const match = makeCityMatch(city);
    const rows = ((data ?? []) as Array<MarketRow & { city: string | null }>).filter((r) => match(r.city));
    const out: LiveFeedItem[] = [];
    for (const r of rows) { out.push(...feedItemFromRow(r, false)); if (out.length >= 20) break; }
    return out.slice(0, 20);
  } catch {
    return [];
  }
}

/**
 * SHARED-MARKET recruitment opportunities — real no-broker, for-sale listings with
 * photos anywhere in the city (any org). Fallback for the WOW "הזדמנויות גיוס" band
 * when the office's own scan hasn't produced private-owner listings yet.
 */
async function marketOpportunities(orgId: string, city: string | null): Promise<ZonePrivateListing[]> {
  if (!city || !city.trim()) return [];
  try {
    const db = createServiceRoleClient();
    const terms = cityIlikeTerms(city);
    let q = db
      .from("external_listings" as never)
      .select("id,property_type,rooms,sqm,price,neighborhood,city,has_agent,contact_phone,deal_type,images,first_seen_at")
      .neq("org_id" as never, orgId as never)
      .neq("status" as never, "removed" as never)
      .not("has_agent" as never, "is", true as never)
      .not("contact_phone" as never, "is", null as never)
      .neq("deal_type" as never, "rent" as never)
      .order("first_seen_at" as never, { ascending: false })
      .limit(80);
    if (terms.length) q = q.or(terms.map((t) => `city.ilike.%${t}%`).join(",")) as typeof q;
    const { data } = await q;
    const match = makeCityMatch(city);
    const out: ZonePrivateListing[] = [];
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      if (!match(r.city)) continue;
      const img = firstImage(r.images);
      if (!img) continue;
      out.push({
        id: typeof r.id === "string" ? r.id : null,
        neighborhood: typeof r.neighborhood === "string" ? r.neighborhood : null,
        price: typeof r.price === "number" ? r.price : null,
        rooms: typeof r.rooms === "number" ? r.rooms : null,
        sqm: typeof r.sqm === "number" ? r.sqm : null,
        propertyType: propertyTypeHe(typeof r.property_type === "string" ? r.property_type : null),
        imageUrl: img,
      });
      if (out.length >= 4) break;
    }
    return out;
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

    const [zone, orgFeed, mktFeed, mktOpps] = await Promise.all([
      getZoneSnapshot(orgId, city, discovery).catch(() => null),
      recentFeed(orgId),
      marketFeed(orgId, city),
      marketOpportunities(orgId, city),
    ]);

    // INSTANT WOW: the office's own freshly-scanned rows first ("נסרק עכשיו"),
    // then already-known shared-market rows in the same city ("באזור שלך"), so a
    // brand-new office sees properties/brokers immediately instead of an empty
    // screen while its own scan runs. Dedup by underlying listing id.
    const seenListing = new Set<string>();
    const feed: LiveFeedItem[] = [];
    for (const it of [...orgFeed, ...mktFeed]) {
      const key = it.listingId ?? it.id;
      const dedupKey = `${it.kind}:${key}`;
      if (seenListing.has(dedupKey)) continue;
      seenListing.add(dedupKey);
      feed.push(it);
    }

    // Opportunities: prefer the office's own private-owner finds; fall back to the
    // shared-market ones so the recruitment band isn't empty on first login.
    const privateOwners = (zone?.privateOwners && zone.privateOwners.length)
      ? zone.privateOwners
      : mktOpps;

    // The office's own scan drives discoveredListings; the shared graph already
    // knows listingsTotal for the city — surface both so the modal can show the
    // real "properties in your area" number instantly, before the own scan lands.
    const listingsTotal = zone?.census?.listingsTotal ?? 0;
    // A brand-new office is "market ready" the moment the shared graph has data.
    const marketReady = listingsTotal > 0 || (zone?.census?.brokersTotal ?? 0) > 0 || feed.length > 0;

    return NextResponse.json({
      ok: true,
      scanRunning: discovery.scanRunning || scanKicked,
      phase: scanKicked ? "scanning" : discovery.phase,
      scanKicked,
      marketReady,
      stats: {
        discoveredListings: discovery.discoveredListings,
        noBrokerCount: discovery.noBrokerCount,
        neighborhoods: discovery.neighborhoods,
        mapPoints: discovery.mapPoints,
        brokersTotal: zone?.census?.brokersTotal ?? 0,
        verifiedOffices: zone?.census?.verifiedOffices ?? 0,
        listingsTotal,
      },
      privateOwners,
      insight: zone?.insights?.[0] ?? null,
      feed,
    });
  } catch {
    return NextResponse.json(empty);
  }
}
