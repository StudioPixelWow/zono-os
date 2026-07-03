// ============================================================================
// 🌍 Area Portal — NEIGHBORHOOD top offices (public brokerage KB). 32.5.
// ============================================================================
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhood, seoForNeighborhood, cityUrl, nbUrl } from "@/lib/area-portal";
import { JsonLd, Glass, Breadcrumbs, OfficeRow } from "@/components/area-portal/ui";

export const revalidate = 900;

export async function generateMetadata({ params }: { params: Promise<{ city: string; neighborhood: string }> }): Promise<Metadata> {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) return { title: "שכונה לא נמצאה" };
  return { title: `משרדי תיווך ב${v.neighborhood}, ${v.city} | ZONO`, description: v.summary, alternates: { canonical: `${nbUrl("", v.city, v.neighborhood)}/offices` } };
}

export default async function OfficesPage({ params }: { params: Promise<{ city: string; neighborhood: string }> }) {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) notFound();
  const seo = seoForNeighborhood(v, "");
  return (
    <main>
      <JsonLd data={seo.jsonLd} />
      <Breadcrumbs trail={[{ name: "אזורים", href: "/area" }, { name: v.city, href: cityUrl("", v.city) }, { name: v.neighborhood, href: nbUrl("", v.city, v.neighborhood) }, { name: "משרדים" }]} />
      <h1 className="text-2xl font-black text-slate-900">משרדי תיווך מובילים ב{v.neighborhood}</h1>
      {v.offices.length === 0 ? <p className="mt-10 text-center text-slate-500">אין עדיין נתוני משרדים לאזור זה.</p> : (
        <Glass className="mt-6 space-y-1.5 p-5">{v.offices.map((o) => <OfficeRow key={o.name} {...o} />)}</Glass>
      )}
    </main>
  );
}
