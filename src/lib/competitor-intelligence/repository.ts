// ============================================================================
// ZONO — Competitor Intelligence repository (server-only). Reads PUBLIC market
// data already collected by Property Radar (market_property_sources +
// market_property_events) scoped to the org's operating cities, and persists
// the radar_competitor_* tables. Strictly org-scoped — no cross-org access.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { extractCoord } from "@/lib/property-radar/live/filter";
import type { ListingSignal, ExistingAlertKey, CompetitorAlert, AlertType, Severity } from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;

const PROFILES = "radar_competitor_profiles";
const LINKS = "radar_competitor_listing_links";
const AREA = "radar_competitor_area_metrics";
const ALERTS = "radar_competitor_alerts";

export interface MarketRow {
  id: string; provider: string | null; listing_type: string | null; source_status: string | null;
  city: string | null; neighborhood: string | null; property_type: string | null; address_text: string | null;
  price: number | null; rooms: number | null; size_sqm: number | null;
  contact_name: string | null; phone: string | null; first_seen_at: string | null;
  raw_metadata: Record<string, unknown> | null; raw_full_payload: Record<string, unknown> | null;
}

const MARKET_COLS =
  "id, provider, listing_type, source_status, city, neighborhood, property_type, address_text, price, rooms, size_sqm, contact_name, phone, first_seen_at, raw_metadata, raw_full_payload";

const str = (raw: Record<string, unknown> | null | undefined, keys: string[]): string | null => {
  if (!raw) return null;
  for (const k of keys) {
    const v = raw[k];
    if (typeof v === "string" && v.trim().length >= 2) return v.trim();
  }
  return null;
};

/**
 * Build a PUBLIC-only ListingSignal from a market source row. The advertiser
 * name on a broker/project listing IS the office; private listings keep their
 * type so the classifier excludes them.
 */
export function toListingSignal(r: MarketRow): ListingSignal {
  const raw = { ...(r.raw_metadata ?? {}), ...(r.raw_full_payload ?? {}) } as Record<string, unknown>;
  const agencyName = str(raw, ["agencyName", "agency", "companyName", "merchantName", "advertiserName"]);
  let officeName = str(raw, ["officeName", "office", "brokerOffice", "agentOfficeName", "realEstateOffice"]);
  const brokerName = str(raw, ["brokerName", "agentName", "realtorName"]);
  const lt = (r.listing_type ?? "").toLowerCase();
  // For broker/project listings the public advertiser name (contact_name) is the office.
  if (!agencyName && !officeName && !brokerName && (lt === "broker" || lt === "project") && r.contact_name) {
    officeName = r.contact_name.trim();
  }
  return {
    marketPropertySourceId: r.id,
    provider: r.provider,
    listingType: r.listing_type,
    city: r.city,
    neighborhood: r.neighborhood,
    propertyType: r.property_type,
    price: r.price,
    rooms: r.rooms,
    sizeSqm: r.size_sqm,
    contactName: r.contact_name,
    phone: r.phone,
    agencyName,
    officeName,
    brokerName,
    firstSeenAt: r.first_seen_at,
  };
}

export function rowCoord(r: MarketRow): { lat: number; lng: number } | null {
  return extractCoord(r.raw_metadata) ?? extractCoord(r.raw_full_payload);
}

