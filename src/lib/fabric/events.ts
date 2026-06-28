// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — event bus (in-process, deterministic).
// ----------------------------------------------------------------------------
// The decoupling mechanism. Engines PUBLISH intelligence events and SUBSCRIBE
// to them through this bus — they never import or call one another directly.
// Synchronous, ordered (subscription order), best-effort (one failing handler
// never blocks the rest). A published event also invalidates affected cache
// contexts so dependent knowledge is recomputed lazily on next read.
//
//   listing.published ─▶ broker.identified ─▶ market.updated ─▶ knowledge.updated
//        ─▶ opportunity.updated ─▶ matching.updated ─▶ recommendation.updated
// ============================================================================
import type { IntelligenceEvent, IntelligenceEventType, EntityRef } from "./types";
import { invalidateEntity } from "./cache";

type Handler = (event: IntelligenceEvent) => void | Promise<void>;

interface BusState {
  handlers: Map<IntelligenceEventType, Set<Handler>>;
  wildcard: Set<Handler>;
  recent: IntelligenceEvent[]; // bounded ring buffer for debugging / AI introspection
}

// Survive HMR / per-runtime reuse via globalThis (one bus per server instance).
const g = globalThis as unknown as { __zonoFabricBus?: BusState };
const bus: BusState = g.__zonoFabricBus ?? (g.__zonoFabricBus = { handlers: new Map(), wildcard: new Set(), recent: [] });

const RECENT_CAP = 200;

/** Subscribe to one event type. Returns an unsubscribe fn. */
export function on(type: IntelligenceEventType, handler: Handler): () => void {
  const set = bus.handlers.get(type) ?? bus.handlers.set(type, new Set()).get(type)!;
  set.add(handler);
  return () => set.delete(handler);
}

/** Subscribe to ALL events (e.g. the timeline writer). Returns unsubscribe. */
export function onAny(handler: Handler): () => void {
  bus.wildcard.add(handler);
  return () => bus.wildcard.delete(handler);
}

/**
 * Publish an intelligence event. Invalidates the subject's cache context first
 * (so reactions recompute fresh), then fans out to subscribers best-effort.
 * Handlers are awaited so event chains are deterministic end-to-end.
 */
export async function publish(event: IntelligenceEvent): Promise<void> {
  // Record (bounded) for introspection.
  bus.recent.push(event);
  if (bus.recent.length > RECENT_CAP) bus.recent.splice(0, bus.recent.length - RECENT_CAP);

  // Cache coherence: a fact about an entity invalidates its assembled context.
  try { invalidateEntity(event.subject); } catch { /* cache optional */ }

  const targets = [...(bus.handlers.get(event.type) ?? []), ...bus.wildcard];
  for (const h of targets) {
    try { await h(event); } catch (e) { console.error(`[fabric] handler for ${event.type} failed:`, e); }
  }
}

/** Convenience constructor — stamps the timestamp. */
export function makeEvent<P extends Record<string, unknown>>(
  type: IntelligenceEventType, subject: EntityRef, payload: P, orgId?: string | null,
): IntelligenceEvent<P> {
  return { type, subject, payload, orgId: orgId ?? null, at: new Date().toISOString() };
}

/** Recent events (newest last) — for the AI agent / debug introspection. */
export function recentEvents(limit = 50): IntelligenceEvent[] {
  return bus.recent.slice(-limit);
}
