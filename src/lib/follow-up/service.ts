/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Follow-up Engine: server selectors (server-only). ONE authoritative,
// bounded, role-aware source of follow-up state for a lead and for the office.
// Reuses the canonical `leads` + `tasks` (tasks.lead_id) + `meetings` tables —
// no duplicate CRM, no new task system. Batched: open tasks and meetings for a
// whole page of leads are fetched in ONE query each (no N+1). Deterministic
// scoring lives in the pure model (state.ts). Uses an `any`-typed client (the
// repo's proven pattern for enum/typed-column safety) with EXPLICIT org scoping
// so tenant isolation never depends on client typing.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { DEFAULT_FOLLOW_UP_POLICY, type FollowUpPolicy } from "./policy";
import { computeFollowUpState, type FollowUpState, type FollowUpTaskSignal } from "./state";

const OPEN_LEAD_STAGES = ["new", "contacted", "qualified", "nurturing"];
const OPEN_TASK_STATUSES = ["todo", "in_progress", "blocked"];

/**
 * The office's follow-up policy. Sane defaults today; an org-level override can
 * be layered here later without touching the model or the callers.
 */
export function getFollowUpPolicy(_orgId: string): FollowUpPolicy {
  return DEFAULT_FOLLOW_UP_POLICY;
}

export interface LoadStatesOpts {
  /** Restrict to specific leads (detail view). Skips the active-only filter. */
  leadIds?: string[];
  /** Restrict to a single agent's leads (agent scope). */
  ownerId?: string | null;
  /** Only active (non-terminal) leads. Ignored when leadIds is set. */
  activeOnly?: boolean;
  limit?: number;
}

/**
 * Core batched loader. Given a client + org, load the leads in scope and, in one
 * query each, their open tasks and meetings; then derive each follow-up state.
 * `db` is any-typed on purpose (see file header).
 */
export async function loadStatesWithClient(db: any, orgId: string, opts: LoadStatesOpts = {}): Promise<FollowUpState[]> {
  const policy = getFollowUpPolicy(orgId);
  const limit = opts.limit ?? 200;

  let lq = db.from("leads")
    .select("id,full_name,source,stage,score,owner_id,last_activity_at,created_at")
    .eq("org_id", orgId);
  if (opts.leadIds && opts.leadIds.length) lq = lq.in("id", opts.leadIds);
  else if (opts.activeOnly !== false) lq = lq.in("stage", OPEN_LEAD_STAGES);
  if (opts.ownerId) lq = lq.eq("owner_id", opts.ownerId);
  lq = lq.order("last_activity_at", { ascending: true, nullsFirst: true }).limit(limit);

  const { data: leadRows } = await lq;
  const leads = (leadRows ?? []) as any[];
  const ids = leads.map((l) => l.id).filter(Boolean);
  if (!ids.length) return [];

  const [{ data: taskRows }, { data: meetRows }] = await Promise.all([
    db.from("tasks").select("id,title,due_at,lead_id,status")
      .eq("org_id", orgId).in("lead_id", ids).in("status", OPEN_TASK_STATUSES),
    db.from("meetings").select("id,lead_id,start_at,completed_at,follow_up_task_id")
      .eq("org_id", orgId).in("lead_id", ids),
  ]);

  const tasksByLead = new Map<string, FollowUpTaskSignal[]>();
  for (const t of (taskRows ?? []) as any[]) {
    if (!t.lead_id) continue;
    const arr = tasksByLead.get(t.lead_id) ?? [];
    arr.push({ id: t.id, title: (t.title as string) ?? "משימה", dueAt: t.due_at ?? null });
    tasksByLead.set(t.lead_id, arr);
  }
  const meetByLead = new Map<string, any[]>();
  for (const m of (meetRows ?? []) as any[]) {
    if (!m.lead_id) continue;
    const arr = meetByLead.get(m.lead_id) ?? [];
    arr.push(m);
    meetByLead.set(m.lead_id, arr);
  }

  const now = Date.now();
  return leads.map((l) => {
    const openTasks = tasksByLead.get(l.id) ?? [];
    const ms = meetByLead.get(l.id) ?? [];
    const upcoming = ms
      .map((m) => m.start_at as string | null)
      .filter((s): s is string => !!s && new Date(s).getTime() > now)
      .sort()[0] ?? null;
    const completedNeeding = openTasks.length === 0 && ms.some((m) => !!m.completed_at && !m.follow_up_task_id);
    return computeFollowUpState(
      {
        id: l.id, stage: l.stage ?? "new", score: l.score ?? null, ownerId: l.owner_id ?? null,
        lastMeaningfulContactAt: l.last_activity_at ?? null, createdAt: l.created_at ?? null,
        fullName: l.full_name ?? null, source: l.source ?? null,
      },
      { openTasks, upcomingMeetingAt: upcoming, completedMeetingNeedingFollowUp: completedNeeding },
      policy,
      now,
    );
  });
}

/** Follow-up state for ONE lead (lead detail). Null when not found / no org. */
export async function getLeadFollowUpState(leadId: string): Promise<FollowUpState | null> {
  const { profile, organization } = await getSessionContext();
  const orgId = organization?.id ?? profile?.org_id ?? null;
  if (!orgId) return null;
  const db: any = await createClient();
  const states = await loadStatesWithClient(db, orgId, { leadIds: [leadId], activeOnly: false, limit: 1 });
  return states[0] ?? null;
}

export interface OfficeFollowUpResult {
  isManager: boolean;
  states: FollowUpState[];
}

/**
 * Batched office follow-up health for the current session, sorted most-urgent
 * first. Agents see only their own leads; managers/owners see the office.
 */
export async function getOfficeFollowUpStates(opts?: { limit?: number }): Promise<OfficeFollowUpResult> {
  const { user, profile, organization } = await getSessionContext();
  const orgId = organization?.id ?? profile?.org_id ?? null;
  if (!orgId) return { isManager: false, states: [] };

  const db: any = await createClient();
  let isManager = false;
  try { const { data } = await db.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }

  const states = await loadStatesWithClient(db, orgId, {
    ownerId: isManager ? undefined : (user?.id ?? undefined),
    activeOnly: true,
    limit: opts?.limit ?? 200,
  });
  states.sort((a, b) => b.urgency - a.urgency);
  return { isManager, states };
}

/** Service-role batched loader for background workers (cron). Explicit org scope. */
export async function loadOrgFollowUpStatesService(orgId: string, limit = 300): Promise<FollowUpState[]> {
  const db: any = createServiceRoleClient();
  return loadStatesWithClient(db, orgId, { activeOnly: true, limit });
}
