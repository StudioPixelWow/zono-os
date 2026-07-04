// ============================================================================
// ⚡ ZONO Compute Cache — repository (server-only). 34.2.
// Org-scoped, TTL'd key/value cache for expensive multi-engine assemblies
// (AI Home, Ask ZONO, Chief of Staff, Orchestrator, Market Domination, Area
// aggregates). Writes run under service_role. Degrades gracefully (returns
// miss / no-op) if the 34.2 migration hasn't been applied. Never throws.
// Every key is org-scoped — no cross-org or unscoped caching.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { buildCacheKey, ttlToExpiry, isExpired } from "./core";

const TABLE = "zono_compute_cache";
const isMissing = (m: string) => /does not exist|schema cache|could not find the table/i.test(m);

export interface CacheHit<T = unknown> { value: T; computedAt: string; expiresAt: string | null; version: string | null }

/** Read a cache entry. Returns null on miss, expiry, or if the table is absent. */
export async function getCache<T = unknown>(orgId: string, namespace: string, keyParts: Array<string | number | null | undefined>): Promise<CacheHit<T> | null> {
  if (!orgId) return null;
  const cache_key = buildCacheKey(keyParts);
  const db = createServiceRoleClient();
  try {
    const { data, error } = await db.from(TABLE).select("payload,computed_at,expires_at,version")
      .eq("org_id", orgId).eq("namespace", namespace).eq("cache_key", cache_key).limit(1).maybeSingle();
    if (error) { if (isMissing(error.message)) return null; return null; }
    if (!data) return null;
    if (isExpired(data.expires_at)) return null;
    return { value: data.payload as T, computedAt: data.computed_at, expiresAt: data.expires_at, version: data.version };
  } catch { return null; }
}

/** Upsert a cache entry with an optional TTL (seconds). No-op if table absent. */
export async function setCache(orgId: string, namespace: string, keyParts: Array<string | number | null | undefined>, value: Json, opts?: { ttlSeconds?: number | null; version?: string | null }): Promise<boolean> {
  if (!orgId) return false;
  const cache_key = buildCacheKey(keyParts);
  const now = Date.now();
  const db = createServiceRoleClient();
  try {
    const { error } = await db.from(TABLE).upsert({
      org_id: orgId, namespace, cache_key, payload: value,
      version: opts?.version ?? null, computed_at: new Date(now).toISOString(),
      expires_at: ttlToExpiry(opts?.ttlSeconds ?? null, now),
    }, { onConflict: "org_id,namespace,cache_key" });
    return !error;
  } catch { return false; }
}

/** Invalidate one key, or a whole namespace when keyParts omitted. */
export async function invalidateCache(orgId: string, namespace: string, keyParts?: Array<string | number | null | undefined>): Promise<boolean> {
  if (!orgId) return false;
  const db = createServiceRoleClient();
  try {
    let q = db.from(TABLE).delete().eq("org_id", orgId).eq("namespace", namespace);
    if (keyParts && keyParts.length) q = q.eq("cache_key", buildCacheKey(keyParts));
    const { error } = await q;
    return !error;
  } catch { return false; }
}
