// ============================================================================
// ZONO INTELLIGENCE FABRIC™ — centralized intelligence cache.
// ----------------------------------------------------------------------------
// One cache for the whole Fabric — no module rolls its own. Memoizes expensive
// composed contexts/knowledge keyed by entity, with TTL and SCOPED invalidation
// (invalidate only the affected entity / type, never a blunt global flush).
// In-process per server instance; safe to miss (always recomputable).
// ============================================================================
import type { EntityRef } from "./types";
import { entityKey } from "./types";

interface Entry { value: unknown; expiresAt: number; type: string; tags: Set<string> }

const g = globalThis as unknown as { __zonoFabricCache?: Map<string, Entry> };
const store: Map<string, Entry> = g.__zonoFabricCache ?? (g.__zonoFabricCache = new Map());

const DEFAULT_TTL_MS = 5 * 60_000; // 5 min — read models are recomputed lazily
const MAX_ENTRIES = 5_000;         // bound memory; evict oldest on overflow

/** Build a namespaced cache key (e.g. "knowledge|property:123"). */
export function cacheKey(namespace: string, ref: Pick<EntityRef, "type" | "id">): string {
  return `${namespace}|${entityKey(ref)}`;
}

export function getCached<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) { store.delete(key); return undefined; }
  return e.value as T;
}

export function setCached<T>(key: string, value: T, opts: { ttlMs?: number; type?: string; tags?: string[] } = {}): T {
  if (store.size >= MAX_ENTRIES) { const oldest = store.keys().next().value; if (oldest) store.delete(oldest); }
  store.set(key, { value, expiresAt: Date.now() + (opts.ttlMs ?? DEFAULT_TTL_MS), type: opts.type ?? "", tags: new Set(opts.tags ?? []) });
  return value;
}

/** Lazy memoize: return cached, else compute + store. */
export async function memo<T>(key: string, compute: () => Promise<T>, opts: { ttlMs?: number; type?: string; tags?: string[] } = {}): Promise<T> {
  const hit = getCached<T>(key);
  if (hit !== undefined) return hit;
  return setCached(key, await compute(), opts);
}

/** Invalidate every cached context that names this entity (key or tag match). */
export function invalidateEntity(ref: Pick<EntityRef, "type" | "id">): number {
  const k = entityKey(ref);
  let n = 0;
  for (const [key, e] of store) {
    if (key.endsWith(`|${k}`) || e.tags.has(k)) { store.delete(key); n++; }
  }
  return n;
}

/** Invalidate all entries of an entity type (e.g. after a market refresh). */
export function invalidateType(type: string): number {
  let n = 0;
  for (const [key, e] of store) {
    if (key.includes(`|${type}:`) || e.type === type) { store.delete(key); n++; }
  }
  return n;
}

export function cacheStats(): { size: number; types: Record<string, number> } {
  const types: Record<string, number> = {};
  for (const e of store.values()) types[e.type || "—"] = (types[e.type || "—"] ?? 0) + 1;
  return { size: store.size, types };
}
