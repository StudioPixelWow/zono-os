// ============================================================================
// ZONO Property Radar™ — Live Command Center pure helpers (client-safe, no I/O).
// Shared by the UI and the dev-check: feed filtering, global search, list
// windowing (virtualization), realtime merge-by-id, timeline ordering, and the
// REAL-coordinate extractor (the rule that keeps the map free of fake pins).
// ============================================================================
import type { LiveFeedItem, PropertyTimelineEntryDTO } from "./types";

export interface FeedFilterOptions {
  /** Max age in ms (Infinity = all time). */
  windowMs: number;
  /** Active kind/listingType chips (empty = all). */
  kinds: Set<string>;
  highOnly: boolean;
  query: string;
}

/** Filter the live feed by time window, kind/type chips, high-score and search. */
export function filterFeed(feed: LiveFeedItem[], opts: FeedFilterOptions, now: number = Date.now()): LiveFeedItem[] {
  const needle = opts.query.trim().toLowerCase();
  return feed.filter((it) => {
    if (opts.windowMs !== Infinity && now - Date.parse(it.at) > opts.windowMs) return false;
    if (opts.highOnly && (it.opportunityScore ?? 0) < 80) return false;
    if (opts.kinds.size > 0) {
      let ok = false;
      for (const k of opts.kinds) {
        if (k === "private" && it.listingType === "private") ok = true;
        else if (k === "broker" && it.listingType === "broker") ok = true;
        else if (k === "project" && it.listingType === "project") ok = true;
        else if (k === it.kind) ok = true;
      }
      if (!ok) return false;
    }
    if (needle) {
      const hay = [it.addressText, it.city, it.neighborhood, it.phone, it.provider, it.marketPropertySourceId, it.price != null ? String(it.price) : ""].join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

/** Window a list for virtualization: first `n` items + whether more remain. */
export function windowItems<T>(list: T[], n: number): { items: T[]; hasMore: boolean } {
  return { items: list.slice(0, n), hasMore: list.length > n };
}

/** Merge incoming feed items into existing, dedup by id, newest-first. */
export function mergeFeedById(prev: LiveFeedItem[], incoming: LiveFeedItem[]): LiveFeedItem[] {
  const byId = new Map(prev.map((i) => [i.id, i]));
  for (const i of incoming) byId.set(i.id, i);
  return [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Chronological timeline ordering (ascending by time). */
export function sortTimelineEntries(entries: PropertyTimelineEntryDTO[]): PropertyTimelineEntryDTO[] {
  return [...entries].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

/**
 * Extract REAL coordinates from a provider raw payload, or null. Rejects
 * missing/non-numeric values, out-of-range values, and the (0,0) null-island —
 * this is the single rule that guarantees the map only ever shows real pins.
 */
export function extractCoord(raw: Record<string, unknown> | null | undefined): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const loc = (raw.location as Record<string, unknown> | undefined) ?? undefined;
  const coords = (raw.coordinates as Record<string, unknown> | undefined) ?? undefined;
  const pick = (...vals: unknown[]) => {
    for (const v of vals) {
      if (v == null) continue;
      const n = typeof v === "number" ? v : parseFloat(String(v));
      if (Number.isFinite(n)) return n;
    }
    return null;
  };
  const lat = pick(raw.lat, raw.latitude, raw.Lat, loc?.lat, coords?.lat);
  const lng = pick(raw.lng, raw.lon, raw.longitude, raw.Lng, loc?.lng, coords?.lng);
  if (lat == null || lng == null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}
