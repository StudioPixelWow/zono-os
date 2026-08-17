// ============================================================================
// ZONO — Publishing Control Center: read-only operational data (server-only).
// ----------------------------------------------------------------------------
// The live picture the Control Center renders: canonical per-group execution
// rows (distribution_posts) bucketed by their P0 lifecycle state, the queues
// that need a human (reconciliation / failed / dead-letter / paused / in-flight),
// the append-only event stream (distribution_publish_events), and any active
// emergency stops (distribution_publish_controls). Real, org-scoped data only —
// no mock. Reuses the SAME canonical tables the P0 engine writes; no new model.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { PUBLISH_STATES, type PublishState } from "./publishing-state-machine";
import { distributionPostsRepository, type GroupPublishStat } from "./distribution-posts-repository";

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ControlPost {
  id: string;
  state: PublishState;
  status: string | null;
  title: string | null;
  text: string | null;
  groupId: string | null;
  groupName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  propertyId: string | null;
  scheduledAt: string | null;
  updatedAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  nextRetryAt: string | null;
  leaseExpiresAt: string | null;
  lockedBy: string | null;
  failureReason: string | null;
  failureCode: string | null;
  externalPostUrl: string | null;
}

export interface ControlEvent {
  id: string;
  targetId: string;
  fromState: string | null;
  toState: string;
  kind: string;
  reason: string | null;
  occurredAt: string;
  actorName: string | null;
  groupName: string | null;
}

export interface ControlStop {
  id: string;
  scope: string;
  scopeId: string | null;
  scopeLabel: string;
  reason: string | null;
  createdAt: string;
  createdByName: string | null;
}

export interface PublishingControlData {
  ready: boolean;                               // false ⇒ no session/org
  stateCounts: Record<PublishState, number>;    // active (non-terminal) rows by state
  totals: { active: number; publishedAllTime: number; failedActive: number; inFlight: number; needsHuman: number };
  inFlight: ControlPost[];        // dispatching / awaiting_confirmation
  reconciliation: ControlPost[];  // awaiting_reconciliation (lost-ack — explicit decision only)
  failed: ControlPost[];          // failed (retry-eligible)
  deadLetter: ControlPost[];      // dead_letter (manual revival)
  paused: ControlPost[];          // paused
  queued: ControlPost[];          // queued / scheduled / draft (waiting to be served)
  publishedToday: ControlPost[];  // published TODAY (Asia/Jerusalem) — today's real activity
  events: ControlEvent[];         // most recent transition audit
  controls: ControlStop[];        // active emergency stops
  groupStats: GroupPublishStat[]; // canonical per-group publishing success rate + history
}

const EMPTY_STATE_COUNTS = (): Record<PublishState, number> =>
  Object.fromEntries(PUBLISH_STATES.map((s) => [s, 0])) as Record<PublishState, number>;

export function emptyControlData(ready = false): PublishingControlData {
  return {
    ready,
    stateCounts: EMPTY_STATE_COUNTS(),
    totals: { active: 0, publishedAllTime: 0, failedActive: 0, inFlight: 0, needsHuman: 0 },
    inFlight: [], reconciliation: [], failed: [], deadLetter: [], paused: [], queued: [], publishedToday: [],
    events: [], controls: [], groupStats: [],
  };
}

const STATUS_TO_STATE: Record<string, PublishState> = {
  published: "published", failed: "failed", scheduled: "scheduled", queued: "queued",
  publishing: "dispatching", draft: "draft", cancelled: "cancelled", skipped: "cancelled",
  paused: "paused",
};

/** Effective lifecycle state: prefer the canonical publish_state, fall back to legacy status. */
function effectiveState(row: any): PublishState {
  const ps = row?.publish_state as string | null;
  if (ps && (PUBLISH_STATES as readonly string[]).includes(ps)) return ps as PublishState;
  const st = (row?.status as string | null) ?? "";
  return STATUS_TO_STATE[st] ?? "queued";
}

function snippet(row: any): string | null {
  const t = (row?.post_text as string | null) ?? (row?.post_title as string | null);
  if (!t) return null;
  const s = t.trim().replace(/\s+/g, " ");
  return s.length > 140 ? `${s.slice(0, 140)}…` : s;
}

