/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Marketing Autopilot 2.0 · EXECUTION ORCHESTRATOR (server-only). ONE
// service that turns an APPROVED plan into real actions by DISPATCHING each item
// to its canonical engine — it implements NO channel itself:
//   facebook_publish / group_expansion → activateFacebookCampaignAction (Distribution)
//   buyer_bundle                        → sendPropertyMatchesForOrg (consent-gated transport)
//   interest_followup                   → a follow-up task in the canonical tasks table
//   creative_refresh                    → handled in Creative Studio (never an external send)
// Idempotent on (planId,itemId): the DB status CLAIM prevents concurrent/double-
// click activation; per-item completion guards + engine-level dedup prevent a
// second post/message/task on retry. Partial failure NEVER rolls back succeeded
// actions — the plan settles to partially_completed and only failed items retry.
// ============================================================================
import "server-only";
import { activateFacebookCampaignAction } from "@/lib/facebook-groups/activate";
import { sendPropertyMatchesForOrg } from "@/lib/customer-comm/match-bundle";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { getPlanById, claimForActivation, finishActivation, serviceDb, type MarketingPlanRow } from "./plan-repo";
import {
  rollupPlanStatus, isExecutableItem, execIdentity,
  type MarketingPlanSnapshot, type PlanItem, type PlanStatus,
} from "./plan-core";

export interface ActivateOutcome {
  ok: boolean;
  status: PlanStatus;
  snapshot: MarketingPlanSnapshot | null;
  ranItems: number;
  reason?: string;
}

const DONE_ITEM = new Set(["completed", "scheduled"]);

/** Create (idempotently) a single follow-up task for the interested customers. */
async function ensureFollowupTask(db: any, args: { orgId: string; propertyId: string; planId: string; itemId: string; assigneeId: string | null; count: number }): Promise<string | null> {
  const source = `marketing-plan:followup:${args.planId}:${args.itemId}`;
  const { data: existing } = await db.from("tasks").select("id")
    .eq("org_id", args.orgId).eq("intelligence_source", source).limit(1).maybeSingle();
  if (existing?.id) return existing.id as string;
  const due = new Date(Date.now() + 2 * 86_400_000).toISOString();
  const { data } = await db.from("tasks").insert({
    org_id: args.orgId, property_id: args.propertyId, assignee_id: args.assigneeId,
    title: `טיפול ב-${args.count} מתעניינים בנכס`, description: "מתעניינים שסימנו עניין וטרם נקבע להם ביקור — צרו קשר לקידום לביקור.",
    status: "todo", priority: "medium", due_at: due, intelligence_source: source, is_automatable: true,
  }).select("id").maybeSingle();
  return (data?.id as string) ?? null;
}

/** Execute a single item through its canonical engine. Pure-ish: returns the new
 *  item (with execution result); never throws (errors become failed executions). */
async function executeItem(db: any, orgId: string, snapshot: MarketingPlanSnapshot, it: PlanItem): Promise<PlanItem> {
  const at = new Date().toISOString();
  // Idempotency: already-succeeded items are never re-run.
  if (it.execution && DONE_ITEM.has(it.execution.status)) return it;
  if (!isExecutableItem(it)) return { ...it, status: it.type === "creative_refresh" ? "skipped" : it.status };

  try {
    if (it.type === "facebook_publish" || it.type === "group_expansion") {
      const fb = it.facebook!;
      // Guard: a campaign already created for this item is not created again.
      if (it.execution?.campaignId) return { ...it, status: "scheduled" };
      const r = await activateFacebookCampaignAction({
        propertyId: snapshot.propertyId, propertyTitle: snapshot.propertyTitle,
        groupIds: fb.groupIds, frequency: fb.frequency as any, startDate: fb.startDate,
        media: fb.media as any, postText: fb.caption,
      });
      if (r.ok) return { ...it, status: "scheduled", execution: { status: "scheduled", campaignId: r.campaignId, postsCreated: r.created, at } };
      return { ...it, status: "failed", execution: { status: "failed", error: r.error, at } };
    }

    if (it.type === "buyer_bundle") {
      const res = await sendPropertyMatchesForOrg(orgId, snapshot.propertyId, { recipientIds: it.buyer?.recipientIds ?? [], db });
      return { ...it, status: "completed", execution: { status: "completed", recipientsSent: res.sent, at } };
    }

    if (it.type === "interest_followup") {
      const { data: prop } = await db.from("properties").select("assigned_agent_id,owner_id").eq("id", snapshot.propertyId).eq("org_id", orgId).maybeSingle();
      const assignee = (prop?.assigned_agent_id as string) ?? (prop?.owner_id as string) ?? null;
      const taskId = await ensureFollowupTask(db, { orgId, propertyId: snapshot.propertyId, planId: snapshot.planId, itemId: it.itemId, assigneeId: assignee, count: it.followup?.count ?? 0 });
      return { ...it, status: "completed", execution: { status: "completed", taskId, at } };
    }
  } catch (e) {
    return { ...it, status: "failed", execution: { status: "failed", error: e instanceof Error ? e.message : "execution_failed", at } };
  }
  return it;
}

