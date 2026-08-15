/**
 * Buyer-Intelligence RECONCILIATION (P9.6C) — production-safe, idempotent backfill.
 *
 * Legacy / imported / bulk-created buyers can exist WITHOUT a
 * `buyer_intelligence_profiles` row when they were created outside the normal
 * `createBuyerAction → initializeBuyerIntelligence` lifecycle (SQL seed, data
 * import, migration). This reconciles them by invoking the SAME canonical
 * `initializeBuyerIntelligence(buyerId)` the product uses — no raw SQL, no
 * duplicated scoring, no per-tenant special-casing. RLS scopes every read/write
 * to the caller's org; it is idempotent (skips buyers that already have
 * intelligence), safe to rerun, and continues past individual failures.
 */
import { createClient } from "@/lib/supabase/server";
import { initializeBuyerIntelligence } from "./service";

export interface ReconcileResult {
  total: number;          // buyers in scope (caller's org, RLS-scoped)
  alreadyPresent: number; // already had a buyer_intelligence_profiles row
  created: number;        // enriched this run
  failed: number;         // individual failures — did NOT stop the run
  errors: string[];       // up to 10 sample "buyerId: message" strings
}

/** Pure planner: given all buyer ids and the set that already have intelligence,
 *  return the ids that still need enrichment. Unit-tested. */
export function planReconcile(buyerIds: string[], existing: Set<string>): string[] {
  return buyerIds.filter((id) => !existing.has(id));
}

/** Reconcile every buyer in the CALLER'S org missing a buyer_intelligence_profiles
 *  row, via the canonical `initializeBuyerIntelligence`. RLS-scoped, idempotent,
 *  rerunnable, fault-tolerant. */
export async function reconcileBuyerIntelligenceForOrg(): Promise<ReconcileResult> {
  const supabase = await createClient();
  const [{ data: buyers }, { data: profiles }] = await Promise.all([
    supabase.from("buyers").select("id").limit(5000),
    supabase.from("buyer_intelligence_profiles").select("buyer_id").limit(5000),
  ]);
  const buyerIds = ((buyers ?? []) as { id: string }[]).map((b) => b.id);
  const existing = new Set(((profiles ?? []) as { buyer_id: string }[]).map((p) => p.buyer_id));
  const missing = planReconcile(buyerIds, existing);

  let created = 0, failed = 0;
  const errors: string[] = [];
  for (const id of missing) {
    try {
      await initializeBuyerIntelligence(id); // canonical, idempotent
      created++;
    } catch (e) {
      failed++;
      if (errors.length < 10) errors.push(`${id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }
  return { total: buyerIds.length, alreadyPresent: existing.size, created, failed, errors };
}
