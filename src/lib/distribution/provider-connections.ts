// ============================================================================
// ZONO — Distribution provider CONNECTIONS (Phase 10.3, server-only).
// ----------------------------------------------------------------------------
// Connection MANAGEMENT only: types + repository + service + the validation that
// runs the existing Facebook provider STUB. There is NO live Meta API yet, so a
// connection is never reported as "connected" by validation — it returns
// manual_publish_required / not_connected. Tokens are never written here.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getProviderByKey } from "./distribution-provider-registry";

const TABLE = "distribution_provider_connections";

// ── Provider catalogue (what the Connection Center shows) ─────────────────────
export type ConnectionProvider =
  | "facebook" | "instagram" | "whatsapp"
  | "facebook_pages" | "facebook_groups" | "facebook_marketplace";

export const CONNECTION_PROVIDERS: ConnectionProvider[] = [
  "facebook", "instagram", "whatsapp", "facebook_pages", "facebook_groups", "facebook_marketplace",
];

export type ConnectionStatus =
  | "not_connected" | "manual_mode" | "pending_approval" | "connected" | "expired" | "error" | "disconnected";

export type ConnectionMode = "manual" | "api";

export interface ProviderConnectionRow {
  id: string; org_id: string; provider: ConnectionProvider; status: ConnectionStatus;
  connection_mode: ConnectionMode; display_name: string | null; external_account_id: string | null;
  access_token_encrypted: string | null; refresh_token_encrypted: string | null; token_expires_at: string | null;
  scopes: string[]; metadata: Record<string, unknown>; last_validated_at: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

/** Static provider metadata surfaced in the UI (labels, future scopes, copy). */
export interface ProviderMeta {
  provider: ConnectionProvider; label: string; hebrewLabel: string;
  group: "facebook" | "instagram" | "whatsapp";
  futureScopes: string[];           // permissions an approved Meta API would require
  destinationsLater: string[];      // destinations available AFTER API approval
}

export const PROVIDER_META: Record<ConnectionProvider, ProviderMeta> = {
  facebook: {
    provider: "facebook", label: "Facebook", hebrewLabel: "Facebook", group: "facebook",
    futureScopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list", "public_profile"],
    destinationsLater: ["עמודי Facebook", "קבוצות מורשות", "Marketplace (בכפוף למדיניות Meta)"],
  },
  facebook_pages: {
    provider: "facebook_pages", label: "Facebook Pages", hebrewLabel: "עמודי Facebook", group: "facebook",
    futureScopes: ["pages_manage_posts", "pages_read_engagement", "pages_show_list"],
    destinationsLater: ["פרסום אוטומטי לעמודי העסק שבניהולך"],
  },
  facebook_groups: {
    provider: "facebook_groups", label: "Facebook Groups", hebrewLabel: "קבוצות Facebook", group: "facebook",
    futureScopes: ["publish_to_groups (כפוף לאישור ומדיניות Meta)"],
    destinationsLater: ["פרסום לקבוצות שבהן אתה חבר/מנהל ומורשה לפרסם"],
  },
  facebook_marketplace: {
    provider: "facebook_marketplace", label: "Facebook Marketplace", hebrewLabel: "Marketplace", group: "facebook",
    futureScopes: ["commerce / catalog (בכפוף לזמינות ומדיניות Meta)"],
    destinationsLater: ["פרסום נכסים ל-Marketplace — כפוף לזמינות API ומדיניות Meta"],
  },
  instagram: {
    provider: "instagram", label: "Instagram", hebrewLabel: "Instagram", group: "instagram",
    futureScopes: ["instagram_basic", "instagram_content_publish", "pages_show_list"],
    destinationsLater: ["פרסום פוסטים לחשבון Instagram Business המקושר"],
  },
  whatsapp: {
    provider: "whatsapp", label: "WhatsApp", hebrewLabel: "WhatsApp", group: "whatsapp",
    futureScopes: ["whatsapp_business_messaging", "whatsapp_business_management"],
    destinationsLater: ["שליחת הודעות יזומות בכפוף לאישור WhatsApp Business API"],
  },
};

// ── Compliance copy (surfaced in the Connection Center) ───────────────────────
export const CONNECTION_COMPLIANCE: string[] = [
  "יש לפרסם רק בקבוצות שבהן הסוכן חבר או מורשה לפרסם.",
  "יש לכבד את חוקי הקבוצה והנהלים שלה.",
  "אין לבצע ספאם — אין לפרסם תוכן זהה במספר קבוצות בו-זמנית.",
  "החיבור הרשמי לפייסבוק ידרוש אישור Meta והרשאות מתאימות.",
];

type DB = Awaited<ReturnType<typeof createClient>>;
async function scope(): Promise<{ db: DB; orgId: string; userId: string | null } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { db: await createClient(), orgId: profile.org_id, userId: profile.id ?? null };
}
const list = <T>(d: unknown): T[] => (d ?? []) as T[];

