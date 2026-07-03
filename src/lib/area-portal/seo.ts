// ============================================================================
// 🌍 Area Portal — SEO engine (pure). 32.5.
// Place / City / Neighborhood / CollectionPage / BreadcrumbList / RealEstateListing
// JSON-LD + canonical + OpenGraph + Twitter + sitemap + robots. REUSES the AI
// Brokerage Website framework XML serializer. The strongest SEO asset of ZONO.
// ============================================================================
import { sitemapXml } from "@/lib/brokerage-site/seo";
import type { SitemapEntry } from "@/lib/brokerage-site/types";
import type { CityView, NeighborhoodView, StreetView, AreaListingCard } from "./types";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const areaBase = (origin: string) => `${origin}/area`;
export const citySeg = (city: string) => encodeURIComponent(city);
export const cityUrl = (origin: string, city: string) => `${areaBase(origin)}/${citySeg(city)}`;
export const nbUrl = (origin: string, city: string, nb: string) => `${cityUrl(origin, city)}/${encodeURIComponent(nb)}`;
export const streetUrl = (origin: string, city: string, nb: string, st: string) => `${nbUrl(origin, city, nb)}/${encodeURIComponent(st)}`;

export interface SeoMeta {
  title: string; description: string; canonical: string;
  openGraph: { title: string; description: string; type: string; url: string; image: string | null };
  twitter: { card: string; title: string; description: string };
  jsonLd: Record<string, unknown>[];
}

function breadcrumb(origin: string, trail: { name: string; url: string }[]): Record<string, unknown> {
  return { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.url })) };
}
function listingLd(l: AreaListingCard): Record<string, unknown> {
  return { "@type": "RealEstateListing", name: l.title, image: l.image ?? undefined, numberOfRooms: l.rooms ?? undefined,
    floorSize: l.area != null ? { "@type": "QuantitativeValue", value: l.area, unitCode: "MTK" } : undefined,
    offers: l.price != null ? { "@type": "Offer", price: l.price, priceCurrency: "ILS" } : undefined };
}

export function seoForCity(v: CityView, origin: string): SeoMeta {
  const url = cityUrl(origin, v.city);
  const title = clip(`נדל״ן ב${v.city} — מחירים, מגמות ונכסים | ZONO`, 65);
  const description = clip(v.overview, 160);
  const place = { "@context": "https://schema.org", "@type": "City", name: v.city, url };
  const collection = { "@context": "https://schema.org", "@type": "CollectionPage", name: `נדל״ן ב${v.city}`, url, about: { "@type": "Place", name: v.city }, hasPart: v.featured.slice(0, 10).map(listingLd) };
  const bc = breadcrumb(origin, [{ name: "אזורים", url: areaBase(origin) }, { name: v.city, url }]);
  return { title, description, canonical: url, openGraph: { title, description, type: "website", url, image: v.featured[0]?.image ?? null }, twitter: { card: "summary_large_image", title, description }, jsonLd: [place, collection, bc] };
}

export function seoForNeighborhood(v: NeighborhoodView, origin: string): SeoMeta {
  const url = nbUrl(origin, v.city, v.neighborhood);
  const title = clip(`${v.neighborhood}, ${v.city} — נדל״ן, מחירים ועסקאות | ZONO`, 65);
  const description = clip(v.summary, 160);
  const place = { "@context": "https://schema.org", "@type": "Place", name: v.neighborhood, address: { "@type": "PostalAddress", addressLocality: v.city }, url };
  const collection = { "@context": "https://schema.org", "@type": "CollectionPage", name: `נדל״ן ב${v.neighborhood}`, url, about: { "@type": "Place", name: v.neighborhood }, hasPart: v.featured.slice(0, 10).map(listingLd) };
  const bc = breadcrumb(origin, [{ name: "אזורים", url: areaBase(origin) }, { name: v.city, url: cityUrl(origin, v.city) }, { name: v.neighborhood, url }]);
  return { title, description, canonical: url, openGraph: { title, description, type: "website", url, image: v.featured[0]?.image ?? null }, twitter: { card: "summary_large_image", title, description }, jsonLd: [place, collection, bc] };
}

export function seoForStreet(v: StreetView, origin: string): SeoMeta {
  const nb = v.neighborhood ?? v.city;
  const url = streetUrl(origin, v.city, nb, v.street);
  const title = clip(`${v.street}, ${nb} — נדל״ן ומחירים | ZONO`, 65);
  const description = clip(v.summary, 160);
  const place = { "@context": "https://schema.org", "@type": "Place", name: `${v.street}, ${nb}`, address: { "@type": "PostalAddress", streetAddress: v.street, addressLocality: v.city }, url };
  const bc = breadcrumb(origin, [{ name: "אזורים", url: areaBase(origin) }, { name: v.city, url: cityUrl(origin, v.city) }, { name: nb, url: nbUrl(origin, v.city, nb) }, { name: v.street, url }]);
  return { title, description, canonical: url, openGraph: { title, description, type: "website", url, image: v.featured[0]?.image ?? null }, twitter: { card: "summary_large_image", title, description }, jsonLd: [place, bc] };
}

/** Sitemap for a city and all its neighborhoods (+ sub-sections). */
export function buildAreaSitemap(origin: string, city: string, neighborhoods: string[]): SitemapEntry[] {
  const out: SitemapEntry[] = [{ loc: cityUrl(origin, city), changefreq: "daily", priority: 0.9 }];
  for (const nb of neighborhoods) {
    const base = nbUrl(origin, city, nb);
    out.push({ loc: base, changefreq: "daily", priority: 0.8 });
    for (const sec of ["insights", "properties", "transactions", "offices", "brokers"]) out.push({ loc: `${base}/${sec}`, changefreq: "weekly", priority: 0.6 });
  }
  return out;
}
export function areaRobotsTxt(origin: string): string {
  return `User-agent: *\nAllow: /area\nSitemap: ${origin}/area/sitemap.xml\n`;
}
export { sitemapXml };
