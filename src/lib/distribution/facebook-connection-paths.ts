// ============================================================================
// ZONO — Facebook connection PATHS service (Phase 17, server-only).
// ----------------------------------------------------------------------------
// Two PARALLEL, DISTINCT connection types — never treated as the same:
//   • meta_oauth        official Meta Graph API (Pages / Instagram / Lead Ads /
//                        Analytics / WhatsApp Business). Tokens, when they exist,
//                        live per-provider in distribution_provider_connections —
//                        NOT in this path row.
//   • chrome_extension  user-assisted publishing (Groups / Marketplace / browser
//                        flows). Runs in the USER's own browser session.
//
// HARD SECURITY RULES enforced here:
//   - This module NEVER stores a Facebook password.
//   - This module NEVER stores Facebook cookies or a session token.
//   - The extension only ever sends back NON-sensitive status signals
//     (status string, extension version, a session-detected boolean).
//   - Nothing here publishes. Connection state + destination catalogue only.
//   - No state is ever auto-faked to "connected"/"ready".
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

const TABLE = "facebook_connection_paths";

export type FacebookPathType = "meta_oauth" | "chrome_extension";

/** Meta OAuth path states (official API). */
export type MetaPathStatus = "not_connected" | "connected" | "expired" | "error";
/** Chrome extension path states (user-assisted browser publishing). */
export type ExtensionPathStatus =
  | "not_installed" | "installed" | "facebook_session_detected" | "ready" | "error";

export type FacebookPathStatus = MetaPathStatus | ExtensionPathStatus;

export interface FacebookConnectionPathRow {
  id: string;
  org_id: string;
  path_type: FacebookPathType;
  status: FacebookPathStatus;
  metadata: Record<string, unknown>;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FacebookPathView {
  pathType: FacebookPathType;
  title: string;
  description: string;
  status: FacebookPathStatus;
  /** Destinations this path will serve (shown so each path's scope is explicit). */
  destinations: string[];
  lastCheckedAt: string | null;
  /** Non-sensitive metadata only (e.g. extension version / heartbeat). */
  metadata: Record<string, unknown>;
}

const META_DESTINATIONS = [
  "עמודי Facebook",
  "Instagram",
  "Facebook Lead Ads",
  "Meta Analytics",
  "WhatsApp Business",
];
const EXTENSION_DESTINATIONS = [
  "קבוצות Facebook",
  "Facebook Marketplace",
  "פרסום ידני מבוסס-דפדפן",
];

const VALID_META: MetaPathStatus[] = ["not_connected", "connected", "expired", "error"];
const VALID_EXT: ExtensionPathStatus[] = ["not_installed", "installed", "facebook_session_detected", "ready", "error"];

type DB = Awaited<ReturnType<typeof createClient>>;
async function scope(): Promise<{ db: DB; orgId: string; userId: string | null } | null> {
  const { profile } = await getSessionContext();
  if (!profile?.org_id) return null;
  return { db: await createClient(), orgId: profile.org_id, userId: profile.id ?? null };
}

export const facebookConnectionPathRepository = {
  async getAll(): Promise<FacebookConnectionPathRow[]> {
    const s = await scope(); if (!s) return [];
    const { data } = await s.db.from(TABLE as never).select("*").eq("org_id", s.orgId);
    return (data ?? []) as unknown as FacebookConnectionPathRow[];
  },
  async setStatus(
    pathType: FacebookPathType,
    status: FacebookPathStatus,
    metadata: Record<string, unknown> = {},
  ): Promise<boolean> {
    const s = await scope(); if (!s) return false;
    // Strip any accidentally-passed sensitive keys — defense in depth.
    const safeMeta = stripSensitive(metadata);
    const { error } = await s.db.from(TABLE as never).upsert({
      org_id: s.orgId, path_type: pathType, status,
      metadata: safeMeta, last_checked_at: new Date().toISOString(), created_by: s.userId,
    } as never, { onConflict: "org_id,path_type" } as never);
    if (error) { console.error("[fb-connection-paths] setStatus:", error.message); return false; }
    return true;
  },
};

/** Remove anything that looks like a credential/secret before persisting. */
function stripSensitive(meta: Record<string, unknown>): Record<string, unknown> {
  const banned = /(password|cookie|session|token|secret|credential|auth)/i;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) if (!banned.test(k)) out[k] = v;
  return out;
}

