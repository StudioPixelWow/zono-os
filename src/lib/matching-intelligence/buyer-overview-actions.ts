"use server";
// ============================================================================
// Buyer Command Center 5.1 — internal buyer overview server actions. Session-scoped
// org; the broker marks a buyer's matches as reviewed (clears "new since review").
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { markBuyerMatchesReviewed, getBuyerMatchOverview, type BuyerMatchOverview } from "./buyer-matches-overview";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/** Broker: mark this buyer's matches reviewed now. */
export async function markBuyerMatchesReviewedAction(buyerId: string): Promise<Result<null>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!buyerId) return { ok: false, error: "חסר מזהה קונה." };
  try {
    await markBuyerMatchesReviewed(profile.org_id, buyerId, createServiceRoleClient());
    return { ok: true, data: null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "העדכון נכשל." };
  }
}

/** Broker: fetch the buyer's match overview (freshness + counts + next action). */
export async function getBuyerMatchOverviewAction(buyerId: string): Promise<Result<BuyerMatchOverview>> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  try {
    const data = await getBuyerMatchOverview(profile.org_id, buyerId, createServiceRoleClient());
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "טעינת ההתאמות נכשלה." };
  }
}
