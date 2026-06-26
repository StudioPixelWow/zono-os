// ============================================================================
// ZONO Orchestrator — the BRIDGE + event/alert emission.
//
// QA-01 root cause: External Listings Sync writes to `external_listings`, but
// Property Radar / popups read from `market_property_sources` + emit
// `market_property_events` + `property_alerts`. These two halves were never
// connected. This module connects them — real data only, idempotent, no fakes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  PRICE_DROP_MIN_PERCENT, PRICE_DROP_MIN_ABS, PRICE_DROP_HOT_PERCENT, PRICE_DROP_HOT_ABS,
} from "./types";

type Db = ReturnType<typeof createServiceRoleClient>;
const SEP = "";
const key = (provider: string, externalId: string) => `${provider}${SEP}${externalId}`;

interface ExtRow {
  source: string; source_id: string; listing_url: string | null; status: string | null;
  title: string | null; city: string | null; neighborhood: string | null; street: string | null;
  address: string | null; property_type: string | null; deal_type: string | null;
  price: number | null; rooms: number | null; floor: number | null; sqm: number | null; area_sqm: number | null;
  images: unknown; contact_phone: string | null; contact_name: string | null;
  published_at: string | null; has_agent: boolean | null; opportunity_score: number | null;
}

export interface PriceChange { providerKey: string; sourceId: string | null; provider: string; externalId: string; city: string | null; neighborhood: string | null; prevPrice: number; nextPrice: number; }
export interface BridgeResult {
  upserted: number;
  newSources: { providerKey: string; provider: string; externalId: string; sourceId: string | null; city: string | null; neighborhood: string | null; price: number | null; hasAgent: boolean | null; opportunityScore: number | null; listingUrl: string | null; title: string | null }[];
  priceDrops: PriceChange[];
}

function firstImage(images: unknown): string | null {
  if (Array.isArray(images) && images.length) {
    const f = images[0];
    if (typeof f === "string") return f;
    if (f && typeof f === "object" && "url" in f && typeof (f as { url: unknown }).url === "string") return (f as { url: string }).url;
  }
  return null;
}

/**
 * STEP 3 — Bridge: read the org's active external_listings and upsert them into
 * the shared `market_property_sources` cache (unique by provider+external_id).
 * Returns which sources are brand-new and which had a qualifying price drop, so
 * the event step can emit accordingly.
 */
