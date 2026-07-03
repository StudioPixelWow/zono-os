// ============================================================================
// 👤 ZONO — AI Agent Website™ — barrel. 32.2.
// Personal broker website reusing the 32.1 framework, public-safe + evidence-only.
// No engine modified; no business logic duplicated; nothing auto-executes.
// ============================================================================
export { buildAgentHome, buildAgentAbout, buildAgentAreas } from "./assemble";
export { brokerIntro, areaExpertise, buyingTip, sellingTip, agentFaq } from "./content";
export { seoForAgentHome, seoForAgentAbout, seoForAgentProperty, seoForAgentArea, buildAgentSitemap, sitemapXml, agentRobotsTxt, type SeoMeta } from "./seo";
export { runSelfCheck } from "./qa";
export {
  resolveAgentSite, getAgentHomeAi, getAgentPropertyAi, getAgentAreaAi, getAgentAreas, getAgentAbout, getAgentProperties, askAgent, getAgentSitemap,
} from "./service";
export * from "./types";
