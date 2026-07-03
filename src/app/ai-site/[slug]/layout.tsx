// ============================================================================
// 🌐 ZONO — AI Brokerage Website — public site chrome. 32.1. Part: DESIGN.
// Premium glass background, mobile-first, RTL. Branding vars are set per page.
// ============================================================================
export default function AiSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      {children}
    </div>
  );
}
