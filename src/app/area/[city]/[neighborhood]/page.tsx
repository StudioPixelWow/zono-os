// ============================================================================
// 🌍 ZONO — Area Portal — NEIGHBORHOOD page. 32.5. Public, SEO'd, evidence-only.
// ============================================================================
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getNeighborhood, seoForNeighborhood, nbUrl, cityUrl } from "@/lib/area-portal";
import { JsonLd, Glass, Stat, Breadcrumbs, ListingCard, InsightCard, OfficeRow, BrokerRow } from "@/components/area-portal/ui";
import AskArea from "@/components/area-portal/AskArea";
import LeadForm from "@/components/area-portal/LeadForm";

export const revalidate = 900;

const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const DEMAND: Record<string, string> = { high: "גבוה", medium: "מתון", low: "נמוך" };
const SUPPLY: Record<string, string> = { high: "רב", medium: "בינוני", low: "מצומצם" };
const SUBS = [{ s: "insights", l: "תובנות" }, { s: "properties", l: "נכסים" }, { s: "transactions", l: "עסקאות" }, { s: "offices", l: "משרדים" }, { s: "brokers", l: "מתווכים" }];

export async function generateMetadata({ params }: { params: Promise<{ city: string; neighborhood: string }> }): Promise<Metadata> {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) return { title: "שכונה לא נמצאה" };
  const seo = seoForNeighborhood(v, "");
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function NeighborhoodPage({ params }: { params: Promise<{ city: string; neighborhood: string }> }) {
  const { city: cp, neighborhood: np } = await params;
  const city = decodeURIComponent(cp), neighborhood = decodeURIComponent(np);
  const v = await getNeighborhood(city, neighborhood);
  if (!v) notFound();
  const seo = seoForNeighborhood(v, "");
  const m = v.market;
  const base = nbUrl("", v.city, v.neighborhood);

  return (
    <main>
      <JsonLd data={seo.jsonLd} />
      <Breadcrumbs trail={[{ name: "אזורים", href: "/area" }, { name: v.city, href: cityUrl("", v.city) }, { name: v.neighborhood }]} />

      <section className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-2xl" style={{ background: "var(--ap-gradient)" }}>
        <h1 className="text-3xl font-black">{v.neighborhood}, {v.city}</h1>
        <p className="mt-3 max-w-2xl text-[15px] opacity-90">{v.summary}</p>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">{SUBS.map((x) => <Link key={x.s} href={`${base}/${x.s}`} className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-[12px] font-bold text-slate-700">{x.l}</Link>)}</div>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מחיר ממוצע" value={fmt(m.avgPrice)} />
        <Stat label="חציון" value={fmt(m.medianPrice)} />
        <Stat label="מחיר למ״ר" value={m.pricePerSqm != null ? fmt(m.pricePerSqm) : "—"} />
        <Stat label="גודל ממוצע" value={m.avgSize != null ? `${m.avgSize} מ״ר` : "—"} />
        <Stat label="נכסים פעילים" value={`${m.inventory}`} />
        <Stat label="עסקאות" value={`${m.transactions}`} />
        <Stat label="ביקוש" value={DEMAND[m.demandLevel]} />
        <Stat label="היצע" value={SUPPLY[m.supplyLevel]} />
        <Stat label="מגמת מחירים" value={m.priceTrendPct != null ? `${m.priceTrendPct > 0 ? "+" : ""}${m.priceTrendPct}%` : "—"} />
        <Stat label="יוקרה" value={`${Math.round(m.luxuryPct)}%`} />
        <Stat label="השכרה" value={`${Math.round(m.rentalPct)}%`} />
        <Stat label="מסחרי" value={`${Math.round(m.commercialPct)}%`} />
      </section>

      {v.topTypes.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{v.topTypes.map((t) => <span key={t.type} className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700">{t.type}: {t.count}</span>)}</div>}

      {v.insights.length > 0 && (
        <section className="mt-8"><h2 className="mb-3 text-xl font-black text-slate-800">תובנות AI</h2>
          <div className="grid gap-3 sm:grid-cols-2">{v.insights.slice(0, 6).map((o, i) => <InsightCard key={i} {...o} />)}</div></section>
      )}

      {v.featured.length > 0 && (
        <section className="mt-8"><div className="mb-3 flex items-center justify-between"><h2 className="text-xl font-black text-slate-800">נכסים ב{v.neighborhood}</h2><Link href={`${base}/properties`} className="text-[12px] font-bold" style={{ color: "var(--ap-accent)" }}>כל הנכסים ←</Link></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{v.featured.slice(0, 8).map((l) => <ListingCard key={l.id} {...l} />)}</div></section>
      )}

      <section className="mt-8 grid gap-3 sm:grid-cols-2">
        {v.offices.length > 0 && <Glass className="p-5"><h2 className="mb-2 text-[15px] font-black text-slate-800">משרדים מובילים</h2><div className="space-y-1.5">{v.offices.slice(0, 6).map((o) => <OfficeRow key={o.name} {...o} />)}</div></Glass>}
        {v.brokers.length > 0 && <Glass className="p-5"><h2 className="mb-2 text-[15px] font-black text-slate-800">מתווכים מובילים</h2><div className="space-y-1.5">{v.brokers.slice(0, 6).map((b) => <BrokerRow key={b.name} {...b} />)}</div></Glass>}
      </section>

      <section className="mt-8"><AskArea city={v.city} neighborhood={v.neighborhood} suggestions={[`מה המחירים ב${v.neighborhood}?`, "האם כדאי לקנות כאן?", "מה מצב הביקוש?", "פוטנציאל השקעה?"]} /></section>
      <section className="mt-4"><LeadForm city={v.city} neighborhood={v.neighborhood} /></section>
    </main>
  );
}
