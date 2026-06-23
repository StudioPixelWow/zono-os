// Facebook GROUP adapter — stub (architecture only; no Meta API writes).
import "server-only";
import type { ChannelAdapter } from "./adapter";
import { baseValidate, notConfigured, commentsNotConfigured } from "./adapter";

export const FacebookGroupAdapter: ChannelAdapter = {
  kind: "facebook_group",
  label: "קבוצת פייסבוק",
  capabilities: { publish: true, schedule: false, comments: true, marketplaceListing: false },
  validate(channel) { return baseValidate(channel, "קבוצת פייסבוק"); },
  async publish() { return notConfigured("Facebook Groups"); },
  async fetchComments() { return commentsNotConfigured("Facebook Groups"); },
};
