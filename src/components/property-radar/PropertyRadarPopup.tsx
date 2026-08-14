"use client";
// ============================================================================
// ZONO Property Radar™ — single RICH opportunity card (P9.1B).
// The loved card, made SAFE: exactly ONE at a time (driven by the no-flood
// digest engine — never re-fires, drains on dismiss), and the backdrop now
// DISMISSES on click so it can never trap the app. Shows the full initial
// property picture (image, price, rooms, m², floor, address, provider, score,
// buyer matches). "N more" opens the Radar center to browse the rest.
// ============================================================================
import { ChevronLeft } from "lucide-react";
import type { PropertyRadarAlertDTO } from "@/lib/property-radar/alerts/types";
import { PropertyRadarAlertCard } from "./PropertyRadarAlertCard";
import { PropertyRadarAlertActions, type AlertActionHandlers } from "./PropertyRadarAlertActions";

export function PropertyRadarPopup({
  alert,
  handlers,
  moreCount,
  onViewMore,
  onDismiss,
}: {
  alert: PropertyRadarAlertDTO | null;
  handlers: AlertActionHandlers;
  moreCount: number;
  onViewMore: () => void;
  onDismiss: () => void;
}) {
  if (!alert) return null;
  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="הזדמנות נכס חדשה"
      onClick={onDismiss}
    >
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-y-auto rounded-t-[28px] bg-white shadow-[var(--shadow-lift)] sm:max-w-md sm:rounded-[28px]"
        onClick={(e) => e.stopPropagation()}
      >
        <PropertyRadarAlertCard alert={alert} />
        <PropertyRadarAlertActions alert={alert} handlers={handlers} />
        {moreCount > 0 && (
          <button
            type="button"
            onClick={onViewMore}
            className="flex items-center justify-center gap-1 border-t border-black/5 py-2.5 text-xs font-bold text-brand-strong hover:bg-brand-soft/40"
          >
            עוד {moreCount.toLocaleString("he-IL")} הזדמנויות — צפו במרכז הרדאר <ChevronLeft size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
