// ============================================================================
// 🛒 ZONO — Buyer Portal — authenticated chrome. 32.3. Part: DESIGN.
// Premium glass background, mobile-first, RTL. Authenticated → NEVER indexed.
// ============================================================================
import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = { title: "פורטל הקונה | ZONO", robots: { index: false, follow: false } };

const theme: CSSProperties = { ["--bp-accent" as string]: "#7c3aed", ["--bp-gradient" as string]: "linear-gradient(135deg,#7c3aed,#2563eb)" };

export default function BuyerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" style={theme} className="min-h-screen bg-gradient-to-b from-violet-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
