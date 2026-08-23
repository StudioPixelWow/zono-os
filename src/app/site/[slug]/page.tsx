import type { Metadata } from "next";
import { headers } from "next/headers";
import { getOfficeSite } from "@/lib/office-website/site-data";
import { logSiteEvent } from "@/lib/office-website/service";
import { OfficeWebsiteTemplate } from "@/components/office-website/OfficeWebsiteTemplate";

export const dynamic = "force-dynamic";

async function origin(): Promise<string | null> {
  const host = (await headers()).get("host");
  return host ? `https://${host}` : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getOfficeSite(slug).catch(() => null);
  // Unpublished/unknown site: keep it out of the index (no indexable soft-404).
  if (!site || site === "disabled") return { title: "אתר משרד · ZONO", robots: { index: false } };
  const O = site.office;
  const title = `${O.name}${O.tagline ? " · " + O.tagline : ""}`;
  const description = O.description || O.tagline || `משרד תיווך${site.areas.length ? " ב" + site.areas.slice(0, 3).map((a) => a.name).join(", ") : ""}`;
  const base = await origin();
  const canonical = base ? `${base}/site/${slug}` : undefined;
  const image = site.brand.logo || O.cover || undefined;
  return {
    title, description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title, description, type: "website", url: canonical, images: image ? [image] : undefined, locale: "he_IL" },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function OfficeSitePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const { preview } = await searchParams;
  const site = await getOfficeSite(slug, { previewForOwner: preview != null }).catch(() => null);

  if (site && site !== "disabled") {
    try {
      const h = await headers();
      await logSiteEvent(slug, "page_view", { path: "/", userAgent: h.get("user-agent") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined });
    } catch { /* never block render */ }
  }
  if (!site) return <Inactive title="האתר לא נמצא" />;
  if (site === "disabled") return <Inactive title="האתר אינו פעיל כרגע" />;

  const base = await origin();
  const url = base ? `${base}/site/${slug}` : undefined;
  const O = site.office;

  // Structured data: RealEstateAgent (office) + Person per team agent + Breadcrumb.
  const graph: Record<string, unknown>[] = [
    {
      "@type": "RealEstateAgent", "@id": url ? `${url}#office` : undefined, name: O.name, description: O.description ?? O.tagline ?? undefined,
      telephone: O.phone ?? undefined, email: O.email ?? undefined, image: site.brand.logo ?? O.cover ?? undefined, url,
      areaServed: site.areas.length ? site.areas.map((a) => a.name) : undefined,
      address: O.address ? { "@type": "PostalAddress", streetAddress: O.address, addressCountry: "IL" } : undefined,
      employee: site.team.length ? site.team.map((m) => ({ "@type": "Person", name: m.name, jobTitle: m.title ?? undefined, image: m.photo ?? undefined, telephone: m.phone ?? undefined })) : undefined,
    },
    url ? { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: O.name, item: url },
      { "@type": "ListItem", position: 2, name: "נכסים", item: `${url}/properties` },
    ] } : undefined,
  ].filter(Boolean) as Record<string, unknown>[];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }} />
      <OfficeWebsiteTemplate data={site} />
    </>
  );
}

function Inactive({ title }: { title: string }) {
  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4">
      <div className="rounded-3xl border border-[#e8eaf0] p-10 text-center">
        <div className="mb-3 text-4xl">🏢</div>
        <h1 className="text-xl font-black text-[#0f172a]">{title}</h1>
      </div>
    </main>
  );
}
