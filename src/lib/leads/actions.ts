"use server";
// ============================================================================
// 📇 ZONO — CRM Lead creation (Command Center quick action).
// Reuses the EXISTING `leads` table + session org/owner scoping (mirrors the
// public-intake insert). No new lead model, no auto-workflows. RLS enforces
// authorization; org_id + owner_id come from the verified session.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
// A "use server" module may export ONLY async functions — the picker options
// live in ./options and are imported (never re-exported) from here.

export interface NewLeadInput {
  fullName: string;
  phone?: string | null;
  email?: string | null;
  source: string;
  intent?: string;
  area?: string | null;
  budget?: string | null;
  propertyId?: string | null;
  notes?: string | null;
}

export async function createLeadAction(input: NewLeadInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  const name = input.fullName?.trim();
  if (!name) return { ok: false, error: "יש להזין שם." };
  if (!input.phone?.trim() && !input.email?.trim()) return { ok: false, error: "יש להזין טלפון או אימייל." };

  const message = [input.notes?.trim(), input.budget?.trim() ? `תקציב: ${input.budget.trim()}` : null, input.area?.trim() ? `אזור: ${input.area.trim()}` : null]
    .filter(Boolean).join(" · ") || null;

  const db = await createClient();
  const { data, error } = await db.from("leads").insert({
    org_id: profile.org_id,
    owner_id: user.id,
    full_name: name,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    source: input.source,
    intent: input.intent || "unknown",
    stage: "new",
    message,
    property_id: input.propertyId || null,
  } as never).select("id").single();

  if (error || !data) return { ok: false, error: error?.message ?? "יצירת הליד נכשלה." };
  const leadId = (data as { id: string }).id;
  // Stage 0.5: put lead creation on the unified timeline (was previously silent).
  try {
    const { logActivityEvent } = await import("@/lib/activity/service");
    await logActivityEvent({ eventType: "lead.created", entityType: "lead", entityId: leadId, title: `ליד חדש: ${name}` });
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({ type: DOMAIN_EVENTS.leadCreated, entityType: "lead", entityId: leadId, payload: { source: input.source, intent: input.intent ?? "unknown" } });
  } catch (e) { console.error("[leads] activity log failed:", e); }
  return { ok: true, id: leadId };
}
