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
import { setShortlistState, type ShortlistState } from "@/lib/buyer-shortlist/service";

// Portal feedback → curated-shortlist state (so the broker's selection reflects it).
const SHORTLIST_STATE_FOR: Partial<Record<FeedbackAction, ShortlistState>> = {
  viewed: "viewed", interested: "liked", rejected: "rejected", viewing_requested: "visit_requested",
};

export type FeedbackAction = "viewed" | "interested" | "rejected" | "viewing_requested" | "talk_to_agent";

// Property-preference statuses valid for the recommendation ledger (matches the DB
// check constraint). "talk_to_agent" is a callback request — NOT a preference — so
// it never writes a status; it creates an idempotent callback task instead.
const STATUS_VALID = new Set(["viewed", "interested", "rejected", "viewing_requested"]);

const REL_FOR: Record<"interested" | "viewing_requested" | "rejected", string> = {
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

  // 2) Update the recommendation status (viewed never downgrades a stronger state;
  //    talk_to_agent is not a preference status → never written here).
  const strong = new Set(["interested", "rejected", "viewing_requested"]);
  if (STATUS_VALID.has(action) && !(action === "viewed" && strong.has((rec as any).status))) {
    await db.from("customer_property_recommendations")
      .update({ status: action, responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", (rec as any).id);
  } else if (action === "talk_to_agent") {
    // Record the response timestamp without changing the preference status.
    await db.from("customer_property_recommendations").update({ responded_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", (rec as any).id);
  }

  // 2b) Mirror onto the broker-curated shortlist state (if this property is on it).
  if (contactType === "buyer" && SHORTLIST_STATE_FOR[action]) {
    try { await setShortlistState(orgId, contactId, propertyId, SHORTLIST_STATE_FOR[action] as ShortlistState, db); }
    catch { /* shortlist mirror is best-effort */ }
  }

  // 3) Canonical property-interest edge (only for buyers — the edge vocabulary is
  //    buyer-scoped). talk_to_agent creates no preference edge (it's a callback).
  if (contactType === "buyer" && (action === "interested" || action === "viewing_requested" || action === "rejected")) {
    try {
      await db.from("entity_relationships").insert({
        org_id: orgId, source_entity_type: "buyer", source_entity_id: contactId,
        target_entity_type: "property", target_entity_id: propertyId,
        relationship_type: REL_FOR[action], strength_score: action === "rejected" ? 10 : 80, status: "active",
      });
    } catch { /* edge is best-effort (may already exist) */ }
  }

  // 3c) Buyer signal → a broker-visible timeline event (interested/rejected have
  //     no task, so without this the broker never sees them). Service-role write
  //     with the KNOWN org — the portal path has no session. Best-effort.
  if (contactType === "buyer" && (action === "interested" || action === "rejected" || action === "viewing_requested")) {
    try {
      const { data: prop } = await db.from("properties").select("title,city").eq("id", propertyId).eq("org_id", orgId).maybeSingle();
      const label = (prop as any)?.title?.trim() || [(prop as any)?.city, "נכס"].filter(Boolean).join(" ") || "נכס";
      const verb = action === "interested" ? "סימן/ה שהנכס מעניין" : action === "rejected" ? "סימן/ה שהנכס לא מתאים" : "ביקש/ה לראות את הנכס";
      await db.from("activity_events").insert({
        org_id: orgId, actor_user_id: null, actor_type: "system",
        event_type: "buyer.interaction.created", entity_type: "buyer", entity_id: contactId,
        related_entity_type: "property", related_entity_id: propertyId,
        title: `הקונה ${verb}`, description: label,
        channel: "portal", direction: "inbound",
        sentiment: action === "rejected" ? "negative" : "positive",
        metadata: { source: "buyer_portal", action, propertyId },
        occurred_at: new Date().toISOString(),
      });
    } catch { /* timeline entry is best-effort */ }
  }

  // 3b) Talk-to-agent → an idempotent high-priority callback task for the owner.
  if (action === "talk_to_agent") {
    try {
      const owner = contactType === "buyer"
        ? (await db.from("buyers").select("owner_id,full_name").eq("id", contactId).maybeSingle()).data
        : (await db.from("leads").select("owner_id,full_name").eq("id", contactId).maybeSingle()).data;
      const source = `reco:callback:${contactType}:${contactId}:${propertyId}`;
      const { data: existing } = await db.from("tasks").select("id")
        .eq("org_id", orgId).eq("intelligence_source", source).in("status", ["todo", "in_progress", "blocked"]).limit(1).maybeSingle();
      if (!existing?.id) {
        const row: any = {
          org_id: orgId, property_id: propertyId, assignee_id: (owner as any)?.owner_id ?? null,
          title: `בקשת שיחה מ${(owner as any)?.full_name ?? "לקוח"} על הנכס`, status: "todo", priority: "high",
          intelligence_source: source, is_automatable: true,
        };
        if (contactType === "buyer") row.buyer_id = contactId; else row.lead_id = contactId;
        await db.from("tasks").insert(row);
      }
    } catch { /* task is best-effort */ }
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
      // Canonical viewing.requested event (entity = the contact; no meeting yet).
      try {
        const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
        await emitBusinessEvent({
          type: DOMAIN_EVENTS.viewingRequested, entityType: contactType, entityId: contactId, orgId,
          payload: { leadName: (b as any)?.full_name ?? null, propertyId },
          idempotencyKey: `viewing.requested:${contactId}:${propertyId}`,
        });
      } catch { /* best-effort */ }
    } catch { /* task is best-effort */ }
  }
  return { ok: true, reason: "ok" };
}
