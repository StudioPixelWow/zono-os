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
import { resolveJobDerivative } from "@/lib/creative-studio/promotion/creative-promotion-service";
import type { Channel } from "@/lib/creative-studio/promotion/creative-promotion-core";

// Map a manual-publish destination onto an APPROVED-DERIVATIVE promotion channel.
// Meta surfaces (page/instagram) keep their own private meta-media path and are
// intentionally NOT promotion channels — they are excluded here (returns null).
function promotionChannelFor(kind: DestinationKind): Channel | null {
  if (kind === "facebook_group" || kind === "facebook_marketplace") return "facebook_groups";
  if (kind === "whatsapp") return "whatsapp";
  return null; // facebook_page / instagram -> Meta private media path, unchanged
}

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

    return await Promise.all(posts.map(async (p) => {
      const group = p.group_id ? byGroup.get(p.group_id) ?? null : null;
      const kind = kindOf(p);
      const provider = getProviderForKind(kind);
      // Image hand-off. When the post is linked to a creative output, the assistant
      // surfaces ONLY the approved distribution derivative for this exact channel/
      // version via a job-scoped signed URL — never the private master, a draft, or
      // a public URL. A missing/revoked derivative or an active emergency stop is an
      // honest empty image (null): we never fall back to a private/legacy leak.
      // Meta surfaces (page/instagram) keep their own media path (channel === null).
      let sourceImageUrl: string | null = p.image_url;
      const channel = promotionChannelFor(kind);
      if (p.creative_output_id && channel) {
        const handoff = await resolveJobDerivative({
          orgId: p.org_id, outputId: p.creative_output_id, targetChannel: channel,
          creativeVersion: p.creative_version ?? 1, emergencyActive: false,
        });
        sourceImageUrl = handoff.ok && handoff.signedUrl ? handoff.signedUrl : null;
      } else if (p.creative_output_id && !channel) {
        // Linked but Meta-routed: no promotion derivative applies; do not leak a
        // private master. Meta's own media path supplies the asset downstream.
        sourceImageUrl = p.image_url;
      }
      const prepared = provider.preparePost({
        text: [p.post_text, (p.hashtags ?? []).join(" ")].filter(Boolean).join("\n\n"),
        hashtags: p.hashtags ?? [],
        imageUrl: sourceImageUrl,
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
    }));
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