// ── Repository ────────────────────────────────────────────────────────────────
export const providerConnectionRepository = {
  async getProviderConnections(): Promise<ProviderConnectionRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(TABLE as never).select("*").eq("org_id", s.orgId);
    return list<ProviderConnectionRow>(data);
  },
  async getProviderConnection(provider: ConnectionProvider): Promise<ProviderConnectionRow | null> {
    const s = await scope(); if (!s) return null;
    const { data } = await s.db.from(TABLE as never).select("*").eq("org_id", s.orgId).eq("provider", provider).maybeSingle();
    return (data as unknown as ProviderConnectionRow) ?? null;
  },
  async upsertProviderConnection(input: {
    provider: ConnectionProvider; status?: ConnectionStatus; connectionMode?: ConnectionMode;
    displayName?: string | null; scopes?: string[]; metadata?: Record<string, unknown>;
  }): Promise<ProviderConnectionRow | null> {
    const s = await scope(); if (!s) return null;
    const { data, error } = await s.db.from(TABLE as never).upsert({
      org_id: s.orgId, provider: input.provider,
      status: input.status ?? "not_connected", connection_mode: input.connectionMode ?? "manual",
      display_name: input.displayName ?? null, scopes: input.scopes ?? [],
      metadata: input.metadata ?? {}, created_by: s.userId,
    } as never, { onConflict: "org_id,provider" } as never).select("*").single();
    if (error) { console.error("[provider-connections] upsert:", error.message); return null; }
    return data as unknown as ProviderConnectionRow;
  },
  async updateProviderStatus(provider: ConnectionProvider, status: ConnectionStatus, patch: Partial<{ connection_mode: ConnectionMode; last_validated_at: string; metadata: Record<string, unknown> }> = {}): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(TABLE as never).update({ status, ...patch } as never)
      .eq("org_id", s.orgId).eq("provider", provider);
    return !error;
  },
  /**
   * Store a real Meta API connection on the `facebook` provider row. The token
   * MUST already be encrypted by the caller — this method never encrypts/logs.
   */
  async storeMetaConnection(input: {
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string | null;
    tokenExpiresAt?: string | null;
    scopes: string[];
    externalAccountId: string | null;
    displayName: string | null;
  }): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    const { error } = await s.db.from(TABLE as never).upsert({
      org_id: s.orgId, provider: "facebook", status: "connected", connection_mode: "api",
      display_name: input.displayName, external_account_id: input.externalAccountId,
      access_token_encrypted: input.accessTokenEncrypted,
      refresh_token_encrypted: input.refreshTokenEncrypted ?? null,
      token_expires_at: input.tokenExpiresAt ?? null,
      scopes: input.scopes, last_validated_at: new Date().toISOString(), created_by: s.userId,
    } as never, { onConflict: "org_id,provider" } as never);
    if (error) { console.error("[provider-connections] storeMetaConnection failed"); return false; }
    return true;
  },

  async disconnectProvider(provider: ConnectionProvider): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    // Hard-clear any token material and mark disconnected (we never stored real tokens,
    // but this guarantees the row holds nothing sensitive).
    const { error } = await s.db.from(TABLE as never).update({
      status: "disconnected", connection_mode: "manual",
      access_token_encrypted: null, refresh_token_encrypted: null, token_expires_at: null,
    } as never).eq("org_id", s.orgId).eq("provider", provider);
    return !error;
  },
};

