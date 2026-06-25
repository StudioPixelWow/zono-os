// ============================================================================
// ZONO Property Radar™ — market events repository (server-only, service-role).
// Reads active areas from the shared cache state, writes immutable market events,
// reads timelines + daily stats, and provides 24h alert dedup. Shared system
// tables only — org consequences live in the per-org tables (handled elsewhere).
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { RADAR_TABLES } from "../types";
import type { PropertyProviderName } from "../types";
import type {
  ActiveMarketArea,
  InsertMarketEventInput,
  MarketEventRepository,
  MarketPropertyTimeline,
  MarketTimelineEntry,
} from "./types";

const CACHE = "market_area_cache_state";
const EVENTS = "market_property_events";
const SOURCES = "market_property_sources";

type Db = ReturnType<typeof createServiceRoleClient>;

export function createMarketEventRepository(db: Db = createServiceRoleClient()): MarketEventRepository {
  return {
    async getActiveMarketAreas(providerName?: PropertyProviderName, marketAreaKey?: string): Promise<ActiveMarketArea[]> {
      let q = db.from(CACHE as never).select("provider, market_area_key, city, neighborhood, status");
      if (providerName) q = (q as ReturnType<typeof q.eq>).eq("provider", providerName);
      if (marketAreaKey) q = (q as ReturnType<typeof q.eq>).eq("market_area_key", marketAreaKey);
      const { data, error } = await q;
      if (error) throw new Error(`getActiveMarketAreas failed: ${error.message}`);
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return rows
        .filter((r) => r.market_area_key && r.provider)
        .map((r) => ({
          provider: String(r.provider) as PropertyProviderName,
          marketAreaKey: String(r.market_area_key),
          city: (r.city as string | null) ?? null,
          neighborhood: (r.neighborhood as string | null) ?? null,
        }));
    },

    async insertMarketEvent(input: InsertMarketEventInput): Promise<string> {
      const { data, error } = await db
        .from(EVENTS as never)
        .insert({
          market_property_source_id: input.marketPropertySourceId,
          provider: input.provider,
          market_area_key: input.marketAreaKey,
          city: input.city,
          neighborhood: input.neighborhood,
          event_type: input.eventType,
          previous_value: input.previousValue ?? {},
          next_value: input.nextValue ?? {},
          price_delta: input.priceDelta ?? null,
          price_delta_percent: input.priceDeltaPercent ?? null,
          severity: input.severity,
          metadata: input.metadata ?? {},
        } as never)
        .select("id")
        .single();
      if (error) throw new Error(`insertMarketEvent failed: ${error.message}`);
      return (data as unknown as { id: string }).id;
    },

    async recentOrgEventAlertExists(orgId, marketPropertySourceId, alertType, sinceIso): Promise<boolean> {
      const { data, error } = await db
        .from(RADAR_TABLES.alerts as never)
        .select("id")
        .eq("org_id", orgId)
        .eq("alert_type", alertType)
        .eq("metadata->>marketPropertySourceId", marketPropertySourceId)
        .gte("created_at", sinceIso)
        .limit(1);
      if (error) throw new Error(`recentOrgEventAlertExists failed: ${error.message}`);
      return ((data as unknown as unknown[]) ?? []).length > 0;
    },

    async getMarketPropertyTimeline(marketPropertySourceId: string): Promise<MarketPropertyTimeline> {
      const { data: srcRows } = await db
        .from(SOURCES as never)
        .select("first_seen_at")
        .eq("id", marketPropertySourceId)
        .maybeSingle();
      const firstSeen = (srcRows as unknown as { first_seen_at: string | null } | null)?.first_seen_at ?? null;

      const { data: evRows, error: evErr } = await db
        .from(EVENTS as never)
        .select("event_type, severity, price_delta, price_delta_percent, previous_value, next_value, detected_at")
        .eq("market_property_source_id", marketPropertySourceId)
        .order("detected_at", { ascending: true });
      if (evErr) throw new Error(`getMarketPropertyTimeline events failed: ${evErr.message}`);

      const { data: alertRows } = await db
        .from(RADAR_TABLES.alerts as never)
        .select("alert_type, title, created_at")
        .eq("metadata->>marketPropertySourceId", marketPropertySourceId)
        .order("created_at", { ascending: true });

      const entries: MarketTimelineEntry[] = [];
      if (firstSeen) entries.push({ at: firstSeen, kind: "first_seen", label: "נקלט לראשונה" });

      for (const e of (evRows ?? []) as unknown as Record<string, unknown>[]) {
        const type = String(e.event_type);
        const kind: MarketTimelineEntry["kind"] =
          type === "price_drop" || type === "price_increase" || type === "hot_deal" ? "price_change"
            : type === "removed" || type === "back_on_market" || type === "status_changed" ? "status_change"
            : type === "buyer_match_gained" || type === "buyer_match_lost" ? "buyer_match_change"
            : "event";
        entries.push({
          at: String(e.detected_at),
          kind,
          label: type,
          detail: {
            severity: e.severity,
            priceDelta: e.price_delta,
            priceDeltaPercent: e.price_delta_percent,
            previous: e.previous_value,
            next: e.next_value,
          },
        });
      }
      for (const a of (alertRows ?? []) as unknown as Record<string, unknown>[]) {
        entries.push({ at: String(a.created_at), kind: "alert", label: String(a.title ?? a.alert_type) });
      }
      entries.sort((x, y) => Date.parse(x.at) - Date.parse(y.at));
      return { marketPropertySourceId, firstSeen, entries };
    },

    async countTodaysEventsForCities(cities: string[], sinceIso: string): Promise<Record<string, number>> {
      let q = db.from(EVENTS as never).select("event_type").gte("detected_at", sinceIso);
      if (cities.length > 0) q = (q as ReturnType<typeof q.in>).in("city", cities as never);
      const { data, error } = await q.limit(5000);
      if (error) throw new Error(`countTodaysEventsForCities failed: ${error.message}`);
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as unknown as { event_type: string }[]) {
        out[r.event_type] = (out[r.event_type] ?? 0) + 1;
      }
      return out;
    },

    async lastRefreshAtForCities(cities: string[]): Promise<string | null> {
      let q = db.from(EVENTS as never).select("detected_at");
      if (cities.length > 0) q = (q as ReturnType<typeof q.in>).in("city", cities as never);
      const { data, error } = await q.order("detected_at", { ascending: false }).limit(1);
      if (error) throw new Error(`lastRefreshAtForCities failed: ${error.message}`);
      const row = ((data ?? []) as unknown as { detected_at: string }[])[0];
      return row?.detected_at ?? null;
    },
  };
}
