"use client";
// ============================================================================
// ZONO Realtime Provider — mounted once in the authenticated app layout. Listens
// (org-scoped) to property_alerts + zono_orchestrator_runs and does ONE debounced
// router.refresh() per burst, so dashboard / Property Radar / Market / Command
// widgets update without a full reload. Renders nothing.
// (The PropertyRadarPopup keeps its own alert subscription for the popup itself.)
// ============================================================================
import { useRouter } from "next/navigation";
import { useCurrentOrganization } from "@/components/dashboard/DashboardDataProvider";
import { usePropertyEventsRealtime } from "@/lib/realtime";

export function ZonoRealtimeProvider() {
  const org = useCurrentOrganization();
  const router = useRouter();
  usePropertyEventsRealtime(org?.id ?? null, () => router.refresh());
  return null;
}
