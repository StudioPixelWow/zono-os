// ============================================================================
// 🎯 ZONO AI Landing Experience™ — server service (server-only). 38.3.
// Resolves a landing by REUSING the EXISTING public renderers (getPropertyAi /
// getNeighborhoodAi / getHomeAi) + SEO engine (seoForProperty/Neighborhood/Home)
// and maps their evidence-only data into the landing context. Adds NO renderer,
// NO data source, NO schema. Public-safe (same redaction as the site renderers).
// ============================================================================
import "server-only";
import { getPropertyAi, getNeighborhoodAi, getHomeAi, seoForProperty, seoForNeighborhood, seoForHome } from "@/lib/brokerage-site";
import type { SeoMeta, SiteBranding, PropertyAI, NeighborhoodAI } from "@/lib/brokerage-site/types";
import { getLandingConfig } from "./catalog";
import { buildLanding } from "./assemble";
import type { LandingType, LandingCtx, LandingView, LandingBadge } from "./types";

const nis = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const DEMAND_HE: Record<string, string> = { high: "ביקוש גבוה", medium: "ביקוש בינוני", low: "ביקוש נמוך" };

function contactOf(b: SiteBranding): LandingCtx["contact"] {
  return { phone: b.phone, whatsapp: b.whatsapp, email: b.email, meeting: null };
}

function propertyBadges(p: PropertyAI): LandingBadge[] {
  const out: LandingBadge[] = [];
  if (p.badges.trust === "verified") out.push({ label: "מאומת", tone: "brand" });
  if (p.badges.demand === "high") out.push({ label: "ביקוש גבוה", tone: "success" });
  if (p.badges.strategyLabel) out.push({ label: p.badges.strategyLabel, tone: "neutral" });
  if (p.badges.domBand === "fast") out.push({ label: "נמכר מהר", tone: "warning" });
  return out;
}

function propertyCtx(slug: string, b: SiteBranding, p: PropertyAI): LandingCtx {
  const line = [p.rooms ? `${p.rooms} חד'` : null, p.area ? `${p.area} מ״ר` : null, p.neighborhood ?? p.city].filter(Boolean).join(" · ");
  return {
    slug, base: "ai-site", officeName: b.officeName, logo: b.logo, cover: p.image,
    title: p.title, subtitle: `${line}${p.price ? ` · ${nis(p.price)}` : ""}`,
    aiSummary: p.aiSummary,
    badges: propertyBadges(p),
    stats: [p.rooms ? { label: "חדרים", value: String(p.rooms) } : null, p.area ? { label: "מ״ר", value: String(p.area) } : null, p.price ? { label: "מחיר", value: nis(p.price) } : null, p.badges.marketScore != null ? { label: "ציון שוק", value: String(p.badges.marketScore) } : null].filter((x): x is { label: string; value: string } => !!x),
    highlights: p.highlights,
    showcase: p.related.map((r) => ({ id: r.id, title: r.title, price: r.price, image: r.image, badge: null })),
    contact: contactOf(b), entityHref: `/ai-site/${slug}/property/${p.id}`, faq: [], seoReady: !!p.title && !!p.aiSummary,
  };
}

function neighborhoodCtx(slug: string, b: SiteBranding, n: NeighborhoodAI): LandingCtx {
  return {
    slug, base: "ai-site", officeName: b.officeName, logo: b.logo, cover: null,
    title: `נדל״ן ב${n.name}`, subtitle: n.overview.slice(0, 160),
    aiSummary: n.overview,
    badges: [{ label: DEMAND_HE[n.stats.demand] ?? "ביקוש", tone: n.stats.demand === "high" ? "success" : "neutral" }, ...(n.stats.trend === "up" ? [{ label: "מגמת עלייה", tone: "warning" as const }] : [])],
    stats: [{ label: "נכסים", value: String(n.stats.inventory) }, n.stats.avgPrice ? { label: "מחיר ממוצע", value: nis(n.stats.avgPrice) } : null, n.stats.growthScore != null ? { label: "צמיחה", value: String(n.stats.growthScore) } : null].filter((x): x is { label: string; value: string } => !!x),
    highlights: n.highlights,
    showcase: n.recommendedListings.map((r) => ({ id: r.id, title: r.title, price: r.price, image: r.image, badge: null })),
    contact: contactOf(b), entityHref: `/ai-site/${slug}/neighborhood/${encodeURIComponent(n.name)}`, faq: [], seoReady: !!n.name && !!n.overview,
  };
}

export interface LandingResult { view: LandingView; seo: SeoMeta; branding: SiteBranding; slug: string }

/** Resolve + assemble a landing. Returns "disabled" | null exactly like the site renderers. */
export async function getLanding(slug: string, type: LandingType, opts: { e?: string; a?: string } = {}): Promise<LandingResult | "disabled" | null> {
  const config = getLandingConfig(type);
  if (!config) return null;

  if (config.family === "property") {
    if (!opts.e) return null;
    const r = await getPropertyAi(slug, opts.e);
    if (r === "disabled" || r === null) return r;
    const ctx = propertyCtx(slug, r.branding, r.property);
    return { view: buildLanding(config, ctx), seo: withSuffix(seoForProperty(r.property, r.branding, "", slug), config.seoSuffix), branding: r.branding, slug };
  }

  if (config.family === "area") {
    if (!opts.a) return null;
    const r = await getNeighborhoodAi(slug, opts.a);
    if (r === "disabled" || r === null) return r;
    const ctx = neighborhoodCtx(slug, r.branding, r.neighborhood);
    return { view: buildLanding(config, ctx), seo: withSuffix(seoForNeighborhood(r.neighborhood, r.branding, "", slug), config.seoSuffix), branding: r.branding, slug };
  }

  // office family — campaign landings backed by the office home.
  const r = await getHomeAi(slug);
  if (r === "disabled" || r === null) return r;
  const b = r.branding, h = r.home;
  const ctx: LandingCtx = {
    slug, base: "ai-site", officeName: b.officeName, logo: b.logo, cover: b.cover,
    title: h.hero.headline, subtitle: h.hero.subtitle, aiSummary: h.marketSummary,
    badges: [], stats: h.stats, highlights: h.insights.map((i) => i.title),
    showcase: h.featured.map((p) => ({ id: p.id, title: p.title, price: p.price, image: p.image, badge: p.badge })),
    contact: contactOf(b), entityHref: `/ai-site/${slug}`, faq: [], seoReady: !!h.hero.headline,
  };
  return { view: buildLanding(config, ctx), seo: withSuffix(seoForHome(b, "", slug), config.seoSuffix), branding: b, slug };
}

function withSuffix(seo: SeoMeta, suffix: string): SeoMeta {
  return { ...seo, title: `${seo.title} · ${suffix}` };
}
