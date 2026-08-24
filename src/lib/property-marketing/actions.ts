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

  // Resolve the property → its owning agent + office member + org (public only).
  const { data: prop } = await admin.from("properties" as never)
    .select("id,org_id,owner_id,assigned_agent_id,office_member_id,status,listing_kind,neighborhood,city")
    .eq("id", propertyId).maybeSingle();
  const p = prop as { id: string; org_id: string; owner_id: string | null; assigned_agent_id: string | null; office_member_id: string | null; status: string; listing_kind: string | null; neighborhood: string | null; city: string | null } | null;
  if (!p || !["active", "published", "under_offer"].includes(p.status)) return { error: "הנכס אינו זמין" };

  const agentId = p.owner_id ?? p.assigned_agent_id ?? null;
  const intent = p.listing_kind === "rent" ? "renter" : "buyer";
  const area = [p.neighborhood, p.city].filter(Boolean).join(", ");
  const { recordLeadIntakeFailure, emitLeadCreatedObserved, LEAD_INTAKE_RETRY } = await import("@/lib/lead-intake/observability");

  // Duplicate-submit protection (double-tap / refresh / network retry): same org +
  // property + contact within a short window is the SAME submission — return success,
  // write nothing, no duplicate CRM lead. Reuses the canonical leads table (no new
  // dedupe table). Best-effort — never blocks a real submission.
  const contact = (input.phone ?? input.email ?? "").trim();
  if (contact) {
    try {
      const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const col = input.phone ? "phone" : "email";
      const { data: dup } = await admin.from("leads" as never).select("id")
        .eq("org_id", p.org_id).eq("property_id", p.id).eq(col, contact).gte("created_at", since).limit(1);
      if (Array.isArray(dup) && dup.length > 0) return { ok: true };
    } catch { /* dedupe is best-effort */ }
  }

  let leadId: string | null = null; let crmError: unknown = null;
  try {
    // Preserve BOTH attributions: office_member_id (the office board's source of
    // truth — carries the responsible roster agent, incl. non-auth members) AND
    // owner_id (canonical auth ownership when the listing has one).
    const { data: lead, error } = await admin.from("leads").insert({
      org_id: p.org_id, owner_id: agentId, office_member_id: p.office_member_id ?? null, property_id: p.id,
      full_name: input.fullName ?? "פנייה מעמוד נכס", phone: input.phone ?? null, email: input.email ?? null,
      source: "website", intent: intent as never, stage: "new",
      message: input.message ?? `פנייה מעמוד שיווקי${area ? ` · ${area}` : ""}`,
    } as never).select("id").maybeSingle();
    if (error) crmError = error; else leadId = (lead as { id: string } | null)?.id ?? null;
  } catch (e) { crmError = e; }
  if (!leadId && !crmError) crmError = new Error("no lead id returned");

  // CANONICAL CONTRACT: no fake success. CRM insert failed → honest retryable failure,
  // audited, and NO lead.created event.
  if (!leadId) {
    await recordLeadIntakeFailure({ orgId: p.org_id, source: "property_marketing_page", sourceSection: null, stage: "crm_write", retryable: true, error: crmError, primaryWriteOk: false, eventEmitted: false });
    return { error: LEAD_INTAKE_RETRY };
  }
  try { await logActivityEvent({ eventType: "lead.created", entityType: "lead", entityId: leadId, title: "ליד חדש מעמוד נכס" }); } catch { /* best-effort */ }
  await emitLeadCreatedObserved({ orgId: p.org_id, leadId, source: "property_marketing_page", payload: { propertyId: p.id, agentId, intent } });
  return { ok: true };
}
