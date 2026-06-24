// ============================================================================
// ZONO — Meta DISCOVERY service (Phase 19, server-only).
// ----------------------------------------------------------------------------
// Discovers, under the connected Facebook account, the available publishing
// DESTINATIONS and stores them in distribution_provider_destinations:
//   - facebook_page              (GET /me/accounts)
//   - instagram_business_account (GET /{page}?fields=instagram_business_account)
//   - lead_ad_form               (GET /{page}/leadgen_forms)
// Plus a permissions/readiness snapshot (GET /me/permissions).
//
// HARD LIMITS: discovery + readiness only. No WhatsApp, no Groups, no scraping,
// no analytics fabrication. Publishing lives in meta-publish.ts (Pages only).
// SECURITY: user token decrypted server-side only; page tokens encrypted before
// storage; no token logged or returned to the client.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { isServiceRoleConfigured } from "@/lib/supabase/env";
import { getSessionContext } from "@/lib/auth/session";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";
import {
  fetchPages, fetchInstagramForPage, fetchLeadForms, fetchPermissions,
  META_RELEASE_PERMISSIONS, type PagesErrorType,
} from "./meta-oauth";
import { loadConnectedMetaToken } from "./meta-token";
import { providerConnectionRepository } from "./provider-connections";
import { facebookConnectionPathService } from "./facebook-connection-paths";

const TABLE = "distribution_provider_destinations";
const PROVIDER = "facebook";
const LOG = "[meta-pages]";

export type MetaDestinationType = "facebook_page" | "instagram_business_account" | "lead_ad_form";

/** Client-safe view of a discovered destination — NEVER carries a token. */
export interface MetaDestinationView {
  destinationType: MetaDestinationType;
  externalId: string;
  name: string;
  category: string | null;
  status: string;
  hasToken: boolean;
  metadata: Record<string, unknown>;
  lastSyncedAt: string | null;
}
/** Back-compat alias for the Pages-only view used by PHASE 19 base. */
export type MetaPageDestinationView = MetaDestinationView;

export interface MetaPermissionView { permission: string; granted: boolean; unlocks: string }

export interface MetaIntegrationView {
  pages: MetaDestinationView[];
  instagram: MetaDestinationView[];
  leadForms: MetaDestinationView[];
  permissions: MetaPermissionView[];
  readiness: {
    pagesConnected: number;
    canPublishPages: boolean;        // pages_manage_posts
    instagramReady: boolean;         // instagram_basic + instagram_content_publish
    leadsReady: boolean;             // leads_retrieval
    analyticsReady: boolean;         // read_insights
  };
}

export type SyncReason = "not_connected" | "expired" | "permission" | "config" | "store" | "unknown";
export type SyncMetaPagesResult =
  | { ok: true; pages: MetaDestinationView[]; instagram: MetaDestinationView[]; leadForms: MetaDestinationView[]; count: number; message: string }
  | { ok: false; reason: SyncReason; message: string };

const PERMISSION_UNLOCKS: Record<string, string> = {
  pages_show_list: "משיכת עמודי Facebook שבניהולך",
  pages_manage_posts: "פרסום פוסטים לעמודי Facebook",
  pages_read_engagement: "קריאת מעורבות ותגובות בעמודים",
  read_insights: "אנליטיקה (חשיפות, קליקים, CTR)",
  instagram_basic: "זיהוי חשבון Instagram Business המקושר",
  instagram_content_publish: "פרסום ל-Instagram",
  leads_retrieval: "משיכת טפסי Lead Ads",
};

interface DestRow {
  destination_type: string; external_id: string; name: string | null; category: string | null;
  status: string; access_token_encrypted: string | null; metadata: Record<string, unknown> | null; last_synced_at: string | null;
}
function toView(r: DestRow): MetaDestinationView {
  return {
    destinationType: r.destination_type as MetaDestinationType,
    externalId: r.external_id, name: r.name ?? "(ללא שם)", category: r.category,
    status: r.status, hasToken: !!r.access_token_encrypted,
    metadata: r.metadata ?? {}, lastSyncedAt: r.last_synced_at,
  };
}

async function readDestinations(): Promise<MetaDestinationView[]> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return [];
  const db = await createClient();
  const { data } = await db.from(TABLE as never)
    .select("destination_type,external_id,name,category,status,access_token_encrypted,metadata,last_synced_at")
    .eq("org_id", profile.org_id).eq("provider", PROVIDER).order("name", { ascending: true });
  return ((data ?? []) as unknown as DestRow[]).map(toView);
}

