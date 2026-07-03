/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🌐 ZONO — AI Brokerage Website — OFFICE page. 32.1.
// Public-safe office profile (trust band, coverage, stats) — no raw scores.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOfficeAi, seoForOffice, themeVars } from "@/lib/brokerage-site";
import { JsonLd, Glass, Stat } from "@/components/brokerage-site/ui";

export const revalidate = 600;
const TRUST_HE = { verified: "נתונים מאומתים", reviewed: "נתונים נבדקים", listed: "משרד רשום" } as const;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const r = await getOfficeAi(slug);
  if (r === "disabled" || r === null) return { title: "משרד לא נמצא" };
  const seo = seoForOffice(r.office, r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical } };
}

export default async function OfficePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const r = await getOfficeAi(slug);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, office: o } = r;
  const seo = seoForOffice(o, branding, "", slug);

  return (
    <main style={themeVars(branding) as CSSProperties} className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <JsonLd data={seo.jsonLd} />
      <div className="flex items-center gap-3">
        {branding.logo && <img src={branding.logo} alt={o.name} className="h-14 w-auto" />}
        <div>
          <h1 className="text-2xl font-black text-slate-900">{o.name}</h1>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">{TRUST_HE[o.trustBand]}</span>
        </div>
      </div>
      <Glass className="mt-4 p-5"><p className="text-[14px] leading-relaxed text-slate-700">{o.story}</p></Glass>
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="נכסים" value={String(o.stats.properties)} />
        <Stat label="מתווכים" value={String(o.stats.agents)} />
        <Stat label="ערים" value={String(o.stats.cities)} />
        <Stat label="דירוג" value={String(o.stats.rating)} />
      </section>
      {o.coverage.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 text-lg font-black text-slate-800">אזורי פעילות</h2>
          <div className="flex flex-col gap-2">
            {o.coverage.map((c) => (
              <Glass key={c.city} className="p-3">
                <div className="text-[13px] font-bold text-slate-800">{c.city}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">{c.areas.map((a) => <Link key={a} href={`/ai-site/${slug}/neighborhood/${encodeURIComponent(a)}`} className="rounded-full border border-slate-200 bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700">{a}</Link>)}</div>
              </Glass>
            ))}
          </div>
        </section>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href={`/ai-site/${slug}`} className="rounded-xl px-5 py-2.5 text-sm font-bold text-white" style={{ background: "var(--site-gradient)" }}>לכל הנכסים</Link>
        {branding.whatsapp && <a href={`https://wa.me/${branding.whatsapp}`} className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white">💬 צור קשר</a>}
      </div>
    </main>
  );
}
