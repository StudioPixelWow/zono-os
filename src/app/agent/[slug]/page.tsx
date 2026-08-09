import type { Metadata } from "next";
import { headers } from "next/headers";
import { getAgentSite } from "@/lib/agent-website/site-data";
import { logAgentSiteEvent } from "@/lib/agent-website/service";
import { AgentWebsiteTemplate } from "@/components/agent-website/AgentWebsiteTemplate";

export const dynamic = "force-dynamic";

async function baseUrl(): Promise<string | null> {
  const host = (await headers()).get("host");
  return host ? `https://${host}` : null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const site = await getAgentSite(slug).catch(() => null);
  if (!site || site === "disabled") return { title: "אתר סוכן · ZONO" };
  const A = site.agent;
  const title = `${A.name}${A.title ? " · " + A.title : ""}${A.officeName ? " | " + A.officeName : ""}`;
  const description = A.bio || A.valueProp || A.headline || `יועץ נדל"ן${A.areas.length ? " ב" + A.areas.slice(0, 3).join(", ") : ""}`;
  const origin = await baseUrl();
  const canonical = origin ? `${origin}/agent/${slug}` : undefined;
  const image = site.brand.profileImage || A.cover || undefined;
  return {
    title, description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title, description, type: "profile", url: canonical, images: image ? [image] : undefined, locale: "he_IL" },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function AgentSitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const site = await getAgentSite(slug).catch(() => null);

  if (site && site !== "disabled") {
    try {
      const h = await headers();
      await logAgentSiteEvent(slug, "page_view", { path: "/", userAgent: h.get("user-agent") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined });
    } catch { /* never block render */ }
  }

  if (!site) return <Inactive title="האתר לא נמצא" />;
  if (site === "disabled") return <Inactive title="האתר אינו פעיל כרגע" />;

  const origin = await baseUrl();
  const url = origin ? `${origin}/agent/${slug}` : undefined;
  const A = site.agent;

  // Structured data (spec §23): Person (the agent) + RealEstateAgent (the office
  // brand) + BreadcrumbList. Only real, public-safe fields.
  const graph: Record<string, unknown>[] = [
    {
      "@type": "Person", "@id": url ? `${url}#agent` : undefined, name: A.name, jobTitle: A.title ?? 'יועץ נדל"ן',
      description: A.bio ?? A.valueProp ?? undefined, telephone: A.phone ?? undefined, email: A.email ?? undefined,
      image: site.brand.profileImage ?? undefined, url, knowsAbout: A.specialties.length ? A.specialties : undefined,
      areaServed: A.areas.length ? A.areas : undefined, knowsLanguage: A.languages.length ? A.languages : undefined,
      worksFor: A.officeName ? { "@type": "RealEstateAgent", name: A.officeName } : undefined,
    },
    {
      "@type": "RealEstateAgent", "@id": url ? `${url}#office` : undefined, name: A.officeName ?? A.name,
      telephone: A.phone ?? undefined, image: site.brand.logo ?? undefined, url, areaServed: A.areas.length ? A.areas : undefined,
      address: A.officeAddress ? { "@type": "PostalAddress", streetAddress: A.officeAddress, addressCountry: "IL" } : undefined,
    },
    url ? {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: A.name, item: url },
        { "@type": "ListItem", position: 2, name: "נכסים", item: `${url}/properties` },
      ],
    } : undefined,
  ].filter(Boolean) as Record<string, unknown>[];

  const jsonLd = { "@context": "https://schema.org", "@graph": graph };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <AgentWebsiteTemplate data={site} />
    </>
  );
}

function Inactive({ title }: { title: string }) {
  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4">
      <div className="rounded-3xl border border-[#e8eaf0] p-10 text-center">
        <div className="mb-3 text-4xl">🏠</div>
        <h1 className="text-xl font-black text-[#0f172a]">{title}</h1>
      </div>
    </main>
  );
}
