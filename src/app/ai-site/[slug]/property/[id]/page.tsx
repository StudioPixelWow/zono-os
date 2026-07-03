/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🌐 ZONO — AI Brokerage Website — PROPERTY AI landing. 32.1.
// Every listing becomes an AI landing page: gallery, AI summary, market/valuation/
// trust/demand badges, highlights, related. Evidence-only, public-safe.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPropertyAi, seoForProperty, themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass, PropertyCard } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";

export const revalidate = 300;

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const TRUST_HE = { verified: "מאומת ✓", reviewed: "נבדק", listed: "רשום" } as const;
const DEMAND_HE = { high: "ביקוש גבוה", medium: "ביקוש בינוני", low: "ביקוש נמוך" } as const;
const POS_HE = { below: "מתחת לשוק", within: "בתוך טווח השוק", above: "מעל השוק", unknown: "—" } as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const r = await getPropertyAi(slug, id);
  if (r === "disabled" || r === null) return { title: "נכס לא נמצא" };
  const seo = seoForProperty(r.property, r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function PropertyPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await getPropertyAi(slug, id);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, property: p } = r;
  const seo = seoForProperty(p, branding, "", slug);
  const b = p.badges;

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <JsonLd data={seo.jsonLd} />

      {/* Gallery */}
      <div className="overflow-hidden rounded-3xl bg-slate-100 shadow-xl">
        <div className="relative aspect-[16/9]">
          {p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-6xl text-slate-300">🏠</div>}
        </div>
        {p.gallery.length > 1 && (
          <div className="flex gap-1 overflow-x-auto p-1">{p.gallery.slice(0, 8).map((g, i) => <img key={i} src={g} alt="" className="h-16 w-24 shrink-0 rounded-lg object-cover" loading="lazy" />)}</div>
        )}
      </div>

      {/* Title + price */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">{p.title}</h1>
          <p className="text-[13px] text-slate-600">{[p.neighborhood, p.city].filter(Boolean).join(", ")}{p.rooms ? ` · ${p.rooms} חדרים` : ""}{p.area ? ` · ${p.area} מ"ר` : ""}</p>
        </div>
        <div className="text-2xl font-black" style={{ color: "var(--site-accent)" }}>{fmt(p.price)}</div>
      </div>

      {/* AI intelligence badges */}
      <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
        <span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-800">{TRUST_HE[b.trust]}</span>
        <span className="rounded-full bg-sky-100 px-3 py-1 font-bold text-sky-800">{DEMAND_HE[b.demand]}</span>
        {b.marketScore != null && <span className="rounded-full bg-indigo-100 px-3 py-1 font-bold text-indigo-800">ביצועי שוק {b.marketScore}/100</span>}
        {b.pricePosition !== "unknown" && <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-800">מחיר {POS_HE[b.pricePosition]}{b.priceGapPct != null ? ` (${b.priceGapPct > 0 ? "+" : ""}${b.priceGapPct}%)` : ""}</span>}
        {b.matchingBuyers > 0 && <span className="rounded-full bg-fuchsia-100 px-3 py-1 font-bold text-fuchsia-800">{b.matchingBuyers} קונים מתאימים</span>}
        {b.domBand === "fast" && <span className="rounded-full bg-teal-100 px-3 py-1 font-bold text-teal-800">קצב מכירה מהיר</span>}
        {b.strategyLabel && <span className="rounded-full bg-slate-200 px-3 py-1 font-bold text-slate-700">{b.strategyLabel}</span>}
      </div>

      {/* AI summary + highlights */}
      <Glass className="mt-5 p-5">
        <h2 className="text-lg font-black text-slate-800">סיכום AI</h2>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-700">{p.aiSummary}</p>
        {p.highlights.length > 0 && <ul className="mt-3 flex flex-wrap gap-2">{p.highlights.map((h, i) => <li key={i} className="rounded-lg bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-slate-700">• {h}</li>)}</ul>}
      </Glass>

      {/* CTAs */}
      <div className="mt-4 flex flex-wrap gap-2">
        {branding.whatsapp && <a href={`https://wa.me/${branding.whatsapp}?text=${encodeURIComponent(`מתעניין/ת בנכס: ${p.title}`)}`} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">💬 תיאום ביקור</a>}
        {branding.phone && <a href={`tel:${branding.phone}`} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "var(--site-gradient)" }}>📞 חייגו</a>}
      </div>

      {/* Ask about this property */}
      <section className="mt-6"><AskWidget slug={slug} office={branding.officeName} suggestions={[`ספר לי עוד על ${p.title}`, "מה יש בסביבה?", "האם המחיר תחרותי?"]} /></section>

      {/* Related */}
      {p.related.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-black text-slate-800">נכסים דומים</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{p.related.map((x) => <PropertyCard key={x.id} slug={slug} id={x.id} title={x.title} price={x.price} image={x.image} />)}</div>
        </section>
      )}
    </main>
  );
}
