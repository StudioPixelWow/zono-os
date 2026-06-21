import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getPublicOfficeSite, logSiteEvent, type PublicProperty } from "@/lib/office-website/service";
import { SiteLeadForm } from "./SiteLeadForm";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) => typeof n === "number" && n > 0 ? `₪${n.toLocaleString("he-IL")}` : "";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublicOfficeSite(slug).catch(() => null);
  if (!site || site === "disabled") return { title: "אתר משרד · ZONO" };
  const title = `${site.office.name}${site.office.address ? " · " + site.office.address : ""}`;
  const description = site.office.description ?? site.office.headline ?? "משרד נדל\"ן מוביל";
  const host = (await headers()).get("host");
  const canonical = host ? `https://${host}/site/${slug}` : undefined;
  return {
    title, description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title, description, type: "website", url: canonical, images: site.office.cover ? [site.office.cover] : undefined },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function OfficeSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getPublicOfficeSite(slug).catch(() => null);

  if (site && site !== "disabled") {
    try { const h = await headers(); await logSiteEvent(slug, "page_view", { path: "/", userAgent: h.get("user-agent") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined }); } catch { /* never block */ }
  }

  if (!site) return <Inactive title="האתר לא נמצא" />;
  if (site === "disabled") return <Inactive title="האתר אינו פעיל כרגע" />;

  const S = site.sections;
  // JSON-LD Organization + LocalBusiness schema (SEO).
  const schema = {
    "@context": "https://schema.org", "@type": "RealEstateAgent", name: site.office.name,
    description: site.office.description, telephone: site.office.phone, email: site.office.email,
    address: site.office.address, aggregateRating: { "@type": "AggregateRating", ratingValue: site.kpis.rating, reviewCount: site.testimonials.length || 50 },
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white text-[#0f172a]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />

      {/* Top bar */}
      <nav className="sticky top-0 z-20 border-b border-[#eef0f4] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 font-black text-[#1e1b4b]">
            {site.office.logo ? <img src={site.office.logo} alt="" className="h-8 w-8 rounded-lg object-cover" /> : <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#7C3AED] text-white">Z</span>}
            {site.office.name}
          </div>
          <div className="hidden items-center gap-5 text-sm font-bold text-[#475569] sm:flex">
            <a href="#properties">נכסים</a><a href="#agents">סוכנים</a><a href="#territory">אזורים</a><a href="#contact">צור קשר</a>
          </div>
          {site.office.phone && <a href={`tel:${site.office.phone}`} className="rounded-xl bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white">📞 {site.office.phone}</a>}
        </div>
      </nav>

      {/* HERO */}
      {S.hero !== false && (
        <header className="relative overflow-hidden bg-[#0b1020] text-white">
          {site.office.cover && <img src={site.office.cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
          <div className="relative mx-auto max-w-6xl px-4 py-16">
            <div className="grid items-center gap-8 lg:grid-cols-2">
              <div>
                <h1 className="text-3xl font-black leading-tight sm:text-4xl">{site.office.headline ?? site.office.name}</h1>
                {site.office.description && <p className="mt-3 max-w-md text-[#cbd5e1]">{site.office.description}</p>}
                <div className="mt-6 flex flex-wrap gap-3">
                  <a href="#properties" className="rounded-2xl bg-[#7C3AED] px-6 py-3 font-bold text-white shadow-[0_10px_30px_rgba(124,58,237,0.4)]">אני מחפש נכס</a>
                  <a href="#valuation" className="rounded-2xl bg-white/10 px-6 py-3 font-bold text-white ring-1 ring-white/20">אני רוצה למכור נכס</a>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-2">
                <Kpi v={`${site.kpis.properties}+`} l="נכסים" />
                <Kpi v={String(site.kpis.agents)} l="סוכנים" />
                <Kpi v={String(site.kpis.territories)} l="אזורי פעילות" />
                <Kpi v={String(site.kpis.rating)} l="דירוג לקוחות" />
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-6xl px-4">
        {S.why_us !== false && (
          <Section title="למה לבחור בנו?">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[["📍", "ניסיון מקומי"], ["💎", "שירות מקצועי"], ["📣", "חשיפה מקסימלית"], ["🤝", "ליווי אישי"], ["⚖️", "משא ומתן חזק"], ["⚡", "טכנולוגיה מתקדמת"]].map(([i, t]) => (
                <div key={t} className="rounded-2xl border border-[#eef0f4] p-4 text-center"><div className="text-2xl">{i}</div><p className="mt-2 text-sm font-bold">{t}</p></div>
              ))}
            </div>
          </Section>
        )}

        {S.featured_properties !== false && site.featured.length > 0 && (
          <Section title="נכסים מובחרים" id="properties" cta={{ href: `/site/${slug}/properties`, label: "לכל הנכסים ←" }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{site.featured.map((p) => <PropCard key={p.id} p={p} />)}</div>
          </Section>
        )}

        {S.valuation !== false && (
          <Section title="רוצים לדעת כמה שווה הנכס שלכם?" id="valuation">
            <div className="rounded-3xl border border-[#eef0f4] bg-[#faf8ff] p-6">
              <p className="mb-4 text-sm text-[#64748b]">קבלו הערכת שווי מקצועית ללא התחייבות.</p>
              <SiteLeadForm slug={slug} variant="valuation" cta="קבלו הערכת שווי" />
            </div>
          </Section>
        )}

        {S.agents !== false && site.agents.length > 0 && (
          <Section title="הצוות שלנו" id="agents">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">{site.agents.map((a) => (
              <div key={a.id} className="rounded-2xl border border-[#eef0f4] p-4 text-center">
                {a.avatar ? <img src={a.avatar} alt="" className="mx-auto h-16 w-16 rounded-full object-cover" /> : <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#f1f5f9] text-xl">👤</div>}
                <p className="mt-2 text-sm font-bold">{a.name}</p>
                {a.title && <p className="text-[12px] text-[#64748b]">{a.title}</p>}
                {a.phone && <a href={`tel:${a.phone}`} className="mt-1 inline-block text-[12px] font-bold text-[#7C3AED]">📞 {a.phone}</a>}
                {a.siteSlug && <Link href={`/agent/${a.siteSlug}`} className="mt-1 block text-[12px] font-bold text-[#7C3AED]">לאתר האישי ←</Link>}
              </div>
            ))}</div>
          </Section>
        )}

        {S.projects !== false && site.projects.length > 0 && (
          <Section title="פרויקטים">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{site.projects.map((p) => (
              <div key={p.id} className="rounded-2xl border border-[#eef0f4] p-4">
                <p className="font-bold">{p.name}</p>
                <p className="text-[13px] text-[#64748b]">{p.city ?? ""}{p.developer ? " · " + p.developer : ""}</p>
                <p className="mt-2 text-[12px] text-[#94a3b8]">{p.units ? `${p.units} יחידות · ` : ""}{p.status}</p>
              </div>
            ))}</div>
          </Section>
        )}

        {S.territory !== false && site.territories.length > 0 && (
          <Section title="אזורי הפעילות שלנו" id="territory">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{site.territories.map((t) => (
              <div key={t.city} className="rounded-2xl border border-[#eef0f4] p-4">
                <p className="font-bold">{t.city}</p>
                {t.areas.length > 0 && <p className="mt-1 text-[12px] text-[#64748b]">{t.areas.join(" · ")}</p>}
              </div>
            ))}</div>
          </Section>
        )}

        {S.market_insights !== false && (site.hotAreas.length > 0 || site.transactions.length > 0) && (
          <Section title="תובנות שוק">
            {site.hotAreas.length > 0 && <p className="mb-3 text-sm"><span className="font-bold">אזורים חמים:</span> {site.hotAreas.join(" · ")}</p>}
            {site.transactions.length > 0 && (
              <div className="overflow-x-auto rounded-2xl border border-[#eef0f4]">
                <table className="w-full text-right text-sm">
                  <thead className="bg-[#f8fafc] text-[12px] text-[#64748b]"><tr>{["שכונה", "חדרים", "מ״ר", "מחיר"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                  <tbody>{site.transactions.map((t, i) => (
                    <tr key={i} className="border-t border-[#eef0f4]"><td className="px-3 py-2 font-semibold">{t.neighborhood ?? "—"}</td><td className="px-3 py-2">{t.rooms ?? "—"}</td><td className="px-3 py-2">{t.area ?? "—"}</td><td className="px-3 py-2 font-bold">{money(t.price) || "—"}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Section>
        )}

        {S.testimonials !== false && site.testimonials.length > 0 && (
          <Section title="סיפורי הצלחה">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{site.testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl border border-[#eef0f4] p-4"><p className="text-[#f59e0b]">{"★".repeat(Math.round(t.rating || 5))}</p><p className="mt-2 text-sm">{t.text}</p><p className="mt-2 text-[12px] font-bold text-[#64748b]">{t.name}</p></div>
            ))}</div>
          </Section>
        )}

        {S.recruitment !== false && (
          <Section title="רוצים להצטרף למשרד מנצח?">
            <div className="rounded-3xl border border-[#eef0f4] bg-[#0b1020] p-6 text-white">
              <p className="mb-4 text-sm text-[#cbd5e1]">טכנולוגיה מתקדמת · מאגר לידים · הכשרה · ליווי · מותג חזק.</p>
              <SiteLeadForm slug={slug} variant="recruitment" cta="הגשת מועמדות" />
            </div>
          </Section>
        )}

        {S.contact !== false && (
          <Section title="צור קשר" id="contact">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="space-y-2 text-sm">
                {site.office.phone && <p>📞 <a className="font-bold text-[#7C3AED]" href={`tel:${site.office.phone}`}>{site.office.phone}</a></p>}
                {site.office.whatsapp && <p>💬 <a className="font-bold text-[#25D366]" href={`https://wa.me/${site.office.whatsapp.replace(/[^0-9]/g, "")}`}>WhatsApp</a></p>}
                {site.office.email && <p>✉ <a className="font-bold" href={`mailto:${site.office.email}`}>{site.office.email}</a></p>}
                {site.office.address && <p>📍 {site.office.address}</p>}
                {site.office.hours && <p>🕐 {site.office.hours}</p>}
              </div>
              <div className="rounded-3xl border border-[#eef0f4] bg-[#faf8ff] p-6"><SiteLeadForm slug={slug} variant="contact" cta="שלח/י פנייה" /></div>
            </div>
          </Section>
        )}
      </main>

      <footer className="mt-12 border-t border-[#eef0f4] bg-[#0b1020] py-8 text-center text-[#94a3b8]">
        <p className="font-black text-white">{site.office.name}</p>
        <div className="mt-2 flex justify-center gap-4 text-[13px]"><a href="#properties">נכסים</a><a href="#agents">סוכנים</a><a href="#contact">צור קשר</a></div>
        <p className="mt-3 text-[11px]">מופעל על ידי ZONO</p>
      </footer>
    </div>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return <div className="rounded-2xl bg-white/10 p-3 text-center ring-1 ring-white/10"><p className="text-2xl font-black">{v}</p><p className="text-[12px] text-[#cbd5e1]">{l}</p></div>;
}
function Section({ title, id, cta, children }: { title: string; id?: string; cta?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section id={id} className="py-10">
      <div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black sm:text-2xl">{title}</h2>{cta && <Link href={cta.href} className="text-sm font-bold text-[#7C3AED]">{cta.label}</Link>}</div>
      {children}
    </section>
  );
}
function PropCard({ p }: { p: PublicProperty }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#eef0f4]">
      <div className="relative h-44 bg-[#f1f5f9]">{p.image ? <img src={p.image} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-3xl">🏠</div>}{p.tag && <span className="absolute right-3 top-3 rounded-full bg-[#7C3AED] px-2 py-0.5 text-[11px] font-bold text-white">{p.tag}</span>}</div>
      <div className="p-4">
        <p className="text-lg font-black">{money(p.price)}</p>
        <p className="text-[13px] text-[#64748b]">{p.city ?? ""}{p.neighborhood ? " · " + p.neighborhood : ""}</p>
        <p className="mt-1 text-[13px] text-[#334155]">{p.rooms ? `${p.rooms} חד׳` : ""}{p.area ? ` · ${p.area} מ״ר` : ""}</p>
      </div>
    </div>
  );
}
function Inactive({ title }: { title: string }) {
  return <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4"><div className="rounded-3xl border border-[#eef0f4] p-10 text-center"><div className="mb-3 text-4xl">🏢</div><h1 className="text-xl font-black">{title}</h1></div></main>;
}
