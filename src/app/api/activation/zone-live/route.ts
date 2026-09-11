import { NextResponse } from "next/server";
import { getOfficeActivation } from "@/lib/activation/activation-server";
import { getCityDiscovery } from "@/lib/activation/city-discovery-server";
import { getZoneSnapshot } from "@/lib/activation/zone-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Live zone snapshot for the first-login WOW modal to POLL while the onboarding
 * scan (and its full intelligence chain) populates the office's city. Everything
 * is REAL and org-scoped: the org is resolved from the SESSION (never a
 * client-supplied id), so a signed-in owner only ever sees their own zone. Safe:
 * any failure returns an empty, honest snapshot (never demo data), so the modal
 * simply keeps its "scanning in the background" state.
 */
export async function GET() {
  const empty = { ok: false, scanRunning: false, phase: "not_started", stats: null, privateOwners: [], insight: null };
  try {
    const act = await getOfficeActivation();
    if (!act) return NextResponse.json(empty);
    const { orgId, city, localityCode } = act.identity;
    const discovery = await getCityDiscovery(orgId, city, localityCode);
    const zone = await getZoneSnapshot(orgId, city, discovery).catch(() => null);
    return NextResponse.json({
      ok: true,
      scanRunning: discovery.scanRunning,
      phase: discovery.phase,
      stats: {
        discoveredListings: discovery.discoveredListings,
        noBrokerCount: discovery.noBrokerCount,
        neighborhoods: discovery.neighborhoods,
        mapPoints: discovery.mapPoints,
        brokersTotal: zone?.census?.brokersTotal ?? 0,
        verifiedOffices: zone?.census?.verifiedOffices ?? 0,
        listingsTotal: zone?.census?.listingsTotal ?? 0,
      },
      privateOwners: zone?.privateOwners ?? [],
      insight: zone?.insights?.[0] ?? null,
    });
  } catch {
    return NextResponse.json(empty);
  }
}
