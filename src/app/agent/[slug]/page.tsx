import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getPublicAgentSite, logAgentSiteEvent } from "@/lib/agent-website/service";
import { PropertyCard } from "@/components/brokerage-site/ui";
import { AgentLeadForm } from "./AgentLeadForm";

export const dynamic = "force-dynamic";
const money = (n: number | null | undefined) => typeof n === "number" && n > 0 ? `₪${n.toLocaleString("he-IL")}` : "";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getPublicAgentSite(slug).catch(() => null);
  if (!site || site === "disabled") return { title: "אתר סוכן · ZONO" };
  const title = `${site.agent.name}${site.agent.title ? " · " + site.agent.title : ""}`;
  const description = site.agent.bio ?? site.agent.headline ?? 'יועץ נדל"ן';
  const host = (await headers()).get("host");
  const canonical = host ? `https://${host}/agent/${slug}` : undefined;
  return { title, description, alternates: canonical ? { canonical } : undefined, openGraph: { title, description, type: "profile", url: canonical, images: site.agent.image ? [site.agent.image] : undefined }, twitter: { card: "summary_large_image", title, description } };
}

export default async function AgentSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getPublicAgentSite(slug).catch(() => null);
  if (site && site !== "disabled") {
    try { const h = await headers(); await logAgentSiteEvent(slug, "page_view", { path: "/", userAgent: h.get("user-agent") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined }); } catch { /* never block */ }
  }
  if (!site) return <Inactive title="האתר לא נמצא" />;
  if (site === "disabled") return <Inactive title="האתר אינו פעיל כרגע" />;
  const A = site.agent; const S = site.sections;

  // Person schema for the agent website (vs the office's RealEstateAgent/Organization schema).
  const schema = {
    "@context": "https://schema.org", "@type": "Person", name: A.name, jobTitle: A.title ?? 'יועץ נדל"ן', description: A.bio,
    telephone: A.phone, email: A.email, image: A.image, knowsAbout: A.specialties.length ? A.specialties : undefined,
    worksFor: A.office ? { "@type": "RealEstateAgent", name: A.office } : undefined,
  };

  return (
    <div dir="rtl" className="min-h-screen bg-white text-[#0f172a]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <nav className="sticky top-0 z-20 border-b border-[#eef0f4] bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="font-black text-[#1e1b4b]">{A.name}</div>
          <div className="hidden gap-5 text-sm font-bold text-[#475569] sm:flex"><a href="#properties">נכסים</a><a href="#about">אודות</a><a href="#contact">צור קשר</a></div>
          {A.whatsapp && <a href={`https://wa.me/${A.whatsapp.replace(/[^0-9]/g, "")}`} className="rounded-xl bg-[#25D366] px-4 py-2 text-sm font-bold text-white">💬 דברו איתי</a>}
        </div>
      </nav>

      {/* HERO — agent first */}
      {S.hero !== false && (
        <header className="bg-gradient-to-bl from-[#f5f3ff] to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-3 lg:order-1">
              <Kpi v={`${site.kpis.deals}+`} l="עסקאות שבוצעו" />
              <Kpi v={`${site.kpis.sold}+`} l="נכסים שנמכרו" />
              <Kpi v={`${site.kpis.satisfaction}%`} l="שביעות רצון" />
              <Kpi v={String(site.kpis.areas)} l="אזורי התמחות" />
            </div>
            <div className="lg:order-2">
              <div className="flex items-center gap-4">
                {A.image ? <img src={A.image} alt="" className="h-24 w-24 rounded-2xl object-cover shadow-lg" /> : <div className="grid h-24 w-24 place-items-center rounded-2xl bg-[#ede9fe] text-3xl">👤</div>}
                <div>
                  <h1 className="text-3xl font-black">{A.name}</h1>
                  <p className="text-[#7C3AED] font-bold">{A.title}</p>
                </div>
              </div>
              {A.bio && <p className="mt-4 max-w-md text-[#475569]">{A.bio}</p>}
              {A.areas.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{A.areas.map((a) => <span key={a} className="rounded-full bg-white px-3 py-1 text-[12px] font-bold ring-1 ring-[#e9d5ff]">{a}</span>)}</div>}
              <div className="mt-5 flex flex-wrap gap-3">
                {A.whatsapp && <a href={`https://wa.me/${A.whatsapp.replace(/[^0-9]/g, "")}`} className="rounded-2xl bg-[#25D366] px-6 py-3 font-bold text-white">💬 דברו איתי</a>}
                {A.phone && <a href={`tel:${A.phone}`} className="rounded-2xl bg-[#7C3AED] px-6 py-3 font-bold text-white">📞 התקשרו</a>}
                <a href="#contact" className="rounded-2xl bg-white px-6 py-3 font-bold ring-1 ring-[#e5e7eb]">קביעת פגישה</a>
              </div>
            </div>
          </div>
        </header>
      )}

      <main className="mx-auto max-w-6xl px-4">
        {/* Dual lead funnels */}
        {(S.buyer_request !== false || S.valuation !== false) && (
          <section className="grid grid-cols-1 gap-4 py-10 lg:grid-cols-2">
            {S.buyer_request !== false && (
              <div className="rounded-3xl border border-[#eef0f4] bg-[#faf8ff] p-6">
                <h2 className="text-xl font-black">מחפשים את הבית הבא שלכם?</h2>
                <p className="mb-4 mt-1 text-sm text-[#64748b]">ספרו לי מה אתם מחפשים ואשלח לכם נכסים מתאימים.</p>
                <AgentLeadForm slug={slug} variant="buyer_request" cta="שלחו לי נכסים מתאימים" />
              </div>
            )}
            {S.valuation !== false && (
              <div className="rounded-3xl border border-[#eef0f4] bg-[#f0fdf4] p-6">
                <h2 className="text-xl font-black">רוצים לדעת כמה שווה הנכס שלכם?</h2>
                <p className="mb-4 mt-1 text-sm text-[#64748b]">קבלו הערכת שווי מקצועית ללא התחייבות.</p>
                <AgentLeadForm slug={slug} variant="valuation" cta="קבלו הערכת שווי" accent="#16a34a" />
              </div>
            )}
          </section>
        )}

        {S.featured_properties !== false && site.featured.length > 0 && (
          <Section title="נכסים נבחרים" id="properties" cta={{ href: `/agent/${slug}/properties`, label: "לכל הנכסים ←" }}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{site.featured.map((p) => {
              const loc = [p.neighborhood, p.city].filter(Boolean).join(" · ");
              return <PropertyCard key={p.id} slug={slug} id={p.id} title={loc || "נכס"} price={p.price} image={p.image} badge={p.tag} href={`/agent/${slug}/properties`} rooms={p.rooms} area={p.area} />;
            })}</div>
          </Section>
        )}

        {S.why_me !== false && (
          <Section title="למה לעבוד איתי?">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[["📍", "ניסיון מקומי"], ["📣", "שיווק מתקדם"], ["⚖️", "משא ומתן חזק"], ["🤝", "שירות אישי"], ["💎", "חשיפה מקסימלית"], ["🧭", "ליווי מקצועי"]].map(([i, t]) => (
                <div key={t} className="rounded-2xl border border-[#eef0f4] p-4 text-center"><div className="text-2xl">{i}</div><p className="mt-2 text-sm font-bold">{t}</p></div>
              ))}
            </div>
          </Section>
        )}

        {S.testimonials !== false && site.testimonials.length > 0 && (
          <Section title="לקוחות מספרים">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">{site.testimonials.map((t, i) => (
              <div key={i} className="rounded-2xl border border-[#eef0f4] p-4"><p className="text-[#f59e0b]">{"★".repeat(Math.round(t.rating || 5))}</p><p className="mt-2 text-sm">{t.text}</p><p className="mt-2 text-[12px] font-bold text-[#64748b]">{t.name}</p></div>
            ))}</div>
          </Section>
        )}

        {S.market_expertise !== false && site.expertise.length > 0 && (
          <Section title="אזורי ההתמחות שלי" id="about">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{site.expertise.map((e) => (
              <div key={e.locality} className="rounded-2xl border border-[#eef0f4] p-4 text-center"><p className="font-bold">{e.locality}</p><p className="text-[12px] text-[#64748b]">{e.deals} עסקאות</p></div>
            ))}</div>
          </Section>
        )}

        {S.recent_transactions !== false && site.transactions.length > 0 && (
          <Section title="עסקאות אחרונות באזור">
            <div className="overflow-x-auto rounded-2xl border border-[#eef0f4]">
              <table className="w-full text-right text-sm">
                <thead className="bg-[#f8fafc] text-[12px] text-[#64748b]"><tr>{["שכונה", "חדרים", "מ״ר", "מחיר"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                <tbody>{site.transactions.map((t, i) => (
                  <tr key={i} className="border-t border-[#eef0f4]"><td className="px-3 py-2 font-semibold">{t.neighborhood ?? "—"}</td><td className="px-3 py-2">{t.rooms ?? "—"}</td><td className="px-3 py-2">{t.area ?? "—"}</td><td className="px-3 py-2 font-bold">{money(t.price) || "—"}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Section>
        )}

        {S.projects !== false && site.projects.length > 0 && (
          <Section title="פרויקטים">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{site.projects.map((p) => (
              <div key={p.id} className="rounded-2xl border border-[#eef0f4] p-4"><p className="font-bold">{p.name}</p><p className="text-[13px] text-[#64748b]">{p.city ?? ""} · {p.status}</p></div>
            ))}</div>
          </Section>
        )}

        {S.contact !== false && (
          <section id="contact" className="my-10 rounded-3xl bg-[#0b1020] p-8 text-white">
            <div className="grid items-center gap-6 lg:grid-cols-2">
              <div>
                <h2 className="text-2xl font-black">מחפשים לקנות או למכור נכס?</h2>
                <p className="mt-2 text-[#cbd5e1]">אני כאן כדי לעזור לכם להגיע לעסקה הנכונה.</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  {A.whatsapp && <a href={`https://wa.me/${A.whatsapp.replace(/[^0-9]/g, "")}`} className="rounded-2xl bg-[#25D366] px-6 py-3 font-bold">💬 דברו איתי</a>}
                  {A.phone && <a href={`tel:${A.phone}`} className="rounded-2xl bg-[#7C3AED] px-6 py-3 font-bold">📞 התקשרו</a>}
                </div>
              </div>
              <div className="rounded-2xl bg-white p-5 text-[#0f172a]"><AgentLeadForm slug={slug} variant="contact" cta="שלח/י פנייה" /></div>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[#eef0f4] py-8 text-center text-[#94a3b8]">
        <p className="font-black text-[#0f172a]">{A.name}{A.office ? ` · ${A.office}` : ""}</p>
        <p className="mt-2 text-[11px]">מופעל על ידי ZONO</p>
      </footer>
    </div>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return <div className="rounded-2xl border border-[#eef0f4] bg-white p-4 text-center shadow-sm"><p className="text-2xl font-black text-[#7C3AED]">{v}</p><p className="text-[12px] font-bold text-[#64748b]">{l}</p></div>;
}
function Section({ title, id, cta, children }: { title: string; id?: string; cta?: { href: string; label: string }; children: React.ReactNode }) {
  return <section id={id} className="py-10"><div className="mb-5 flex items-center justify-between"><h2 className="text-xl font-black sm:text-2xl">{title}</h2>{cta && <Link href={cta.href} className="text-sm font-bold text-[#7C3AED]">{cta.label}</Link>}</div>{children}</section>;
}
function Inactive({ title }: { title: string }) {
  return <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4"><div className="rounded-3xl border border-[#eef0f4] p-10 text-center"><div className="mb-3 text-4xl">👤</div><h1 className="text-xl font-black">{title}</h1></div></main>;
}
