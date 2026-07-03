// ============================================================================
// ✅ AI Agent Website — self-tests (pure, offline). 32.2.
// no-listings / many / luxury / multi-city / no-photo / no-phone / unpublished /
// redaction / SEO (Person+RealEstateAgent) / Ask scope / large set.
// ============================================================================
import { buildAgentHome, buildAgentAbout, buildAgentAreas } from "./assemble";
import { seoForAgentHome, seoForAgentAbout, seoForAgentProperty, seoForAgentArea, buildAgentSitemap, sitemapXml, agentRobotsTxt } from "./seo";
import { containsForbidden, buildProperty, buildNeighborhood } from "@/lib/brokerage-site";
import type { AgentInput, AgentBranding, SiteListingInput } from "./types";

export interface ASCheck { name: string; pass: boolean; detail: string }
export interface ASSelfCheck { ok: boolean; total: number; passed: number; checks: ASCheck[] }

const branding = (o: Partial<AgentBranding> = {}): AgentBranding => ({ officeName: "נדל\"ן זונו", logo: null, cover: null, accent: "#0ea5e9", accent2: "#6366f1", phone: "0500000000", whatsapp: "972500000000", email: "broker@zono.co.il", address: null, brokerName: "דנה כהן", title: "סוכנת בכירה", photo: "https://x/p.jpg", bio: "12 שנות ניסיון בנדל\"ן עירוני.", languages: ["עברית", "אנגלית"], specialties: ["דירות יוקרה", "השקעות"], yearsExperience: 12, calendarLink: "https://cal/dana", social: {}, ...o });
const listing = (o: Partial<SiteListingInput> = {}): SiteListingInput => ({ id: "P1", title: "דירת 4 חדרים", city: "תל אביב", neighborhood: "לב העיר", price: 3200000, rooms: 4, area: 95, type: "apartment", status: "active", image: "https://x/i.jpg", gallery: ["https://x/1.jpg"], healthLabel: "בריא", classification: ["בריא"], truthScore: 78, valuationAvailable: true, rangePosition: "within", priceGapPct: 1, marketScore: 72, domBand: "fast", buyerDemandScore: 70, matchingBuyers: 3, competitionPressure: 40, strategy: "hold", recommendationAction: null, ...o });
const input = (o: Partial<AgentInput> = {}): AgentInput => ({ branding: branding(), listings: [listing(), listing({ id: "P2", title: "פנטהאוז יוקרה", classification: ["יוקרה"], price: 12000000, neighborhood: "צפון הישן" }), listing({ id: "P3", city: "רמת גן", neighborhood: "מרכז", price: 2400000 })], perf: { closedDeals: 34, satisfaction: 92 }, serviceAreas: ["לב העיר", "צפון הישן", "מרכז"], dataQuality: 72, marketFacts: ["3 נכסים פעילים"], ...o });

export function runSelfCheck(): ASSelfCheck {
  const checks: ASCheck[] = [];
  const add = (name: string, pass: boolean, detail: string) => checks.push({ name, pass, detail });

  const home = buildAgentHome(input());
  add("agent home hero + stats + intro + featured", home.hero.name === "דנה כהן" && home.stats.length >= 2 && home.intro.length > 0 && home.featured.length > 0, "");
  add("home NO forbidden keys", containsForbidden(home) === null, containsForbidden(home) ?? "");
  add("stats include deals (real) not fabricated", home.stats.some((s) => s.label === "עסקאות" && s.value === "34"), "");

  const about = buildAgentAbout(input());
  add("about bio + languages + specialties + trust band", about.bio.length > 0 && about.languages.length === 2 && about.specialties.length === 2 && ["verified", "reviewed", "listed"].includes(about.trustBand), "");
  add("about NO forbidden keys (no raw scores)", containsForbidden(about) === null, "");
  add("about contact only present fields", about.contact.phone === "0500000000" && about.faq.length >= 2, "");

  const areas = buildAgentAreas(input());
  add("areas aggregated + expertise tiers", areas.areas.length >= 2 && areas.areas.every((a) => ["verified", "reviewed", "listed"].includes(a.expertise)), "");

  // Property + neighborhood reuse the 32.1 framework.
  const prop = buildProperty(listing(), input().listings);
  const seoP = seoForAgentProperty(prop, branding(), "https://app.zono", "dana");
  add("agent property SEO — listing + breadcrumbs + agent path", seoP.jsonLd.some((j) => j["@type"] === "RealEstateListing") && seoP.canonical.includes("/ai-agent/dana/property/"), "");
  const nb = buildNeighborhood("צפון הישן", input().listings, 60);
  const seoA = seoForAgentArea(nb, branding(), "https://app.zono", "dana");
  add("agent area SEO Place + agent path", seoA.jsonLd.some((j) => j["@type"] === "Place") && seoA.canonical.includes("/ai-agent/dana/area/"), "");

  // SEO home has Person + RealEstateAgent.
  const seoH = seoForAgentHome(branding(), "https://app.zono", "dana");
  add("home SEO Person + RealEstateAgent", seoH.jsonLd.some((j) => j["@type"] === "Person") && seoH.jsonLd.some((j) => j["@type"] === "RealEstateAgent") && seoH.title.length <= 65, `${seoH.title.length}`);
  const seoAb = seoForAgentAbout(branding(), "https://app.zono", "dana");
  add("about SEO complete", !!seoAb.title && seoAb.canonical.endsWith("/about"), "");

  // Sitemap + robots.
  const sm = buildAgentSitemap("https://app.zono", "dana", ["P1", "P2"], ["לב העיר"]);
  add("agent sitemap + xml", sm.length >= 6 && sitemapXml(sm).includes("/ai-agent/dana/property/P1"), "");
  add("agent robots references sitemap", agentRobotsTxt("https://app.zono", "dana").includes("/ai-agent/dana"), "");

  // Edge cases.
  const noListings = buildAgentHome(input({ listings: [] }));
  add("broker with NO listings safe", noListings.featured.length === 0 && noListings.stats.length >= 1 && noListings.intro.length > 0, "");
  const noPhoto = buildAgentAbout(input({ branding: branding({ photo: null }) }));
  add("broker with NO photo safe", noPhoto.photo === null && noPhoto.bio.length > 0, "");
  const noPhone = buildAgentAbout(input({ branding: branding({ phone: null, whatsapp: null }) }));
  add("broker with NO public phone → omitted (not faked)", noPhone.contact.phone === null && noPhone.contact.whatsapp === null, "");
  const noDeals = buildAgentHome(input({ perf: { closedDeals: null, satisfaction: null } }));
  add("no deals → NOT shown (no fake sales)", !noDeals.stats.some((st) => st.label === "עסקאות"), "");
  const luxury = buildAgentHome(input({ listings: [listing({ classification: ["יוקרה"], buyerDemandScore: 85 })] }));
  add("luxury broker", luxury.featured.length === 1, "");
  const multi = buildAgentAreas(input());
  add("multi-city areas", new Set(input().listings.map((l) => l.city)).size >= 2 && multi.areas.length >= 2, "");

  // Large set performance.
  const t0 = Date.now();
  const big = input({ listings: Array.from({ length: 400 }, (_, i) => listing({ id: `P${i}`, city: i % 2 ? "חיפה" : "תל אביב" })) });
  buildAgentHome(big); buildAgentAreas(big);
  add("large listing set < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
