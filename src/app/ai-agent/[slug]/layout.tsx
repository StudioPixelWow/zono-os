// ============================================================================
// 👤 ZONO — AI Agent Website — public site chrome. 32.2. Part: DESIGN.
// Premium glass background, mobile-first, RTL. Branding vars set per page.
// ============================================================================
export default function AiAgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" className="bg-surface text-ink min-h-screen">
      {children}
    </div>
  );
}
