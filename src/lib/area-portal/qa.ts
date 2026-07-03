// ============================================================================
// ✅ Area Portal — self-tests (pure, offline). 32.5.
// small/large city / luxury / empty neighborhood / many listings-offices-brokers
// / SEO (Place+City+Collection+Breadcrumb+RealEstateListing) / public-safe / perf.
// ============================================================================
import { buildCityView, buildNeighborhoodView, buildStreetView, neighborhoodInsights } from "./assemble";
import { seoForCity, seoForNeighborhood, seoForStreet, buildAreaSitemap, sitemapXml, areaRobotsTxt } from "./seo";
import { containsForbidden } from "@/lib/brokerage-site";
import type { AreaData, AreaMarket, AreaListingCard, AreaTransaction } from "./types";

export interface APCheck { name: string; pass: boolean; detail: string }
export interface APSelfCheck { ok: boolean; total: number; passed: number; checks: APCheck[] }

const market = (o: Partial<AreaMarket> = {}): AreaMarket => ({
  avgPrice: 4_800_000, medianPrice: 4_500_000, pricePerSqm: 42_000, avgSoldPrice: 4_600_000, avgSize: 96,
  inventory: 120, transactions: 34, newListings: 18, priceReductions: 4, luxuryPct: 22, rentalPct: 18, commercialPct: 6,
  priceTrendPct: 6.2, momentum: "up", supplyLevel: "low", demandLevel: "high", derived: true, ...o,
});
const listing = (i: number, o: Partial<AreaListingCard> = {}): AreaListingCard => ({ id: `P${i}`, title: `דירת ${3 + (i % 3)} חדרים`, price: 3_000_000 + i * 100000, image: "https://x/i.jpg", rooms: 3 + (i % 3), area: 80 + i, type: "apartment", neighborhood: "לב העיר", street: "דיזנגוף", tags: i % 4 === 0 ? ["יוקרה"] : ["חדש"], ...o });
const tx = (i: number): AreaTransaction => ({ date: `2026-0${1 + (i % 6)}-15`, price: 4_000_000 + i * 50000, pricePerSqm: 40000 + i * 200, rooms: 3 + (i % 3), area: 85 + i, street: "דיזנגוף", type: "apartment" });

const data = (o: Partial<AreaData> = {}): AreaData => ({
  level: "neighborhood", city: "תל אביב", neighborhood: "לב העיר", street: null, market: market(),
  listings: Array.from({ length: 14 }, (_, i) => listing(i)), transactions: Array.from({ length: 10 }, (_, i) => tx(i)),
  offices: [{ name: "רי/מקס מרכז", brokers: 12, listings: 40, city: "תל אביב" }, { name: "אנגלו סכסון", brokers: 8, listings: 25, city: "תל אביב" }],
  brokers: [{ name: "דנה כהן", agency: "רי/מקס", listings: 14, city: "תל אביב", verified: true }, { name: "יוסי לוי", agency: "אנגלו", listings: 9, city: "תל אביב", verified: false }],
  neighborhoods: [{ name: "לב העיר", inventory: 120, avgPrice: 4_800_000, transactions: 34 }, { name: "צפון הישן", inventory: 80, avgPrice: 6_900_000, transactions: 18 }, { name: "פלורנטין", inventory: 140, avgPrice: 2_650_000, transactions: 27 }],
  population: null, ...o,
});