export const facebookConnectionPathService = {
  /** Both connection paths with honest defaults (meta=not_connected, ext=not_installed). */
  async getPaths(): Promise<{ meta: FacebookPathView; extension: FacebookPathView }> {
    const rows = await facebookConnectionPathRepository.getAll();
    const byType = new Map(rows.map((r) => [r.path_type, r]));
    const metaRow = byType.get("meta_oauth");
    const extRow = byType.get("chrome_extension");

    const metaStatus = (VALID_META as string[]).includes(metaRow?.status as string)
      ? (metaRow!.status as MetaPathStatus) : "not_connected";
    const extStatus = (VALID_EXT as string[]).includes(extRow?.status as string)
      ? (extRow!.status as ExtensionPathStatus) : "not_installed";

    return {
      meta: {
        pathType: "meta_oauth",
        title: "חיבור Meta רשמי",
        description: "לעמודי פייסבוק, אינסטגרם, לידים, אנליטיקה ו-WhatsApp Business",
        status: metaStatus,
        destinations: META_DESTINATIONS,
        lastCheckedAt: metaRow?.last_checked_at ?? null,
        metadata: stripSensitive(metaRow?.metadata ?? {}),
      },
      extension: {
        pathType: "chrome_extension",
        title: "תוסף Chrome לפרסום בקבוצות",
        description: "לעבודה עם קבוצות Facebook ו-Marketplace מתוך הדפדפן של המשתמש",
        status: extStatus,
        destinations: EXTENSION_DESTINATIONS,
        lastCheckedAt: extRow?.last_checked_at ?? null,
        metadata: stripSensitive(extRow?.metadata ?? {}),
      },
    };
  },

  /**
   * Meta OAuth start — official connection requires Meta App Review + business
   * verification, which is not yet wired. Returns an honest "not available yet"
   * result and NEVER flips status to "connected".
   */
  async startMetaOAuth(): Promise<{ ok: boolean; message: string }> {
    return {
      ok: false,
      message: "חיבור Meta רשמי דורש אישור Meta והרשאות — בתהליך. עד אז הפרסום מתבצע ידנית.",
    };
  },

  /**
   * Extension heartbeat — the ONLY way the chrome_extension status becomes
   * installed/ready. Intended to be called by the real extension later with a
   * non-sensitive payload. Validates the status; refuses unknown values.
   */
  async recordExtensionHeartbeat(
    status: ExtensionPathStatus,
    version?: string,
  ): Promise<{ ok: boolean; message: string }> {
    if (!(VALID_EXT as string[]).includes(status)) {
      return { ok: false, message: "סטטוס תוסף לא תקין." };
    }
    const ok = await facebookConnectionPathRepository.setStatus("chrome_extension", status, version ? { version } : {});
    return { ok, message: ok ? "סטטוס התוסף עודכן." : "עדכון סטטוס התוסף נכשל." };
  },

  /**
   * Set the Meta OAuth path status (called by the real OAuth callback on success,
   * or to mark expired/error). Stores only NON-sensitive metadata (display name,
   * account id, scopes) — never the token.
   */
  async setMetaStatus(status: MetaPathStatus, metadata: Record<string, unknown> = {}): Promise<boolean> {
    return facebookConnectionPathRepository.setStatus("meta_oauth", status, metadata);
  },

  /** Read-only refresh — returns current real state (never fabricates). */
  async refreshExtensionStatus(): Promise<ExtensionPathStatus> {
    const { extension } = await this.getPaths();
    return extension.status as ExtensionPathStatus;
  },
};