function mapPost(row: any, groupName: string | null, campaignName: string | null): ControlPost {
  return {
    id: row.id,
    state: effectiveState(row),
    status: row.status ?? null,
    title: row.post_title ?? null,
    text: snippet(row),
    groupId: row.group_id ?? null,
    groupName,
    campaignId: row.campaign_id ?? null,
    campaignName,
    propertyId: row.property_id ?? null,
    scheduledAt: row.scheduled_at ?? null,
    updatedAt: row.updated_at ?? null,
    attemptCount: row.attempt_count ?? 0,
    maxAttempts: row.max_attempts ?? 5,
    nextRetryAt: row.next_retry_at ?? null,
    leaseExpiresAt: row.lease_expires_at ?? null,
    lockedBy: row.locked_by ?? null,
    failureReason: row.failure_reason ?? null,
    failureCode: row.failure_code ?? null,
    externalPostUrl: row.external_post_url ?? null,
  };
}

function scopeLabel(scope: string, groupName: string | null): string {
  switch (scope) {
    case "all": case "organization": case "org": return "כל הארגון";
    case "group": return groupName ? `קבוצה · ${groupName}` : "קבוצה";
    case "campaign": return "קמפיין";
    case "property": return "נכס";
    default: return scope;
  }
}

/**
 * The full operational snapshot for the Control Center. Read-only; every mutating
 * action lives in publishing-control-actions.ts and routes through the state machine.
 */
