// ============================================================================
// 🌐 ZONO — AI Brokerage Website — NEIGHBORHOOD AI page. 32.1.
// AI overview + market stats + recommended listings, evidence-only, public-safe.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhoodAi, seoForNeighborhood, themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass, Stat, PropertyCard } from "@/components/brokerage-site/ui";

export const revalidate = 600;
const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const DEMAND_HE = { high: "גבוה", medium: "בינוני", low: "נמוך" } as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string; name: string }> }): Promise<Metadata> {
  const { slug, name } = await params;
  const r = await getNeighborhoodAi(slug, decodeURIComponent(name));
  if (r === "disabled" || r === null) return { title: "שכונה לא נמצאה" };
  const seo = seoForNeighborhood(r.neighborhood, r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical } };
}

export default async function NeighborhoodPage({ params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  const r = await getNeighborhoodAi(slug, decodeURIComponent(name));
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, neighborhood: n } = r;
  const seo = seoForNeighborhood(n, branding, "", slug);

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <JsonLd data={seo.jsonLd} />
      <h1 className="text-2xl font-black text-slate-900">נדל״ן ב{n.name}{n.city ? `, ${n.city}` : ""}</h1>
      <Glass className="mt-4 p-5"><p className="text-[14px] leading-relaxed text-slate-700">{n.overview}</p></Glass>
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מלאי" value={String(n.stats.inventory)} />
        <Stat label="מחיר ממוצע" value={fmt(n.stats.avgPrice)} />
        <Stat label="ביקוש" value={DEMAND_HE[n.stats.demand]} />
        <Stat label="מגמה" value={n.stats.trend === "up" ? "עולה" : n.stats.trend === "down" ? "יורדת" : "יציבה"} />
      </section>
      {n.recommendedListings.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-black text-slate-800">נכסים ב{n.name}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{n.recommendedListings.map((x) => <PropertyCard key={x.id} slug={slug} id={x.id} title={x.title} price={x.price} image={x.image} />)}</div>
        </section>
      )}
    </main>
  );
}
