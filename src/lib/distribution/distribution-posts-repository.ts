// ============================================================================
// ZONO — Distribution POSTS repository (server-only). Real, org-scoped Supabase
// queries over distribution_posts — the posting queue's storage. RLS enforces
// org isolation; we also stamp org_id on writes. The spec field `failed_reason`
// maps to the existing `failure_reason` column. No mock data.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { DIST, type DistPostRow } from "./db-types";
import type { PostingStatus } from "./scheduler-planner";
import { buildContentHash, buildIdempotencyKey } from "./publishing-state-machine";

type DB = Awaited<ReturnType<typeof createClient>>;

async function scope(): Promise<{ db: DB; orgId: string; userId: string | null } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { db: await createClient(), orgId: profile.org_id, userId: profile.id ?? null };
}
const list = <T>(d: unknown): T[] => (d ?? []) as T[];

export interface QueuePostInput {
  campaignId: string; groupId: string; variationId: string; scheduledAt: string;
  status?: PostingStatus; postTitle?: string | null; postText?: string | null;
  hashtags?: string[]; cta?: string | null; imageUrl?: string | null; propertyId?: string | null;
  creativeOutputId?: string | null; creativeVersion?: number | null;
}
export interface QueueFilters {
  campaignId?: string; groupId?: string; status?: PostingStatus; from?: string; to?: string; limit?: number;
}
export interface QueueCounts {
  total: number; draft: number; scheduled: number; queued: number; publishing: number;
  published: number; failed: number; cancelled: number; successRate: number;
}
export interface GroupPublishStat {
  groupId: string; groupName: string | null;
  total: number; published: number; failed: number; deadLetter: number; inFlight: number;
  successRate: number; avgAttempts: number; lastPublishedAt: string | null; topFailureCode: string | null;
}