export async function syncExternalListingsToMarketSources(organizationId: string): Promise<BridgeResult> {
  const db = createServiceRoleClient() as Db;
  const { data } = await db
    .from("external_listings")
    .select("source,source_id,listing_url,status,title,city,neighborhood,street,address,property_type,deal_type,price,rooms,floor,sqm,area_sqm,images,contact_phone,contact_name,published_at,has_agent,opportunity_score")
    .eq("org_id", organizationId)
    .eq("status", "active")
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .limit(1500);
  const rows = (data ?? []) as unknown as ExtRow[];
  if (!rows.length) return { upserted: 0, newSources: [], priceDrops: [] };

  // Pre-fetch existing market sources for these keys (to detect new + price change).
  const providers = [...new Set(rows.map((r) => r.source))];
  const externalIds = [...new Set(rows.map((r) => r.source_id))];
  const prev = new Map<string, { id: string; price: number | null }>();
  // Chunk the IN() to keep the query bounded.
  for (let i = 0; i < externalIds.length; i += 300) {
    const slice = externalIds.slice(i, i + 300);
    const { data: ex } = await db
      .from("market_property_sources" as never)
      .select("id,provider,external_id,price")
      .in("provider", providers)
      .in("external_id", slice);
    for (const e of (ex ?? []) as unknown as { id: string; provider: string; external_id: string; price: number | null }[]) {
      prev.set(key(e.provider, e.external_id), { id: e.id, price: e.price });
    }
  }

  // Build + upsert.
  const upsertRows = rows.map((r) => ({
    provider: r.source, external_id: r.source_id, external_url: r.listing_url,
    listing_type: r.deal_type ?? "unknown", source_status: r.status ?? "active",
    title: r.title, city: r.city, neighborhood: r.neighborhood, street: r.street, address_text: r.address,
    property_type: r.property_type, price: r.price, rooms: r.rooms, floor: r.floor != null ? String(r.floor) : null,
    size_sqm: r.sqm ?? r.area_sqm ?? null, image_url: firstImage(r.images),
    phone: r.contact_phone, contact_name: r.contact_name, published_at: r.published_at,
    market_area_key: r.city, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    raw_metadata: { org_id: organizationId, has_agent: r.has_agent, opportunity_score: r.opportunity_score } as never,
  }));

  const { data: upserted } = await db
    .from("market_property_sources" as never)
    .upsert(upsertRows as never, { onConflict: "provider,external_id" })
    .select("id,provider,external_id");
  const idByKey = new Map<string, string>();
  for (const u of (upserted ?? []) as unknown as { id: string; provider: string; external_id: string }[]) {
    idByKey.set(key(u.provider, u.external_id), u.id);
  }

  const newSources: BridgeResult["newSources"] = [];
  const priceDrops: PriceChange[] = [];
  for (const r of rows) {
    const k = key(r.source, r.source_id);
    const before = prev.get(k);
    const sourceId = idByKey.get(k) ?? before?.id ?? null;
    if (!before) {
      newSources.push({
        providerKey: k, provider: r.source, externalId: r.source_id, sourceId,
        city: r.city, neighborhood: r.neighborhood, price: r.price, hasAgent: r.has_agent,
        opportunityScore: r.opportunity_score, listingUrl: r.listing_url, title: r.title,
      });
    } else if (before.price != null && r.price != null && r.price < before.price) {
      const delta = r.price - before.price; // negative
      const pct = before.price > 0 ? (Math.abs(delta) / before.price) * 100 : 0;
      if (Math.abs(delta) >= PRICE_DROP_MIN_ABS || pct >= PRICE_DROP_MIN_PERCENT) {
        priceDrops.push({ providerKey: k, sourceId, provider: r.source, externalId: r.source_id, city: r.city, neighborhood: r.neighborhood, prevPrice: before.price, nextPrice: r.price });
      }
    }
  }
  return { upserted: upsertRows.length, newSources, priceDrops };
}

/**
 * STEP 6/7 — From the bridge result, emit market_property_events and the matching
 * org-scoped property_alerts. Idempotent: new_property only fires for sources that
 * were brand-new in the bridge AND have no prior new_property event; price_drop is
 * naturally idempotent because the source price is updated by the bridge.
 */
