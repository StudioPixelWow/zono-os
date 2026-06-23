// ============================================================================
// ZONO — COMMENT COLLECTION service (server-only).
// ----------------------------------------------------------------------------
// Pulls comments for published posts via the channel adapter and persists new
// ones into distribution_comments (deduped by external id). It does NOT classify
// or create leads — that is the Lead Detection service's job, which this service
// invokes after ingest. Architecture phase: adapters return `not_configured`, so
// this is a no-op end-to-end, but the persistence + dedupe path is real.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getChannelAdapter } from "../channels/registry";
import { leadDetectionService } from "./lead-detection-service";
import { TBL, type ChannelRow, type FetchedComment } from "./types";

type DB = Awaited<ReturnType<typeof createClient>>;
const nowIso = () => new Date().toISOString();

interface PublishedPostRow { id: string; group_id: string | null; channel_kind?: string | null; metadata?: Record<string, unknown> | null }

export interface CollectResult { postsScanned: number; fetched: number; inserted: number; leadsCreated: number; notConfigured: number }

export const commentCollectionService = {
  /** Collect comments for an org's published posts that have a resolvable channel.
   *  New comments are inserted, then handed to lead detection. */
  async collectForOrg(orgId: string, db?: DB): Promise<CollectResult> {
    const sb = db ?? (await createClient());
    const res: CollectResult = { postsScanned: 0, fetched: 0, inserted: 0, leadsCreated: 0, notConfigured: 0 };

    const { data: posts } = await sb.from(TBL.posts as never)
      .select("id, group_id, channel_kind, metadata").eq("org_id", orgId).eq("status", "published").limit(200);
    const list = (posts ?? []) as unknown as PublishedPostRow[];
    res.postsScanned = list.length;

    for (const post of list) {
      const kind = (post.channel_kind as string) ?? (post.metadata?.channel_kind as string) ?? "facebook_group";
      const adapter = getChannelAdapter(kind);
      if (!adapter || !adapter.capabilities.comments) continue;

      // The adapter needs a channel row; resolve a minimal one from the post's group.
      const channelId = (post.metadata?.channel_id as string) ?? null;
      let channel: ChannelRow | null = null;
      if (channelId) {
        const { data } = await sb.from(TBL.channels as never).select("*").eq("id", channelId).maybeSingle();
        channel = data as unknown as ChannelRow | null;
      }
      if (!channel) continue;

      const outcome = await adapter.fetchComments(channel, post.id);
      if (outcome.status === "not_configured") { res.notConfigured += 1; continue; }
      if (outcome.status !== "ok") continue;
      res.fetched += outcome.comments.length;

      const created = await this.persist(sb, orgId, post.id, post.group_id, outcome.comments);
      res.inserted += created.inserted;
    }

    // After ingest, run lead detection over any unprocessed comments for the org.
    const detected = await leadDetectionService.detectForOrg(orgId, sb);
    res.leadsCreated += detected.leadsCreated;
    return res;
  },

  /** Insert new comments, deduping on (post_id, author_external_id, occurred_at). */
  async persist(sb: DB, orgId: string, postId: string, groupId: string | null, comments: FetchedComment[]): Promise<{ inserted: number }> {
    if (!comments.length) return { inserted: 0 };
    const rows = comments.map((c) => ({
      org_id: orgId, post_id: postId, group_id: groupId,
      author_name: c.authorName, author_external_id: c.authorExternalId, comment_text: c.text,
      occurred_at: c.occurredAt ?? nowIso(), metadata: { external_id: c.externalId, ...(c.raw ?? {}) },
    }));
    // No DB unique constraint on comments → guard duplicates by external id in app.
    const externalIds = comments.map((c) => c.externalId).filter(Boolean) as string[];
    if (externalIds.length) {
      const { data: existing } = await sb.from(TBL.comments as never)
        .select("metadata").eq("org_id", orgId).eq("post_id", postId);
      const seen = new Set(((existing ?? []) as { metadata: Record<string, unknown> | null }[]).map((e) => e.metadata?.external_id).filter(Boolean));
      const fresh = rows.filter((r) => !seen.has(r.metadata.external_id));
      if (!fresh.length) return { inserted: 0 };
      const { error } = await sb.from(TBL.comments as never).insert(fresh as never);
      if (error) { console.error("[distribution.comments] insert failed:", error.message); return { inserted: 0 }; }
      return { inserted: fresh.length };
    }
    const { error } = await sb.from(TBL.comments as never).insert(rows as never);
    if (error) { console.error("[distribution.comments] insert failed:", error.message); return { inserted: 0 }; }
    return { inserted: rows.length };
  },
};
