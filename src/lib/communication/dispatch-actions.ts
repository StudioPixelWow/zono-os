// ============================================================================
// ZONO — Delivery recovery (server action). Manager/admin-only manual retry of a
// terminally-FAILED external notification delivery. Re-queues through the EXISTING
// dispatcher (no new mechanism). Org scope is re-derived server-side and enforced
// in the DB write, so a browser can never re-queue another tenant's delivery.
// ============================================================================
"use server";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { requeueFailedDelivery } from "./dispatch";

export async function retryFailedDeliveryAction(deliveryId: string): Promise<{ ok: boolean; error?: string }> {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id || !sc.user) return { ok: false, error: "unauthorized" };
  const db = await createClient();
  const { data } = await db.rpc("has_min_role", { p_min: "manager" });
  if (data !== true) return { ok: false, error: "unauthorized" }; // fail closed
  if (typeof deliveryId !== "string" || !deliveryId) return { ok: false, error: "bad_request" };

  const ok = await requeueFailedDelivery(sc.profile.org_id, deliveryId);
  return ok ? { ok: true } : { ok: false, error: "not_retryable" };
}
