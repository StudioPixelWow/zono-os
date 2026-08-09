import Link from "next/link";
import { headers } from "next/headers";
import { getAgentListing, type PropertyFilters } from "@/lib/agent-website/site-data";
import { logAgentSiteEvent } from "@/lib/agent-website/service";
import { AgentPropertyCard } from "@/components/agent-website/ui";

export const dynamic = "force-dynamic";

export default async function AgentPropertiesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
  const filters: PropertyFilters = { q: one(sp.q), area: one(sp.area), type: one(sp.type), min: one(sp.min), max: one(sp.max), rooms: one(sp.rooms) };

  const view = await getAgentListing(slug, filters).catch(() => null);
  try { const h = await headers(); await logAgentSiteEvent(slug, "property_view", { path: "/properties", userAgent: h.get("user-agent") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined }); } catch { /* never block render */ }

  if (!view || view === "disabled") {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4"><div className="rounded-3xl border border-[#e8eaf0] p-10 text-center"><div className="mb-3 text-4xl">🏠</div><h1 className="text-xl font-black text-[#0f172a]">האתר אינו פעיל כרגע</h1></div></main>;
  }

  const active = Object.values(filters).some(Boolean);
  return (
    <div dir="rtl" style={{ ...(view.brandVars as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)]">
      <nav className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-[var(--brand-background)]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href={`/agent/${slug}`} className="text-[14px] font-bold text-[color:var(--brand-link)]">← חזרה לאתר</Link>
          {view.logo ? <img src={view.logo} alt={view.officeName ?? ""} className="h-8 w-auto max-w-[130px] object-contain" /> : <span className="font-black text-[var(--brand-text)]">{view.officeName ?? view.agentName}</span>}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8">
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-black sm:text-3xl">כל הנכסים</h1>
          <span className="text-[14px] font-semibold text-[var(--brand-muted)]">{view.properties.length} נכסים{active ? " · מסוננים" : ""}</span>
        </div>
        {view.properties.length === 0 ? (
          <div className="py-20 text-center text-[var(--brand-muted)]">
            <p className="text-[16px] font-semibold">לא נמצאו נכסים{active ? " התואמים לחיפוש" : ""}.</p>
            {active && <Link href={`/agent/${slug}/properties`} className="mt-3 inline-block text-[14px] font-bold text-[color:var(--brand-link)]">ניקוי סינון</Link>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {view.properties.map((p) => <AgentPropertyCard key={p.id} property={p} />)}
          </div>
        )}
      </main>
    </div>
  );
}
