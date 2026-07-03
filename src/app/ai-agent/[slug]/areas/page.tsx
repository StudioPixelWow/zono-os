// ============================================================================
// 👤 ZONO — AI Agent Website — AREAS. 32.2. Broker's areas of expertise.
// Aggregated from the broker's real listings + declared service areas.
// Expertise shown as a redacted tier (verified/reviewed/listed), not raw scores.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentAreas, seoForAgentHome } from "@/lib/agent-site";
import { themeVars } from "@/lib/brokerage-site";
import { Glass } from "@/components/brokerage-site/ui";

export const revalidate = 600;
const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const TIER_HE = { verified: "מומחיות מוכחת", reviewed: "פעילות מובהקת", listed: "אזור שירות" } as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getAgentAreas(slug);
  if (r === "disabled" || r === null) return { title: "אתר לא זמין" };
  const seo = seoForAgentHome(r.branding, "", slug);
  return { title: `אזורי הפעילות של ${r.branding.brokerName}`, description: seo.description, alternates: { canonical: `${seo.canonical}/areas` } };
}

export default async function AgentAreasPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getAgentAreas(slug);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, areas } = r;

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">אזורי הפעילות שלי</h1>
        <Link href={`/ai-agent/${slug}`} className="text-[12px] font-bold" style={{ color: "var(--site-accent)" }}>← לעמוד הבית</Link>
      </div>
      {areas.areas.length === 0 ? (
        <p className="mt-10 text-center text-slate-500">אין כרגע אזורי פעילות להצגה.</p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {areas.areas.map((a) => (
            <Link key={a.name} href={`/ai-agent/${slug}/area/${encodeURIComponent(a.name)}`}>
              <Glass className="p-4 transition hover:shadow-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-black text-slate-800">{a.name}{a.city ? <span className="text-[12px] font-normal text-slate-500"> · {a.city}</span> : null}</h2>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{TIER_HE[a.expertise]}</span>
                </div>
                <p className="mt-2 text-[12px] text-slate-600">{a.inventory > 0 ? `${a.inventory} נכסים · ממוצע ${fmt(a.avgPrice)}` : "אזור שירות פעיל"}</p>
              </Glass>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
