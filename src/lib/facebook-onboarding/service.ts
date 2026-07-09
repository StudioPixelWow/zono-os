// ============================================================================
// 📘 ZONO — Facebook Onboarding state machine (server-only).
// Drives the /facebook product flow across the REAL Meta OAuth lifecycle:
//   not-configured → not-live → not-connected → connected → synced (partial ok)
//   → imported → dashboard.
// State persists in the EXISTING facebook provider row (distribution_provider_
// connections) — NO new schema. The connection itself is the canonical
// `status="connected" & connection_mode="api"` written by the OAuth callback.
// The scan performs a REAL sync when connected (Pages via meta-pages, Business
// Managers, Ad Accounts, granted permissions) and always reads the org's REAL
// group library (community_profiles). When NOT connected it stays in honest
// manual mode. Nothing here publishes, scrapes, or fakes a live connection.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { providerConnectionRepository } from "@/lib/distribution/provider-connections";
import { loadConnectedMetaToken } from "@/lib/distribution/meta-token";
import { metaPagesService } from "@/lib/distribution/meta-pages";
import { fetchPermissions, fetchBusinesses, fetchAdAccounts } from "@/lib/distribution/meta-oauth";

export type FbOnboardingState = "disconnected" | "connected" | "scanned" | "imported";

/** Per-asset availability after a real sync. */
export type FbAssetStatus = "ok" | "permission" | "expired" | "unavailable";

export interface FbDiscoveredGroup { id: string; name: string; members: number; audience: string | null; city: string | null }
export interface FbDiscovery {
  groups: FbDiscoveredGroup[];
  pages: number | null;               // null = not available (see pagesStatus)
  businessManagers: number | null;
  adAccounts: number | null;
  // Real-lifecycle enrichment (optional; absent on legacy/simulated discovery).
  mode?: "real" | "manual";
  connectedUser?: string | null;
  permissions?: string[];
  pagesStatus?: FbAssetStatus;
  groupsStatus?: "library" | "unavailable";
  businessesStatus?: FbAssetStatus;
  adAccountsStatus?: FbAssetStatus;
  health?: "healthy" | "expired" | "degraded";
  syncedAt?: string | null;
}
export interface FbOnboarding {
  state: FbOnboardingState;
  /** True when a REAL Meta API connection exists (status=connected & mode=api). */
  apiConnected: boolean;
  connectedUser: string | null;
  connectedAt: string | null;
  scannedAt: string | null;
  discovery: FbDiscovery | null;
  importedGroupIds: string[];
}

interface OnboardingMeta {
  connected?: boolean; connectedAt?: string | null;
  discovery?: FbDiscovery | null; scannedAt?: string | null;
  importedGroupIds?: string[]; importedAt?: string | null;
}

const isApiConnected = (row: { status?: string | null; connection_mode?: string | null } | null): boolean =>
  !!row && row.status === "connected" && row.connection_mode === "api";

/** Read the current onboarding state. A REAL Meta connection (status=connected &
 *  mode=api, written by the OAuth callback) is authoritative — it moves the flow
 *  straight to "connected" even before any onboarding metadata is written. */
export async function getFacebookOnboarding(): Promise<FbOnboarding> {
  const row = await providerConnectionRepository.getProviderConnection("facebook").catch(() => null);
  const ob = ((row?.metadata as { onboarding?: OnboardingMeta } | undefined)?.onboarding ?? {}) as OnboardingMeta;

  const apiConnected = isApiConnected(row);
  const connected = apiConnected || ob.connected === true;
  const scanned = !!ob.discovery;
  const imported = !!ob.importedAt || (Array.isArray(ob.importedGroupIds) && ob.importedGroupIds.length > 0);

  let state: FbOnboardingState = "disconnected";
  if (imported) state = "imported";
  else if (scanned) state = "scanned";
  else if (connected) state = "connected";

  return {
    state,
    apiConnected,
    connectedUser: apiConnected ? (row?.display_name ?? null) : null,
    connectedAt: ob.connectedAt ?? null,
    scannedAt: ob.scannedAt ?? null,
    discovery: ob.discovery ?? null,
    importedGroupIds: ob.importedGroupIds ?? [],
  };
}

/** The org's REAL Facebook group library (community_profiles). Always available. */
async function readGroupLibrary(): Promise<FbDiscoveredGroup[]> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  const db = await createClient();
  try {
    let q = db.from("community_profiles").select("id,name,audience_type,members_count,city,platform,status").eq("platform", "facebook");
    if (orgId) q = q.eq("organization_id", orgId);
    const { data } = await q.order("members_count", { ascending: false }).limit(100);
    return ((data ?? []) as { id: string; name: string; audience_type: string | null; members_count: number | null; city: string | null }[])
      .map((c) => ({ id: c.id, name: c.name, members: c.members_count ?? 0, audience: c.audience_type ?? null, city: c.city ?? null }));
  } catch { return []; }
}

