// ============================================================================
// 📘 ZONO — Facebook Onboarding state machine (server-only).
// Drives the /facebook product flow: disconnected → connected → scanned →
// imported → dashboard. State persists in the EXISTING facebook provider row's
// `metadata` jsonb (distribution_provider_connections) — NO new schema. The scan
// discovers the org's REAL Facebook community/group library (community_profiles).
// The canonical API status stays honest (manual_mode) — this never fakes a live
// Meta API connection and nothing here publishes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { providerConnectionRepository } from "@/lib/distribution/provider-connections";

export type FbOnboardingState = "disconnected" | "connected" | "scanned" | "imported";

export interface FbDiscoveredGroup { id: string; name: string; members: number; audience: string | null; city: string | null }
export interface FbDiscovery {
  groups: FbDiscoveredGroup[];
  pages: number | null;               // null = requires official Meta connection (not simulated)
  businessManagers: number | null;
  adAccounts: number | null;
}
export interface FbOnboarding {
  state: FbOnboardingState;
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

/** Read the current onboarding state from the facebook provider row metadata. */
export async function getFacebookOnboarding(): Promise<FbOnboarding> {
  const row = await providerConnectionRepository.getProviderConnection("facebook").catch(() => null);
  const ob = ((row?.metadata as { onboarding?: OnboardingMeta } | undefined)?.onboarding ?? {}) as OnboardingMeta;

  const connected = ob.connected === true;
  const scanned = !!ob.discovery;
  const imported = !!ob.importedAt || (Array.isArray(ob.importedGroupIds) && ob.importedGroupIds.length > 0);

  let state: FbOnboardingState = "disconnected";
  if (imported) state = "imported";
  else if (scanned) state = "scanned";
  else if (connected) state = "connected";

  return {
    state,
    connectedAt: ob.connectedAt ?? null,
    scannedAt: ob.scannedAt ?? null,
    discovery: ob.discovery ?? null,
    importedGroupIds: ob.importedGroupIds ?? [],
  };
}

/** Discover assets. Groups are REAL (the org's community library). Pages / BM /
 *  Ad Accounts return null — they require the official Meta API (not simulated). */
export async function discoverFacebookAssets(): Promise<FbDiscovery> {
  const { profile } = await getSessionContext();
  const orgId = profile?.org_id ?? null;
  const db = await createClient();
  let groups: FbDiscoveredGroup[] = [];
  try {
    let q = db.from("community_profiles").select("id,name,audience_type,members_count,city,platform,status").eq("platform", "facebook");
    if (orgId) q = q.eq("organization_id", orgId);
    const { data } = await q.order("members_count", { ascending: false }).limit(100);
    groups = ((data ?? []) as { id: string; name: string; audience_type: string | null; members_count: number | null; city: string | null }[])
      .map((c) => ({ id: c.id, name: c.name, members: c.members_count ?? 0, audience: c.audience_type ?? null, city: c.city ?? null }));
  } catch { groups = []; }
  return { groups, pages: null, businessManagers: null, adAccounts: null };
}

/** Merge a patch into the onboarding metadata, creating the row if needed. Keeps
 *  the canonical connection status at manual_mode (never fakes real-API). */
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
