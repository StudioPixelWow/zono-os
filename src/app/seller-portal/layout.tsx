// ============================================================================
// 🏷️ ZONO — Seller Portal — authenticated chrome. 32.4. Part: DESIGN.
// Premium glass background, mobile-first, RTL, consistent with the Buyer Portal.
// Authenticated → NEVER indexed.
// ============================================================================
import type { Metadata } from "next";
import type { CSSProperties } from "react";

export const metadata: Metadata = { title: "פורטל המוכר | ZONO", robots: { index: false, follow: false } };

const theme: CSSProperties = { ["--sp-accent" as string]: "#0d9488", ["--sp-gradient" as string]: "linear-gradient(135deg,#0d9488,#2563eb)" };

export default function SellerPortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" style={theme} className="min-h-screen bg-gradient-to-b from-teal-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</div>
    </div>
  );
}
