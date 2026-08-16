"use client";
// ============================================================================
// ZONO Property Radar™ — global opportunity DIGEST banner (P9.1B).
// ----------------------------------------------------------------------------
// A single, NON-BLOCKING bottom banner: "ZONO found N opportunities in <city>".
// Deliberately NOT a `fixed inset-0` overlay — it is a bounded card anchored to
// the bottom, so the rest of the app stays fully clickable (fixes the flood that
// intercepted "פתח עסקה ראשונה"). One at a time, never stacked. RTL + mobile safe.
//   • Primary  → "צפו בהזדמנויות" (open the Radar center + drain the batch to seen)
//   • Secondary→ "מאוחר יותר"     (postpone: drain to seen, browse later in Radar)
// ============================================================================
import { Radar, X } from "lucide-react";
import { digestCountLabel } from "./digest-logic";

export function PropertyRadarDigest({
  count,
  city,
  onView,
  onDismiss,
}: {
  count: number;
  city: string | null;
  onView: () => void;
  onDismiss: () => void;
}) {
  if (count <= 0) return null;
  const where = city ? `ב${city}` : "באזור שלך";

  return (
    <div
      dir="rtl"
      role="status"
      aria-live="polite"
      // Bounded + bottom-anchored → never covers the viewport. pointer-events are
      // scoped to the card, so everything behind it remains interactive.
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[120] flex justify-center px-3 sm:bottom-6"
    >
      <div className="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border border-white/15 bg-[var(--brand,#5b21b6)] bg-gradient-to-l from-brand-strong to-brand px-4 py-3 text-white shadow-[var(--shadow-lift)]">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/15">
          <Radar size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black leading-tight">
            ZONO מצאה {digestCountLabel(count)} {where}
          </p>
          <p className="truncate text-[11px] font-medium text-white/80 leading-tight">
            סקירה חכמה של השוק — ללא הפרעה לעבודה שלך
          </p>
        </div>
        <button
          type="button"
          onClick={onView}
          className="shrink-0 rounded-xl bg-white px-3 py-2 text-xs font-black text-brand-strong hover:bg-white/90"
        >
          צפו בהזדמנויות
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold text-white/80 hover:bg-white/10 hover:text-white"
        >
          מאוחר יותר
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="סגור"
          className="shrink-0 rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
