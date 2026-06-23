// Facebook PAGE adapter — stub (architecture only; no Meta API writes).
import "server-only";
import type { ChannelAdapter } from "./adapter";
import { baseValidate, notConfigured, commentsNotConfigured } from "./adapter";

export const FacebookPageAdapter: ChannelAdapter = {
  kind: "facebook_page",
  label: "עמוד פייסבוק",
  // Pages support native scheduling via the Graph API once connected.
  capabilities: { publish: true, schedule: true, comments: true, marketplaceListing: false },
  validate(channel) { return baseValidate(channel, "עמוד פייסבוק"); },
  async publish() { return notConfigured("Facebook Pages"); },
  async fetchComments() { return commentsNotConfigured("Facebook Pages"); },
};