// ── Service ───────────────────────────────────────────────────────────────────
export interface ProviderConnectionView extends ProviderMeta {
  status: ConnectionStatus; connectionMode: ConnectionMode;
  displayName: string | null; lastValidatedAt: string | null;
  providerStubStatus: string;       // raw status from the provider stub validation
  providerStubMessage: string;      // Hebrew message from the stub
}

/** Map a connection provider to the underlying DistributionProvider stub key. */
function stubKeyFor(provider: ConnectionProvider): string {
  if (provider.startsWith("facebook")) return "facebook";
  return provider; // instagram | whatsapp
}

export const providerConnectionService = {
  /** All providers with their persisted connection + live stub validation status. */
  async listConnections(): Promise<ProviderConnectionView[]> {
    const s = await scope();
    const rows = await providerConnectionRepository.getProviderConnections();
    const byProvider = new Map<ConnectionProvider, ProviderConnectionRow>(rows.map((r) => [r.provider, r]));
    const out: ProviderConnectionView[] = [];
    for (const provider of CONNECTION_PROVIDERS) {
      const meta = PROVIDER_META[provider];
      const row = byProvider.get(provider) ?? null;
      // Live stub validation — NEVER returns a real "connected".
      const stub = getProviderByKey(stubKeyFor(provider));
      const conn = await stub.validateConnection(s?.orgId ?? "");
      out.push({
        ...meta,
        status: row?.status ?? "not_connected",
        connectionMode: row?.connection_mode ?? "manual",
        displayName: row?.display_name ?? null,
        lastValidatedAt: row?.last_validated_at ?? null,
        providerStubStatus: conn.status,
        providerStubMessage: conn.message,
      });
    }
    return out;
  },

  /** Initialize Facebook in MANUAL mode (the only currently-available mode). */
  async initializeManualFacebook(): Promise<{ ok: boolean; message: string }> {
    const meta = PROVIDER_META.facebook;
    const row = await providerConnectionRepository.upsertProviderConnection({
      provider: "facebook", status: "manual_mode", connectionMode: "manual",
      displayName: "Facebook (פרסום ידני)", scopes: [],
      metadata: { manual: true, future_scopes: meta.futureScopes, note: "ממתין לאישור Meta API" },
    });
    if (!row) return { ok: false, message: "אתחול החיבור נכשל (הרשאות/חיבור)." };
    await providerConnectionRepository.updateProviderStatus("facebook", "manual_mode", { last_validated_at: new Date().toISOString() });
    return { ok: true, message: "מצב פרסום ידני הופעל ל-Facebook. החיבור הרשמי דורש אישור Meta." };
  },

  /**
   * Validate a provider via its STUB. Returns the honest state:
   *  - facebook/groups/pages/marketplace in manual_mode → manual_publish_required
   *  - otherwise not_connected. Never fakes "connected".
   */
  async validate(provider: ConnectionProvider): Promise<{ status: "manual_publish_required" | "not_connected"; message: string }> {
    const s = await scope();
    const stub = getProviderByKey(stubKeyFor(provider));
    const conn = await stub.validateConnection(s?.orgId ?? "");
    const existing = await providerConnectionRepository.getProviderConnection(provider);
    const manual = existing?.status === "manual_mode";
    const result = manual
      ? { status: "manual_publish_required" as const, message: "פרסום ידני נדרש — Facebook API טרם חובר." }
      : { status: "not_connected" as const, message: conn.message };
    // Record the validation timestamp (without changing a manual_mode status).
    if (existing) {
      await providerConnectionRepository.updateProviderStatus(provider, existing.status, {
        last_validated_at: new Date().toISOString(),
        metadata: { ...existing.metadata, last_validation: result.status },
      });
    }
    return result;
  },

  async disconnect(provider: ConnectionProvider): Promise<{ ok: boolean; message: string }> {
    const ok = await providerConnectionRepository.disconnectProvider(provider);
    return { ok, message: ok ? "החיבור נותק." : "ניתוק החיבור נכשל." };
  },

  /** Is Facebook connected to a live API? (Always false in this phase.) */
  async isFacebookApiConnected(): Promise<boolean> {
    const row = await providerConnectionRepository.getProviderConnection("facebook");
    return row?.status === "connected" && row?.connection_mode === "api";
  },
};
