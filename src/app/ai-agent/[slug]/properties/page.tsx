// ============================================================================
// 👤 ZONO — AI Agent Website — PROPERTIES. 32.2. Broker's public listings.
// Evidence-only, public-safe (published statuses only). ISR.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentProperties, seoForAgentHome } from "@/lib/agent-site";
import { themeVars, badgesFor } from "@/lib/brokerage-site";
import { PropertyCard } from "@/components/brokerage-site/ui";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getAgentProperties(slug);
  if (r === "disabled" || r === null) return { title: "אתר לא זמין" };
  const seo = seoForAgentHome(r.branding, "", slug);
  return { title: `הנכסים של ${r.branding.brokerName} | ${r.branding.officeName}`, description: seo.description, alternates: { canonical: `${seo.canonical}/properties` } };
}

export default async function AgentPropertiesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getAgentProperties(slug);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, listings } = r;

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-slate-900">הנכסים של {branding.brokerName}</h1>
        <Link href={`/ai-agent/${slug}`} className="text-[12px] font-bold" style={{ color: "var(--site-accent)" }}>← לעמוד הבית</Link>
      </div>
      <p className="mt-1 text-[13px] text-slate-600">{listings.length} נכסים פעילים בייצוג · מתעדכן אוטומטית</p>
      {listings.length === 0 ? (
        <p className="mt-10 text-center text-slate-500">אין כרגע נכסים פעילים. חזרו בקרוב או צרו קשר.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => {
            const bg = badgesFor(l);
            const badge = bg.demand === "high" ? "ביקוש גבוה" : bg.trust === "verified" ? "מאומת" : bg.strategyLabel;
            return <PropertyCard key={l.id} slug={slug} id={l.id} title={l.title} price={l.price} image={l.image} badge={badge} base="ai-agent" />;
          })}
        </div>
      )}
    </main>
  );
}
