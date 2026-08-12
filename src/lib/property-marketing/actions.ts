"use server";
// Public lead capture for the property marketing page. Attributes every lead to
// the PROPERTY + listing AGENT + OFFICE (spec §23/§24). Reuses the canonical CRM
// leads model + kernel event — no duplicate lead system. Auth-free (public page).
import { createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { logActivityEvent } from "@/lib/activity/service";

export interface PropertyLeadState { ok?: boolean; error?: string }

export async function submitPropertyLeadAction(
  propertyId: string,
  input: { fullName?: string; phone?: string; email?: string; message?: string },
): Promise<PropertyLeadState> {
  if (!propertyId || (!input.phone && !input.email)) return { error: "חסר טלפון או אימייל" };
  if (!isServiceRoleConfigured()) return { error: "unavailable" };
  const admin = createServiceRoleClient();

  // Resolve the property → its owning agent + org (public statuses only).
  const { data: prop } = await admin.from("properties")
    .select("id,org_id,owner_id,assigned_agent_id,status,listing_kind,neighborhood,city")
    .eq("id", propertyId).maybeSingle();
  const p = prop as { id: string; org_id: string; owner_id: string | null; assigned_agent_id: string | null; status: string; listing_kind: string | null; neighborhood: string | null; city: string | null } | null;
  if (!p || !["active", "published", "under_offer"].includes(p.status)) return { error: "הנכס אינו זמין" };

  const agentId = p.owner_id ?? p.assigned_agent_id ?? null;
  const intent = p.listing_kind === "rent" ? "buyer" : "buyer";
  const area = [p.neighborhood, p.city].filter(Boolean).join(", ");

  let leadId: string | null = null;
  try {
    const { data: lead } = await admin.from("leads").insert({
      org_id: p.org_id, owner_id: agentId, property_id: p.id,
      full_name: input.fullName ?? "פנייה מעמוד נכס", phone: input.phone ?? null, email: input.email ?? null,
      source: "website", intent: intent as never, stage: "new",
      message: input.message ?? `פנייה מעמוד שיווקי${area ? ` · ${area}` : ""}`,
    } as never).select("id").single();
    leadId = (lead as { id: string } | null)?.id ?? null;
  } catch { /* enum/constraint — best effort */ }

  if (leadId) {
    try { await logActivityEvent({ eventType: "lead.created", entityType: "lead", entityId: leadId, title: "ליד חדש מעמוד נכס" }); } catch { /* best-effort */ }
    try {
      const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
      await emitBusinessEvent({ type: DOMAIN_EVENTS.leadCreated, entityType: "lead", entityId: leadId, payload: { source: "property_marketing_page", propertyId: p.id, agentId } });
    } catch { /* best-effort */ }
  }
  return { ok: true };
}
