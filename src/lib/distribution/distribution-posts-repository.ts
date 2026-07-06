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
}
export interface QueueFilters {
  campaignId?: string; groupId?: string; status?: PostingStatus; from?: string; to?: string; limit?: number;
}
export interface QueueCounts {
  total: number; draft: number; scheduled: number; queued: number; publishing: number;
  published: number; failed: number; cancelled: number; successRate: number;
}

export const distributionPostsRepository = {
  /** Bulk-insert queue posts. Returns the created rows. */
  async createMany(rows: QueuePostInput[]): Promise<DistPostRow[]> {
    const s = await scope(); if (!s || !rows.length) return [];
    const payload = rows.map((r) => ({
      org_id: s.orgId, campaign_id: r.campaignId, group_id: r.groupId, variation_id: r.variationId,
      property_id: r.propertyId ?? null, platform: "facebook", status: r.status ?? "scheduled",
      post_title: r.postTitle ?? null, post_text: r.postText ?? null, hashtags: r.hashtags ?? [],
      cta: r.cta ?? null, image_url: r.imageUrl ?? null, scheduled_at: r.scheduledAt, created_by: s.userId,
    }));
    const { data, error } = await s.db.from(DIST.posts as never).insert(payload as never).select("*");
    if (error) { console.error("[distribution.posts] createMany:", error.message); return []; }
    return list<DistPostRow>(data);
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
