/* eslint-disable @next/next/no-img-element -- external CDN broker/listing photos; next/image would require remotePatterns config */
// ============================================================================
// 👤 ZONO — AI Agent Website — BROKER HOME. 32.2. Dynamic, evidence-only, SEO'd.
// Personal hero (photo/name/office/specialty/stats) + featured listings + top
// areas + AI insights + Ask Agent. Public-safe; no fabricated awards/sales.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentHomeAi, seoForAgentHome } from "@/lib/agent-site";
import { themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass, Stat, PropertyCard } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getAgentHomeAi(slug);
  if (r === "disabled" || r === null) return { title: "אתר לא זמין" };
  const seo = seoForAgentHome(r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function AgentHomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getAgentHomeAi(slug);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, home } = r;
  const seo = seoForAgentHome(branding, "", slug);

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <JsonLd data={seo.jsonLd} />

      {/* Hero — personal */}
      <section className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-2xl sm:p-12" style={{ background: "var(--site-gradient)" }}>
        <div className="relative z-10 flex flex-col-reverse items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-bold opacity-80">{home.hero.office}{home.hero.specialty ? ` · ${home.hero.specialty}` : ""}</p>
            <h1 className="mt-1 text-3xl font-black leading-tight sm:text-4xl">{home.hero.name}{home.hero.title ? <span className="block text-lg font-bold opacity-90">{home.hero.title}</span> : null}</h1>
            <p className="mt-3 max-w-xl text-[15px] opacity-90">{home.hero.tagline}</p>
            {home.hero.focus.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{home.hero.focus.map((f) => <span key={f} className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">{f}</span>)}</div>}
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`/ai-agent/${slug}/properties`} className="rounded-xl bg-white/95 px-5 py-2.5 text-sm font-bold text-slate-900">הנכסים שלי</Link>
              <Link href={`/ai-agent/${slug}/about`} className="rounded-xl border border-white/60 px-5 py-2.5 text-sm font-bold">אודות</Link>
              <a href="#ask" className="rounded-xl border border-white/60 px-5 py-2.5 text-sm font-bold">שאל אותי</a>
            </div>
          </div>
          {branding.photo && <img src={branding.photo} alt={home.hero.name} className="h-28 w-28 shrink-0 rounded-full border-4 border-white/70 object-cover shadow-xl sm:h-36 sm:w-36" />}
        </div>
      </section>

      {/* Stats — evidence-only */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">{home.stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} />)}</section>

      {/* Intro */}
      <Glass className="mt-6 p-5">
        <h2 className="text-lg font-black text-slate-800">קצת עליי</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{home.intro}</p>
        {home.topAreas.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{home.topAreas.map((a) => <Link key={a} href={`/ai-agent/${slug}/area/${encodeURIComponent(a)}`} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{a}</Link>)}</div>}
      </Glass>

      {/* Featured listings */}
      {home.featured.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xl font-black text-slate-800">נכסים מובילים בייצוגי</h2>
            <Link href={`/ai-agent/${slug}/properties`} className="text-[12px] font-bold" style={{ color: "var(--site-accent)" }}>כל הנכסים ←</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {home.featured.map((p) => <PropertyCard key={p.id} slug={slug} id={p.id} title={p.title} price={p.price} image={p.image} badge={p.badge} base="ai-agent" />)}
          </div>
        </section>
      )}

      {/* AI insights */}
      {home.insights.length > 0 && (
        <section className="mt-8 grid gap-3 sm:grid-cols-2">
          {home.insights.map((b, i) => (
            <Glass key={i} className="p-4">
              <h3 className="text-[15px] font-black text-slate-800">{b.title}</h3>
              <p className="mt-1 text-[13px] text-slate-600">{b.body}</p>
              {b.evidence.length > 0 && <p className="mt-2 text-[11px] text-slate-400">מבוסס על: {b.evidence.join(" · ")}</p>}
            </Glass>
          ))}
        </section>
      )}

      {/* Ask Agent */}
      <section id="ask" className="mt-8">
        <AskWidget slug={slug} office={branding.brokerName} apiBase="agent-site" title={`שאל את ${branding.brokerName}`} suggestions={["אילו נכסים יש לך?", `ספר לי על ${home.topAreas[0] ?? "האזור"}`, "המלצות לקנייה?", "מה כדאי לדעת לפני מכירה?"]} />
      </section>

      {/* Contact footer */}
      <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-[12px] text-slate-500">
        <div className="flex flex-wrap justify-center gap-4">
          {branding.phone && <a href={`tel:${branding.phone}`} className="font-bold text-slate-700">📞 {branding.phone}</a>}
          {branding.whatsapp && <a href={`https://wa.me/${branding.whatsapp}`} className="font-bold text-emerald-700">💬 WhatsApp</a>}
          {branding.email && <a href={`mailto:${branding.email}`} className="font-bold text-slate-700">✉️ {branding.email}</a>}
          {branding.calendarLink && <a href={branding.calendarLink} className="font-bold text-slate-700">📅 קביעת פגישה</a>}
        </div>
        <p className="mt-3">{branding.brokerName} · {branding.officeName} · אתר אישי מונע בינה מלאכותית של ZONO · המלאי מתעדכן אוטומטית</p>
      </footer>
    </main>
  );
}
