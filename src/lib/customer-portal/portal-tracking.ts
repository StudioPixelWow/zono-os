// ============================================================================
// ZONO — Buyer PORTAL property-view tracking (server-only). When a buyer opens a
// property FROM their personal portal, record a real, honest view signal — linked
// to buyer + property + portal + org + timestamp — throttled so refreshes don't
// spam. This is distinct from the coarse portal-open event: it's per-property.
// Never leaks CRM data; only records what the product needs.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

type SupabaseLike = ReturnType<typeof createServiceRoleClient>;
const VIEW_THROTTLE_MS = 30 * 60_000; // one recorded view per buyer+property / 30 min

/**
 * Record a portal property-view. Verifies the property is actually in this buyer's
 * portal set (shortlist or match) — a token cannot forge views on arbitrary
 * properties. Throttled; best-effort; mirrors shortlist 'selected|sent' → 'viewed'
 * without ever downgrading a stronger buyer action.
 */
export async function recordPortalPropertyView(orgId: string, buyerId: string, propertyId: string, db?: SupabaseLike): Promise<boolean> {
  // buyer_property_shortlist is newer than the generated types — use an untyped client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = db ?? createServiceRoleClient();
  try {
    // Membership guard — the property must belong to this buyer's portal universe.
    const [{ data: onShortlist }, { data: onMatch }] = await Promise.all([
      client.from("buyer_property_shortlist").select("property_id").eq("org_id", orgId).eq("buyer_id", buyerId).eq("property_id", propertyId).maybeSingle(),
      client.from("match_intelligence_profiles").select("property_id").eq("org_id", orgId).eq("buyer_id", buyerId).eq("property_id", propertyId).maybeSingle(),
    ]);
    if (!onShortlist && !onMatch) return false;

    // Throttle — skip if we already recorded a view for this pair recently.
    const since = new Date(Date.now() - VIEW_THROTTLE_MS).toISOString();
    const { data: recent } = await client.from("activity_events").select("id")
      .eq("org_id", orgId).eq("entity_id", buyerId).eq("related_entity_id", propertyId)
      .eq("event_type", "buyer.property_viewed").gte("occurred_at", since).limit(1).maybeSingle();
    if (recent?.id) return false;

    await client.from("activity_events").insert({
      org_id: orgId, actor_user_id: null, actor_type: "system", event_type: "buyer.property_viewed",
      entity_type: "buyer", entity_id: buyerId, related_entity_type: "property", related_entity_id: propertyId,
      title: "הקונה צפה בנכס מהבחירה", channel: "portal", direction: "inbound",
      metadata: { source: "buyer_portal", propertyId }, occurred_at: new Date().toISOString(),
    } as never);

    // Canonical property.viewed telemetry event (buyer + property + portal + org).
    try {
      const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
      await emitBusinessEvent({
        type: DOMAIN_EVENTS.propertyViewed, entityType: "property", entityId: propertyId, orgId,
        actorUserId: null, payload: { buyerId, source: "portal" },
      });
    } catch { /* telemetry is best-effort */ }

    // Mirror shortlist state → 'viewed', but only from a WEAKER state (never
    // downgrade liked / rejected / visit_requested).
    try {
      await client.from("buyer_property_shortlist")
        .update({ state: "viewed", updated_at: new Date().toISOString() } as never)
        .eq("org_id", orgId).eq("buyer_id", buyerId).eq("property_id", propertyId)
        .in("state", ["selected", "sent"] as never);
    } catch { /* mirror is best-effort */ }
    return true;
  } catch {
    return false;
  }
}
