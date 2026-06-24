// ============================================================================
// ZONO — Meta Page DISCOVERY (Phase 19, server-only).
// ----------------------------------------------------------------------------
// Discovers the Facebook Pages the connected user manages and stores them as
// available publishing DESTINATIONS in distribution_provider_destinations.
//
// HARD LIMITS (this module does NOTHING beyond discovery):
//   - No publishing, no scheduling, no auto-posting.
//   - No analytics. No WhatsApp.
// SECURITY:
//   - The Facebook user token is decrypted SERVER-SIDE only (never to client).
//   - Page tokens, if Meta returns them, are ENCRYPTED before storage.
//   - No token (user or page) is ever logged or returned to the client.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { getSessionContext } from "@/lib/auth/session";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/security/crypto";
import { getMetaOAuthConfig, fetchPages, type PagesErrorType } from "./meta-oauth";
import { providerConnectionRepository } from "./provider-connections";
import { facebookConnectionPathService } from "./facebook-connection-paths";

const TABLE = "distribution_provider_destinations";
const PROVIDER = "facebook";
const DEST_TYPE = "facebook_page";
const LOG = "[meta-pages]";

/** Client-safe view of a discovered Page — NEVER carries a token. */
export interface MetaPageDestinationView {
  externalId: string;
  name: string;
  category: string | null;
  status: string;
  hasPageToken: boolean;
  lastSyncedAt: string | null;
}

export type SyncReason = "not_connected" | "expired" | "permission" | "config" | "store" | "unknown";
export type SyncMetaPagesResult =
  | { ok: true; pages: MetaPageDestinationView[]; count: number; message: string }
  | { ok: false; reason: SyncReason; message: string };

interface DestRow {
  external_id: string; name: string | null; category: string | null;
  status: string; access_token_encrypted: string | null; last_synced_at: string | null;
}

function toView(r: DestRow): MetaPageDestinationView {
  return {
    externalId: r.external_id,
    name: r.name ?? "(ללא שם)",
    category: r.category,
    status: r.status,
    hasPageToken: !!r.access_token_encrypted,
    lastSyncedAt: r.last_synced_at,
  };
}

export const metaPagesService = {
  /** Read stored Page destinations for the current org (no tokens leave the server). */
  async listPages(): Promise<MetaPageDestinationView[]> {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return [];
    const db = await createClient();
    const { data } = await db.from(TABLE as never)
      .select("external_id,name,category,status,access_token_encrypted,last_synced_at")
      .eq("org_id", profile.org_id).eq("provider", PROVIDER).eq("destination_type", DEST_TYPE)
      .order("name", { ascending: true });
    return ((data ?? []) as unknown as DestRow[]).map(toView);
  },

  /**
   * Sync the connected Facebook account's managed Pages into destinations.
   * DISCOVERY ONLY — never publishes. Returns honest connection/permission states.
   */
  async syncPages(): Promise<SyncMetaPagesResult> {
    const { profile, user } = await getSessionContext();
    if (!profile?.org_id || !user) return { ok: false, reason: "not_connected", message: "אין חיבור פעיל." };
    const orgId = profile.org_id;
    const userId = profile.id ?? null;

    // 1) Canonical connection must exist + be connected.
    const conn = await providerConnectionRepository.getProviderConnection("facebook");
    if (!conn || conn.status !== "connected" || !conn.access_token_encrypted) {
      return { ok: false, reason: "not_connected", message: "Meta אינו מחובר. חבר תחילה את חשבון Meta." };
    }
    if (!isEncryptionConfigured()) {
      return { ok: false, reason: "config", message: "הצפנה אינה מוגדרת בשרת — לא ניתן לקרוא את הטוקן." };
    }
    const cfg = getMetaOAuthConfig();
    if (!cfg.configured) return { ok: false, reason: "config", message: "הגדרות Meta חסרות." };

    // 2) Decrypt the user token SERVER-SIDE only.
    let userToken: string;
    try {
      userToken = decryptSecret(conn.access_token_encrypted);
    } catch {
      console.error(`${LOG} token decrypt failed for org_id=${orgId}`);
      return { ok: false, reason: "config", message: "פענוח הטוקן נכשל." };
    }

    // 3) Call Graph /me/accounts.
    const result = await fetchPages(cfg, userToken);
    if (result.error) {
      return await handlePagesError(result.error.type, orgId, userId);
    }

    // 4) Empty → no managed pages (honest, not an error).
    if (result.pages.length === 0) {
      console.log(`${LOG} org_id=${orgId} discovered 0 pages`);
      return { ok: true, pages: [], count: 0, message: "לא נמצאו עמודי Facebook לניהול בחשבון המחובר" };
    }

    // 5) Persist (service-role; explicit verified org). Encrypt page tokens.
    if (!isServiceRoleConfigured()) {
      return { ok: false, reason: "store", message: "אחסון לא זמין (service role)." };
    }
    const db = createServiceRoleClient();
    const now = new Date().toISOString();
    const rows = result.pages.map((p) => ({
      org_id: orgId, provider: PROVIDER, destination_type: DEST_TYPE,
      external_id: p.id, name: p.name, category: p.category, status: "available",
      access_token_encrypted: p.accessToken ? encryptSecret(p.accessToken) : null,
      metadata: { tasks: p.tasks }, last_synced_at: now, created_by: userId,
    }));
    const { error } = await db.from(TABLE as never)
      .upsert(rows as never, { onConflict: "org_id,provider,destination_type,external_id" } as never);
    if (error) {
      console.error(`${LOG} upsert FAILED org_id=${orgId}: code=${error.code ?? "?"} message=${error.message ?? "?"}`);
      return { ok: false, reason: "store", message: "שמירת העמודים נכשלה." };
    }

    console.log(`${LOG} org_id=${orgId} synced ${rows.length} page(s) [tokens encrypted, not logged]`);
    const pages = await this.listPages();
    return { ok: true, pages, count: pages.length, message: `סונכרנו ${pages.length} עמודים.` };
  },
};

/** Map a Graph error type to an honest result + reflect token state on the connection. */
async function handlePagesError(type: PagesErrorType, orgId: string, userId: string | null): Promise<SyncMetaPagesResult> {
  if (type === "expired") {
    // Mark the canonical connection + path expired so the UI shows reconnect.
    await providerConnectionRepository.updateProviderStatus("facebook", "expired").catch(() => {});
    await facebookConnectionPathService.setMetaStatusServiceRole(orgId, userId, "expired", {}).catch(() => {});
    console.warn(`${LOG} org_id=${orgId} token expired — marked expired`);
    return { ok: false, reason: "expired", message: "תוקף החיבור פג. יש להתחבר מחדש ל-Meta." };
  }
  if (type === "permission") {
    return { ok: false, reason: "permission", message: "נדרש pages_show_list כדי למשוך עמודי Facebook" };
  }
  return { ok: false, reason: "unknown", message: "שגיאה במשיכת העמודים מ-Meta." };
}