export const distributionPostsRepository = {
  /**
   * Insert queue posts as canonical per-group execution rows. Each row gets a
   * deterministic content_hash + idempotency_key + agent owner + publish_state, so
   * the same content to the same group cannot be enqueued twice (DB-enforced dedup;
   * duplicates are skipped, never a second post). Returns the created rows.
   */
  async createMany(rows: QueuePostInput[]): Promise<DistPostRow[]> {
    const s = await scope(); if (!s || !rows.length) return [];
    const created: DistPostRow[] = [];
    for (const r of rows) {
      const contentHash = buildContentHash({ text: r.postText ?? "", imageUrl: r.imageUrl ?? null, destinationId: r.groupId });
      const idempotencyKey = buildIdempotencyKey({
        orgId: s.orgId, campaignId: r.campaignId, groupId: r.groupId, propertyId: r.propertyId ?? null,
        contentHash, scheduleKey: (r.scheduledAt ?? "").slice(0, 13),
      });
      const { data, error } = await s.db.from(DIST.posts as never).insert({
        org_id: s.orgId, campaign_id: r.campaignId, group_id: r.groupId, variation_id: r.variationId,
        property_id: r.propertyId ?? null, platform: "facebook", status: r.status ?? "scheduled", publish_state: "queued",
        post_title: r.postTitle ?? null, post_text: r.postText ?? null, hashtags: r.hashtags ?? [],
        cta: r.cta ?? null, image_url: r.imageUrl ?? null,
        creative_output_id: r.creativeOutputId ?? null, creative_version: r.creativeOutputId ? (r.creativeVersion ?? 1) : null,
        scheduled_at: r.scheduledAt, created_by: s.userId,
        assigned_user_id: s.userId, content_hash: contentHash, idempotency_key: idempotencyKey,
      } as never).select("*").maybeSingle();
      if (error) {
        if (!/duplicate key|23505/i.test(error.message)) console.error("[distribution.posts] createMany:", error.message);
        continue; // duplicate content → skip (never a second post)
      }
      if (data) created.push(data as unknown as DistPostRow);
    }
    return created;
  },

  async getById(id: string): Promise<DistPostRow | null> {
    const s = await scope(); if (!s) return null;
    const { data } = await s.db.from(DIST.posts as never).select("*").eq("id", id).eq("org_id", s.orgId).maybeSingle();
    return (data as unknown as DistPostRow) ?? null;
  },

  async listQueue(f: QueueFilters = {}): Promise<DistPostRow[]> {
    const s = await scope(); if (!s) return [];
    let q = s.db.from(DIST.posts as never).select("*").eq("org_id", s.orgId);
    if (f.campaignId) q = q.eq("campaign_id", f.campaignId);
    if (f.groupId) q = q.eq("group_id", f.groupId);
    if (f.status) q = q.eq("status", f.status);
    if (f.from) q = q.gte("scheduled_at", f.from);
    if (f.to) q = q.lte("scheduled_at", f.to);
    const { data } = await q.order("scheduled_at", { ascending: true, nullsFirst: false }).limit(f.limit ?? 300);
    return list<DistPostRow>(data);
  },

  /** Update the scheduled time (reschedule). */
  async updateSchedule(id: string, scheduledAt: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.posts as never)
      .update({ scheduled_at: scheduledAt, status: "scheduled", failure_reason: null } as never)
      .eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  /** Generic status transition with optional fields (published_at, failure_reason, external_post_url). */
  async updateStatus(id: string, status: PostingStatus, patch: { publishedAt?: string | null; failedReason?: string | null; externalPostUrl?: string | null } = {}): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const row: Record<string, unknown> = { status };
    if (patch.publishedAt !== undefined) row.published_at = patch.publishedAt;
    if (patch.failedReason !== undefined) row.failure_reason = patch.failedReason;
    if (patch.externalPostUrl !== undefined) row.external_post_url = patch.externalPostUrl;
    const { error } = await s.db.from(DIST.posts as never).update(row as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },

  /** True when an identical (campaign, group, variation, scheduled_at) post already exists. */
  async existsDuplicate(campaignId: string, groupId: string, variationId: string, scheduledAt: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { data } = await s.db.from(DIST.posts as never).select("id")
      .eq("org_id", s.orgId).eq("campaign_id", campaignId).eq("group_id", groupId)
      .eq("variation_id", variationId).eq("scheduled_at", scheduledAt)
      .not("status", "eq", "cancelled").limit(1);
    return list<unknown>(data).length > 0;
  },

  /** Analytics-prep counters (scheduled / published / failed / success rate). */
  async counts(campaignId?: string): Promise<QueueCounts> {
    const s = await scope();
    const empty: QueueCounts = { total: 0, draft: 0, scheduled: 0, queued: 0, publishing: 0, published: 0, failed: 0, cancelled: 0, successRate: 0 };
    if (!s) return empty;
    let q = s.db.from(DIST.posts as never).select("status").eq("org_id", s.orgId);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    const { data } = await q;
    const rows = list<{ status: PostingStatus }>(data);
    const c = { ...empty };
    for (const r of rows) { c.total++; if (r.status in c) (c as unknown as Record<string, number>)[r.status]++; }
    const attempted = c.published + c.failed;
    c.successRate = attempted ? Math.round((c.published / attempted) * 10000) / 100 : 0;
    return c;
  },

  /**
   * CANONICAL per-group publishing report — aggregates distribution_posts by
   * group over the publish_state lifecycle (not the legacy status column):
   * published / failed / dead-letter / in-flight counts, success rate, average
   * attempts, last published time and the dominant failure code per group.
   */
  async groupPublishStats(limit = 2000): Promise<GroupPublishStat[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(DIST.posts as never)
      .select("group_id,publish_state,status,attempt_count,published_at,failure_code")
      .eq("org_id", s.orgId).not("group_id", "is", null).limit(limit);
    const rows = list<{ group_id: string | null; publish_state: string | null; status: string | null; attempt_count: number | null; published_at: string | null; failure_code: string | null }>(data);

    // Resolve group names for the groups that actually appear.
    const ids = [...new Set(rows.map((r) => r.group_id).filter((g): g is string => !!g))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: gs } = await s.db.from(DIST.groups as never).select("id,name").eq("org_id", s.orgId).in("id", ids as never);
      for (const g of list<{ id: string; name: string | null }>(gs)) names.set(g.id, g.name ?? "");
    }

    const TERMINAL_FAIL = new Set(["dead_letter"]);
    const IN_FLIGHT = new Set(["dispatching", "awaiting_confirmation", "awaiting_reconciliation"]);
    const eff = (r: { publish_state: string | null; status: string | null }): string =>
      r.publish_state ?? (r.status === "publishing" ? "dispatching" : (r.status ?? "queued"));

    type Acc = { total: number; published: number; failed: number; deadLetter: number; inFlight: number; attemptsSum: number; lastPublishedAt: string | null; failCodes: Record<string, number> };
    const by = new Map<string, Acc>();
    for (const r of rows) {
      const gid = r.group_id as string;
      const a = by.get(gid) ?? { total: 0, published: 0, failed: 0, deadLetter: 0, inFlight: 0, attemptsSum: 0, lastPublishedAt: null, failCodes: {} };
      const st = eff(r);
      a.total++;
      a.attemptsSum += r.attempt_count ?? 0;
      if (st === "published") { a.published++; if (r.published_at && (!a.lastPublishedAt || r.published_at > a.lastPublishedAt)) a.lastPublishedAt = r.published_at; }
      else if (st === "failed") { a.failed++; if (r.failure_code) a.failCodes[r.failure_code] = (a.failCodes[r.failure_code] ?? 0) + 1; }
      else if (TERMINAL_FAIL.has(st)) { a.deadLetter++; if (r.failure_code) a.failCodes[r.failure_code] = (a.failCodes[r.failure_code] ?? 0) + 1; }
      else if (IN_FLIGHT.has(st)) a.inFlight++;
      by.set(gid, a);
    }

    const out: GroupPublishStat[] = [];
    for (const [gid, a] of by) {
      const attempted = a.published + a.failed + a.deadLetter;
      const topFailureCode = Object.entries(a.failCodes).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
      out.push({
        groupId: gid, groupName: names.get(gid) ?? null,
        total: a.total, published: a.published, failed: a.failed, deadLetter: a.deadLetter, inFlight: a.inFlight,
        successRate: attempted ? Math.round((a.published / attempted) * 10000) / 100 : 0,
        avgAttempts: a.total ? Math.round((a.attemptsSum / a.total) * 10) / 10 : 0,
        lastPublishedAt: a.lastPublishedAt, topFailureCode,
      });
    }
    // Most active / most at-risk first: by attempted desc, then success asc.
    return out.sort((x, y) => (y.published + y.failed + y.deadLetter) - (x.published + x.failed + x.deadLetter) || x.successRate - y.successRate);
  },

  // ── Phase 6: manual publishing ──────────────────────────────────────────────
  /** Mark a post published BY HAND (no API). Stamps who/when + the external URL. */
  async markPublishedManually(id: string, externalPostUrl: string | null): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const now = new Date().toISOString();
    const { error } = await s.db.from(DIST.posts as never).update({
      status: "published", published_at: now, published_manually_at: now, published_by: s.userId,
      external_post_url: externalPostUrl ?? null, failure_reason: null,
    } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  /** Mark a queued post as SKIPPED (broker chose not to publish it today). */
  async markSkipped(id: string, reason: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.posts as never)
      .update({ status: "skipped", skipped_reason: reason.slice(0, 500) } as never)
      .eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  /** Mark a manual publish as failed with a reason. */
  async markManualFailed(id: string, reason: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.posts as never)
      .update({ status: "failed", failure_reason: reason.slice(0, 500) } as never)
      .eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  /** Save / update the external (Facebook) post URL without changing status. */
  async saveExternalUrl(id: string, url: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.posts as never)
      .update({ external_post_url: url } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
  /** Stamp the resolved provider + connection status onto a post. */
  async setProvider(id: string, provider: string, providerStatus: string): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(DIST.posts as never)
      .update({ provider, provider_status: providerStatus } as never).eq("id", id).eq("org_id", s.orgId);
    return !error;
  },
};
