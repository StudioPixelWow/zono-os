// ============================================================================
// 🌍 ZONO — Area Portal — CITY page. 32.5. Public, SEO'd, evidence-only.
// ============================================================================
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCity, seoForCity, nbUrl } from "@/lib/area-portal";
import { JsonLd, Glass, Stat, Breadcrumbs, ListingCard, InsightCard, OfficeRow, BrokerRow } from "@/components/area-portal/ui";
import AskArea from "@/components/area-portal/AskArea";
import LeadForm from "@/components/area-portal/LeadForm";

export const revalidate = 900;

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const DEMAND: Record<string, string> = { high: "גבוה", medium: "מתון", low: "נמוך" };
const SUPPLY: Record<string, string> = { high: "רב", medium: "בינוני", low: "מצומצם" };

export async function generateMetadata({ params }: { params: Promise<{ city: string }> }): Promise<Metadata> {
  const { city } = await params;
  const v = await getCity(decodeURIComponent(city));
  if (!v) return { title: "אזור לא נמצא" };
  const seo = seoForCity(v, "");
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function CityPage({ params }: { params: Promise<{ city: string }> }) {
  const { city: cityParam } = await params;
  const city = decodeURIComponent(cityParam);
  const v = await getCity(city);
  if (!v) notFound();
  const seo = seoForCity(v, "");
  const m = v.market;

  return (
    <main>
      <JsonLd data={seo.jsonLd} />
      <Breadcrumbs trail={[{ name: "אזורים", href: "/area" }, { name: v.city }]} />

      <section className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-2xl sm:p-12" style={{ background: "var(--ap-gradient)" }}>
        <p className="text-[13px] font-bold opacity-80">ZONO Location Intelligence</p>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">נדל״ן ב{v.city}</h1>
        <p className="mt-3 max-w-2xl text-[15px] opacity-90">{v.overview}</p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מחיר ממוצע" value={fmt(m.avgPrice)} />
        <Stat label="מחיר למ״ר" value={m.pricePerSqm != null ? `${fmt(m.pricePerSqm)}` : "—"} />
        <Stat label="נכסים פעילים" value={`${m.inventory}`} />
        <Stat label="עסקאות" value={`${m.transactions}`} />
        <Stat label="ביקוש" value={DEMAND[m.demandLevel]} />
        <Stat label="היצע" value={SUPPLY[m.supplyLevel]} />
        <Stat label="מגמת מחירים" value={m.priceTrendPct != null ? `${m.priceTrendPct > 0 ? "+" : ""}${m.priceTrendPct}%` : "—"} />
        <Stat label="יוקרה" value={`${Math.round(m.luxuryPct)}%`} />
      </section>

      {v.topNeighborhoods.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xl font-black text-slate-800">שכונות מובילות</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {v.topNeighborhoods.map((n) => (
              <Link key={n.name} href={nbUrl("", v.city, n.name)}><Glass className="p-4 transition hover:shadow-2xl">
                <div className="text-[14px] font-black text-slate-800">{n.name}</div>
                <div className="mt-1 text-[12px] text-slate-500">{n.inventory} נכסים · {n.transactions} עסקאות</div>
                {n.avgPrice != null && <div className="text-[12px] font-bold" style={{ color: "var(--ap-accent)" }}>{fmt(n.avgPrice)}</div>}
              </Glass></Link>
            ))}
          </div>
        </section>
      )}

      {v.opportunities.length > 0 && (
        <section className="mt-8"><h2 className="mb-3 text-xl font-black text-slate-800">הזדמנויות מובילות</h2>
          <div className="grid gap-3 sm:grid-cols-2">{v.opportunities.map((o, i) => <InsightCard key={i} {...o} />)}</div></section>
      )}

      {v.featured.length > 0 && (
        <section className="mt-8"><h2 className="mb-3 text-xl font-black text-slate-800">נכסים נבחרים</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{v.featured.map((l) => <ListingCard key={l.id} {...l} />)}</div></section>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        {v.offices.length > 0 && <Glass className="p-5"><h2 className="mb-2 text-[15px] font-black text-slate-800">משרדים מובילים</h2><div className="space-y-1.5">{v.offices.map((o) => <OfficeRow key={o.name} {...o} />)}</div></Glass>}
        {v.brokers.length > 0 && <Glass className="p-5"><h2 className="mb-2 text-[15px] font-black text-slate-800">מתווכים מובילים</h2><div className="space-y-1.5">{v.brokers.map((b) => <BrokerRow key={b.name} {...b} />)}</div></Glass>}
      </section>

      {v.insights.length > 0 && (
        <section className="mt-8"><h2 className="mb-3 text-xl font-black text-slate-800">תובנות AI</h2>
          <div className="grid gap-3 sm:grid-cols-2">{v.insights.slice(0, 4).map((o, i) => <InsightCard key={i} {...o} />)}</div></section>
      )}

      <Glass className="mt-8 p-5"><h2 className="text-[15px] font-black text-slate-800">המלצת AI ל{v.city}</h2><p className="mt-1 text-[13px] text-slate-600">{v.recommendation}</p></Glass>

      <section className="mt-8"><AskArea city={v.city} suggestions={[`מה המחירים ב${v.city}?`, "איפה הכי כדאי לקנות?", "מה מצב הביקוש?", "כמה עסקאות נסגרו?"]} /></section>
      <section className="mt-4"><LeadForm city={v.city} /></section>
    </main>
  );
}
