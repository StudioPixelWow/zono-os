/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Marketing Autopilot 2.0 · PRE-APPROVAL validation (server-only). Re-reads
// the world at approval time and reconciles the (possibly stale) draft against it:
// property still marketable? groups still active? Facebook connected? creative still
// publish-ready? buyers still relevant / not rejected / consented / not already sent?
// It gathers ONLY real facts, then hands them to the PURE validatePlan() reducer,
// which removes ineligible recipients, drops inactive groups, marks unpublishable
// items blocked, and returns human-readable Hebrew blockers/notices. A stale draft
// is never blindly executed.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCreativeFacebookReadiness } from "@/lib/facebook-groups/creative-readiness";
import {
  validatePlan, type MarketingPlanSnapshot, type PlanValidationFacts, type PlanValidationResult, type RecipientEligibilityInput,
} from "./plan-core";

const STRONG_MATCH = 70;
const MARKETABLE = ["active", "published", "under_offer", "in_contract", "ready"];

/** Gather live facts and run the pure reducer. Never mutates the input snapshot. */
export async function validateSnapshot(orgId: string, snapshot: MarketingPlanSnapshot, opts?: { db?: any }): Promise<PlanValidationResult> {
  const db: any = opts?.db ?? createServiceRoleClient();
  const propertyId = snapshot.propertyId;

  // Property marketable?
  const { data: prop } = await db.from("properties").select("status").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
  const propertyMarketable = !!prop && MARKETABLE.includes(prop.status);

  // Active groups (org-wide; the reducer intersects with each item's group set).
  const { data: groupRows } = await db.from("distribution_groups").select("id").eq("org_id", orgId).eq("status", "active").limit(500);
  const activeGroupIds = ((groupRows ?? []) as any[]).map((g) => g.id as string);
  const facebookConnected = activeGroupIds.length > 0;

  // Creative readiness per facebook item that pins a creative.
  const creativeReadyByItem: Record<string, boolean | null> = {};
  for (const it of snapshot.items) {
    if ((it.type === "facebook_publish" || it.type === "group_expansion") && it.facebook?.creativeOutputId) {
      try { const r = await getCreativeFacebookReadiness(it.facebook.creativeOutputId); creativeReadyByItem[it.itemId] = r.status === "ready"; }
      catch { creativeReadyByItem[it.itemId] = null; }
    }
  }

  // Buyer eligibility per buyer item — real candidates/rejected/opted-out/already-sent.
  const buyerEligibilityByItem: Record<string, RecipientEligibilityInput> = {};
  const buyerItems = snapshot.items.filter((i) => i.type === "buyer_bundle" && i.buyer);
  if (buyerItems.length) {
    // Current strong candidates for the property.
    const { data: matchRows } = await db.from("match_intelligence_profiles")
      .select("buyer_id").eq("org_id", orgId).eq("property_id", propertyId).eq("match_status", "active").gte("compatibility_score", STRONG_MATCH).limit(500);
    const candidates = ((matchRows ?? []) as any[]).map((m) => m.buyer_id as string);

    // Recommendation ledger → already-sent + rejected (this property).
    const { data: recRows } = await db.from("customer_property_recommendations")
      .select("contact_id,status").eq("org_id", orgId).eq("contact_type", "buyer").eq("property_id", propertyId);
    const alreadySent = ((recRows ?? []) as any[]).map((r) => r.contact_id as string);
    const rejected = ((recRows ?? []) as any[]).filter((r) => r.status === "rejected").map((r) => r.contact_id as string);

    // Consent — a buyer is marketing-eligible only with ≥1 channel opted_in (fail-closed).
    const draftIds = new Set<string>();
    buyerItems.forEach((i) => i.buyer!.recipientIds.forEach((id) => draftIds.add(id)));
    candidates.forEach((id) => draftIds.add(id));
    const ids = [...draftIds];
    const optedInByBuyer = new Set<string>();
    if (ids.length) {
      const { data: consentRows } = await db.from("customer_comm_consent")
        .select("contact_id,channel,status").eq("org_id", orgId).eq("contact_type", "buyer").in("contact_id", ids);
      for (const c of (consentRows ?? []) as any[]) if (c.status === "opted_in") optedInByBuyer.add(c.contact_id as string);
    }
    const optedOut = ids.filter((id) => !optedInByBuyer.has(id)); // no consented channel ⇒ excluded from marketing

    for (const it of buyerItems) {
      // Candidate set for this item = the draft's approved recipients that are still strong candidates.
      const stillStrong = new Set(candidates);
      const itemCandidates = it.buyer!.recipientIds.filter((id) => stillStrong.has(id));
      buyerEligibilityByItem[it.itemId] = { candidates: itemCandidates, rejected, optedOut, alreadySent };
    }
  }

  const facts: PlanValidationFacts = { propertyMarketable, facebookConnected, activeGroupIds, creativeReadyByItem, buyerEligibilityByItem };
  return validatePlan(snapshot, facts);
}
