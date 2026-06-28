// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — unified timeline stream (server-only).
// ----------------------------------------------------------------------------
// One searchable event stream instead of N isolated timelines. Producers emit
// TimelineEntry items for an entity; this merges, sorts and bounds them. Also
// projects recent live intelligence events from the bus into the same shape, so
// "what happened to X" is answered from a single place. RLS is preserved —
// producers read through the caller's request-scoped clients.
// ============================================================================
import "server-only";
import type { EntityRef, TimelineEntry, TimelineEventType } from "./types";
import { gather } from "./registry";
import { recentEvents } from "./events";
import { entityKey } from "./types";

const EVENT_TO_TIMELINE: Partial<Record<string, TimelineEventType>> = {
  "listing.published": "listing_created",
  "market.updated": "market_changed",
  "knowledge.updated": "neighborhood_updated",
  "opportunity.updated": "opportunity_created",
  "recommendation.updated": "recommendation_accepted",
  "refresh.completed": "refresh_completed",
  "broker.identified": "relationship_discovered",
};

/** Merge + sort (newest first) + cap a set of timeline entries. */
export function mergeTimeline(entries: TimelineEntry[], limit = 50): TimelineEntry[] {
  return entries
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, limit);
}

/** The unified timeline for one entity (producers + recent bus events). */
export async function getEntityTimeline(ref: EntityRef, limit = 50): Promise<TimelineEntry[]> {
  const contributions = await gather(ref);
  const fromProducers: TimelineEntry[] = contributions.flatMap((c) => c.contribution.timeline ?? []);

  const k = entityKey(ref);
  const fromBus: TimelineEntry[] = recentEvents(200)
    .filter((e) => entityKey(e.subject) === k && EVENT_TO_TIMELINE[e.type])
    .map((e, i) => ({
      id: `bus_${i}_${e.at}`, at: e.at, type: EVENT_TO_TIMELINE[e.type]!,
      title: e.type, detail: null, entity: e.subject, city: e.subject.city ?? null, source: "fabric-bus",
    }));

  return mergeTimeline([...fromProducers, ...fromBus], limit);
}
