"use client";
// ============================================================================
// 🧭 IntelligenceDrawer — one reusable side drawer for the whole Intelligence
// experience (Phase 26.8). Presentation only · RTL. Controlled by the parent
// (open/onClose) so it works inside any client view. No data, no logic.
// ============================================================================
import type { ReactNode } from "react";

export function IntelligenceDrawer({
  open, onClose, title, eyebrow, subtitle, children,
}: {
  open: boolean; onClose: () => void; title: string; eyebrow?: string; subtitle?: string; children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-start" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div
        dir="rtl"
        className="bg-card border-line relative h-full w-full max-w-md overflow-y-auto border-e p-5 shadow-[var(--shadow-lift)] sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {eyebrow && <p className="text-brand text-[11px] font-black tracking-wide">{eyebrow}</p>}
            <h2 className="text-ink text-xl font-black">{title}</h2>
            {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink text-xl font-black" aria-label="סגור">✕</button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
