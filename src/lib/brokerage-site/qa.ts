// ============================================================================
// ✅ AI Brokerage Website — self-tests (pure, offline). 32.1. Part: QA.
// Security/redaction · SEO · content evidence-only · personalization inputs ·
// small/large/luxury/multi-city/empty-office assembly · performance.
// ============================================================================
import { buildHome, buildProperty, buildNeighborhood, buildOffice } from "./assemble";
import { badgesFor, containsForbidden, trustTier, publicStrategyLabel } from "./redact";
import { seoForHome, seoForProperty, seoForNeighborhood, buildSitemap, sitemapXml, robotsTxt } from "./seo";
import { faqBlocks } from "./content";
import { themeVars } from "./branding";
import type { SiteInput, SiteListingInput, SiteBranding } from "./types";

export interface BSCheck { name: string; pass: boolean; detail: string }
export interface BSSelfCheck { ok: boolean; total: number; passed: number; checks: BSCheck[] }

const branding = (o: Partial<SiteBranding> = {}): SiteBranding => ({ officeName: "נדל\"ן זונו", logo: null, cover: null, accent: "#0ea5e9", accent2: "#6366f1", phone: "03-1234567", whatsapp: "972500000000", email: "info@zono.co.il", address: "תל אביב", ...o });
const listing = (o: Partial<SiteListingInput> = {}): SiteListingInput => ({ id: "P1", title: "דירת 4 חדרים", city: "תל אביב", neighborhood: "לב העיר", price: 3200000, rooms: 4, area: 95, type: "apartment", status: "active", image: "https://x/i.jpg", gallery: ["https://x/1.jpg", "https://x/2.jpg"], healthLabel: "בריא", classification: ["בריא"], truthScore: 78, valuationAvailable: true, rangePosition: "within", priceGapPct: 1, marketScore: 72, domBand: "fast", buyerDemandScore: 70, matchingBuyers: 3, competitionPressure: 40, strategy: "hold", recommendationAction: "החזק מחיר", ...o });
const input = (o: Partial<SiteInput> = {}): SiteInput => ({
  branding: branding(), officeStats: { properties: 24, agents: 6, cities: 3, rating: 4.9, businessHealth: 66, dataQuality: 72 },
  listings: [listing(), listing({ id: "P2", title: "פנטהאוז יוקרה", classification: ["יוקרה"], price: 12000000, neighborhood: "צפון הישן", buyerDemandScore: 80, strategy: "luxury_campaign" }), listing({ id: "P3", title: "דירת 3", city: "רמת גן", neighborhood: "מרכז", price: 2400000 })],
  coverage: [{ city: "תל אביב", areas: ["לב העיר", "צפון הישן"] }, { city: "רמת גן", areas: ["מרכז"] }],
  recentAreas: ["לב העיר", "מרכז"], marketSummaryFacts: ["24 נכסים פעילים", "ביקוש גבוה בלב העיר"], ...o,
});

export function runSelfCheck(): BSSelfCheck {
  const checks: BSCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  // Redaction / security — the core guarantee.
  add("trust tier redaction", trustTier(78) === "verified" && trustTier(50) === "reviewed" && trustTier(null) === "listed", "");
  add("internal strategy code not exposed", publicStrategyLabel("hold") === "מחיר יציב" && publicStrategyLabel("BUYER_CLOSE") === null, "");
  const badges = badgesFor(listing());
  add("badges are public-safe (count, no ids)", badges.matchingBuyers === 3 && typeof badges.marketScore === "number" && !("truthScore" in badges), "");

  // Property AI + no forbidden fields leak.
  const prop = buildProperty(listing(), input().listings);
  add("property AI summary + highlights", prop.aiSummary.length > 0 && prop.highlights.length > 0 && prop.related.length > 0, "");
  add("property view model has NO forbidden keys", containsForbidden(prop) === null, containsForbidden(prop) ?? "");

  // Home.
  const home = buildHome(input());
  add("home hero + stats + featured + insights", home.hero.headline.length > 0 && home.stats.length === 4 && home.featured.length > 0 && home.insights.length >= 4, "");
  add("home has NO forbidden keys", containsForbidden(home) === null, containsForbidden(home) ?? "");

  // Neighborhood (luxury + multi-city).
  const nb = buildNeighborhood("צפון הישן", input().listings, 62);
  add("neighborhood stats + luxury detection", nb.stats.inventory >= 1 && (nb.stats.luxuryActivity === "high" || nb.stats.luxuryActivity === "medium") && nb.stats.trend === "up", nb.stats.luxuryActivity);
  add("neighborhood no forbidden keys", containsForbidden(nb) === null, "");

  // Office (public-safe — business score NOT exposed, only trust band).
  const office = buildOffice(input());
  add("office trust band (redacted, not raw score)", ["verified", "reviewed", "listed"].includes(office.trustBand) && containsForbidden(office) === null, "");

  // SEO completeness.
  const seoHome = seoForHome(branding(), "https://app.zono", "zono");
  add("SEO home complete", !!seoHome.title && !!seoHome.description && seoHome.canonical.includes("/ai-site/zono") && seoHome.jsonLd.length > 0 && !!seoHome.openGraph.url, "");
  const seoProp = seoForProperty(prop, branding(), "https://app.zono", "zono");
  add("SEO property JSON-LD RealEstateListing + breadcrumbs", seoProp.jsonLd.some((j) => j["@type"] === "RealEstateListing") && seoProp.breadcrumbs.length >= 2 && seoProp.title.length <= 65, `${seoProp.title.length}`);
  const seoNb = seoForNeighborhood(nb, branding(), "https://app.zono", "zono");
  add("SEO neighborhood Place schema", seoNb.jsonLd.some((j) => j["@type"] === "Place"), "");

  // Sitemap + robots.
  const sm = buildSitemap("https://app.zono", "zono", ["P1", "P2"], ["לב העיר"]);
  add("sitemap entries + xml", sm.length >= 5 && sitemapXml(sm).includes("<urlset") && sitemapXml(sm).includes("/property/P1"), "");
  add("robots references sitemap", robotsTxt("https://app.zono", "zono").includes("Sitemap:"), "");

  // Content evidence-only.
  const faqs = faqBlocks("נדל\"ן זונו");
  add("FAQ blocks carry evidence", faqs.length === 3 && faqs.every((f) => f.evidence.length > 0), "");

  // Branding theme.
  const t = themeVars(branding({ accent: "ff0000" }));
  add("theme vars from brand colors", t["--site-accent"] === "#ff0000" && !!t["--site-gradient"], "");

  // Empty office (no listings) must not crash + no fabrication.
  const empty = buildHome(input({ listings: [], officeStats: { properties: 0, agents: 0, cities: 0, rating: 0, businessHealth: null, dataQuality: null }, marketSummaryFacts: [], coverage: [], recentAreas: [] }));
  add("empty office renders safely", empty.featured.length === 0 && empty.stats.length === 4 && empty.marketSummary.length > 0, "");

  // Large office performance.
  const big = input({ listings: Array.from({ length: 400 }, (_, i) => listing({ id: `P${i}`, city: i % 2 ? "חיפה" : "תל אביב" })) });
  const t0 = Date.now();
  buildHome(big); big.listings.slice(0, 50).forEach((l) => buildProperty(l, big.listings));
  add("large office performance < 300ms", Date.now() - t0 < 300, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
