// ============================================================================
// ZONO Property Radar™ — Live Command Center data loader (server-only).
// Aggregates REAL org-scoped data from the existing radar tables into one DTO
// for the /property-radar screen. Strictly org-scoped (session org + explicit
// filters). Reuses the settings page data for status/market/provider health.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { startOfUtcDayIso } from "../scheduler/credit-budget";
import { getPropertyRadarSettingsPageData } from "../settings/service";
import { extractCoord } from "./filter";
import type {
  ActionItem, ActivityItem, BuyerStreamItem, CreditMonitor, HotDealItem,
  LiveEventKind, LiveFeedItem, LiveKpis, LiveMapPoint, PropertyRadarLiveData,
  PropertySidePanelData, PropertyTimelineEntryDTO,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;
const DAY7 = 7 * 24 * 60 * 60 * 1000;

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  return { db: createServiceRoleClient(), orgId: profile.org_id, userId: user.id };
}

async function orgCities(db: Db, orgId: string): Promise<string[]> {
  const { data } = await db
    .from("user_operating_localities" as never)
    .select("city_name")
    .eq("organization_id", orgId)
    .eq("is_active", true);
  return [...new Set(((data ?? []) as unknown as { city_name: string | null }[]).map((r) => (r.city_name ?? "").trim()).filter(Boolean))];
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

const EVENT_KIND: Record<string, LiveEventKind> = {
  price_drop: "price_drop", hot_deal: "hot_deal", back_on_market: "back_on_market",
  removed: "removed", buyer_match_gained: "buyer_match", status_changed: "status_change",
  metadata_changed: "status_change", price_increase: "status_change",
};

interface SourceRow {
  id: string; provider: string; listing_type: string | null; city: string | null; neighborhood: string | null;
  address_text: string | null; street: string | null; price: number | null; rooms: number | null; size_sqm: number | null;
  floor: string | null; property_type: string | null; image_url: string | null; external_url: string | null;
  phone: string | null; published_at: string | null; first_seen_at: string | null;
  raw_metadata: Record<string, unknown> | null; raw_full_payload: Record<string, unknown> | null;
}

const SOURCE_COLS =
  "id, provider, listing_type, city, neighborhood, address_text, street, price, rooms, size_sqm, floor, property_type, image_url, external_url, phone, published_at, first_seen_at, raw_metadata, raw_full_payload";

async function fetchSources(db: Db, ids: string[]): Promise<Map<string, SourceRow>> {
  const map = new Map<string, SourceRow>();
  if (ids.length === 0) return map;
  const { data } = await db.from("market_property_sources" as never).select(SOURCE_COLS).in("id", ids as never).limit(300);
  for (const r of ((data ?? []) as unknown as SourceRow[])) map.set(r.id, r);
  return map;
}

export async function getPropertyRadarLiveData(): Promise<PropertyRadarLiveData> {
  const { db, orgId } = await ctx();
  const now = new Date();
  const todayIso = startOfUtcDayIso(now);
  const cities = await orgCities(db, orgId);

  // Reuse the proven settings aggregation for status / market / provider health.
  const page = await getPropertyRadarSettingsPageData();
  const dm = page.status.dailyMarket;

  // ── Events (org cities) → feed source set ────────────────────────────────
  let events: { id: string; market_property_source_id: string | null; event_type: string; price_delta: number | null; city: string | null; neighborhood: string | null; detected_at: string; provider: string }[] = [];
  if (cities.length > 0) {
    const { data } = await db
      .from("market_property_events" as never)
      .select("id, market_property_source_id, event_type, price_delta, city, neighborhood, detected_at, provider")
      .in("city", cities as never)
      .order("detected_at", { ascending: false })
      .limit(80);
    events = (data ?? []) as never;
  }

  // ── Org links (relevance + recency) ──────────────────────────────────────
  const { data: linkRows } = await db
    .from("org_market_property_links" as never)
    .select("market_property_source_id, opportunity_score, buyer_match_count, relevance_status, created_at, first_matched_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(200);
  const links = (linkRows ?? []) as unknown as { market_property_source_id: string; opportunity_score: number | null; buyer_match_count: number | null; relevance_status: string | null; created_at: string; first_matched_at: string | null }[];
  const linkBySource = new Map(links.map((l) => [l.market_property_source_id, l]));

  const sourceIds = [...new Set([
    ...events.map((e) => e.market_property_source_id).filter((x): x is string => !!x),
    ...links.slice(0, 60).map((l) => l.market_property_source_id),
  ])];
  const sources = await fetchSources(db, sourceIds);

  const itemFromSource = (s: SourceRow | undefined, link?: { opportunity_score: number | null; buyer_match_count: number | null }) => ({
    listingType: s?.listing_type ?? null, city: s?.city ?? null, neighborhood: s?.neighborhood ?? null,
    addressText: s?.address_text ?? (s ? [s.street, s.neighborhood, s.city].filter(Boolean).join(", ") : null),
    price: s?.price ?? null, imageUrl: s?.image_url ?? null, externalUrl: s?.external_url ?? null, phone: s?.phone ?? null,
    opportunityScore: link?.opportunity_score ?? null, buyerMatchCount: link?.buyer_match_count ?? 0, provider: s?.provider ?? "mock",
  });

  // ── Feed: events + recent new listings ───────────────────────────────────
  const feed: LiveFeedItem[] = [];
  for (const e of events) {
    const kind = EVENT_KIND[e.event_type];
    if (!kind) continue;
    const s = e.market_property_source_id ? sources.get(e.market_property_source_id) : undefined;
    const link = e.market_property_source_id ? linkBySource.get(e.market_property_source_id) : undefined;
    const base = itemFromSource(s, link);
    feed.push({ id: `ev-${e.id}`, kind, at: e.detected_at, marketPropertySourceId: e.market_property_source_id, priceDelta: e.price_delta ?? null, ...base, city: base.city ?? e.city, neighborhood: base.neighborhood ?? e.neighborhood, provider: e.provider ?? base.provider });
  }
  const weekAgo = new Date(now.getTime() - DAY7).toISOString();
  for (const l of links) {
    const seenAt = l.first_matched_at ?? l.created_at;
    if (seenAt < weekAgo) continue;
    const s = sources.get(l.market_property_source_id);
    feed.push({ id: `new-${l.market_property_source_id}`, kind: "new_property", at: seenAt, marketPropertySourceId: l.market_property_source_id, priceDelta: null, ...itemFromSource(s, l) });
  }
  feed.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const feedTop = feed.slice(0, 80);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const todayLinks = links.filter((l) => l.created_at >= todayIso);
  const privateToday = todayLinks.filter((l) => sources.get(l.market_property_source_id)?.listing_type === "private").length;
  const { count: matchesToday } = await db.from("buyer_property_matches" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", todayIso);
  const { count: tasksToday } = await db.from("tasks" as never).select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", todayIso);

  const kpis: LiveKpis = {
    newListings: todayLinks.length,
    privateListings: privateToday,
    priceDrops: dm.priceDropsToday,
    hotDeals: dm.hotDealsToday,
    backOnMarket: dm.backOnMarketToday,
    buyerMatchesCreated: matchesToday ?? 0,
    alertsSent: page.status.alertsCreatedToday,
    tasksCreated: tasksToday ?? 0,
    creditsSaved: page.status.creditsSavedToday,
    duplicateScansAvoided: page.market.duplicateScansAvoided,
  };

  // ── Hot deals (opportunity ≥ 90) ─────────────────────────────────────────
  const hotDeals: HotDealItem[] = links
    .filter((l) => (l.opportunity_score ?? 0) >= 90)
    .slice(0, 24)
    .map((l) => {
      const s = sources.get(l.market_property_source_id);
      return {
        marketPropertySourceId: l.market_property_source_id, city: s?.city ?? null, neighborhood: s?.neighborhood ?? null,
        addressText: s?.address_text ?? null, price: s?.price ?? null, priceDelta: null, imageUrl: s?.image_url ?? null,
        opportunityScore: l.opportunity_score ?? 90, buyerMatchCount: l.buyer_match_count ?? 0, publishedAt: s?.published_at ?? null, provider: s?.provider ?? "mock",
      };
    })
    .sort((a, b) => b.opportunityScore - a.opportunityScore);

  // ── Buyer match stream ───────────────────────────────────────────────────
  const { data: matchRows } = await db
    .from("buyer_property_matches" as never)
    .select("id, buyer_id, market_property_source_id, match_score, match_level, explanation, buyers!inner(full_name, phone)")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("match_score", { ascending: false })
    .limit(80);
  const matchSourceIds = [...new Set(((matchRows ?? []) as unknown as { market_property_source_id: string }[]).map((m) => m.market_property_source_id))];
  const matchSources = await fetchSources(db, matchSourceIds);
  const streamMap = new Map<string, BuyerStreamItem>();
  for (const m of ((matchRows ?? []) as unknown as Record<string, unknown>[])) {
    const sid = String(m.market_property_source_id);
    const s = matchSources.get(sid);
    const buyer = (Array.isArray(m.buyers) ? m.buyers[0] : m.buyers) as { full_name?: string; phone?: string | null } | undefined;
    const exp = (m.explanation && typeof m.explanation === "object" ? m.explanation : {}) as { positives?: string[] };
    let item = streamMap.get(sid);
    if (!item) {
      item = { marketPropertySourceId: sid, addressText: s?.address_text ?? null, city: s?.city ?? null, price: s?.price ?? null, imageUrl: s?.image_url ?? null, buyers: [] };
      streamMap.set(sid, item);
    }
    if (item.buyers.length < 4) {
      item.buyers.push({ matchId: String(m.id), buyerId: String(m.buyer_id), buyerName: String(buyer?.full_name ?? ""), phone: buyer?.phone ?? null, matchScore: num(m.match_score) ?? 0, matchLevel: String(m.match_level), positives: Array.isArray(exp.positives) ? exp.positives.slice(0, 3) : [] });
    }
  }
  const buyerStream = [...streamMap.values()].slice(0, 12);

  // ── Action center (tasks + high alerts) ──────────────────────────────────
  const { data: taskRows } = await db
    .from("tasks" as never)
    .select("id, title, description, priority, due_at, buyer_id, property_id")
    .eq("org_id", orgId)
    .in("status", ["todo", "in_progress"] as never)
    .order("due_at", { ascending: true })
    .limit(25);
  const actionCenter: ActionItem[] = ((taskRows ?? []) as unknown as Record<string, unknown>[]).map((t) => ({
    id: `task-${String(t.id)}`, kind: "task", priority: String(t.priority ?? "medium"), title: String(t.title ?? "משימה"),
    subtitle: (t.description as string | null) ?? null, dueAt: (t.due_at as string | null) ?? null,
    overdue: !!t.due_at && Date.parse(String(t.due_at)) < now.getTime(), marketPropertySourceId: null, phone: null,
  }));
  const { data: alertRows } = await db
    .from("property_alerts" as never)
    .select("id, title, message, priority, created_at, metadata")
    .eq("org_id", orgId)
    .in("status", ["unread", "shown"] as never)
    .in("priority", ["high", "urgent"] as never)
    .order("created_at", { ascending: false })
    .limit(10);
  for (const a of ((alertRows ?? []) as unknown as Record<string, unknown>[])) {
    const meta = (a.metadata && typeof a.metadata === "object" ? a.metadata : {}) as Record<string, unknown>;
    actionCenter.push({
      id: `alert-${String(a.id)}`, kind: "alert", priority: String(a.priority ?? "high"), title: String(a.title ?? "התראה"),
      subtitle: (a.message as string | null) ?? null, dueAt: null, overdue: false,
      marketPropertySourceId: (meta.marketPropertySourceId as string | null) ?? null, phone: (meta.phone as string | null) ?? null,
    });
  }

  // ── Activity stream ──────────────────────────────────────────────────────
  const { data: actRows } = await db
    .from("activity_events" as never)
    .select("id, event_type, title, channel, occurred_at")
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(20);
  const activity: ActivityItem[] = ((actRows ?? []) as unknown as Record<string, unknown>[]).map((a) => ({
    id: String(a.id), eventType: String(a.event_type ?? ""), title: String(a.title ?? ""), channel: (a.channel as string | null) ?? null, at: String(a.occurred_at ?? new Date().toISOString()),
  }));

  // ── Credit monitor ───────────────────────────────────────────────────────
  const used = page.status.creditsUsedToday, saved = page.status.creditsSavedToday;
  const creditMonitor: CreditMonitor = {
    usedToday: used, savedToday: saved, remainingToday: page.status.creditsRemainingToday,
    efficiencyPct: used + saved > 0 ? Math.round((saved / (used + saved)) * 100) : 0,
  };

  // ── Map points (real coordinates only) ───────────────────────────────────
  const mapPoints: LiveMapPoint[] = [];
  for (const it of feedTop) {
    if (!it.marketPropertySourceId) continue;
    const s = sources.get(it.marketPropertySourceId);
    const c = extractCoord({ ...(s?.raw_metadata ?? {}), ...(s?.raw_full_payload ?? {}) });
    if (!c) continue;
    const tone = it.kind === "hot_deal" ? "danger" : it.kind === "price_drop" ? "warning" : it.kind === "new_property" ? "brand" : "neutral";
    mapPoints.push({ id: it.marketPropertySourceId, lat: c.lat, lng: c.lng, title: it.addressText ?? it.city ?? "נכס", details: [it.price ? `₪${it.price.toLocaleString("he-IL")}` : "", it.opportunityScore != null ? `ציון ${it.opportunityScore}` : ""].filter(Boolean), tone });
  }

  return {
    kpis, feed: feedTop, hotDeals, buyerStream, actionCenter, activity,
    providerHealth: page.health, creditMonitor,
    mapPoints: mapPoints.slice(0, 200), cities,
    lastRefreshAt: dm.lastRefreshAt ?? page.market.lastMarketScanAt ?? now.toISOString(),
    generatedAt: now.toISOString(),
  };
}

// ── Property side panel (timeline + price history + detail) ──────────────────
export async function getPropertySidePanel(marketPropertySourceId: string): Promise<PropertySidePanelData> {
  const { db } = await ctx();
  const { data } = await db.from("market_property_sources" as never).select(SOURCE_COLS).eq("id", marketPropertySourceId).maybeSingle();
  const s = (data as unknown as SourceRow | null);

  const { createMarketEventRepository } = await import("../events/repository");
  const tl = await createMarketEventRepository(db).getMarketPropertyTimeline(marketPropertySourceId).catch(() => null);

  const priceHistory: { at: string; price: number | null }[] = [];
  for (const e of tl?.entries ?? []) {
    const detail = (e as { detail?: { next?: { price?: number } } }).detail;
    if (detail?.next?.price != null) priceHistory.push({ at: e.at, price: detail.next.price });
  }

  const images = (() => {
    const full = s?.raw_full_payload ?? {};
    const arr = (full.images ?? full.imageUrls ?? full.photos) as unknown;
    const list = Array.isArray(arr) ? arr.map((x) => (typeof x === "string" ? x : "")).filter(Boolean) : [];
    if (list.length) return list as string[];
    return s?.image_url ? [s.image_url] : [];
  })();

  return {
    marketPropertySourceId,
    addressText: s?.address_text ?? null, city: s?.city ?? null, neighborhood: s?.neighborhood ?? null,
    price: s?.price ?? null, rooms: s?.rooms ?? null, sizeSqm: s?.size_sqm ?? null, floor: s?.floor ?? null,
    propertyType: s?.property_type ?? null, listingType: s?.listing_type ?? null, provider: s?.provider ?? "mock",
    phone: s?.phone ?? null, externalUrl: s?.external_url ?? null, images,
    firstSeen: tl?.firstSeen ?? s?.first_seen_at ?? null,
    timeline: (tl?.entries ?? []).map((e): PropertyTimelineEntryDTO => ({ at: e.at, kind: e.kind, label: e.label })),
    priceHistory,
  };
}
