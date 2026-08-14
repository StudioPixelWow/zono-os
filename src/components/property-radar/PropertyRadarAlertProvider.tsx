"use client";
// ============================================================================
// ZONO Property Radar™ — global opportunity provider (P9.1B).
// Mounted ONCE in the authenticated app layout. Surfaces the loved RICH card for
// the single TOP new opportunity, driven by the no-flood digest engine: one at a
// time, never re-fires, drains the whole batch to "seen" on any exit (dismiss /
// act / view-more), and the backdrop dismisses so it can't trap the app. The
// rest of the batch is browsed intentionally in the Radar center.
// ============================================================================
import { useRouter } from "next/navigation";
import { useCurrentOrganization } from "@/components/dashboard/DashboardDataProvider";
import { usePropertyRadarAlerts } from "./usePropertyRadarAlerts";
import { PropertyRadarPopup } from "./PropertyRadarPopup";
import type { AlertActionHandlers } from "./PropertyRadarAlertActions";

const RADAR_CENTER_ROUTE = "/property-radar";

function openUrl(url: string | null | undefined, newTab: boolean): boolean {
  if (!url || typeof window === "undefined") return false;
  if (newTab) window.open(url, "_blank", "noopener,noreferrer");
  else window.location.href = url;
  return true;
}

export function PropertyRadarAlertProvider() {
  const org = useCurrentOrganization();
  const router = useRouter();
  const radar = usePropertyRadarAlerts(org?.id ?? null);
  const active = radar.topAlert;

  const handlers: AlertActionHandlers = {
    onCall: () => {
      const m = active?.metadata ?? {};
      openUrl(m.callUrl ?? (m.phone ? `tel:${m.phone}` : null), false);
      radar.acknowledge();
    },
    onWhatsapp: () => {
      openUrl(active?.metadata?.whatsappUrl ?? null, true);
      radar.acknowledge();
    },
    onOpenProperty: () => {
      if (active?.linkedPropertyId) router.push(`/properties/${active.linkedPropertyId}`);
      else if (!openUrl(active?.metadata?.externalUrl, true)) router.push(RADAR_CENTER_ROUTE);
      radar.acknowledge();
    },
    onFindBuyers: () => { router.push("/buyers"); radar.acknowledge(); },
    onReminder: () => { radar.acknowledge(); },
    onContacted: () => { radar.acknowledge(); },
    onDismiss: () => { radar.acknowledge(); },
  };

  if (!org?.id || !radar.digestVisible || !active) return null;

  return (
    <PropertyRadarPopup
      alert={active}
      handlers={handlers}
      moreCount={Math.max(0, radar.count - 1)}
      onViewMore={() => { radar.acknowledge(); router.push(RADAR_CENTER_ROUTE); }}
      onDismiss={radar.acknowledge}
    />
  );
}
