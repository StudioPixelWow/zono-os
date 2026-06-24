// ============================================================================
// ZONO — Manual publishing service (Phase 6, server-only).
// ----------------------------------------------------------------------------
// Assembles the "Publish Assistant" rows (copy-ready text + asset + destination
// URL + compliance checklist) for queued posts, and exposes the provider status.
// This is the bridge used UNTIL an official Meta API connection is approved: the
// agent publishes by hand, then records the result. No API calls, no scraping.
// ============================================================================
import "server-only";
import { distributionPostsRepository, type QueueFilters } from "./distribution-posts-repository";
import { distributionRepo } from "./repository";
import { getProviderForKind } from "./distribution-provider-registry";
import type { DestinationKind, ProviderConnectionStatus } from "./distribution-provider";
import type { DistPostRow, DistGroupRow } from "./db-types";

export interface AssistantPost {
  postId: string; status: string; campaignId: string | null; groupId: string | null;
  groupName: string | null; groupUrl: string | null; requiresMembership: boolean;
  title: string | null; text: string; hashtags: string[]; cta: string | null;
  imageUrl: string | null; scheduledAt: string | null; externalPostUrl: string | null;
  provider: string; providerLabel: string; providerStatus: string; checklist: string[];
}

export interface ProviderStatusView {
  provider: string; label: string; status: ProviderConnectionStatus; message: string; requiresMembership: boolean;
}

function kindOf(post: DistPostRow): DestinationKind {
  const k = (post.metadata?.channel_kind as DestinationKind) ?? null;
  if (k) return k;
  // platform string → default facebook group
  return (post.platform === "instagram" ? "instagram" : post.platform === "whatsapp" ? "whatsapp" : "facebook_group");
}

export const manualPublishService = {
  /** Compliant provider status for the org (stub → not_connected). */
  async providerStatus(orgId: string, kind: DestinationKind = "facebook_group"): Promise<ProviderStatusView> {
    const provider = getProviderForKind(kind);
    const conn = await provider.validateConnection(orgId);
    return { provider: provider.key, label: provider.label, status: conn.status, message: conn.message, requiresMembership: conn.requiresMembership };
  },

  /** Build the Publish Assistant list for the org's actionable posts. */
  async listAssistant(filters: QueueFilters = {}): Promise<AssistantPost[]> {
    const posts = await distributionPostsRepository.listQueue({ ...filters, limit: filters.limit ?? 200 });
    if (!posts.length) return [];
    const groups = await distributionRepo.listGroups({ limit: 500 });
    const byGroup = new Map<string, DistGroupRow>(groups.map((g) => [g.id, g]));

    return posts.map((p) => {
      const group = p.group_id ? byGroup.get(p.group_id) ?? null : null;
      const kind = kindOf(p);
      const provider = getProviderForKind(kind);
      const prepared = provider.preparePost({
        text: [p.post_text, (p.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n"),
        hashtags: p.hashtags ?? [],
        imageUrl: p.image_url,
        destinationUrl: group?.group_url ?? p.external_destination_url ?? null,
        destinationName: group?.name ?? null,
        scheduledAt: p.scheduled_at,
      });
      return {
        postId: p.id, status: p.status, campaignId: p.campaign_id, groupId: p.group_id,
        groupName: group?.name ?? null, groupUrl: group?.group_url ?? p.external_destination_url ?? null,
        requiresMembership: kind.startsWith("facebook"),
        title: p.post_title, text: prepared.text, hashtags: prepared.hashtags, cta: p.cta,
        imageUrl: prepared.imageUrl, scheduledAt: p.scheduled_at, externalPostUrl: p.external_post_url,
        provider: provider.key, providerLabel: provider.label, providerStatus: p.provider_status ?? "not_connected",
        checklist: prepared.checklist,
      };
    });
  },

  /** Prepare ONE post for manual publishing (also snapshots provider fields). */
  async prepare(postId: string): Promise<AssistantPost | null> {
    const post = await distributionPostsRepository.getById(postId);
    if (!post) return null;
    const provider = getProviderForKind(kindOf(post));
    await distributionPostsRepository.setProvider(postId, provider.key, "not_connected");
    const [row] = await this.listAssistant({}).then((rows) => rows.filter((r) => r.postId === postId));
    return row ?? null;
  },
};
