/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Buyer Match Bundles: customer FEEDBACK → CRM (server-only). A customer
// marking מעניין/לא מתאים/רוצה ביקור from the secure /r/[token] view feeds REAL
// CRM state: the recommendation row status, a canonical property-interest edge
// (entity_relationships — previously never written), and, for a viewing request,
// an idempotent agent task. Customer UI NEVER mutates privileged deal state; this
// server layer validates the (org, contact, property) relationship first.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ContactType } from "./consent";

export type FeedbackAction = "viewed" | "interested" | "rejected" | "viewing_requested";

const REL_FOR: Record<Exclude<FeedbackAction, "viewed">, string> = {
  interested: "buyer_interested_in_property",
  viewing_requested: "buyer_interested_in_property",
  rejected: "buyer_rejected_property",
};

/** Apply one feedback action. Validates the recommendation exists for this
 *  (org, contact, property) before mutating anything. Idempotent. */
export async function applyRecommendationFeedback(
  orgId: string, contactType: Extract<ContactType, "buyer" | "lead">, contactId: string,
  propertyId: string, action: FeedbackAction,
): Promise<{ ok: boolean; reason: string }> {
  const db: any = createServiceRoleClient();

  // 1) Validate the relationship — the customer may only act on properties that
  //    were actually recommended to them (prevents forged feedback).
  const { data: rec } = await db.from("customer_property_recommendations").select("id,status")
    .eq("org_id", orgId).eq("contact_type", contactType).eq("contact_id", contactId).eq("property_id", propertyId)
    .limit(1).maybeSingle();
  if (!rec?.id) return { ok: false, reason: "not_recommended" };

  // 2) Update the recommendation status (viewed never downgrades a stronger state).
  const strong = new Set(["interested", "rejected", "viewing_requested"]);
  if (!(action === "viewed" && strong.has((rec as any).status))) {
    await db.from("customer_property_recommendations")
      .update({ status: action, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", (rec as any).id);
  }

  // 3) Canonical property-interest edge (only for buyers — the edge vocabulary is buyer-scoped).
  if (contactType === "buyer" && action !== "viewed") {
    try {
      await db.from("entity_relationships").insert({
        org_id: orgId, source_entity_type: "buyer", source_entity_id: contactId,
        target_entity_type: "property", target_entity_id: propertyId,
        relationship_type: REL_FOR[action], strength_score: action === "rejected" ? 10 : 80, status: "active",
      });
    } catch { /* edge is best-effort (may already exist) */ }
  }

  // 4) Viewing request → an idempotent agent task on the buyer's owner.
  if (action === "viewing_requested") {
    try {
      const { data: b } = await db.from("buyers").select("owner_id,full_name").eq("id", contactId).maybeSingle();
      const source = `reco:viewing_request:${contactId}:${propertyId}`;
      const { data: existing } = await db.from("tasks").select("id")
        .eq("org_id", orgId).eq("intelligence_source", source).in("status", ["todo", "in_progress", "blocked"]).limit(1).maybeSingle();
      if (!existing?.id) {
        await db.from("tasks").insert({
          org_id: orgId, buyer_id: contactId, property_id: propertyId, assignee_id: (b as any)?.owner_id ?? null,
          title: `בקשת ביקור מ${(b as any)?.full_name ?? "לקוח"}`, status: "todo", priority: "high",
          intelligence_source: source, is_automatable: true,
        });
      }
    } catch { /* task is best-effort */ }
  }
  return { ok: true, reason: "ok" };
}