export async function getPublishingControlData(): Promise<PublishingControlData> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return emptyControlData(false);
  const orgId = profile.org_id;
  const db: any = createServiceRoleClient();

  // ── Active (non-terminal) canonical execution rows ─────────────────────────
  const { data: activeRows } = await db
    .from("distribution_posts")
    .select(
      "id,status,publish_state,post_title,post_text,group_id,campaign_id,property_id,scheduled_at,updated_at,attempt_count,max_attempts,next_retry_at,lease_expires_at,locked_by,failure_reason,failure_code,external_post_url,terminal",
    )
    .eq("org_id", orgId)
    .or("terminal.is.null,terminal.eq.false")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(500);

  const rows: any[] = Array.isArray(activeRows) ? activeRows : [];

  // ── Published TODAY (Asia/Jerusalem). Terminal ⇒ not in `rows`; queried separately
  //    so the Home summary reflects today's real publishing activity, not just planned.
  const israelDay = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) : null);
  const todayIsrael = israelDay(new Date().toISOString());
  const { data: pubTodayRaw } = await db
    .from("distribution_posts")
    .select("id,status,publish_state,post_title,post_text,group_id,campaign_id,property_id,scheduled_at,updated_at,published_at,external_post_url,terminal")
    .eq("org_id", orgId)
    .eq("publish_state", "published")
    .gte("published_at", new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString())
    .order("published_at", { ascending: false })
    .limit(100);
  const pubTodayRows: any[] = (Array.isArray(pubTodayRaw) ? pubTodayRaw : []).filter((r) => israelDay(r.published_at) === todayIsrael);

  // ── Recent transition events (append-only audit feed) ──────────────────────
  const { data: eventRows } = await db
    .from("distribution_publish_events")
    .select("id,target_id,from_state,to_state,kind,reason,occurred_at,actor_id")
    .eq("org_id", orgId)
    .order("occurred_at", { ascending: false })
    .limit(40);
  const events: any[] = Array.isArray(eventRows) ? eventRows : [];

  // ── Active emergency stops ─────────────────────────────────────────────────
  const { data: controlRows } = await db
    .from("distribution_publish_controls")
    .select("id,scope,scope_id,reason,created_at,created_by")
    .eq("org_id", orgId)
    .eq("state", "active")
    .order("created_at", { ascending: false });
  const controlsRaw: any[] = Array.isArray(controlRows) ? controlRows : [];

  // ── Resolve human-readable labels (groups, campaigns, actors) in batch ─────
  const groupIds = new Set<string>();
  const campaignIds = new Set<string>();
  const userIds = new Set<string>();
  for (const r of rows) { if (r.group_id) groupIds.add(r.group_id); if (r.campaign_id) campaignIds.add(r.campaign_id); }
  for (const r of pubTodayRows) { if (r.group_id) groupIds.add(r.group_id); if (r.campaign_id) campaignIds.add(r.campaign_id); }
  for (const c of controlsRaw) { if (c.scope_id && c.scope === "group") groupIds.add(c.scope_id); if (c.created_by) userIds.add(c.created_by); }
  for (const e of events) { if (e.actor_id) userIds.add(e.actor_id); }
  // Events reference posts we may not have loaded (terminal ones) — resolve their groups too.
  const eventTargetIds = events.map((e) => e.target_id).filter(Boolean);

  const [groupsRes, campaignsRes, usersRes, evPostsRes] = await Promise.all([
    groupIds.size ? db.from("distribution_groups").select("id,name").in("id", [...groupIds]).eq("org_id", orgId) : Promise.resolve({ data: [] }),
    campaignIds.size ? db.from("distribution_campaigns").select("id,name").in("id", [...campaignIds]).eq("org_id", orgId) : Promise.resolve({ data: [] }),
    userIds.size ? db.from("users").select("id,full_name,email").in("id", [...userIds]) : Promise.resolve({ data: [] }),
    eventTargetIds.length ? db.from("distribution_posts").select("id,group_id").in("id", [...new Set(eventTargetIds)]).eq("org_id", orgId) : Promise.resolve({ data: [] }),
  ]);

  const groupName = new Map<string, string>();
  for (const g of (groupsRes.data ?? []) as any[]) groupName.set(g.id, g.name ?? "");
  const campaignName = new Map<string, string>();
  for (const c of (campaignsRes.data ?? []) as any[]) campaignName.set(c.id, c.name ?? "");
  const userName = new Map<string, string>();
  for (const u of (usersRes.data ?? []) as any[]) userName.set(u.id, u.full_name ?? u.email ?? "");
  const postGroup = new Map<string, string | null>();
  for (const p of (evPostsRes.data ?? []) as any[]) postGroup.set(p.id, p.group_id ?? null);

  // ── Bucket the active rows by lifecycle state ──────────────────────────────
  const stateCounts = EMPTY_STATE_COUNTS();
  const inFlight: ControlPost[] = [];
  const reconciliation: ControlPost[] = [];
  const failed: ControlPost[] = [];
  const deadLetter: ControlPost[] = [];
  const paused: ControlPost[] = [];
  const queued: ControlPost[] = [];

  for (const r of rows) {
    const post = mapPost(r, r.group_id ? groupName.get(r.group_id) ?? null : null, r.campaign_id ? campaignName.get(r.campaign_id) ?? null : null);
    stateCounts[post.state] = (stateCounts[post.state] ?? 0) + 1;
    switch (post.state) {
      case "dispatching": case "awaiting_confirmation": inFlight.push(post); break;
      case "awaiting_reconciliation": reconciliation.push(post); break;
      case "failed": failed.push(post); break;
      case "dead_letter": deadLetter.push(post); break;
      case "paused": paused.push(post); break;
      case "queued": case "scheduled": case "draft": queued.push(post); break;
      default: break; // terminal states shouldn't appear among active rows
    }
  }

  const publishedToday: ControlPost[] = pubTodayRows.map((r) =>
    mapPost(r, r.group_id ? groupName.get(r.group_id) ?? null : null, r.campaign_id ? campaignName.get(r.campaign_id) ?? null : null));

  // ── All-time published count (small, honest headline metric) ───────────────
  const { count: publishedAllTime } = await db
    .from("distribution_posts")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("publish_state", "published");

  const controls: ControlStop[] = controlsRaw.map((c) => ({
    id: c.id,
    scope: c.scope,
    scopeId: c.scope_id ?? null,
    scopeLabel: scopeLabel(c.scope, c.scope_id && c.scope === "group" ? groupName.get(c.scope_id) ?? null : null),
    reason: c.reason ?? null,
    createdAt: c.created_at,
    createdByName: c.created_by ? userName.get(c.created_by) ?? null : null,
  }));

  const controlEvents: ControlEvent[] = events.map((e) => {
    const gid = postGroup.get(e.target_id) ?? null;
    return {
      id: e.id,
      targetId: e.target_id,
      fromState: e.from_state ?? null,
      toState: e.to_state,
      kind: e.kind,
      reason: e.reason ?? null,
      occurredAt: e.occurred_at,
      actorName: e.actor_id ? userName.get(e.actor_id) ?? null : null,
      groupName: gid ? groupName.get(gid) ?? null : null,
    };
  });

  const needsHuman = reconciliation.length + failed.length + deadLetter.length;
  // Canonical per-group publishing report (success rate + attempts + last published).
  const groupStats = await distributionPostsRepository.groupPublishStats().catch(() => []);
  return {
    ready: true,
    stateCounts,
    totals: {
      active: rows.length,
      publishedAllTime: publishedAllTime ?? 0,
      failedActive: failed.length,
      inFlight: inFlight.length,
      needsHuman,
    },
    inFlight, reconciliation, failed, deadLetter, paused, queued, publishedToday,
    events: controlEvents,
    controls,
    groupStats,
  };
}