export async function emitMarketEventsAndAlerts(organizationId: string, bridge: BridgeResult): Promise<{ newProperties: number; priceDrops: number; alertsCreated: number }> {
  const db = createServiceRoleClient() as Db;
  let alertsCreated = 0;

  // ── New-property events (guard against duplicates) ─────────────────────────
  const candidateIds = bridge.newSources.map((n) => n.sourceId).filter((x): x is string => !!x);
  const already = new Set<string>();
  for (let i = 0; i < candidateIds.length; i += 300) {
    const slice = candidateIds.slice(i, i + 300);
    const { data: ev } = await db
      .from("market_property_events" as never)
      .select("market_property_source_id")
      .eq("event_type", "new_property")
      .in("market_property_source_id", slice);
    for (const e of (ev ?? []) as unknown as { market_property_source_id: string }[]) already.add(e.market_property_source_id);
  }
  const freshNew = bridge.newSources.filter((n) => n.sourceId && !already.has(n.sourceId));

  if (freshNew.length) {
    const eventRows = freshNew.map((n) => ({
      market_property_source_id: n.sourceId, provider: n.provider, market_area_key: n.city,
      city: n.city, neighborhood: n.neighborhood, event_type: "new_property",
      previous_value: {} as never, next_value: { price: n.price, title: n.title } as never,
      severity: (n.hasAgent === false || (n.opportunityScore ?? 0) >= 70) ? "high" : "low",
      detected_at: new Date().toISOString(),
      metadata: { org_id: organizationId, opportunity_score: n.opportunityScore } as never,
    }));
    try { await db.from("market_property_events" as never).insert(eventRows as never); } catch { /* best-effort */ }

    // Alerts only for relevant new listings (private owner OR high opportunity),
    // capped per run, so we never spam the popup queue.
    const alertable = freshNew
      .filter((n) => n.hasAgent === false || (n.opportunityScore ?? 0) >= 70)
      .slice(0, 50);
    if (alertable.length) {
      const alertRows = alertable.map((n) => ({
        org_id: organizationId, alert_type: n.hasAgent === false ? "new_private_property" : "high_opportunity",
        title: n.hasAgent === false ? "נכס פרטי חדש באזור שלך" : "נכס חדש בעל פוטנציאל גבוה",
        message: [n.title, n.city].filter(Boolean).join(" · ") || "נכס חדש זוהה",
        priority: "high", status: "unread", opportunity_score: n.opportunityScore ?? null,
        metadata: { marketPropertySourceId: n.sourceId, provider: n.provider, externalId: n.externalId, listingUrl: n.listingUrl, city: n.city } as never,
      }));
      try { const { error } = await db.from("property_alerts" as never).insert(alertRows as never); if (!error) alertsCreated += alertRows.length; } catch { /* best-effort */ }
    }
  }

  // ── Price-drop events + alerts ─────────────────────────────────────────────
  if (bridge.priceDrops.length) {
    const dropEventRows = bridge.priceDrops.map((d) => {
      const delta = d.nextPrice - d.prevPrice;
      const pct = d.prevPrice > 0 ? (Math.abs(delta) / d.prevPrice) * 100 : 0;
      const hot = Math.abs(delta) >= PRICE_DROP_HOT_ABS || pct >= PRICE_DROP_HOT_PERCENT;
      return {
        market_property_source_id: d.sourceId, provider: d.provider, market_area_key: d.city,
        city: d.city, neighborhood: d.neighborhood, event_type: "price_drop",
        previous_value: { price: d.prevPrice } as never, next_value: { price: d.nextPrice } as never,
        price_delta: delta, price_delta_percent: Math.round(pct * 10) / 10,
        severity: hot ? "urgent" : "high", detected_at: new Date().toISOString(),
        metadata: { org_id: organizationId } as never,
      };
    });
    try { await db.from("market_property_events" as never).insert(dropEventRows as never); } catch { /* best-effort */ }

    // Self-healing dedup guard: skip a price_drop alert when one already exists
    // for the same market source within the last 24h. The bridge makes drops
    // idempotent across runs (it updates the source price), but this protects
    // against a silently-failed price upsert re-detecting the same drop and
    // against an overlap with the Property Radar daily-refresh — so the popup
    // queue never gets a duplicate price drop for the same listing.
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentlyAlerted = new Set<string>();
    try {
      const { data: recent } = await db
        .from("property_alerts" as never)
        .select("metadata")
        .eq("org_id", organizationId)
        .eq("alert_type", "price_drop")
        .gte("created_at", since24h);
      for (const a of (recent ?? []) as unknown as { metadata: { marketPropertySourceId?: string } | null }[]) {
        const id = a.metadata?.marketPropertySourceId;
        if (id) recentlyAlerted.add(id);
      }
    } catch { /* best-effort — if the guard read fails we still cap at 50 below */ }

    const dropAlertRows = bridge.priceDrops
      .filter((d) => !(d.sourceId && recentlyAlerted.has(d.sourceId)))
      .slice(0, 50)
      .map((d) => {
        const delta = d.nextPrice - d.prevPrice;
        const pct = d.prevPrice > 0 ? Math.round((Math.abs(delta) / d.prevPrice) * 100) : 0;
        const hot = Math.abs(delta) >= PRICE_DROP_HOT_ABS || pct >= PRICE_DROP_HOT_PERCENT;
        return {
          org_id: organizationId, alert_type: "price_drop",
          title: hot ? "ירידת מחיר משמעותית" : "ירידת מחיר באזור שלך",
          message: [`-${pct}%`, d.city].filter(Boolean).join(" · "),
          priority: hot ? "urgent" : "high", status: "unread",
          metadata: { marketPropertySourceId: d.sourceId, provider: d.provider, externalId: d.externalId, prevPrice: d.prevPrice, nextPrice: d.nextPrice, city: d.city } as never,
        };
      });
    if (dropAlertRows.length) {
      try { const { error } = await db.from("property_alerts" as never).insert(dropAlertRows as never); if (!error) alertsCreated += dropAlertRows.length; } catch { /* best-effort */ }
    }
  }

  return { newProperties: freshNew.length, priceDrops: bridge.priceDrops.length, alertsCreated };
}
