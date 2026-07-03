// ============================================================================
// 🌍 ZONO — Area Portal — public chrome. 32.5. Part: DESIGN.
// Magazine-quality glass background, mobile-first, RTL. Public + indexable.
// ============================================================================
import type { CSSProperties } from "react";

const theme: CSSProperties = { ["--ap-accent" as string]: "#059669", ["--ap-gradient" as string]: "linear-gradient(135deg,#059669,#0ea5e9)" };

export default function AreaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" style={theme} className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-slate-100 text-slate-900">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
