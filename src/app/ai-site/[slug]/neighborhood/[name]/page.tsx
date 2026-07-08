// ============================================================================
// 🌐 ZONO — AI Brokerage Website — NEIGHBORHOOD AI page. 32.1.
// AI overview + market stats + recommended listings, evidence-only, public-safe.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getNeighborhoodAi, seoForNeighborhood, themeVars } from "@/lib/brokerage-site";
import { JsonLd } from "@/components/brokerage-site/ui";
import { AreaGuide } from "@/components/brokerage-site/AreaGuide";

export const revalidate = 600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string; name: string }> }): Promise<Metadata> {
  const { slug, name } = await params;
  const r = await getNeighborhoodAi(slug, decodeURIComponent(name));
  if (r === "disabled" || r === null) return { title: "שכונה לא נמצאה" };
  const seo = seoForNeighborhood(r.neighborhood, r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical } };
}

export default async function NeighborhoodPage({ params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  const r = await getNeighborhoodAi(slug, decodeURIComponent(name));
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, neighborhood: n } = r;
  const seo = seoForNeighborhood(n, branding, "", slug);

  return (
    <div style={themeVars(branding) as CSSProperties}>
      <JsonLd data={seo.jsonLd} />
      <AreaGuide neighborhood={n} slug={slug} base="ai-site" cover={branding.cover}
        contactName={branding.officeName} whatsapp={branding.whatsapp} phone={branding.phone} />
    </div>
  );
}