export const metaPagesService = {
  /** Back-compat: stored Page destinations only (PHASE 19 base UI). */
  async listPages(): Promise<MetaDestinationView[]> {
    return (await readDestinations()).filter((d) => d.destinationType === "facebook_page");
  },

  /** Full integration snapshot: pages + instagram + lead forms + permissions readiness. */
  async getIntegration(): Promise<MetaIntegrationView> {
    const all = await readDestinations();
    const pages = all.filter((d) => d.destinationType === "facebook_page");
    const instagram = all.filter((d) => d.destinationType === "instagram_business_account");
    const leadForms = all.filter((d) => d.destinationType === "lead_ad_form");

    // Permission snapshot (best-effort; if token/permission read fails we show all missing).
    let granted: string[] = [];
    const t = await loadConnectedMetaToken();
    if (t.ok) {
      const p = await fetchPermissions(t.cfg, t.token);
      granted = p.granted;
    }
    const permissions: MetaPermissionView[] = META_RELEASE_PERMISSIONS.map((perm) => ({
      permission: perm, granted: granted.includes(perm), unlocks: PERMISSION_UNLOCKS[perm] ?? "",
    }));
    const has = (p: string) => granted.includes(p);

    return {
      pages, instagram, leadForms, permissions,
      readiness: {
        pagesConnected: pages.length,
        canPublishPages: has("pages_manage_posts"),
        instagramReady: has("instagram_basic") && has("instagram_content_publish"),
        leadsReady: has("leads_retrieval"),
        analyticsReady: has("read_insights"),
      },
    };
  },

  /**
   * Discover Pages + linked Instagram accounts + Lead Ads forms and store them.
   * Discovery only — never publishes. Honest not_connected/expired/permission states.
   */
  async syncPages(): Promise<SyncMetaPagesResult> {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { ok: false, reason: "not_connected", message: "אין חיבור פעיל." };
    const orgId = profile.org_id;
    const userId = profile.id ?? null;

    const t = await loadConnectedMetaToken();
    if (!t.ok) {
      if (t.reason === "expired") return await markExpired(orgId, userId);
      if (t.reason === "not_connected") return { ok: false, reason: "not_connected", message: t.message };
      return { ok: false, reason: "config", message: t.message };
    }
    const { cfg, token } = t;

    // 1) Pages (GET /me/accounts).
    const pagesRes = await fetchPages(cfg, token);
    if (pagesRes.error) return await mapErr(pagesRes.error.type, orgId, userId);
    if (pagesRes.pages.length === 0) {
      return { ok: true, pages: [], instagram: [], leadForms: [], count: 0, message: "לא נמצאו עמודי Facebook לניהול בחשבון המחובר" };
    }

    if (!isServiceRoleConfigured()) return { ok: false, reason: "store", message: "אחסון לא זמין (service role)." };
    const db = createServiceRoleClient();
    const now = new Date().toISOString();

    const rows: Record<string, unknown>[] = [];
    // Page rows.
    for (const p of pagesRes.pages) {
      rows.push({
        org_id: orgId, provider: PROVIDER, destination_type: "facebook_page",
        external_id: p.id, name: p.name, category: p.category, status: "available",
        access_token_encrypted: p.accessToken ? encryptSecret(p.accessToken) : null,
        metadata: { tasks: p.tasks }, last_synced_at: now, created_by: userId,
      });
    }

    // 2/3) Per-page: linked Instagram account + Lead Ads forms (best-effort; uses page token).
    for (const p of pagesRes.pages) {
      if (!p.accessToken) continue; // need a page token to query page edges
      const ig = await fetchInstagramForPage(cfg, p.id, p.accessToken);
      if (ig.account) {
        rows.push({
          org_id: orgId, provider: PROVIDER, destination_type: "instagram_business_account",
          external_id: ig.account.igUserId, name: ig.account.username ?? "Instagram", category: null,
          status: "available", access_token_encrypted: null,
          metadata: { linked_page_id: p.id, username: ig.account.username }, last_synced_at: now, created_by: userId,
        });
      }
      const leads = await fetchLeadForms(cfg, p.id, p.accessToken);
      for (const f of leads.forms) {
        rows.push({
          org_id: orgId, provider: PROVIDER, destination_type: "lead_ad_form",
          external_id: f.id, name: f.name, category: null, status: f.status ?? "available",
          access_token_encrypted: null, metadata: { page_id: p.id }, last_synced_at: now, created_by: userId,
        });
      }
    }

    const { error } = await db.from(TABLE as never)
      .upsert(rows as never, { onConflict: "org_id,provider,destination_type,external_id" } as never);
    if (error) {
      console.error(`${LOG} upsert FAILED org_id=${orgId}: code=${error.code ?? "?"} message=${error.message ?? "?"}`);
      return { ok: false, reason: "store", message: "שמירת היעדים נכשלה." };
    }
    console.log(`${LOG} org_id=${orgId} synced ${rows.length} destination(s) [tokens encrypted, not logged]`);

    const all = await readDestinations();
    return {
      ok: true,
      pages: all.filter((d) => d.destinationType === "facebook_page"),
      instagram: all.filter((d) => d.destinationType === "instagram_business_account"),
      leadForms: all.filter((d) => d.destinationType === "lead_ad_form"),
      count: rows.length,
      message: `סונכרנו ${rows.length} יעדים.`,
    };
  },

  /** Decrypt a stored page token server-side (used by the publish service only). */
  async getPageToken(externalId: string): Promise<string | null> {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return null;
    const db = await createClient();
    const { data } = await db.from(TABLE as never)
      .select("access_token_encrypted")
      .eq("org_id", profile.org_id).eq("provider", PROVIDER).eq("destination_type", "facebook_page")
      .eq("external_id", externalId).maybeSingle();
    const enc = (data as { access_token_encrypted?: string | null } | null)?.access_token_encrypted;
    if (!enc) return null;
    try { return decryptSecret(enc); } catch { return null; }
  },
};

async function markExpired(orgId: string, userId: string | null): Promise<SyncMetaPagesResult> {
  await providerConnectionRepository.updateProviderStatus("facebook", "expired").catch(() => {});
  await facebookConnectionPathService.setMetaStatusServiceRole(orgId, userId, "expired", {}).catch(() => {});
  return { ok: false, reason: "expired", message: "תוקף החיבור פג. יש להתחבר מחדש ל-Meta." };
}
async function mapErr(type: PagesErrorType, orgId: string, userId: string | null): Promise<SyncMetaPagesResult> {
  if (type === "expired") return await markExpired(orgId, userId);
  if (type === "permission") return { ok: false, reason: "permission", message: "נדרש pages_show_list כדי למשוך עמודי Facebook" };
  return { ok: false, reason: "unknown", message: "שגיאה במשיכת היעדים מ-Meta." };
}
