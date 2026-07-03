// ============================================================================
// 👤 AI Agent Website — SEO engine (pure). 32.2. Person + RealEstateAgent JSON-LD.
// REUSES the framework XML serializer; agent-scoped base path + person schema.
// ============================================================================
import { sitemapXml } from "@/lib/brokerage-site/seo";
import type { SitemapEntry } from "@/lib/brokerage-site/types";
import type { AgentBranding, PropertyAI, NeighborhoodAI } from "./types";

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const base = (origin: string, slug: string) => `${origin}/ai-agent/${slug}`;

export interface SeoMeta {
  title: string; description: string; canonical: string;
  openGraph: { title: string; description: string; image: string | null; type: string; url: string };
  twitter: { card: string; title: string; description: string; image: string | null };
  jsonLd: Record<string, unknown>[];
}

function agentLd(b: AgentBranding, origin: string, slug: string): Record<string, unknown>[] {
  const url = base(origin, slug);
  const person: Record<string, unknown> = { "@context": "https://schema.org", "@type": "Person", name: b.brokerName, jobTitle: b.title ?? "מתווך/ת נדל\"ן", image: b.photo ?? undefined, url, knowsLanguage: b.languages.length ? b.languages : undefined, worksFor: { "@type": "Organization", name: b.officeName }, telephone: b.phone ?? undefined, email: b.email ?? undefined };
  const agent: Record<string, unknown> = { "@context": "https://schema.org", "@type": "RealEstateAgent", name: b.brokerName, image: b.photo ?? b.logo ?? undefined, url, telephone: b.phone ?? undefined, email: b.email ?? undefined, memberOf: { "@type": "Organization", name: b.officeName }, knowsAbout: b.specialties.length ? b.specialties : undefined };
  return [agent, person];
}

export function seoForAgentHome(b: AgentBranding, origin: string, slug: string): SeoMeta {
  const url = base(origin, slug);
  const title = clip(`${b.brokerName}${b.title ? ` · ${b.title}` : ""} | ${b.officeName}`, 65);
  const description = clip(`${b.brokerName} — ליווי נדל"ן אישי מונע בינה מלאכותית${b.specialties.length ? `. מתמחה ב${b.specialties.slice(0, 2).join(", ")}` : ""}. נכסים חיים, המלצות ותשובות מיידיות.`, 160);
  return { title, description, canonical: url, openGraph: { title, description, image: b.photo ?? b.cover, type: "profile", url }, twitter: { card: "summary_large_image", title, description, image: b.photo ?? b.cover }, jsonLd: agentLd(b, origin, slug) };
}

export function seoForAgentAbout(b: AgentBranding, origin: string, slug: string): SeoMeta {
  const url = `${base(origin, slug)}/about`;
  const title = clip(`אודות ${b.brokerName} | ${b.officeName}`, 65);
  const description = clip(b.bio ?? `${b.brokerName} — מתווך/ת נדל"ן ב${b.officeName}.`, 160);
  return { title, description, canonical: url, openGraph: { title, description, image: b.photo ?? b.cover, type: "profile", url }, twitter: { card: "summary_large_image", title, description, image: b.photo ?? b.cover }, jsonLd: agentLd(b, origin, slug) };
}

export function seoForAgentProperty(p: PropertyAI, b: AgentBranding, origin: string, slug: string): SeoMeta {
  const url = `${base(origin, slug)}/property/${p.id}`;
  const price = p.price != null ? ` · ₪${p.price.toLocaleString("he-IL")}` : "";
  const title = clip(`${p.title}${p.neighborhood ? `, ${p.neighborhood}` : ""}${price} | ${b.brokerName}`, 65);
  const description = clip(p.aiSummary || `${p.title} בייצוג ${b.brokerName}.`, 160);
  const listingLd: Record<string, unknown> = {
    "@context": "https://schema.org", "@type": "RealEstateListing", name: p.title, url, image: p.image ?? undefined,
    offers: p.price != null ? { "@type": "Offer", price: p.price, priceCurrency: "ILS" } : undefined,
    address: { "@type": "PostalAddress", addressLocality: p.city ?? undefined, addressRegion: p.neighborhood ?? undefined },
    numberOfRooms: p.rooms ?? undefined, floorSize: p.area != null ? { "@type": "QuantitativeValue", value: p.area, unitCode: "MTK" } : undefined,
    agent: { "@type": "RealEstateAgent", name: b.brokerName },
  };
  const crumbs = { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "בית", item: base(origin, slug) }, { "@type": "ListItem", position: 2, name: "נכסים", item: `${base(origin, slug)}/properties` }, { "@type": "ListItem", position: 3, name: p.title, item: url }] };
  return { title, description, canonical: url, openGraph: { title, description, image: p.image ?? b.photo, type: "website", url }, twitter: { card: "summary_large_image", title, description, image: p.image ?? b.photo }, jsonLd: [listingLd, crumbs] };
}

export function seoForAgentArea(n: NeighborhoodAI, b: AgentBranding, origin: string, slug: string): SeoMeta {
  const url = `${base(origin, slug)}/area/${encodeURIComponent(n.name)}`;
  const title = clip(`${n.name}${n.city ? `, ${n.city}` : ""} · נדל"ן עם ${b.brokerName}`, 65);
  const description = clip(n.overview, 160);
  const placeLd = { "@context": "https://schema.org", "@type": "Place", name: n.name, url, address: { "@type": "PostalAddress", addressLocality: n.city ?? undefined } };
  return { title, description, canonical: url, openGraph: { title, description, image: b.photo ?? b.cover, type: "website", url }, twitter: { card: "summary_large_image", title, description, image: b.photo ?? b.cover }, jsonLd: [placeLd] };
}

export function buildAgentSitemap(origin: string, slug: string, propertyIds: string[], areas: string[]): SitemapEntry[] {
  const bse = base(origin, slug);
  const out: SitemapEntry[] = [
    { loc: bse, changefreq: "daily", priority: 1 },
    { loc: `${bse}/properties`, changefreq: "hourly", priority: 0.9 },
    { loc: `${bse}/areas`, changefreq: "weekly", priority: 0.7 },
    { loc: `${bse}/about`, changefreq: "monthly", priority: 0.6 },
  ];
  for (const id of propertyIds) out.push({ loc: `${bse}/property/${id}`, changefreq: "daily", priority: 0.8 });
  for (const a of areas) out.push({ loc: `${bse}/area/${encodeURIComponent(a)}`, changefreq: "weekly", priority: 0.6 });
  return out;
}
export function agentRobotsTxt(origin: string, slug: string): string {
  return `User-agent: *\nAllow: /ai-agent/${slug}\nSitemap: ${base(origin, slug)}/sitemap.xml\n`;
}
export { sitemapXml };
