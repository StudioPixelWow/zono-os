// ============================================================================
// 🌍 ZONO — Area Portal — STREET page. 32.5. Public, SEO'd, evidence-only.
// (Static sibling routes insights/properties/transactions/offices/brokers take
//  precedence over this dynamic [street] segment in the Next.js App Router.)
// ============================================================================
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStreet, seoForStreet, cityUrl, nbUrl } from "@/lib/area-portal";
import { JsonLd, Glass, Stat, Breadcrumbs, ListingCard, BrokerRow } from "@/components/area-portal/ui";
import AskArea from "@/components/area-portal/AskArea";

export const revalidate = 900;
const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);

export async function generateMetadata({ params }: { params: Promise<{ city: string; neighborhood: string; street: string }> }): Promise<Metadata> {
  const { city, neighborhood, street } = await params;
  const v = await getStreet(decodeURIComponent(city), decodeURIComponent(neighborhood), decodeURIComponent(street));
  if (!v) return { title: "רחוב לא נמצא" };
  const seo = seoForStreet(v, "");
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function StreetPage({ params }: { params: Promise<{ city: string; neighborhood: string; street: string }> }) {
  const { city: cp, neighborhood: np, street: sp } = await params;
  const city = decodeURIComponent(cp), neighborhood = decodeURIComponent(np), street = decodeURIComponent(sp);
  const v = await getStreet(city, neighborhood, street);
  if (!v) notFound();
  const seo = seoForStreet(v, ""); const m = v.market;

  return (
    <main>
      <JsonLd data={seo.jsonLd} />
      <Breadcrumbs trail={[{ name: "אזורים", href: "/area" }, { name: v.city, href: cityUrl("", v.city) }, { name: neighborhood, href: nbUrl("", v.city, neighborhood) }, { name: v.street }]} />

      <section className="relative overflow-hidden rounded-[2rem] p-8 text-white shadow-2xl" style={{ background: "var(--ap-gradient)" }}>
        <h1 className="text-3xl font-black">{v.street}</h1>
        <p className="mt-1 text-[13px] opacity-80">{neighborhood}, {v.city}</p>
        <p className="mt-3 max-w-2xl text-[15px] opacity-90">{v.summary}</p>
      </section>

      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="מחיר ממוצע" value={fmt(m.avgPrice)} />
        <Stat label="מחיר למ״ר" value={m.pricePerSqm != null ? fmt(m.pricePerSqm) : "—"} />
        <Stat label="נכסים פעילים" value={`${m.inventory}`} />
        <Stat label="עסקאות" value={`${m.transactions}`} />
      </section>

      {v.featured.length > 0 && (
        <section className="mt-8"><h2 className="mb-3 text-xl font-black text-slate-800">נכסים ב{v.street}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{v.featured.map((l) => <ListingCard key={l.id} {...l} />)}</div></section>
      )}

      {v.transactions.length > 0 && (
        <Glass className="mt-8 overflow-x-auto p-4">
          <h2 className="mb-2 text-[15px] font-black text-slate-800">עסקאות אחרונות</h2>
          <table className="w-full text-right text-[13px]"><thead className="text-[11px] text-slate-500"><tr><th className="p-2">תאריך</th><th className="p-2">חדרים</th><th className="p-2">מ״ר</th><th className="p-2">מחיר</th></tr></thead>
          <tbody>{v.transactions.map((t, i) => <tr key={i} className="border-t border-slate-100"><td className="p-2">{t.date ?? "—"}</td><td className="p-2">{t.rooms ?? "—"}</td><td className="p-2">{t.area ?? "—"}</td><td className="p-2 font-bold">{fmt(t.price)}</td></tr>)}</tbody></table>
        </Glass>
      )}

      {v.brokers.length > 0 && <Glass className="mt-8 space-y-1.5 p-5"><h2 className="mb-2 text-[15px] font-black text-slate-800">מתווכים מובילים</h2>{v.brokers.map((b) => <BrokerRow key={b.name} {...b} />)}</Glass>}

      <section className="mt-8"><AskArea city={v.city} neighborhood={neighborhood} street={v.street} suggestions={[`מה המחירים ב${v.street}?`, "אילו נכסים יש?", "מה נמכר לאחרונה?"]} /></section>
    </main>
  );
}
