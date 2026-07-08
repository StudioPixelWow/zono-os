// ============================================================================
// 👤 ZONO — AI Agent Website — PROPERTY AI landing. 32.2. Scoped to the broker.
// REUSES the 32.1 framework property view model; adds the broker's contact CTAs.
// Evidence-only, public-safe.
// ============================================================================
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAgentPropertyAi, seoForAgentProperty } from "@/lib/agent-site";
import { themeVars } from "@/lib/brokerage-site";
import { JsonLd } from "@/components/brokerage-site/ui";
import { PropertyMicrosite } from "@/components/brokerage-site/PropertyMicrosite";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string; id: string }> }): Promise<Metadata> {
  const { slug, id } = await params;
  const r = await getAgentPropertyAi(slug, id);
  if (r === "disabled" || r === null) return { title: "נכס לא נמצא" };
  const seo = seoForAgentProperty(r.property, r.branding, "", slug);
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function AgentPropertyPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const r = await getAgentPropertyAi(slug, id);
  if (r === "disabled") return <div className="p-16 text-center text-slate-500">האתר אינו פעיל כרגע.</div>;
  if (!r) notFound();
  const { branding, property: p } = r;
  const seo = seoForAgentProperty(p, branding, "", slug);

  return (
    <div style={themeVars(branding) as CSSProperties}>
      <JsonLd data={seo.jsonLd} />
      <PropertyMicrosite property={p} slug={slug} base="ai-agent" areaBase="area"
        contactName={branding.brokerName} whatsapp={branding.whatsapp} phone={branding.phone}
        calendarLink={branding.calendarLink} attribution={`בייצוג ${branding.brokerName}`}
        askApiBase="agent-site" askTitle={`שאל את ${branding.brokerName}`} />
    </div>
  );
}
