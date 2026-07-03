// ============================================================================
// 👤 ZONO — AI Agent Website — public site chrome. 32.2. Part: DESIGN.
// Premium glass background, mobile-first, RTL. Branding vars set per page.
// ============================================================================
export default function AiAgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100 text-slate-900">
      {children}
    </div>
  );
}
