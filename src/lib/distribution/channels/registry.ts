// ============================================================================
// ZONO — Channel registry. One lookup point that maps a ChannelKind to its
// adapter. Adding a future integration = implement ChannelAdapter + register it
// here; nothing else in the infrastructure layer changes.
// ============================================================================
import "server-only";
import type { ChannelKind, ChannelCapabilities } from "../infrastructure/types";
import { CHANNEL_KINDS } from "../infrastructure/types";
import type { ChannelAdapter } from "./adapter";
import { FacebookGroupAdapter } from "./facebook-group";
import { FacebookPageAdapter } from "./facebook-page";
import { FacebookMarketplaceAdapter } from "./facebook-marketplace";

const ADAPTERS: Record<ChannelKind, ChannelAdapter> = {
  facebook_group: FacebookGroupAdapter,
  facebook_page: FacebookPageAdapter,
  facebook_marketplace: FacebookMarketplaceAdapter,
};

/** Resolve the adapter for a channel kind, or null when unsupported. */
export function getChannelAdapter(kind: ChannelKind | string): ChannelAdapter | null {
  return ADAPTERS[kind as ChannelKind] ?? null;
}

/** All registered adapters (e.g. for a "connect a channel" UI). */
export function listChannelAdapters(): ChannelAdapter[] {
  return CHANNEL_KINDS.map((k) => ADAPTERS[k]);
}

/** Capabilities for a kind (defaults to all-false when unknown). */
export function capabilitiesFor(kind: ChannelKind | string): ChannelCapabilities {
  return getChannelAdapter(kind)?.capabilities ?? { publish: false, schedule: false, comments: false, marketplaceListing: false };
}
