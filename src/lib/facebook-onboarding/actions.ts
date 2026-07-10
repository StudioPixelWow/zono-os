// ============================================================================
// 📘 ZONO — Facebook Onboarding actions (server). Drive the /facebook flow.
// Persist state into the existing provider row metadata; discovery reads REAL
// group data. Nothing publishes, nothing fakes a live Meta API connection.
// ============================================================================
"use server";
import { discoverFacebookAssets, patchOnboarding, type FbDiscovery } from "./service";

export async function fbConnectAction(): Promise<{ ok: boolean }> {
  await patchOnboarding({ connected: true, connectedAt: new Date().toISOString() });
  // STABILIZATION: emit facebook.connected → timeline (channel-connected milestone).
  try {
    const { getSessionContext } = await import("@/lib/auth/session");
    const { profile, user } = await getSessionContext();
    const orgId = profile?.org_id ?? null;
    if (orgId) {
      const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
      await emitBusinessEvent({ type: DOMAIN_EVENTS.facebookConnected, entityType: "organization", entityId: orgId, payload: { userId: user?.id ?? null } });
    }
  } catch (e) { console.error("[facebook] connect emit failed:", e); }
  return { ok: true };
}

export async function fbScanAction(): Promise<{ ok: boolean; discovery: FbDiscovery }> {
  const discovery = await discoverFacebookAssets();
  await patchOnboarding({ discovery, scannedAt: new Date().toISOString() });
  return { ok: true, discovery };
}

/** Re-run the real sync (Pages / Business Managers / Ad Accounts / permissions /
 *  group library) and refresh the stored discovery + lastSync. Same safe path as
 *  the first scan; nothing publishes. Used by "רענן חיבור Facebook". */
export async function fbRefreshAction(): Promise<{ ok: boolean; discovery: FbDiscovery }> {
  const discovery = await discoverFacebookAssets();
  await patchOnboarding({ discovery, scannedAt: new Date().toISOString() });
  return { ok: true, discovery };
}

export async function fbImportAction(groupIds: string[]): Promise<{ ok: boolean }> {
  const ids = Array.isArray(groupIds) ? groupIds.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) return { ok: false };
  await patchOnboarding({ importedGroupIds: ids, importedAt: new Date().toISOString() });
  return { ok: true };
}

/** Reset the onboarding (disconnect / re-run the flow). */
export async function fbResetAction(): Promise<{ ok: boolean }> {
  await patchOnboarding({ connected: false, connectedAt: null, discovery: null, scannedAt: null, importedGroupIds: [], importedAt: null });
  return { ok: true };
}
