// ============================================================================
// ZONO — commercial state resolver (server-only). P7.4.
// ONE server function both Platform Admin and Customer 360 call, so the two
// surfaces always show the SAME canonical commercial model (per-agent, 197 ₪,
// billable agents, standard/custom, trial) — never divergent numbers. Reads only;
// no billing/provider calls. The amounts are a commercial EXPECTATION, explicitly
// flagged isExpectationOnly — NOT verified revenue.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { commercialState, type CommercialState } from "./model";

export async function getOrgCommercialState(orgId: string): Promise<CommercialState> {
  const db = createServiceRoleClient();
  const [{ count: activeUsers }, { count: pendingInvites }, planRow] = await Promise.all([
    (db.from("users" as never).select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active") as unknown as Promise<{ count: number | null }>),
    (db.from("org_invitations" as never).select("*", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "pending") as unknown as Promise<{ count: number | null }>),
    (db.from("org_plans" as never).select("status,trial_ends_at").eq("org_id", orgId).maybeSingle() as unknown as Promise<{ data: { status: string | null; trial_ends_at: string | null } | null }>),
  ]);
  const plan = (planRow as { data: { status: string | null; trial_ends_at: string | null } | null }).data;
  const isTrial = (plan?.status ?? "").toLowerCase() === "trialing"
    || (!!plan?.trial_ends_at && new Date(plan.trial_ends_at).getTime() > Date.now());
  return commercialState({
    seats: { activeUsers: activeUsers ?? 0, pendingInvites: pendingInvites ?? 0 },
    trialEndsAt: plan?.trial_ends_at ?? null,
    isTrial,
  });
}
