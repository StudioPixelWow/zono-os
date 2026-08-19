"use server";
// ============================================================================
// ZONO — Manager Command Center · server ACTIONS. Manager/owner-gated office
// mutations. Reassignment reuses the CANONICAL lead-assign path (which re-derives
// org from the session, updates owner, logs the activity, ensures the first-
// response task) — this layer only adds the manager role gate + product analytics.
// No generic reassignment infrastructure, no second audit table.
// ============================================================================
import { createClient } from "@/lib/supabase/server";
import { assignLead } from "@/lib/leads/service";
import { recordUsage } from "@/lib/launch/server/services";

async function requireManager(): Promise<boolean> {
  try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); return data === true; } catch { return false; }
}

export interface ReassignResult { ok: boolean; error?: string }

/** Reassign a lead to an agent — manager/owner only. Org scope + activity log are
 *  enforced by the canonical assignLead; we add the role gate + analytics. */
export async function reassignLeadAction(leadId: string, agentId: string): Promise<ReassignResult> {
  if (!leadId || !agentId) return { ok: false, error: "חסר ליד או סוכן." };
  if (!(await requireManager())) return { ok: false, error: "נדרשת הרשאת מנהל/בעלים." };
  const r = await assignLead(leadId, agentId);
  if (!r.ok) return { ok: false, error: r.error ?? "השיוך נכשל." };
  await recordUsage({ category: "workflow", name: "manager_assignment_changed", props: { entity: "lead" } });
  return { ok: true };
}

/** Product analytics for opening an exception (no surveillance data). */
export async function recordManagerExceptionOpenedAction(type: string): Promise<void> {
  await recordUsage({ category: "feature", name: "manager_exception_opened", props: { type } });
}

/** Product analytics for opening the marketing review from the office center. */
export async function recordManagerMarketingReviewOpenedAction(): Promise<void> {
  await recordUsage({ category: "feature", name: "manager_marketing_review_opened" });
}
