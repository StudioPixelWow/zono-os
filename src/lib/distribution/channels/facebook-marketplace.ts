// Facebook MARKETPLACE adapter — stub (architecture only; no Meta API writes).
import "server-only";
import type { ChannelAdapter } from "./adapter";
import { baseValidate, notConfigured, commentsNotConfigured } from "./adapter";

export const FacebookMarketplaceAdapter: ChannelAdapter = {
  kind: "facebook_marketplace",
  label: "מרקטפלייס",
  // Marketplace = structured LISTING (price/category), no public comment stream.
  capabilities: { publish: true, schedule: false, comments: false, marketplaceListing: true },
  validate(channel) {
    const base = baseValidate(channel, "מרקטפלייס");
    if (base) return base;
    return null;
  },
  async publish() { return notConfigured("Facebook Marketplace"); },
  async fetchComments() { return commentsNotConfigured("Facebook Marketplace"); },
};
