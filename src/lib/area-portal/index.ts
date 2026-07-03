// ============================================================================
// 🌍 ZONO — AI Area & Neighborhood Portal™ — barrel. 32.5.
// Public, SEO-first location intelligence pages, reusing existing engines + the
// AI Brokerage Website framework. Public-safe + evidence-only; no engine modified.
// ============================================================================
export { buildCityView, buildNeighborhoodView, buildStreetView, neighborhoodInsights } from "./assemble";
export { areaSummary, buildInsights, cityOpportunities, cityRecommendation } from "./content";
export { seoForCity, seoForNeighborhood, seoForStreet, buildAreaSitemap, areaRobotsTxt, sitemapXml, cityUrl, nbUrl, streetUrl, type SeoMeta } from "./seo";
export { runSelfCheck } from "./qa";
export {
  getCity, getNeighborhood, getStreet, getAreaSitemap, listAreaCities, askArea, submitAreaLead,
} from "./service";
export * from "./types";
