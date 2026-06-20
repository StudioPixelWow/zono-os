/**
 * Community provider architecture — interfaces + manual/CSV implementations.
 * Real social providers (Facebook Groups / WhatsApp / Telegram) are SERVER-ONLY
 * placeholders that return `not_configured` until an official, compliant API
 * integration exists. NEVER scrape, NEVER bypass permissions, NEVER expose tokens.
 */
import "server-only";

export interface RawCommunity {
  externalCommunityId?: string | null;
  name: string;
  sourceUrl?: string | null;
  platform: string;
  cityGuess?: string | null;
  neighborhoodGuess?: string | null;
  audienceGuess?: string | null;
  communityTypeGuess?: string | null;
  membersCount?: number;
  confidenceScore?: number;
  rawPayload?: Record<string, unknown>;
}

export interface ProviderResult {
  status: "ok" | "not_configured" | "error";
  communities: RawCommunity[];
  message?: string;
}

export interface CommunityProvider {
  readonly provider: string;
  /** Discover communities for a connected account (future). */
  discoverCommunities(accountId: string | null): Promise<ProviderResult>;
  /** Normalize a raw payload into a RawCommunity. */
  normalizeCommunity(raw: Record<string, unknown>): RawCommunity;
  /** Metadata for a single community (future). */
  getCommunityMetadata(externalId: string): Promise<ProviderResult>;
  /** Communities the connected user belongs to (future). */
  listUserCommunities(accountId: string | null): Promise<ProviderResult>;
}

const notConfigured = (provider: string): ProviderResult => ({ status: "not_configured", communities: [], message: `${provider}: אינטגרציה רשמית טרם הוגדרה — מצב ידני בלבד.` });

/** Manual provider — communities are entered by the agent; nothing external. */
export const ManualCommunityProvider: CommunityProvider = {
  provider: "manual",
  async discoverCommunities() { return { status: "ok", communities: [] }; },
  normalizeCommunity(raw) {
    return { name: String(raw.name ?? ""), platform: String(raw.platform ?? "manual"), sourceUrl: (raw.source_url as string) ?? null, membersCount: Number(raw.members_count ?? 0) };
  },
  async getCommunityMetadata() { return { status: "ok", communities: [] }; },
  async listUserCommunities() { return { status: "ok", communities: [] }; },
};

/** CSV/paste provider — parses agent-pasted lists (real, no network). */
export const CsvCommunityProvider: CommunityProvider = {
  provider: "csv",
  async discoverCommunities() { return { status: "ok", communities: [] }; },
  normalizeCommunity(raw) {
    return {
      name: String(raw.name ?? raw.community ?? ""), platform: String(raw.platform ?? "facebook"),
      sourceUrl: (raw.source_url as string) ?? (raw.url as string) ?? null, cityGuess: (raw.city as string) ?? null,
      audienceGuess: (raw.audience as string) ?? null, communityTypeGuess: (raw.type as string) ?? null,
      membersCount: Number(raw.members ?? raw.members_count ?? 0),
    };
  },
  async getCommunityMetadata() { return { status: "ok", communities: [] }; },
  async listUserCommunities() { return { status: "ok", communities: [] }; },
};

/** Placeholder — real Facebook Groups integration is future + official-API only. */
export const FacebookGroupsProvider: CommunityProvider = {
  provider: "facebook",
  async discoverCommunities() { return notConfigured("Facebook Groups"); },
  normalizeCommunity(raw) { return ManualCommunityProvider.normalizeCommunity({ ...raw, platform: "facebook" }); },
  async getCommunityMetadata() { return notConfigured("Facebook Groups"); },
  async listUserCommunities() { return notConfigured("Facebook Groups"); },
};

export const WhatsAppCommunityProvider: CommunityProvider = {
  provider: "whatsapp",
  async discoverCommunities() { return notConfigured("WhatsApp"); },
  normalizeCommunity(raw) { return ManualCommunityProvider.normalizeCommunity({ ...raw, platform: "whatsapp" }); },
  async getCommunityMetadata() { return notConfigured("WhatsApp"); },
  async listUserCommunities() { return notConfigured("WhatsApp"); },
};

export const TelegramCommunityProvider: CommunityProvider = {
  provider: "telegram",
  async discoverCommunities() { return notConfigured("Telegram"); },
  normalizeCommunity(raw) { return ManualCommunityProvider.normalizeCommunity({ ...raw, platform: "telegram" }); },
  async getCommunityMetadata() { return notConfigured("Telegram"); },
  async listUserCommunities() { return notConfigured("Telegram"); },
};

export const communityProviders: Record<string, CommunityProvider> = {
  manual: ManualCommunityProvider, csv: CsvCommunityProvider, facebook: FacebookGroupsProvider,
  whatsapp: WhatsAppCommunityProvider, telegram: TelegramCommunityProvider,
};
