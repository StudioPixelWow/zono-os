// ============================================================================
// 🎯 ZONO — AI Landing Experience — public chrome. 38.3.
// Official ZONO surface, RTL. Per-landing branding vars set on the page.
// ============================================================================
export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div dir="rtl" className="bg-surface text-ink min-h-screen">{children}</div>;
}
