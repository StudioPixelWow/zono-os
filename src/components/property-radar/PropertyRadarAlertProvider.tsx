"use client";
// ============================================================================
// ZONO Property Radar™ — global opportunity DIGEST provider (P9.1B).
// Mounted ONCE in the authenticated app layout. Runs the digest hook for the
// current org and renders a SINGLE non-blocking banner. "View" opens the Radar
// center (the intentional browse surface) and drains the batch to seen; "Later"
// just drains to seen. No per-opportunity modal, no stacking, no click-blocking.
// ============================================================================
import { useRouter } from "next/navigation";
import { useCurrentOrganization } from "@/components/dashboard/DashboardDataProvider";
import { usePropertyRadarAlerts } from "./usePropertyRadarAlerts";
import { PropertyRadarDigest } from "./PropertyRadarDigest";

const RADAR_CENTER_ROUTE = "/property-radar";

export function PropertyRadarAlertProvider() {
  const org = useCurrentOrganization();
  const router = useRouter();
  const radar = usePropertyRadarAlerts(org?.id ?? null);

  if (!org?.id || !radar.digestVisible) return null;

  return (
    <PropertyRadarDigest
      count={radar.count}
      city={radar.city}
      onView={() => {
        radar.acknowledge();
        router.push(RADAR_CENTER_ROUTE);
      }}
      onDismiss={radar.acknowledge}
    />
  );
}
