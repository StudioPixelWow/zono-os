// ============================================================================
// 🌐 AI Brokerage Website — SEO engine (pure). 32.1. Part: SEO ENGINE.
// Titles, descriptions, OpenGraph, Twitter, JSON-LD (Organization / listing /
// neighborhood / breadcrumbs), sitemap + robots. No I/O.
// ============================================================================
import type { SeoMeta, SitemapEntry, PropertyAI, NeighborhoodAI, OfficeAI, SiteBranding } from "./types";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const base = (origin: string, slug: string) => `${origin}/ai-site/${slug}`;

function org(branding: SiteBranding, origin: string, slug: string): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "RealEstateAgent", name: branding.officeName, url: base(origin, slug), image: branding.logo ?? undefined, telephone: branding.phone ?? undefined, email: branding.email ?? undefined, address: branding.address ?? undefined };
}
function breadcrumbs(crumbs: { name: string; href: string }[]): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.href })) };
}

export function seoForHome(branding: SiteBranding, origin: string, slug: string): SeoMeta {
  const url = base(origin, slug);
  const title = `${branding.officeName} — נדל"ן חכם מונע בינה מלאכותית`;
  const description = clip(`מלאי נדל"ן חי, חיפוש חכם, המלצות מותאמות ותשובות מיידיות מ-Ask ZONO אצל ${branding.officeName}.`, 160);
  return {
    title, description, canonical: url,
    openGraph: { title, description, image: branding.cover ?? branding.logo, type: "website", url },
    twitter: { card: "summary_large_image", title, description, image: branding.cover ?? branding.logo },
    breadcrumbs: [{ name: "בית", href: url }],
    jsonLd: [org(branding, origin, slug)],
  };
}

export function seoForProperty(p: PropertyAI, branding: SiteBranding, origin: string, slug: string): SeoMeta {
  const url = `${base(origin, slug)}/property/${p.id}`;
  const priceTxt = p.price != null ? ` · ₪${p.price.toLocaleString("he-IL")}` : "";
  const title = clip(`${p.title}${p.neighborhood ? `, ${p.neighborhood}` : ""}${priceTxt} | ${branding.officeName}`, 65);
  const description = clip(p.aiSummary || `${p.title} למכירה אצל ${branding.officeName}.`, 160);
  const listingLd: Record<string, unknown> = {
    "@context": "https://schema.org", "@type": "RealEstateListing", name: p.title, url,
    image: p.image ?? undefined,
    offers: p.price != null ? { "@type": "Offer", price: p.price, priceCurrency: "ILS" } : undefined,
    address: { "@type": "PostalAddress", addressLocality: p.city ?? undefined, addressRegion: p.neighborhood ?? undefined },
    numberOfRooms: p.rooms ?? undefined, floorSize: p.area != null ? { "@type": "QuantitativeValue", value: p.area, unitCode: "MTK" } : undefined,
  };
  return {
    title, description, canonical: url,
    openGraph: { title, description, image: p.image ?? branding.cover, type: "website", url },
    twitter: { card: "summary_large_image", title, description, image: p.image ?? branding.cover },
    breadcrumbs: [{ name: "בית", href: base(origin, slug) }, { name: "נכסים", href: `${base(origin, slug)}/properties` }, { name: p.title, href: url }],
    jsonLd: [listingLd, breadcrumbs([{ name: "בית", href: base(origin, slug) }, { name: p.title, href: url }])],
  };
}

export function seoForNeighborhood(n: NeighborhoodAI, branding: SiteBranding, origin: string, slug: string): SeoMeta {
  const url = `${base(origin, slug)}/neighborhood/${encodeURIComponent(n.name)}`;
  const title = clip(`נדל"ן ב${n.name}${n.city ? `, ${n.city}` : ""} | ${branding.officeName}`, 65);
  const description = clip(n.overview, 160);
  const placeLd = { "@context": "https://schema.org", "@type": "Place", name: n.name, url, address: { "@type": "PostalAddress", addressLocality: n.city ?? undefined } };
  return {
    title, description, canonical: url,
    openGraph: { title, description, image: branding.cover ?? branding.logo, type: "website", url },
    twitter: { card: "summary_large_image", title, description, image: branding.cover ?? branding.logo },
    breadcrumbs: [{ name: "בית", href: base(origin, slug) }, { name: "שכונות", href: `${base(origin, slug)}/neighborhoods` }, { name: n.name, href: url }],
    jsonLd: [placeLd],
  };
}

export function seoForOffice(o: OfficeAI, branding: SiteBranding, origin: string, slug: string): SeoMeta {
  const url = `${base(origin, slug)}/office`;
  const title = clip(`אודות ${o.name} | נדל"ן חכם`, 65);
  const description = clip(o.story, 160);
  return {
    title, description, canonical: url,
    openGraph: { title, description, image: branding.cover ?? branding.logo, type: "website", url },
    twitter: { card: "summary_large_image", title, description, image: branding.cover ?? branding.logo },
    breadcrumbs: [{ name: "בית", href: base(origin, slug) }, { name: "אודות", href: url }],
    jsonLd: [org(branding, origin, slug)],
  };
}

export function buildSitemap(origin: string, slug: string, propertyIds: string[], neighborhoods: string[]): SitemapEntry[] {
  const b = base(origin, slug);
  const out: SitemapEntry[] = [
    { loc: b, changefreq: "daily", priority: 1 },
    { loc: `${b}/properties`, changefreq: "hourly", priority: 0.9 },
    { loc: `${b}/office`, changefreq: "weekly", priority: 0.6 },
  ];
  for (const id of propertyIds) out.push({ loc: `${b}/property/${id}`, changefreq: "daily", priority: 0.8 });
  for (const n of neighborhoods) out.push({ loc: `${b}/neighborhood/${encodeURIComponent(n)}`, changefreq: "weekly", priority: 0.7 });
  return out;
}
export function sitemapXml(entries: SitemapEntry[]): string {
  const urls = entries.map((e) => `  <url><loc>${e.loc}</loc><changefreq>${e.changefreq}</changefreq><priority>${e.priority}</priority>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}</url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}
export function robotsTxt(origin: string, slug: string): string {
  return `User-agent: *\nAllow: /ai-site/${slug}\nSitemap: ${base(origin, slug)}/sitemap.xml\n`;
}
