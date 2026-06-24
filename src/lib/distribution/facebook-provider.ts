// ============================================================================
// ZONO — Facebook DistributionProvider (Phase 6 STUB, server-only).
// ----------------------------------------------------------------------------
// Covers Facebook Groups, Pages and Marketplace. SAFE STUB: no Meta API calls,
// no scraping. publishPost ALWAYS returns manual_publish_required (the agent
// publishes by hand) — it never fakes a success. preparePost is real and
// assembles the copy-ready manual-publish package. Swapping in the official
// Graph API later means filling these methods; nothing above changes.
// ============================================================================
import "server-only";
import {
  buildChecklist,
  type DistributionProvider, type PreparePostInput, type PreparedPost,
} from "./distribution-provider";

const NOT_CONNECTED = "אינטגרציית Facebook הרשמית טרם אושרה — פרסום ידני בלבד.";

export const FacebookProvider: DistributionProvider = {
  key: "facebook",
  label: "Facebook",
  kinds: ["facebook_group", "facebook_page", "facebook_marketplace"],

  async validateConnection() {
    return { status: "not_connected", message: NOT_CONNECTED, requiresMembership: true };
  },
  async getAvailableDestinations() {
    // No API connection → no programmatic destinations. The agent's own groups
    // are managed inside ZONO (distribution_groups) and used for the manual flow.
    return [];
  },
  preparePost(input: PreparePostInput): PreparedPost {
    return {
      text: input.text,
      hashtags: input.hashtags,
      imageUrl: input.imageUrl,
      destinationUrl: input.destinationUrl,
      scheduledAt: input.scheduledAt,
      checklist: buildChecklist(true, input.destinationName),
    };
  },
  async publishPost() {
    // NEVER fake success. Until the official API is approved, posting is manual.
    return { status: "manual_publish_required", message: "פרסום ידני נדרש — Facebook API טרם חובר." };
  },
  async getPostStatus(externalPostUrl) {
    return { status: "manual", externalPostUrl: externalPostUrl ?? null };
  },
  async getComments() {
    return { status: "not_connected", comments: [], message: NOT_CONNECTED };
  },
  async getAnalytics() {
    return { status: "not_connected", message: NOT_CONNECTED };
  },
};