export function runSelfCheck(): APSelfCheck {
  const checks: APCheck[] = [];
  const add = (name: string, pass: boolean, detail = "") => checks.push({ name, pass, detail });

  // City view.
  const city = buildCityView(data({ level: "city", neighborhood: null }));
  add("city view overview + top neighborhoods + featured", city.overview.length > 0 && city.topNeighborhoods.length === 3 && city.featured.length > 0);
  add("city opportunities + recommendation", city.opportunities.length > 0 && city.recommendation.length > 0);
  add("city offices + brokers", city.offices.length === 2 && city.brokers.length === 2);
  add("city NO forbidden keys", containsForbidden(city) === null, containsForbidden(city) ?? "");

  // Neighborhood view.
  const nb = buildNeighborhoodView(data());
  add("neighborhood summary + market + featured + transactions", nb.summary.length > 0 && nb.featured.length > 0 && nb.transactions.length === 10);
  add("neighborhood insights include evidence", nb.insights.length >= 4 && nb.insights.every((i) => i.evidence.length > 0));
  add("neighborhood top property types", nb.topTypes.length >= 1);
  add("neighborhood NO forbidden keys", containsForbidden(nb) === null);
  add("insights include buy/sell/invest/outlook kinds", ["buy", "sell", "invest", "outlook"].every((k) => nb.insights.some((i) => i.kind === k)));

  // Luxury + warning branches.
  const lux = buildNeighborhoodView(data({ market: market({ luxuryPct: 40 }) }));
  add("luxury trend insight", lux.insights.some((i) => i.kind === "luxury"));
  const warn = buildNeighborhoodView(data({ market: market({ supplyLevel: "high", demandLevel: "low", momentum: "down" }) }));
  add("market warning insight", warn.insights.some((i) => i.kind === "warning"));

  // Empty neighborhood safe.
  const empty = buildNeighborhoodView(data({ listings: [], transactions: [], offices: [], brokers: [], market: market({ avgPrice: null, pricePerSqm: null, inventory: 0, transactions: 0, priceTrendPct: null, momentum: "stable", supplyLevel: "low", demandLevel: "low" }) }));
  add("empty neighborhood honest (no crash, no fabricated numbers)", empty.summary.length > 0 && empty.featured.length === 0 && empty.market.avgPrice === null);

  // Street.
  const st = buildStreetView(data({ level: "street", street: "דיזנגוף" }));
  add("street view summary + transactions", st.street === "דיזנגוף" && st.summary.includes("דיזנגוף") && st.transactions.length > 0);

  // SEO.
  const seoC = seoForCity(city, "https://app.zono");
  add("city SEO City+CollectionPage+Breadcrumb", seoC.jsonLd.some((j) => j["@type"] === "City") && seoC.jsonLd.some((j) => j["@type"] === "CollectionPage") && seoC.jsonLd.some((j) => j["@type"] === "BreadcrumbList") && seoC.title.length <= 65 && seoC.canonical.includes("/area/"));
  const seoN = seoForNeighborhood(nb, "https://app.zono");
  add("neighborhood SEO Place+Collection+RealEstateListing", seoN.jsonLd.some((j) => j["@type"] === "Place") && JSON.stringify(seoN.jsonLd).includes("RealEstateListing") && seoN.canonical.includes("/area/"));
  const seoS = seoForStreet(st, "https://app.zono");
  add("street SEO Place + breadcrumb depth 4", seoS.jsonLd.some((j) => j["@type"] === "Place") && (seoS.jsonLd.find((j) => j["@type"] === "BreadcrumbList") as { itemListElement: unknown[] }).itemListElement.length === 4);

  // Sitemap + robots.
  const sm = buildAreaSitemap("https://app.zono", "תל אביב", ["לב העיר", "צפון הישן"]);
  add("sitemap covers neighborhoods + sub-sections", sm.length >= 1 + 2 * 6 && sitemapXml(sm).includes("/area/"));
  add("robots references area sitemap", areaRobotsTxt("https://app.zono").includes("/area/sitemap.xml"));

  // Many listings/offices/brokers.
  const many = buildNeighborhoodView(data({ listings: Array.from({ length: 300 }, (_, i) => listing(i)), offices: Array.from({ length: 30 }, (_, i) => ({ name: `משרד ${i}`, brokers: i, listings: i * 2, city: "תל אביב" })), brokers: Array.from({ length: 50 }, (_, i) => ({ name: `מתווך ${i}`, agency: "X", listings: i, city: "תל אביב", verified: i % 2 === 0 })) }));
  add("many listings/offices/brokers capped", many.featured.length === 12 && many.offices.length === 8 && many.brokers.length === 8);

  // Public-safe over full insight set.
  add("insights NO forbidden keys", containsForbidden(neighborhoodInsights(data())) === null);

  // Performance.
  const t0 = Date.now();
  const big = data({ listings: Array.from({ length: 500 }, (_, i) => listing(i)), transactions: Array.from({ length: 500 }, (_, i) => tx(i)), neighborhoods: Array.from({ length: 200 }, (_, i) => ({ name: `אזור ${i}`, inventory: i, avgPrice: 3_000_000 + i * 1000, transactions: i % 30 })) });
  buildCityView(big); buildNeighborhoodView(big); neighborhoodInsights(big);
  add("large set < 250ms", Date.now() - t0 < 250, `${Date.now() - t0}ms`);

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
