// ============================================================================
// ZONO — DistributionProvider registry. Maps a destination kind / provider key
// to its provider implementation. Adding a real integration = swap the stub for
// an API-backed provider and register it here; the service + UI never change.
// ============================================================================
import "server-only";
import type { DistributionProvider, DestinationKind } from "./distribution-provider";
import { FacebookProvider } from "./facebook-provider";
import { InstagramProvider } from "./instagram-provider";
import { WhatsAppProvider } from "./whatsapp-provider";

const PROVIDERS: DistributionProvider[] = [FacebookProvider, InstagramProvider, WhatsAppProvider];

const BY_KIND: Record<DestinationKind, DistributionProvider> = {
  facebook_group: FacebookProvider,
  facebook_page: FacebookProvider,
  facebook_marketplace: FacebookProvider,
  instagram: InstagramProvider,
  whatsapp: WhatsAppProvider,
};

/** Resolve the provider for a destination kind (defaults to Facebook). */
export function getProviderForKind(kind: DestinationKind | string | null | undefined): DistributionProvider {
  return BY_KIND[(kind as DestinationKind)] ?? FacebookProvider;
}

/** Resolve a provider by its key (facebook | instagram | whatsapp). */
export function getProviderByKey(key: string | null | undefined): DistributionProvider {
  return PROVIDERS.find((p) => p.key === key) ?? FacebookProvider;
}

export function listProviders(): DistributionProvider[] {
  return PROVIDERS;
}
