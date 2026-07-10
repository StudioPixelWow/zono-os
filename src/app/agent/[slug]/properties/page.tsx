import Link from "next/link";
import { headers } from "next/headers";
import { getPublicAgentProperties, logAgentSiteEvent, type PublicAgentProperty } from "@/lib/agent-website/service";

export const dynamic = "force-dynamic";
const money = (n: number | null | undefined) => typeof n === "number" && n > 0 ? `₪${n.toLocaleString("he-IL")}` : "";

export default async function AgentPropertiesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const props = await getPublicAgentProperties(slug).catch(() => []);
  // Record the property-listing view so the agent-site "צפיות בנכסים" metric is real.
  try { const h = await headers(); await logAgentSiteEvent(slug, "property_view", { path: "/properties", userAgent: h.get("user-agent") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined }); } catch { /* never block render */ }
  return (
    <div dir="rtl" className="min-h-screen bg-white text-[#0f172a]">
      <nav className="border-b border-[#eef0f4] bg-white"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3"><Link href={`/agent/${slug}`} className="font-black text-[#1e1b4b]">← חזרה לאתר</Link><h1 className="text-lg font-black">כל הנכסים</h1></div></nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {props.length === 0 ? <p className="py-16 text-center text-[#64748b]">אין נכסים זמינים כרגע.</p> : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{props.map((p) => <Card key={p.id} p={p} />)}</div>
        )}
      </main>
    </div>
  );
}
function Card({ p }: { p: PublicAgentProperty }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#eef0f4]">
      <div className="relative h-44 bg-[#f1f5f9]">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">🏠</div>}{p.tag && <span className="absolute right-3 top-3 rounded-full bg-[#7C3AED] px-2 py-0.5 text-[11px] font-bold text-white">{p.tag}</span>}</div>
      <div className="p-4"><p className="text-lg font-black">{money(p.price)}</p><p className="text-[13px] text-[#64748b]">{p.city ?? ""}{p.neighborhood ? " · " + p.neighborhood : ""}</p><p className="mt-1 text-[13px] text-[#334155]">{p.rooms ? `${p.rooms} חד׳` : ""}{p.area ? ` · ${p.area} מ״ר` : ""}</p></div>
    </div>
  );
}