/** Map a discriminated error type onto the asset-status vocabulary. */
function statusFromErr(type: "expired" | "permission" | "unknown"): FbAssetStatus {
  return type === "expired" ? "expired" : type === "permission" ? "permission" : "unavailable";
}

/**
 * Discover assets. Groups are ALWAYS the org's REAL community library. When a
 * real Meta connection exists we additionally sync REAL Pages (stored as
 * publishing destinations), Business Managers and Ad Accounts, plus the granted
 * permission set — each with an honest per-asset availability status. When NOT
 * connected, Pages/BM/Ad-Accounts return null (they require the official API).
 */
export async function discoverFacebookAssets(): Promise<FbDiscovery> {
  const groups = await readGroupLibrary();
  const groupsStatus = groups.length > 0 ? "library" as const : "unavailable" as const;

  const row = await providerConnectionRepository.getProviderConnection("facebook").catch(() => null);
  if (!isApiConnected(row)) {
    // Manual/simulated mode — no official API. Honest nulls (not zeros).
    return { groups, pages: null, businessManagers: null, adAccounts: null, mode: "manual", groupsStatus };
  }

  const connectedUser = row?.display_name ?? null;
  const t = await loadConnectedMetaToken();
  if (!t.ok) {
    // Connected row but the token is unusable (expired / config). Honest state.
    const s: FbAssetStatus = t.reason === "expired" ? "expired" : "unavailable";
    return {
      groups, pages: null, businessManagers: null, adAccounts: null,
      mode: "real", connectedUser, permissions: [],
      pagesStatus: s, groupsStatus, businessesStatus: s, adAccountsStatus: s,
      health: t.reason === "expired" ? "expired" : "degraded",
      syncedAt: new Date().toISOString(),
    };
  }

  // Real sync — best-effort, each edge independent. Pages sync also STORES the
  // page destinations (reuses meta-pages; never publishes).
  const perms = await fetchPermissions(t.cfg, t.token).catch(() => ({ granted: [] as string[] }));
  const pagesRes = await metaPagesService.syncPages().catch(() => ({ ok: false as const, reason: "unknown" as const, message: "" }));
  const biz = await fetchBusinesses(t.cfg, t.token).catch(() => ({ businesses: [], error: { type: "unknown" as const, message: "" } }));
  const ads = await fetchAdAccounts(t.cfg, t.token).catch(() => ({ adAccounts: [], error: { type: "unknown" as const, message: "" } }));

  const pages = pagesRes.ok ? pagesRes.count : null;
  const pagesStatus: FbAssetStatus = pagesRes.ok
    ? "ok"
    : pagesRes.reason === "permission" ? "permission"
    : pagesRes.reason === "expired" ? "expired" : "unavailable";

  const businessManagers = biz.error ? null : biz.businesses.length;
  const businessesStatus: FbAssetStatus = biz.error ? statusFromErr(biz.error.type) : "ok";

  const adAccounts = ads.error ? null : ads.adAccounts.length;
  const adAccountsStatus: FbAssetStatus = ads.error ? statusFromErr(ads.error.type) : "ok";

  const anyExpired = [pagesStatus, businessesStatus, adAccountsStatus].includes("expired");
  const health: FbDiscovery["health"] = anyExpired ? "expired" : pagesStatus === "ok" ? "healthy" : "degraded";

  return {
    groups, pages, businessManagers, adAccounts,
    mode: "real", connectedUser, permissions: perms.granted,
    pagesStatus, groupsStatus, businessesStatus, adAccountsStatus,
    health, syncedAt: new Date().toISOString(),
  };
}

/** Merge a patch into the onboarding metadata, creating the row if needed. Never
 *  downgrades a real connection: keeps status "connected" when already connected,
 *  otherwise "manual_mode" (never fakes real-API). */
export async function patchOnboarding(patch: OnboardingMeta): Promise<void> {
  const row = await providerConnectionRepository.getProviderConnection("facebook").catch(() => null);
  const meta = { ...((row?.metadata as Record<string, unknown> | undefined) ?? {}) };
  const prev = (meta.onboarding as OnboardingMeta | undefined) ?? {};
  meta.onboarding = { ...prev, ...patch };
  if (row) {
    const status = row.status === "not_connected" ? "manual_mode" : row.status;
    await providerConnectionRepository.updateProviderStatus("facebook", status, { metadata: meta });
  } else {
    await providerConnectionRepository.upsertProviderConnection({
      provider: "facebook", status: "manual_mode", connectionMode: "manual",
      displayName: "Facebook (חיבור מודרך)", metadata: meta,
    });
  }
}
