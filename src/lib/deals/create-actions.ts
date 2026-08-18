"use server";
// ============================================================================
// 💼 ZONO — Deal creation (Command Center quick action + Lead → Deal).
// Inserts a real, OPEN deal into the EXISTING canonical `deals` table with the
// session org/owner scope. No new deal engine, no fake revenue (value/commission
// only when the user enters them), no automatic stage advancement. RLS enforces
// authorization. Participants (buyer/seller/property/lead) are linked, never
// fabricated. Duplicate protection: an OPEN deal already linked to the same lead
// (or the same buyer+property pair) is REUSED instead of creating a second one —
// double-click / repeat-conversion safe without a new DB constraint.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { DEAL_TO_PROFILE_STAGE } from "./service";
// A "use server" module may export ONLY async functions — the picker options
// live in ./options and are imported (never re-exported) from here.
import { DEAL_STAGE_OPTIONS } from "./options";

export interface NewDealInput {
  title?: string | null;
  propertyId?: string | null;
  buyerId?: string | null;
  sellerId?: string | null;
  leadId?: string | null;       // origin lead — preserves the customer journey
  stage: string;                 // deal_stage
  value?: number | null;
  commission?: number | null;
  expectedClose?: string | null; // ISO date
  notes?: string | null;
}

/**
 * Find an existing OPEN deal that a new creation would duplicate. Truthful,
 * minimal idempotency using existing columns (no new constraint):
 *  - same origin lead, OR
 *  - same buyer + property pair (when both are known).
 * Returns the existing deal id or null.
 */
async function findDuplicateOpenDeal(
  db: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  input: { leadId?: string | null; buyerId?: string | null; propertyId?: string | null },
): Promise<string | null> {
  if (input.leadId) {
    const { data } = await db.from("deals").select("id")
      .eq("org_id", orgId).eq("lead_id", input.leadId).eq("status", "open")
      .limit(1).maybeSingle();
    if ((data as { id?: string } | null)?.id) return (data as { id: string }).id;
  }
  if (input.buyerId && input.propertyId) {
    const { data } = await db.from("deals").select("id")
      .eq("org_id", orgId).eq("buyer_id", input.buyerId).eq("property_id", input.propertyId).eq("status", "open")
      .limit(1).maybeSingle();
    if ((data as { id?: string } | null)?.id) return (data as { id: string }).id;
  }
  return null;
}

export async function createDealAction(input: NewDealInput): Promise<{ ok: boolean; id?: string; error?: string; reused?: boolean }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };

  const title = input.title?.trim() || "עסקה חדשה";
  const stage = DEAL_STAGE_OPTIONS.includes(input.stage as never) ? input.stage : "new";
  const value = typeof input.value === "number" && input.value >= 0 ? Math.round(input.value) : null;
  const commission = typeof input.commission === "number" && input.commission >= 0 ? Math.round(input.commission) : null;

  const db = await createClient();

  // Duplicate protection — reuse an existing open deal rather than double-create.
  const dup = await findDuplicateOpenDeal(db, profile.org_id, input);
  if (dup) return { ok: true, id: dup, reused: true };

  const { data, error } = await db.from("deals").insert({
    org_id: profile.org_id,
    owner_id: user.id,
    title,
    type: "sale",
    stage,
    status: "open",             // never auto-won/lost
    value,
    commission_amount: commission,
    buyer_id: input.buyerId || null,
    seller_id: input.sellerId || null,
    property_id: input.propertyId || null,
    lead_id: input.leadId || null,   // keep the deal traceable back to its lead
    expected_close_date: input.expectedClose || null,
  } as never).select("id").single();

  if (error || !data) return { ok: false, error: error?.message ?? "יצירת העסקה נכשלה." };
  const dealId = (data as { id: string }).id;

  // Stage 0.1: initialize the 1:1 projection so the deal appears in Deals OS
  // immediately (unique index on deal_id makes this idempotent on retries).
  try {
    await db.from("deal_profiles").insert({
      organization_id: profile.org_id,
      deal_id: dealId,
      buyer_id: input.buyerId || null,
      seller_id: input.sellerId || null,
      property_id: input.propertyId || null,
      assigned_agent_id: user.id,
      deal_stage: DEAL_TO_PROFILE_STAGE[stage] ?? "new_opportunity",
      deal_value: value ?? 0,
      commission_value: commission ?? 0,
      deal_probability: 0,
      status: "active",
    } as never);
  } catch { /* projection is best-effort; getDealsBoard reconciles as a fallback */ }

  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({ type: DOMAIN_EVENTS.dealCreated, entityType: "deal", entityId: dealId, payload: { stage, propertyId: input.propertyId ?? null, buyerId: input.buyerId ?? null, leadId: input.leadId ?? null } });
  } catch (e) { console.error("[deals] emit failed:", e); }

  // Stage 0.2: give the brand-new deal its first next-action task immediately
  // (reuses the follow-up primitive; the reconcile cron is the safety net).
  try {
    const { ensureDealNextAction } = await import("@/lib/follow-up/deal-automation");
    await ensureDealNextAction(profile.org_id, dealId, user.id, stage);
  } catch (e) { console.error("[deals] next-action ensure failed:", e); }

  return { ok: true, id: dealId };
}

/**
 * LEAD → DEAL. The explicit, user-triggered point where a lead becomes a deal.
 * Never automatic. Carries over the lead's property + converted buyer/seller so
 * the deal keeps full context, and marks the lead `converted` so lead follow-up
 * hands off cleanly to deal follow-up (history is preserved — the lead row and
 * `deals.lead_id` remain). Idempotent via the open-deal duplicate check.
 */
export async function openDealFromLeadAction(leadId: string): Promise<{ ok: boolean; id?: string; error?: string; reused?: boolean }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  if (!leadId) return { ok: false, error: "חסר מזהה ליד." };

  const db = await createClient();
  const { data: lead, error } = await db.from("leads")
    .select("id, full_name, stage, property_id, converted_buyer_id, converted_seller_id, owner_id")
    .eq("id", leadId).maybeSingle();          // RLS scopes to the caller's org
  if (error || !lead) return { ok: false, error: "הליד לא נמצא." };

  const l = lead as {
    id: string; full_name: string | null; stage: string;
    property_id: string | null; converted_buyer_id: string | null;
    converted_seller_id: string | null; owner_id: string | null;
  };
  if (l.stage === "lost" || l.stage === "disqualified") {
    return { ok: false, error: "לא ניתן לפתוח עסקה מליד שנסגר." };
  }

  const res = await createDealAction({
    title: l.full_name ? `עסקה — ${l.full_name}` : "עסקה חדשה",
    leadId: l.id,
    propertyId: l.property_id,
    buyerId: l.converted_buyer_id,
    sellerId: l.converted_seller_id,
    stage: "new",
  });
  if (!res.ok) return res;

  // Hand off: the lead is now an active deal — move it to `converted` so lead
  // follow-up stops nagging and deal follow-up takes over. Best-effort; the deal
  // already exists and links back, so history/traceability never depend on this.
  if (l.stage !== "converted") {
    try { await db.from("leads").update({ stage: "converted", last_activity_at: new Date().toISOString() } as never).eq("id", l.id); }
    catch (e) { console.error("[deals] lead handoff stage update failed:", e); }
  }
  return res;
}
