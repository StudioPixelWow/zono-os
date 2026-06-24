// ============================================================================
// ZONO — Facebook PAGE publishing (Phase 19, server-only).
// ----------------------------------------------------------------------------
// Official Graph API publishing to a Facebook PAGE only. Groups/Marketplace are
// NOT handled here (Groups → Chrome extension, later). Uses the page-scoped token
// stored (encrypted) on the facebook_page destination.
//
// SAFETY:
//   - Publishes ONLY when the Graph API call truly succeeds (never fakes success).
//   - On API failure → the linked distribution post is marked FAILED with the
//     Graph error; it is never marked published.
//   - No token is logged or returned to the client.
// ============================================================================
import "server-only";
import { getMetaOAuthConfig, publishToPage } from "./meta-oauth";
import { metaPagesService } from "./meta-pages";
import { distributionPostsRepository } from "./distribution-posts-repository";

export type PublishResult =
  | { ok: true; externalPostId: string; externalPostUrl: string | null; message: string }
  | { ok: false; reason: "not_connected" | "no_token" | "expired" | "permission" | "graph_error" | "config"; message: string };

export const metaPublishService = {
  /**
   * Publish a prepared post to a Facebook Page destination. If `postId` is given,
   * the distribution post row is updated to published (on success) or failed (on
   * API error) — published status is set ONLY after a confirmed API success.
   */
  async publishToFacebookPage(input: {
    destinationExternalId: string;
    text: string;
    imageUrl?: string | null;
    postId?: string | null;
  }): Promise<PublishResult> {
    const cfg = getMetaOAuthConfig();
    if (!cfg.configured) return { ok: false, reason: "config", message: "הגדרות Meta חסרות." };

    const pageToken = await metaPagesService.getPageToken(input.destinationExternalId);
    if (!pageToken) {
      return { ok: false, reason: "no_token", message: "לא נמצא טוקן לעמוד. סנכרן עמודים מחדש (נדרש pages_manage_posts)." };
    }

    const res = await publishToPage(cfg, input.destinationExternalId, pageToken, {
      text: input.text, imageUrl: input.imageUrl ?? null,
    });

    if (!res.ok) {
      // API failed → mark the post failed (never published). Surface the Graph error.
      if (input.postId) {
        await distributionPostsRepository.updateStatus(input.postId, "failed", { failedReason: res.error?.message ?? "graph error" }).catch(() => {});
      }
      const type = res.error?.type ?? "graph_error";
      const msg = type === "expired" ? "תוקף החיבור פג. יש להתחבר מחדש."
        : type === "permission" ? "נדרשת הרשאת pages_manage_posts לפרסום בעמוד."
        : `הפרסום נכשל: ${res.error?.message ?? "שגיאת Graph"}`;
      return { ok: false, reason: type, message: msg };
    }

    // Success — record external id/url and flip status to published.
    if (input.postId) {
      await distributionPostsRepository.updateStatus(input.postId, "published", {
        publishedAt: new Date().toISOString(), externalPostUrl: res.externalPostUrl ?? null, failedReason: null,
      }).catch(() => {});
    }
    return {
      ok: true,
      externalPostId: res.externalPostId as string,
      externalPostUrl: res.externalPostUrl ?? null,
      message: "פורסם לעמוד Facebook בהצלחה.",
    };
  },
};
