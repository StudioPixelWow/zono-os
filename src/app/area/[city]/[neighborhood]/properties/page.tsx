// ============================================================================
// 🌍 Area Portal — NEIGHBORHOOD properties (public discovery). 32.5.
// ============================================================================
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhood, seoForNeighborhood, cityUrl, nbUrl } from "@/lib/area-portal";
import { JsonLd, Breadcrumbs, ListingCard } from "@/components/area-portal/ui";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ city: string; neighborhood: string }> }): Promise<Metadata> {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) return { title: "שכונה לא נמצאה" };
  return { title: `נכסים ב${v.neighborhood}, ${v.city} | ZONO`, description: v.summary, alternates: { canonical: `${nbUrl("", v.city, v.neighborhood)}/properties` } };
}

export default async function PropertiesPage({ params }: { params: Promise<{ city: string; neighborhood: string }> }) {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) notFound();
  const seo = seoForNeighborhood(v, "");
  return (
    <main>
      <JsonLd data={seo.jsonLd} />
      <Breadcrumbs trail={[{ name: "אזורים", href: "/area" }, { name: v.city, href: cityUrl("", v.city) }, { name: v.neighborhood, href: nbUrl("", v.city, v.neighborhood) }, { name: "נכסים" }]} />
      <h1 className="text-2xl font-black text-slate-900">נכסים ב{v.neighborhood}</h1>
      <p className="mt-1 text-[13px] text-slate-600">{v.featured.length} נכסים מוצגים · מתעדכן אוטומטית</p>
      {v.featured.length === 0 ? <p className="mt-10 text-center text-slate-500">אין כרגע נכסים מוצגים באזור זה.</p> : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{v.featured.map((l) => <ListingCard key={l.id} {...l} />)}</div>
      )}
    </main>
  );
}
