// ============================================================================
// 🌐 ZONO — AI Brokerage Website — public site chrome. 32.1. Part: DESIGN.
// Premium glass background, mobile-first, RTL. Branding vars are set per page.
// ============================================================================
export default function AiSiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="bg-surface text-ink min-h-screen">
      {children}
    </div>
  );
}
