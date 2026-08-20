import Link from "next/link";
import { headers } from "next/headers";
import { getOfficeListing, type OfficePropertyFilters } from "@/lib/office-website/site-data";
import { logSiteEvent } from "@/lib/office-website/service";
import { OfficePropertyCard } from "@/components/office-website/ui";

export const dynamic = "force-dynamic";

export default async function OfficePropertiesPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? undefined;
  const filters: OfficePropertyFilters = { q: one(sp.q), area: one(sp.area), type: one(sp.type), min: one(sp.min), max: one(sp.max), rooms: one(sp.rooms), agent: one(sp.agent) };
  const keepQuery = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: filters.q, area: filters.area, type: filters.type, min: filters.min, max: filters.max, rooms: filters.rooms, agent: filters.agent, ...over })) if (v) params.set(k, v);
    const qs = params.toString();
    return qs ? `?${qs}` : "";
  };

  const view = await getOfficeListing(slug, filters).catch(() => null);
  try { const h = await headers(); await logSiteEvent(slug, "property_view", { path: "/properties", userAgent: h.get("user-agent") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined }); } catch { /* never block */ }

  if (!view || view === "disabled") {
    return <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4"><div className="rounded-3xl border border-[#e8eaf0] p-10 text-center"><div className="mb-3 text-4xl">🏢</div><h1 className="text-xl font-black text-[#0f172a]">האתר אינו פעיל כרגע</h1></div></main>;
  }

  const active = Object.values(filters).some(Boolean);
  return (
    <div dir="rtl" style={{ ...(view.brandVars as Record<string, string>) }} className="min-h-screen bg-[var(--brand-background)] text-[var(--brand-text)]">
      <nav className="sticky top-0 z-30 border-b border-[var(--brand-border)] bg-[var(--brand-background)]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href={`/site/${slug}`} className="text-[14px] font-bold text-[color:var(--brand-link)]">← חזרה לאתר</Link>
          {view.logo ? <img src={view.logo} alt={view.officeName} className="h-8 w-auto max-w-[150px] object-contain" /> : <span className="font-black text-[var(--brand-text)]">{view.officeName}</span>}
        </div>
      </nav>
      <main className="mx-auto w-full max-w-7xl px-5 py-10 sm:px-8">
        <div className="mb-4 flex items-baseline justify-between gap-4">
          <h1 className="text-2xl font-black sm:text-3xl">כל הנכסים</h1>
          <span className="text-[14px] font-semibold text-[var(--brand-muted)]">{view.properties.length} נכסים{active ? " · מסוננים" : ""}</span>
        </div>
        {view.members.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center gap-2">
            <span className="text-[13px] font-bold text-[var(--brand-muted)]">סוכן:</span>
            <Link href={`/site/${slug}/properties${keepQuery({ agent: undefined })}`}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${!filters.agent ? "bg-[var(--brand-primary)] text-[var(--brand-on-primary)]" : "border border-[var(--brand-border)] text-[var(--brand-muted)] hover:border-[color:var(--brand-primary)]"}`}>הכל</Link>
            {view.members.map((m) => (
              <Link key={m.id} href={`/site/${slug}/properties${keepQuery({ agent: m.id })}`}
                className={`rounded-full px-3.5 py-1.5 text-[13px] font-bold transition ${filters.agent === m.id ? "bg-[var(--brand-primary)] text-[var(--brand-on-primary)]" : "border border-[var(--brand-border)] text-[var(--brand-muted)] hover:border-[color:var(--brand-primary)]"}`}>{m.name}</Link>
            ))}
          </div>
        )}
        {view.properties.length === 0 ? (
          <div className="py-20 text-center text-[var(--brand-muted)]">
            <p className="text-[16px] font-semibold">לא נמצאו נכסים{active ? " התואמים לחיפוש" : ""}.</p>
            {active && <Link href={`/site/${slug}/properties`} className="mt-3 inline-block text-[14px] font-bold text-[color:var(--brand-link)]">ניקוי סינון</Link>}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{view.properties.map((p) => <OfficePropertyCard key={p.id} property={p} />)}</div>
        )}
      </main>
    </div>
  );
}
