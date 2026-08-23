import type { Metadata } from "next";
import { headers } from "next/headers";
import { getPropertyMarketing } from "@/lib/property-marketing/data";
import { PropertyMarketingPage } from "@/components/property-marketing/PropertyMarketingPage";
import { resolvePropertyTypeLabel } from "@/lib/property-marketing/presentation";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) => (typeof n === "number" && n > 0 ? `₪${n.toLocaleString("he-IL")}` : "");

async function origin(): Promise<string | null> {
  const host = (await headers()).get("host");
  return host ? `https://${host}` : null;
}

// OpenGraph is CRITICAL (§30): when the agent shares the link on WhatsApp the
// preview must show the PROPERTY photo, not a generic ZONO image.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const d = await getPropertyMarketing(id).catch(() => null);
  if (!d || d === "unavailable") return { title: "נכס · ZONO", robots: { index: false } };
  // Canonical Hebrew resolver — never leaks a raw enum into the title/OG/Twitter.
  const type = resolvePropertyTypeLabel(d.type);
  const priceStr = d.listingKind === "rent" ? (money(d.price) ? `${money(d.price)}/חודש` : "") : money(d.price);
  const title = `${type}${d.rooms ? ` · ${d.rooms} חדרים` : ""}${d.address.area ? ` · ${d.address.area}` : ""}`;
  const description = [priceStr, d.description?.slice(0, 120)].filter(Boolean).join(" · ") || title;
  const base = await origin();
  const canonical = base ? `${base}/p/${id}` : undefined;
  const image = d.media.images[0] || d.brand.logo || undefined;
  return {
    title: `${title} · ${d.office.name}`,
    description,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title, description, type: "website", url: canonical, images: image ? [{ url: image }] : undefined, locale: "he_IL" },
    twitter: { card: "summary_large_image", title, description, images: image ? [image] : undefined },
  };
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getPropertyMarketing(id).catch(() => null);
  if (!d) return <Inactive title="הנכס לא נמצא" />;
  if (d === "unavailable") return <Inactive title="הנכס אינו זמין לצפייה" />;

  const base = await origin();
  const url = base ? `${base}/p/${id}` : undefined;
  const schemaType = d.type === "house" || d.type === "cottage" ? "House" : d.type === "lot" ? "Residence" : "Apartment";

  const graph: Record<string, unknown>[] = [
    {
      "@type": schemaType, name: d.title, description: d.description ?? undefined, numberOfRooms: d.rooms ?? undefined,
      floorSize: d.sizeSqm ? { "@type": "QuantitativeValue", value: d.sizeSqm, unitCode: "MTK" } : undefined,
      image: d.media.images.length ? d.media.images.slice(0, 6) : undefined,
      address: { "@type": "PostalAddress", addressLocality: d.address.area || undefined, addressCountry: "IL" },
      geo: d.address.exact && d.address.lat != null ? { "@type": "GeoCoordinates", latitude: d.address.lat, longitude: d.address.lng } : undefined,
    },
    d.price ? { "@type": "Offer", price: d.price, priceCurrency: "ILS", availability: "https://schema.org/InStock", url } : undefined,
    d.agent ? { "@type": "RealEstateAgent", name: d.agent.name, telephone: d.agent.phone ?? undefined, image: d.agent.photo ?? undefined, worksFor: { "@type": "Organization", name: d.office.name } } : undefined,
    url ? { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: d.office.name },
      { "@type": "ListItem", position: 2, name: d.title, item: url },
    ] } : undefined,
  ].filter(Boolean) as Record<string, unknown>[];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@graph": graph }) }} />
      <PropertyMarketingPage data={d} />
    </>
  );
}

function Inactive({ title }: { title: string }) {
  return (
    <main dir="rtl" className="grid min-h-screen place-items-center bg-white px-4">
      <div className="rounded-3xl border border-[#e8eaf0] p-10 text-center"><div className="mb-3 text-4xl">🏠</div><h1 className="text-xl font-black text-[#0f172a]">{title}</h1></div>
    </main>
  );
}
