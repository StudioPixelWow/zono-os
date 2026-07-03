// ============================================================================
// 🌍 Area Portal — NEIGHBORHOOD AI insights sub-page. 32.5. Evidence-backed.
// ============================================================================
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhood, seoForNeighborhood, cityUrl, nbUrl } from "@/lib/area-portal";
import { JsonLd, Breadcrumbs, InsightCard } from "@/components/area-portal/ui";
import AskArea from "@/components/area-portal/AskArea";

export const revalidate = 900;

export async function generateMetadata({ params }: { params: Promise<{ city: string; neighborhood: string }> }): Promise<Metadata> {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) return { title: "שכונה לא נמצאה" };
  return { title: `תובנות AI — ${v.neighborhood}, ${v.city} | ZONO`, description: v.summary, alternates: { canonical: `${nbUrl("", v.city, v.neighborhood)}/insights` } };
}

export default async function InsightsPage({ params }: { params: Promise<{ city: string; neighborhood: string }> }) {
  const { city, neighborhood } = await params;
  const v = await getNeighborhood(decodeURIComponent(city), decodeURIComponent(neighborhood));
  if (!v) notFound();
  const seo = seoForNeighborhood(v, "");
  return (
    <main>
      <JsonLd data={seo.jsonLd} />
      <Breadcrumbs trail={[{ name: "אזורים", href: "/area" }, { name: v.city, href: cityUrl("", v.city) }, { name: v.neighborhood, href: nbUrl("", v.city, v.neighborhood) }, { name: "תובנות" }]} />
      <h1 className="text-2xl font-black text-slate-900">תובנות AI — {v.neighborhood}</h1>
      <p className="mt-1 text-[13px] text-slate-600">{v.summary}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">{v.insights.map((o, i) => <InsightCard key={i} {...o} />)}</div>
      <section className="mt-8"><AskArea city={v.city} neighborhood={v.neighborhood} suggestions={["למה הביקוש עלה?", "האם כדאי למכור עכשיו?", "מה הסיכונים?", "מבט קדימה?"]} /></section>
    </main>
  );
}
