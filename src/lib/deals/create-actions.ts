"use server";
// ============================================================================
// 💼 ZONO — Deal creation (Command Center quick action).
// Inserts a real, OPEN deal into the EXISTING canonical `deals` table with the
// session org/owner scope. No new deal engine, no fake revenue (value/commission
// only when the user enters them), no automatic stage advancement. RLS enforces
// authorization. Participants (buyer/seller/property) are linked, never fabricated.
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
  stage: string;                 // deal_stage
  value?: number | null;
  commission?: number | null;
  expectedClose?: string | null; // ISO date
  notes?: string | null;
}

export async function createDealAction(input: NewDealInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };

  const title = input.title?.trim() || "עסקה חדשה";
  const stage = DEAL_STAGE_OPTIONS.includes(input.stage as never) ? input.stage : "new";
  const value = typeof input.value === "number" && input.value >= 0 ? Math.round(input.value) : null;
  const commission = typeof input.commission === "number" && input.commission >= 0 ? Math.round(input.commission) : null;

  const db = await createClient();
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
    await emitBusinessEvent({ type: DOMAIN_EVENTS.dealCreated, entityType: "deal", entityId: dealId, payload: { stage, propertyId: input.propertyId ?? null, buyerId: input.buyerId ?? null } });
  } catch (e) { console.error("[deals] emit failed:", e); }

  return { ok: true, id: dealId };
}
