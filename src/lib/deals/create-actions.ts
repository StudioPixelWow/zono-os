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

/** Valid deal_stage enum values (Hebrew labels in UI). */
export const DEAL_STAGE_OPTIONS = ["new", "qualified", "negotiation", "agreement", "contract", "closing"] as const;

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
  return { ok: true, id: (data as { id: string }).id };
}
