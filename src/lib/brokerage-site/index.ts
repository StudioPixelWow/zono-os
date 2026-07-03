// ============================================================================
// 🌐 ZONO — AI Brokerage Website™ — barrel. 32.1.
// Reusable, evidence-only, public-safe website framework over the existing
// engines. No engine modified; no business logic duplicated; nothing auto-runs.
// ============================================================================
export { buildHome, buildProperty, buildNeighborhood, buildOffice } from "./assemble";
export { badgesFor, trustTier, demandLevel, publicStrategyLabel, containsForbidden } from "./redact";
export { seoForHome, seoForProperty, seoForNeighborhood, seoForOffice, buildSitemap, sitemapXml, robotsTxt } from "./seo";
export { marketUpdateBlock, neighborhoodSpotlightBlock, buyingTipBlock, sellingTipBlock, investmentInsightBlock, faqBlocks, featuredPropertyBlock } from "./content";
export { themeVars } from "./branding";
export { runSelfCheck } from "./qa";
export {
  resolveSiteOrg, getHomeAi, getPropertyAi, getNeighborhoodAi, getOfficeAi, askPublic, getSitemap,
} from "./service";
export * from "./types";
