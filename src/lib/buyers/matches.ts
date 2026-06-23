/**
 * Buyer → matched-properties counts.
 *
 * Reads the match intelligence layer (match_intelligence_profiles) and returns a
 * per-buyer count of viable property matches (compatibility >= MIN_COMPAT). This
 * is real data when the matching engine has run for the org; otherwise it fails
 * soft and returns {} so the UI shows "טרם חושב" rather than breaking.
 *
 * Server-only — never import from a Client Component.
 */
import { createClient } from "@/lib/supabase/server";

/** Minimum compatibility to count a pairing as a real match. */
const MIN_COMPAT = 50;

export type BuyerMatchCounts = Record<string, number>;

/**
 * Returns { [buyerId]: matchCount }. Empty object on any failure (table missing,
 * matching engine not yet run, RLS, etc.) — callers treat empty as "not computed".
 *
 * TODO(matching): once match recompute is scheduled org-wide, surface match
 * *quality* (best closing probability) here too, not just a count.
 */
export async function listBuyerMatchCounts(): Promise<BuyerMatchCounts> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("match_intelligence_profiles")
      .select("buyer_id,compatibility_score")
      .gte("compatibility_score", MIN_COMPAT)
      .limit(5000);
    if (error || !data) return {};
    const counts: BuyerMatchCounts = {};
    for (const row of data) {
      const id = (row as { buyer_id: string | null }).buyer_id;
      if (!id) continue;
      counts[id] = (counts[id] ?? 0) + 1;
    }
    return counts;
  } catch (e) {
    console.error("[buyers] match counts failed:", e);
    return {};
  }
}