/** Activate (or RETRY) an approved / partially-completed plan. Claims the plan via a
 *  conditional status flip so a double-click / concurrent call no-ops. Reuses each
 *  canonical engine. Emits plan lifecycle events (idempotent). */
export async function activateMarketingPlan(orgId: string, planId: string, opts: { actorUserId: string | null; db?: any }): Promise<ActivateOutcome> {
  const db: any = opts.db ?? serviceDb();
  const before = await getPlanById(db, orgId, planId);
  if (!before) return { ok: false, status: "draft", snapshot: null, ranItems: 0, reason: "not_found" };

  // CLAIM: approved|partially_completed → activating. Null ⇒ someone else owns the
  // run (double-click / concurrent) or it isn't runnable → return current state.
  const claimed = await claimForActivation(db, orgId, planId);
  if (!claimed) {
    const now = await getPlanById(db, orgId, planId);
    return { ok: now?.status === "active" || now?.status === "completed" || now?.status === "partially_completed", status: (now?.status ?? before.status) as PlanStatus, snapshot: now?.plan_json ?? before.plan_json, ranItems: 0, reason: "already_running_or_not_runnable" };
  }

  const snapshot: MarketingPlanSnapshot = { ...(claimed.plan_json as MarketingPlanSnapshot), planId };
  let ranItems = 0;
  const items: PlanItem[] = [];
  for (const it of snapshot.items) {
    const already = it.execution && DONE_ITEM.has(it.execution.status);
    if (already || !isExecutableItem(it)) { items.push(it.type === "creative_refresh" && it.status !== "blocked" ? { ...it, status: "skipped" } : it); continue; }
    const next = await executeItem(db, orgId, snapshot, it);
    if (next.execution?.at) ranItems++;
    items.push(next);
  }
  snapshot.items = items;
  snapshot.audit = { ...snapshot.audit, activatedBy: opts.actorUserId, activatedAt: new Date().toISOString() };

  const status = rollupPlanStatus(items);
  await finishActivation(db, orgId, planId, { status, snapshot });

  // ── Events (idempotent) ───────────────────────────────────────────────────
  await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanActivated, entityType: "property", entityId: snapshot.propertyId, orgId, actorUserId: opts.actorUserId, idempotencyKey: `marketing.plan_activated:${planId}`, payload: { planId, status } });
  if (status === "partially_completed" || status === "failed") {
    const failed = items.filter((i) => (i.execution?.status ?? i.status) === "failed").map((i) => execIdentity(planId, i.itemId));
    await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanPartialFailure, entityType: "property", entityId: snapshot.propertyId, orgId, actorUserId: opts.actorUserId, idempotencyKey: `marketing.plan_partial_failure:${planId}:${failed.length}`, payload: { planId, failed } });
  } else if (status === "completed") {
    await emitBusinessEvent({ type: DOMAIN_EVENTS.marketingPlanCompleted, entityType: "property", entityId: snapshot.propertyId, orgId, actorUserId: opts.actorUserId, idempotencyKey: `marketing.plan_completed:${planId}`, payload: { planId } });
  }

  return { ok: true, status, snapshot, ranItems };
}

/** Retry a partially-failed plan (re-runs ONLY the not-yet-succeeded items). */
export async function retryMarketingPlan(orgId: string, planId: string, opts: { actorUserId: string | null; db?: any }): Promise<ActivateOutcome> {
  return activateMarketingPlan(orgId, planId, opts);
}

export type { MarketingPlanRow };
