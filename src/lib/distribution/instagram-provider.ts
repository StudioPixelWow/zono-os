// ZONO — Instagram DistributionProvider (Phase 6 STUB, server-only).
// Safe stub: no API, no scraping. publishPost never fakes success.
import "server-only";
import { buildChecklist, type DistributionProvider, type PreparePostInput, type PreparedPost } from "./distribution-provider";

const NOT_CONNECTED = "אינטגרציית Instagram הרשמית טרם אושרה — פרסום ידני בלבד.";

export const InstagramProvider: DistributionProvider = {
  key: "instagram",
  label: "Instagram",
  kinds: ["instagram"],
  async validateConnection() { return { status: "not_connected", message: NOT_CONNECTED, requiresMembership: false }; },
  async getAvailableDestinations() { return []; },
  preparePost(input: PreparePostInput): PreparedPost {
    return { text: input.text, hashtags: input.hashtags, imageUrl: input.imageUrl, destinationUrl: input.destinationUrl, scheduledAt: input.scheduledAt, checklist: buildChecklist(false, input.destinationName) };
  },
  async publishPost() { return { status: "manual_publish_required", message: "פרסום ידני נדרש — Instagram API טרם חובר." }; },
  async getPostStatus(externalPostUrl) { return { status: "manual", externalPostUrl: externalPostUrl ?? null }; },
  async getComments() { return { status: "not_connected", comments: [], message: NOT_CONNECTED }; },
  async getAnalytics() { return { status: "not_connected", message: NOT_CONNECTED }; },
};