export function createCompetitorRepository(db: Db) {
  return {
    /** Active operating cities for the org (the monitored market scope). */
    async orgCities(orgId: string): Promise<string[]> {
      const { data } = await db
        .from("user_operating_localities" as never)
        .select("city_name")
        .eq("organization_id", orgId)
        .eq("is_active", true);
      return [...new Set(((data ?? []) as unknown as { city_name: string | null }[]).map((r) => (r.city_name ?? "").trim()).filter(Boolean))];
    },

    /** Public market listings in the org's monitored cities (optionally filtered). */
    async marketListings(cities: string[], opts?: { onlyCities?: string[]; limit?: number }): Promise<MarketRow[]> {
      const scope = (opts?.onlyCities && opts.onlyCities.length ? opts.onlyCities : cities).filter(Boolean);
      if (scope.length === 0) return [];
      const { data } = await db
        .from("market_property_sources" as never)
        .select(MARKET_COLS)
        .in("city", scope as never)
        .order("last_seen_at", { ascending: false })
        .limit(opts?.limit ?? 1500);
      return (data ?? []) as unknown as MarketRow[];
    },

    /** Market sources by explicit id list (for Property Radar enrichment). */
    async marketListingsByIds(ids: string[]): Promise<MarketRow[]> {
      if (ids.length === 0) return [];
      const { data } = await db.from("market_property_sources" as never).select(MARKET_COLS).in("id", ids as never).limit(400);
      return (data ?? []) as unknown as MarketRow[];
    },

    /** Price-drop / removed / back-on-market events in scope since a date. */
    async events(cities: string[], sinceIso: string): Promise<{ market_property_source_id: string | null; event_type: string; price_delta: number | null; price_delta_percent: number | null; city: string | null; neighborhood: string | null; detected_at: string }[]> {
      if (cities.length === 0) return [];
      const { data } = await db
        .from("market_property_events" as never)
        .select("market_property_source_id, event_type, price_delta, price_delta_percent, city, neighborhood, detected_at")
        .in("city", cities as never)
        .gte("detected_at", sinceIso)
        .order("detected_at", { ascending: false })
        .limit(1000);
      return (data ?? []) as never;
    },

    /** Our own active office listings grouped by city (for comparison). */
    async ourActiveByCity(orgId: string): Promise<Map<string, number>> {
      const { data } = await db
        .from("properties" as never)
        .select("city, status")
        .eq("org_id", orgId)
        .in("status", ["active", "under_offer", "in_contract"] as never)
        .limit(2000);
      const m = new Map<string, number>();
      for (const r of ((data ?? []) as unknown as { city: string | null }[])) {
        const c = (r.city ?? "").trim();
        if (!c) continue;
        m.set(c, (m.get(c) ?? 0) + 1);
      }
      return m;
    },

    // ── Persistence (snapshot job, manager+ via RLS / service role) ─────────────
    async upsertProfile(orgId: string, p: { competitorName: string; normalizedName: string; confidence: number; source: string }): Promise<string | null> {
      const { data } = await db
        .from(PROFILES as never)
        .upsert({ org_id: orgId, competitor_name: p.competitorName, normalized_name: p.normalizedName, confidence: p.confidence, source: p.source, active: true, last_seen_at: new Date().toISOString() } as never, { onConflict: "org_id,normalized_name" })
        .select("id")
        .maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },

    async upsertLink(orgId: string, link: { competitorProfileId: string; marketPropertySourceId: string; provider: string | null; city: string | null; neighborhood: string | null; propertyType: string | null; listingType: string | null; price: number | null; rooms: number | null; sizeSqm: number | null; confidence: number; evidence: Record<string, unknown> }): Promise<void> {
      await db.from(LINKS as never).upsert({
        org_id: orgId, competitor_profile_id: link.competitorProfileId, market_property_source_id: link.marketPropertySourceId,
        provider: link.provider, city: link.city, neighborhood: link.neighborhood, property_type: link.propertyType,
        listing_type: link.listingType, price: link.price, rooms: link.rooms, size_sqm: link.sizeSqm,
        status: "active", confidence: link.confidence, evidence: link.evidence, last_seen_at: new Date().toISOString(),
      } as never, { onConflict: "org_id,competitor_profile_id,market_property_source_id" });
    },

    async insertAreaMetric(orgId: string, m: Record<string, unknown>): Promise<void> {
      await db.from(AREA as never).upsert({ org_id: orgId, ...m } as never, { onConflict: "org_id,competitor_profile_id,city,neighborhood,period,period_start" });
    },

    async recentAlertKeys(orgId: string, sinceIso: string): Promise<ExistingAlertKey[]> {
      const { data } = await db
        .from(ALERTS as never)
        .select("alert_type, competitor_profile_id, city, neighborhood, created_at, status")
        .eq("org_id", orgId)
        .gte("created_at", sinceIso);
      return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
        alertType: String(r.alert_type ?? ""), competitorProfileId: (r.competitor_profile_id as string | null) ?? null,
        city: (r.city as string | null) ?? null, neighborhood: (r.neighborhood as string | null) ?? null,
        createdAt: String(r.created_at ?? ""), status: String(r.status ?? "unread"),
      }));
    },

    async insertAlerts(orgId: string, rows: { competitorProfileId: string | null; alertType: AlertType; severity: Severity; title: string; message: string; city: string | null; neighborhood: string | null }[]): Promise<number> {
      if (rows.length === 0) return 0;
      const { error } = await db.from(ALERTS as never).insert(rows.map((r) => ({
        org_id: orgId, competitor_profile_id: r.competitorProfileId, alert_type: r.alertType, severity: r.severity,
        title: r.title, message: r.message, city: r.city, neighborhood: r.neighborhood, status: "unread",
      })) as never);
      return error ? 0 : rows.length;
    },

    async unreadAlerts(orgId: string, limit = 50): Promise<CompetitorAlert[]> {
      const { data } = await db
        .from(ALERTS as never)
        .select("id, competitor_profile_id, alert_type, severity, title, message, city, neighborhood, status, created_at")
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(limit);
      const profileNames = new Map<string, string>();
      const rows = ((data ?? []) as unknown as Record<string, unknown>[]);
      const pids = [...new Set(rows.map((r) => r.competitor_profile_id).filter((x): x is string => !!x))];
      if (pids.length) {
        const { data: pdata } = await db.from(PROFILES as never).select("id, competitor_name").in("id", pids as never);
        for (const p of ((pdata ?? []) as unknown as { id: string; competitor_name: string }[])) profileNames.set(p.id, p.competitor_name);
      }
      return rows.map((r) => ({
        id: String(r.id), competitorProfileId: (r.competitor_profile_id as string | null) ?? null,
        competitorName: r.competitor_profile_id ? profileNames.get(String(r.competitor_profile_id)) ?? null : null,
        alertType: String(r.alert_type) as AlertType, severity: String(r.severity) as Severity,
        title: String(r.title ?? ""), message: String(r.message ?? ""),
        city: (r.city as string | null) ?? null, neighborhood: (r.neighborhood as string | null) ?? null,
        status: (String(r.status) === "read" ? "read" : "unread"), createdAt: String(r.created_at ?? ""),
      }));
    },

    async markAlertRead(orgId: string, alertId: string): Promise<void> {
      await db.from(ALERTS as never).update({ status: "read", read_at: new Date().toISOString() } as never).eq("org_id", orgId).eq("id", alertId);
    },

    /** Prior-period active link count per competitor (for trend), from area metrics. */
    async previousAreaMetrics(orgId: string, beforeIso: string): Promise<{ competitor_profile_id: string; active_listings: number; estimated_share_percent: number | null }[]> {
      const { data } = await db
        .from(AREA as never)
        .select("competitor_profile_id, active_listings, estimated_share_percent, created_at")
        .eq("org_id", orgId)
        .lt("created_at", beforeIso)
        .order("created_at", { ascending: false })
        .limit(500);
      return (data ?? []) as never;
    },
  };
}

export type CompetitorRepository = ReturnType<typeof createCompetitorRepository>;
