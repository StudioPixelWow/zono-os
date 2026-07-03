/* eslint-disable @next/next/no-img-element -- external CDN broker photo; next/image would require remotePatterns config */
// ============================================================================
// 👤 ZONO — AI Agent Website — ABOUT. 32.2. Broker bio, languages, specialties,
// areas served, trust band (redacted), contact, FAQ. Evidence-only, public-safe.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgentAbout, seoForAgentAbout } from "@/lib/agent-site";
import { themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass } from "@/components/brokerage-site/ui";
import AskWidget from "@/components/brokerage-site/AskWidget";

export const revalidate = 600;
const TRUST_HE = { verified: "נתונים מאומתים", reviewed: "פעילות מובהקת", listed: "פרופיל רשום" } as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getAgentAbout(slug);
  if (r === "disabled" || r === null) return { title: "אתר לא זמין" };
  const seo = seoForAgentAbout(r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] } };
}

export default async function AgentAboutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getAgentAbout(slug);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, about: a } = r;
  const seo = seoForAgentAbout(branding, "", slug);

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <JsonLd data={seo.jsonLd} />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {a.photo && <img src={a.photo} alt={a.name} className="h-20 w-20 rounded-full object-cover shadow-lg" />}
          <div>
            <h1 className="text-2xl font-black text-slate-900">{a.name}</h1>
            <p className="text-[13px] text-slate-600">{[a.title, a.office].filter(Boolean).join(" · ")}</p>
            <span className="mt-1 inline-block rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">{TRUST_HE[a.trustBand]}</span>
          </div>
        </div>
        <Link href={`/ai-agent/${slug}`} className="text-[12px] font-bold" style={{ color: "var(--site-accent)" }}>← לעמוד הבית</Link>
      </div>

      <Glass className="mt-5 p-5"><p className="text-[14px] leading-relaxed text-slate-700">{a.bio}</p></Glass>

      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        {a.specialties.length > 0 && <Glass className="p-4"><h2 className="text-[14px] font-black text-slate-800">תחומי התמחות</h2><div className="mt-2 flex flex-wrap gap-1.5">{a.specialties.map((x) => <span key={x} className="rounded-full bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-slate-700">{x}</span>)}</div></Glass>}
        {a.areasServed.length > 0 && <Glass className="p-4"><h2 className="text-[14px] font-black text-slate-800">אזורי שירות</h2><div className="mt-2 flex flex-wrap gap-1.5">{a.areasServed.map((x) => <Link key={x} href={`/ai-agent/${slug}/area/${encodeURIComponent(x)}`} className="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[12px] font-semibold text-slate-700">{x}</Link>)}</div></Glass>}
        {a.languages.length > 0 && <Glass className="p-4"><h2 className="text-[14px] font-black text-slate-800">שפות</h2><p className="mt-1 text-[13px] text-slate-600">{a.languages.join(" · ")}</p></Glass>}
        {a.experienceYears != null && <Glass className="p-4"><h2 className="text-[14px] font-black text-slate-800">ותק</h2><p className="mt-1 text-[13px] text-slate-600">{a.experienceYears} שנות פעילות בנדל״ן</p></Glass>}
      </section>

      {a.faq.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-xl font-black text-slate-800">שאלות נפוצות</h2>
          <div className="space-y-2">{a.faq.map((f, i) => (
            <Glass key={i} className="p-4"><h3 className="text-[14px] font-black text-slate-800">{f.q}</h3><p className="mt-1 text-[13px] text-slate-600">{f.a}</p></Glass>
          ))}</div>
        </section>
      )}

      {/* Contact */}
      <div className="mt-6 flex flex-wrap gap-2">
        {a.contact.whatsapp && <a href={`https://wa.me/${a.contact.whatsapp}`} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">💬 WhatsApp</a>}
        {a.contact.phone && <a href={`tel:${a.contact.phone}`} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "var(--site-gradient)" }}>📞 {a.contact.phone}</a>}
        {a.contact.email && <a href={`mailto:${a.contact.email}`} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700">✉️ אימייל</a>}
        {a.contact.calendarLink && <a href={a.contact.calendarLink} className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-bold text-slate-700">📅 קביעת פגישה</a>}
      </div>

      <section className="mt-8"><AskWidget slug={slug} office={a.name} apiBase="agent-site" title={`שאל את ${a.name}`} suggestions={["באילו אזורים אתה פעיל?", "אילו נכסים יש לך?", "איך אפשר ליצור קשר?"]} /></section>
    </main>
  );
}
