/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Follow-up Engine: DEAL extension (server-only). Reuses the SAME `tasks`
// table + `intelligence_source` idempotency + reconcile pattern as the lead
// follow-up engine — NOT a second engine. Guarantees every ACTIVE (open) deal
// has a clear next action, and detects STALE deals (no recent activity) so they
// surface in the Morning Brief / ZI / manager exceptions. Never closes a deal.
// Emits canonical `deal.stale` events (deduped once/day) for the Communication
// Automation layer to decide whether/how to notify — no provider send here.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";

// Deterministic next-action title per CANONICAL deal_stage (the 8-value enum on
// `deals`). Terminal stages (won/lost) get no next action.
const DEAL_NEXT_ACTION: Record<string, string> = {
  new: "צור קשר ראשוני והתאם ציפיות",
  qualified: "קבע פגישה או הצג נכסים מתאימים",
  negotiation: "קדם את המשא ומתן — עדכן הצעה/תגובה",
  agreement: "השלם טיוטת הסכם",
  contract: "השלם חתימה על החוזה",
  closing: "השלם סגירה ותיעוד",
};
const TERMINAL_DEAL_STAGES = new Set(["won", "lost"]);

// How long an open deal may sit without activity before it is "stale".
export const DEAL_STALE_DAYS = 7;
// Default breathing room for a freshly-promoted deal's next action.
const NEXT_ACTION_DUE_DAYS = 2;

const sourceFor = (dealId: string) => `followup:deal_next_action:${dealId}`;

/**
 * Ensure ONE open next-action task exists for an active deal. Idempotent via
 * `tasks.intelligence_source = followup:deal_next_action:<dealId>` + `deal_id`.
 * No-op for terminal deals. Safe to call from a create/stage-change hook OR the
 * reconcile cron.
 */
export async function ensureDealNextAction(
  orgId: string,
  dealId: string,
  assigneeId: string | null,
  stage: string,
  db?: any,
  opts?: { refresh?: boolean },
): Promise<{ created: boolean; id: string | null }> {
  if (TERMINAL_DEAL_STAGES.has(stage)) return { created: false, id: null };
  const client: any = db ?? createServiceRoleClient();
  const source = sourceFor(dealId);
  const title = DEAL_NEXT_ACTION[stage] ?? "הפעולה הבאה בעסקה";

  const { data: existing } = await client.from("tasks").select("id, title")
    .eq("org_id", orgId).eq("deal_id", dealId).eq("intelligence_source", source)
    .in("status", ["todo", "in_progress", "blocked"]).limit(1).maybeSingle();
  if (existing?.id) {
    // Stage changed → re-evaluate the next action (update the open task's title
    // to the new stage's action). Only when asked, and only when it differs.
    if (opts?.refresh && (existing as { title?: string }).title !== title) {
      await client.from("tasks").update({ title } as never).eq("id", existing.id);
    }
    return { created: false, id: existing.id };
  }

  const dueAt = new Date(Date.now() + NEXT_ACTION_DUE_DAYS * 86_400_000).toISOString();
  const { data: ins } = await client.from("tasks").insert({
    org_id: orgId,
    deal_id: dealId,
    assignee_id: assigneeId,
    title,
    status: "todo",
    priority: "medium",
    due_at: dueAt,
    intelligence_source: source,
    is_automatable: true,
  }).select("id").maybeSingle();

  const id = (ins as { id?: string } | null)?.id ?? null;
  if (id) {
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.taskCreated, entityType: "task", entityId: id, orgId,
      metadata: { source, deal_id: dealId, stage },
    });
  }
  return { created: !!id, id };
}

/**
 * WON/LOST deal → stop follow-up automation: cancel any open auto next-action
 * task for the deal (section 15/16 "stop active follow-up"). Never deletes
 * history — the task rows remain as `cancelled`. Idempotent.
 */
export async function stopDealFollowUp(orgId: string, dealId: string, db?: any): Promise<{ cancelled: number }> {
  const client: any = db ?? createServiceRoleClient();
  const { data } = await client.from("tasks")
    .update({ status: "cancelled" } as never)
    .eq("org_id", orgId).eq("deal_id", dealId).eq("intelligence_source", sourceFor(dealId))
    .in("status", ["todo", "in_progress", "blocked"]).select("id");
  return { cancelled: ((data ?? []) as any[]).length };
}

export interface DealReconcileResult { org: string; deals: number; tasksCreated: number; stale: number }

/**
 * Reconcile one org's active deals: guarantee a next action on each, and emit a
 * deduped `deal.stale` event for any open deal untouched for ≥ DEAL_STALE_DAYS.
 * Bounded; never scans unbounded history; never mutates deal stage/status.
 */
export async function reconcileOrgDeals(orgId: string, opts?: { limit?: number }): Promise<DealReconcileResult> {
  const db: any = createServiceRoleClient();
  const { data } = await db.from("deals")
    .select("id, owner_id, stage, updated_at, value")
    .eq("org_id", orgId).eq("status", "open")
    .order("updated_at", { ascending: true }).limit(opts?.limit ?? 300);

  const deals = (data ?? []) as Array<{ id: string; owner_id: string | null; stage: string; updated_at: string | null; value: number | null }>;
  const today = new Date().toISOString().slice(0, 10);
  const staleBefore = Date.now() - DEAL_STALE_DAYS * 86_400_000;
  let tasksCreated = 0, stale = 0;

  for (const d of deals) {
    if (TERMINAL_DEAL_STAGES.has(d.stage)) continue;
    const r = await ensureDealNextAction(orgId, d.id, d.owner_id, d.stage, db);
    if (r.created) tasksCreated++;

    const touched = d.updated_at ? new Date(d.updated_at).getTime() : 0;
    if (touched && touched < staleBefore) {
      const daysStale = Math.floor((Date.now() - touched) / 86_400_000);
      const res = await emitBusinessEvent({
        type: DOMAIN_EVENTS.dealStale, entityType: "deal", entityId: d.id, orgId,
        idempotencyKey: `${DOMAIN_EVENTS.dealStale}:${d.id}:${today}`,
        metadata: { stage: d.stage, daysStale, value: d.value ?? null },
      });
      if (res.ok && !res.deduped) stale++;
    }
  }
  return { org: orgId, deals: deals.length, tasksCreated, stale };
}

/** Reconcile a bounded set of orgs' deals (cron entry point). */
export async function reconcileAllOrgsDeals(opts?: { orgLimit?: number; perOrgLimit?: number }): Promise<{ orgs: number; tasksCreated: number; stale: number; results: DealReconcileResult[] }> {
  const db: any = createServiceRoleClient();
  const { data } = await db.from("organizations").select("id").limit(opts?.orgLimit ?? 100);
  const orgIds = ((data ?? []) as any[]).map((o) => o.id).filter(Boolean);
  const results: DealReconcileResult[] = [];
  let tasksCreated = 0, stale = 0;
  for (const id of orgIds) {
    const r = await reconcileOrgDeals(id, { limit: opts?.perOrgLimit ?? 300 });
    results.push(r); tasksCreated += r.tasksCreated; stale += r.stale;
  }
  return { orgs: orgIds.length, tasksCreated, stale, results };
}
