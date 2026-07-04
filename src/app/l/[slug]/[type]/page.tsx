// ============================================================================
// 🎯 ZONO — AI Landing Experience page (/l/[slug]/[type]). 38.3.
// Reusable campaign landing for every type (property/area/office family),
// resolved from the EXISTING renderers and rendered with the shared site-ui.
// Property landings take ?e=<propertyId>; area landings take ?a=<areaName>.
// ============================================================================
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLanding } from "@/lib/landing/service";
import { isLandingType } from "@/lib/landing/catalog";
import { LandingPage } from "@/components/landing/LandingPage";

export const revalidate = 300;

export async function generateMetadata({ params, searchParams }: { params: Promise<{ slug: string; type: string }>; searchParams: Promise<{ e?: string; a?: string }> }): Promise<Metadata> {
  const { slug, type } = await params;
  const { e, a } = await searchParams;
  if (!isLandingType(type)) return { title: "דף לא נמצא" };
  const r = await getLanding(slug, type, { e, a });
  if (r === "disabled" || r === null) return { title: "דף לא זמין" };
  const seo = r.seo;
  return { title: seo.title, description: seo.description, alternates: { canonical: seo.canonical }, openGraph: { title: seo.openGraph.title, description: seo.openGraph.description, images: seo.openGraph.image ? [seo.openGraph.image] : [] }, twitter: { card: "summary_large_image", title: seo.twitter.title, description: seo.twitter.description } };
}

export default async function LandingRoute({ params, searchParams }: { params: Promise<{ slug: string; type: string }>; searchParams: Promise<{ e?: string; a?: string }> }) {
  const { slug, type } = await params;
  const { e, a } = await searchParams;
  if (!isLandingType(type)) notFound();
  const r = await getLanding(slug, type, { e, a });
  if (r === "disabled") return <div className="text-muted p-16 text-center">הדף אינו פעיל כרגע.</div>;
  if (!r) notFound();
  return <LandingPage view={r.view} branding={r.branding} slug={r.slug} jsonLd={r.seo.jsonLd} />;
}
