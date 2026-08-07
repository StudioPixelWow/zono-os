"use server";
// ============================================================================
// ZONO — Property Contact CTA: click tracking (server action).
// ----------------------------------------------------------------------------
// Records an audit/analytics event on every CTA click via the existing activity
// event system, which stamps org_id + actor_user_id + occurred_at from the
// session. The WhatsApp message BODY is intentionally NOT stored.
// NOTE: a "use server" module may export ONLY async functions (CI: check:use-server).
// ============================================================================
import { logActivityEvent } from "@/lib/activity/service";

export async function trackPropertyContactClick(input: {
  propertyId: string;
  contactType: "owner" | "broker";
  action: "whatsapp" | "call";
}): Promise<{ ok: boolean }> {
  await logActivityEvent({
    eventType: "property.contact_clicked",
    entityType: "property",
    entityId: input.propertyId,
    title: input.action === "whatsapp" ? "פנייה ב-WhatsApp מדף הנכס" : "חיוג מדף הנכס",
    channel: input.action, // whatsapp | call
    direction: "outbound",
    metadata: { contact_type: input.contactType, action: input.action },
  });
  return { ok: true };
}
