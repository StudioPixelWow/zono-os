/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Follow-up Engine: automation (server-only). Idempotent, org-safe,
// retry-safe. Creates the MISSING safe follow-up task for deterministic
// situations (new lead, completed meeting, hot lead with no next action) using
// the EXISTING `tasks` table, keyed by `tasks.intelligence_source` so a repeat
// (cron re-run OR an event hook firing after the cron) never duplicates. Emits
// the canonical follow-up business events (deduped once/day) for the future
// communication layer to consume — no provider send is wired here.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { emitBusinessEvent } from "@/lib/kernel/emit";
import { DOMAIN_EVENTS } from "@/lib/kernel/events";
import { getFollowUpPolicy, loadStatesWithClient } from "./service";
import { runIsolated } from "./isolate";
import { type AutoTaskKind, type FollowUpState } from "./state";

function autoTaskSpec(kind: AutoTaskKind, orgId: string): { title: string; dueAt: string | null } {
  const now = Date.now();
  const policy = getFollowUpPolicy(orgId);
  switch (kind) {
    case "new_lead": return { title: "חזרה לליד חדש", dueAt: new Date(now + policy.firstResponseMinutes * 60_000).toISOString() };
    case "post_meeting": return { title: "חזרה לאחר הפגישה", dueAt: new Date(now + policy.postMeetingFollowUpHours * 3_600_000).toISOString() };
    case "hot_no_action": return { title: "פעולה הבאה לליד חם", dueAt: new Date(now + 2 * 3_600_000).toISOString() };
    default: return { title: "פולואפ", dueAt: null };
  }
}

/**
 * Ensure ONE open follow-up task of `kind` exists for a lead. Idempotent via
 * `tasks.intelligence_source = followup:<kind>:<leadId>`: if an open one already
 * exists, no-op. Safe to call from a cron OR an event hook.
 */
export async function ensureFollowUpTask(
  db: any,
  args: { orgId: string; leadId: string; assigneeId: string | null; kind: AutoTaskKind; title?: string; dueAt?: string | null },
): Promise<{ created: boolean; id: string | null }> {
  const source = `followup:${args.kind}:${args.leadId}`;
  const { data: existing } = await db.from("tasks").select("id")
    .eq("org_id", args.orgId).eq("lead_id", args.leadId).eq("intelligence_source", source)
    .in("status", ["todo", "in_progress", "blocked"]).limit(1).maybeSingle();
  if (existing?.id) return { created: false, id: existing.id };

  const spec = autoTaskSpec(args.kind, args.orgId);
  const { data: ins } = await db.from("tasks").insert({
    org_id: args.orgId,
    lead_id: args.leadId,
    assignee_id: args.assigneeId,
    title: args.title ?? spec.title,
    status: "todo",
    priority: "medium",
    due_at: args.dueAt ?? spec.dueAt,
    intelligence_source: source,
    is_automatable: true,
  }).select("id").maybeSingle();

  const id = (ins as { id?: string } | null)?.id ?? null;
  if (id) {
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.taskCreated, entityType: "task", entityId: id, orgId: args.orgId,
      metadata: { source, followup_kind: args.kind, lead_id: args.leadId },
    });
  }
  return { created: !!id, id };
}

export interface ReconcileResult { org: string; leads: number; tasksCreated: number; events: number }

/**
 * Reconcile one org's follow-up state: create any missing safe tasks and emit
 * the canonical follow-up events (deduped once/day per lead+event). Idempotent
 * and bounded. Never scans unbounded history.
 */
export async function reconcileOrgFollowUps(orgId: string, opts?: { limit?: number }): Promise<ReconcileResult> {
  const db: any = createServiceRoleClient();
  const states: FollowUpState[] = await loadStatesWithClient(db, orgId, { activeOnly: true, limit: opts?.limit ?? 300 });
  const today = new Date().toISOString().slice(0, 10);
  let tasksCreated = 0, events = 0;

  for (const st of states) {
    if (st.needsAutoTask) {
      const r = await ensureFollowUpTask(db, { orgId, leadId: st.leadId, assigneeId: st.assignedUserId, kind: st.needsAutoTask });
      if (r.created) tasksCreated++;
    }
    if (st.event) {
      const res = await emitBusinessEvent({
        type: st.event as any, entityType: "lead", entityId: st.leadId, orgId,
        idempotencyKey: `${st.event}:${st.leadId}:${today}`,
        metadata: { state: st.state, escalation: st.escalationLevel, urgency: st.urgency },
      });
      if (res.ok && !res.deduped) events++;
    }
  }
  return { org: orgId, leads: states.length, tasksCreated, events };
}

/** Reconcile a bounded set of orgs (cron entry point). A single org's failure is
 *  isolated (logged + counted) so it never aborts the whole run and starves the
 *  remaining tenants — deterministic order keeps the scan stable across runs. */
export async function reconcileAllOrgs(opts?: { orgLimit?: number; perOrgLimit?: number }): Promise<{ orgs: number; tasksCreated: number; events: number; failed: number; results: ReconcileResult[] }> {
  const db: any = createServiceRoleClient();
  const { data } = await db.from("organizations").select("id").order("id", { ascending: true }).limit(opts?.orgLimit ?? 100);
  const orgIds = ((data ?? []) as any[]).map((o) => o.id).filter(Boolean);
  const { results, failed } = await runIsolated(
    orgIds,
    (id: string) => reconcileOrgFollowUps(id, { limit: opts?.perOrgLimit ?? 300 }),
    (id, err) => console.error(`[followup-reconcile] org ${id} failed:`, err instanceof Error ? err.message : err),
  );
  let tasksCreated = 0, events = 0;
  for (const r of results) { tasksCreated += r.tasksCreated; events += r.events; }
  return { orgs: orgIds.length, tasksCreated, events, failed, results };
}

// ── Event-driven hooks (exposed for the assign / meeting-complete flows to call
// directly for instant creation; the reconcile cron is the safety net). ───────

/** New lead assigned → ensure a first-response follow-up. Idempotent. */
export async function onLeadAssignedEnsureFollowUp(orgId: string, leadId: string, assigneeId: string | null): Promise<void> {
  const db: any = createServiceRoleClient();
  await ensureFollowUpTask(db, { orgId, leadId, assigneeId, kind: "new_lead" });
}

/** Meeting completed with no follow-up → ensure a post-meeting follow-up. Idempotent. */
export async function onMeetingCompletedEnsureFollowUp(orgId: string, leadId: string, assigneeId: string | null): Promise<void> {
  const db: any = createServiceRoleClient();
  await ensureFollowUpTask(db, { orgId, leadId, assigneeId, kind: "post_meeting" });
}
