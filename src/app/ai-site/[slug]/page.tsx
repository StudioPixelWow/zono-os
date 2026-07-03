/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🌐 ZONO — AI Brokerage Website — HOME. 32.1. Dynamic, evidence-only, SEO'd.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getHomeAi, seoForHome, themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass, Stat, PropertyCard } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getHomeAi(slug);
  if (r === "disabled" || r === null) return { title: "אתר לא זמין" };
  const seo = seoForHome(r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function AiSiteHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getHomeAi(slug);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, home } = r;
  const seo = seoForHome(branding, "", slug);

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd data={seo.jsonLd} />

      {/* Hero */}
      <section className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-2xl sm:p-12" style={{ background: "var(--site-gradient)" }}>
        <div className="relative z-10">
          {branding.logo && <img src={branding.logo} alt={branding.officeName} className="mb-4 h-12 w-auto" />}
          <h1 className="text-3xl font-black leading-tight sm:text-4xl">{home.hero.headline}</h1>
          <p className="mt-3 max-w-2xl text-[15px] opacity-90">{home.hero.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/ai-site/${slug}/office`} className="rounded-xl bg-white/95 px-5 py-2.5 text-sm font-bold text-slate-900">אודות המשרד</Link>
            <a href="#ask" className="rounded-xl border border-white/60 px-5 py-2.5 text-sm font-bold">שאל את ZONO</a>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{home.stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}</section>

      {/* Market summary */}
      <Glass className="mt-6 p-5">
        <h2 className="text-lg font-black text-slate-800">סקירת שוק</h2>
        <p className="mt-1 text-[13px] text-slate-600">{home.marketSummary}</p>
        {home.featuredAreas.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{home.featuredAreas.map((a) => <Link key={a} href={`/ai-site/${slug}/neighborhood/${encodeURIComponent(a)}`} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{a}</Link>)}</div>}
      </Glass>

      {/* Featured properties */}
      {home.featured.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-black text-slate-800">נכסים מובילים</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {home.featured.map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} />)}
          </div>
        </section>
      )}

      {/* Insights */}
      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        {home.insights.map((b, i) => (
          <Glass key={i} className="p-4">
            <h3 className="text-[15px] font-black text-slate-800">{b.title}</h3>
            <p className="mt-1 text-[13px] text-slate-600">{b.body}</p>
            {b.cta && <Link href={`/ai-site/${slug}/${b.cta.href}`} className="mt-2 inline-block text-[12px] font-bold" style={{ color: "var(--site-accent)" }}>{b.cta.label} ←</Link>}
          </Glass>
        ))}
      </section>

      {/* Ask ZONO */}
      <section id="ask" className="mt-8">
        <AskWidget slug={slug} office={branding.officeName} suggestions={["אילו דירות 4 חדרים יש?", "מה המחירים בלב העיר?", "יש נכסי יוקרה?", "המלצות להשקעה?"]} />
      </section>

      {/* Contact footer */}
      <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-[12px] text-slate-500">
        <div className="flex flex-wrap justify-center gap-4">
          {branding.phone && <a href={`tel:${branding.phone}`} className="font-bold text-slate-700">📞 {branding.phone}</a>}
          {branding.whatsapp && <a href={`https://wa.me/${branding.whatsapp}`} className="font-bold text-emerald-700">💬 WhatsApp</a>}
          {branding.email && <a href={`mailto:${branding.email}`} className="font-bold text-slate-700">✉️ {branding.email}</a>}
        </div>
        <p className="mt-3">{branding.officeName} · אתר מונע בינה מלאכותית של ZONO · המלאי מתעדכן אוטומטית</p>
      </footer>
    </main>
  );
}
