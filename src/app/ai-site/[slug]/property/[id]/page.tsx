// ============================================================================
// 🌐 ZONO — AI Brokerage Website — PROPERTY AI landing. 32.1.
// Every listing becomes an AI landing page: gallery, AI summary, market/valuation/
// trust/demand badges, highlights, related. Evidence-only, public-safe.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPropertyAi, seoForProperty, themeVars } from "@/lib/brokerage-site";
import { JsonLd } from "@/components/brokerage-site/ui";
import { PropertyMicrosite } from "@/components/brokerage-site/PropertyMicrosite";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const r = await getPropertyAi(slug, id);
  if (r === "disabled" || r === null) return { title: "נכס לא נמצא" };
  const seo = seoForProperty(r.property, r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function PropertyPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await getPropertyAi(slug, id);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, property: p } = r;
  const seo = seoForProperty(p, branding, "", slug);

  return (
    <div style={themeVars(branding) as CSSProperties}>
      <JsonLd data={seo.jsonLd} />
      <PropertyMicrosite property={p} slug={slug} base="ai-site" areaBase="neighborhood"
        contactName={branding.officeName} whatsapp={branding.whatsapp} phone={branding.phone} logo={branding.logo} />
    </div>
  );
}
