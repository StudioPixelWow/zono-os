"use client";
// ============================================================================
// ZONO Property Radar™ — global popup shell.
// Desktop: centered command-center modal. Mobile: full-width bottom sheet.
// Also renders the compact "N הזדמנויות חדשות" summary when rate-limited.
// High z-index so it floats above every page. RTL.
// ============================================================================
import { Sparkles, ChevronLeft } from "lucide-react";
import type { PropertyRadarAlertDTO } from "@/lib/property-radar/alerts/types";
import { PropertyRadarAlertCard } from "./PropertyRadarAlertCard";
import { PropertyRadarAlertActions, type AlertActionHandlers } from "./PropertyRadarAlertActions";

export function PropertyRadarPopup({
  alert,
  handlers,
  queueRemaining,
  showCompact,
  compactCount,
  onViewNow,
}: {
  alert: PropertyRadarAlertDTO | null;
  handlers: AlertActionHandlers;
  queueRemaining: number;
  showCompact: boolean;
  compactCount: number;
  onViewNow: () => void;
}) {
  if (alert) {
    return (
      <div
        dir="rtl"
        className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="התראת נכס חדש"
      >
        <div
          className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-[28px] bg-white shadow-[var(--shadow-lift)] sm:max-w-md sm:rounded-[28px]"
          onClick={(e) => e.stopPropagation()}
        >
          <PropertyRadarAlertCard alert={alert} />
          <PropertyRadarAlertActions alert={alert} handlers={handlers} />
          {queueRemaining > 0 && (
            <button
              type="button"
              onClick={onViewNow}
              className="flex items-center justify-center gap-1 border-t border-black/5 py-2.5 text-xs font-bold text-brand-strong hover:bg-brand-soft/40"
            >
              עוד {queueRemaining} הזדמנויות ממתינות <ChevronLeft size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  if (showCompact && compactCount > 0) {
    return (
      <div dir="rtl" className="fixed bottom-4 left-1/2 z-[200] -translate-x-1/2 px-3">
        <button
          type="button"
          onClick={onViewNow}
          className="zono-gradient flex items-center gap-3 rounded-2xl px-4 py-3 text-white shadow-[var(--shadow-lift)]"
        >
          <Sparkles size={18} />
          <span className="text-sm font-black">{compactCount} הזדמנויות חדשות נמצאו</span>
          <span className="rounded-lg bg-white px-3 py-1 text-xs font-black text-brand-strong">צפה עכשיו</span>
        </button>
      </div>
    );
  }

  return null;
}
