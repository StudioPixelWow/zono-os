"use client";
// ============================================================================
// ZONO Property Radar™ — global alert provider.
// Mounted ONCE in the authenticated app layout (never on public pages). Runs the
// realtime alert hook for the current org and renders the global popup with all
// action handlers wired (tel / WhatsApp / navigation / DB lifecycle updates).
// ============================================================================
import { useRouter } from "next/navigation";
import { useCurrentOrganization } from "@/components/dashboard/DashboardDataProvider";
import { usePropertyRadarAlerts } from "./usePropertyRadarAlerts";
import { PropertyRadarPopup } from "./PropertyRadarPopup";
import type { AlertActionHandlers } from "./PropertyRadarAlertActions";

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

  const active = radar.activeAlert;

  const handlers: AlertActionHandlers = {
    onCall: () => {
      if (!active) return;
      const m = active.metadata ?? {};
      const url = m.callUrl ?? (m.phone ? `tel:${m.phone}` : null);
      if (openUrl(url, false)) radar.markContacted(active.id);
    },
    onWhatsapp: () => {
      if (!active) return;
      const url = active.metadata?.whatsappUrl ?? null;
      if (openUrl(url, true)) radar.markContacted(active.id);
    },
    onOpenProperty: () => {
      if (!active) return;
      radar.markClicked(active.id);
      if (active.linkedPropertyId) {
        router.push(`/properties/${active.linkedPropertyId}`);
      } else {
        openUrl(active.metadata?.externalUrl, true);
      }
      radar.closeActive(active.id);
    },
    onFindBuyers: () => {
      if (!active) return;
      radar.markClicked(active.id);
      router.push("/buyers");
      radar.closeActive(active.id);
    },
    onReminder: async () => {
      if (!active) return;
      await radar.createReminder(active.id);
    },
    onContacted: () => {
      if (active) radar.markContacted(active.id);
    },
    onDismiss: () => {
      if (active) radar.dismissAlert(active.id);
    },
  };

  // Nothing to show when org is unknown.
  if (!org?.id) return null;

  const showCompact = radar.isRateLimited && !active && !radar.isQuiet;

  return (
    <PropertyRadarPopup
      alert={active}
      handlers={handlers}
      queueRemaining={active ? Math.max(0, radar.unreadCount - 1) : 0}
      showCompact={showCompact}
      compactCount={radar.compactCount}
      onViewNow={radar.openNextNow}
    />
  );
}
