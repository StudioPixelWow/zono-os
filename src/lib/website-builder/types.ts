// ============================================================================
// 🌐 ZONO Website Builder OS™ — types (client-safe). 38.0.
// The UNIFYING builder/CMS layer over the EXISTING website stack (agent-website,
// office-website, brokerage-site/agent-site renderers, SEO engine, analytics,
// branding, Ask widget). It re-implements NO renderer, NO SEO engine, NO schema —
// it defines the section CATALOG, TEMPLATES, an AI recommender, and the composed
// builder view. Persistence reuses the existing agent_websites/office_websites
// columns (enabled_sections + theme jsonb). Nothing auto-publishes.
// ============================================================================

export const WEBSITE_BUILDER_VERSION = "38.0";
export type Impact = "high" | "medium" | "low";
export type BuilderTarget = "agent" | "office";

/** One section definition in the catalog. */
export interface SectionDef {
  key: string;
  label: string;
  icon: string;
  category: "core" | "content" | "social" | "conversion";
  essential: boolean;      // recommended for every site
  description: string;
}

/** A section as arranged in a site (order + visibility + catalog meta). */
export interface BuilderSection {
  key: string; label: string; icon: string; category: SectionDef["category"];
  enabled: boolean; essential: boolean; order: number;
}

export interface SiteTemplate {
  key: string; name: string; description: string;
  sections: string[];        // ordered section keys
  disabled?: string[];       // keys present but toggled off by default
}

export interface WeakSeo { field: string; issue: string }
export interface WebsiteRecommendation {
  kind: "missing_section" | "weak_seo" | "missing_cta" | "missing_faq" | "low_content" | "poor_conversion";
  title: string; why: string; evidence: string[]; impact: Impact;
  cta: { action: string; sectionKey: string | null } | null;
}

export interface WebsiteHealth {
  score: number;           // 0..100
  band: "strong" | "fair" | "weak";
  seoReady: boolean;
  sectionsEnabled: number;
  issues: number;
}

export interface WebsiteAnalyticsLean {
  visitors: number; leads: number; propertyViews: number; conversionRate: number;
  whatsappClicks: number; calls: number;
}

/** Lean normalized site config (mapped from agent/office website config). */
export interface SiteConfigLean {
  target: BuilderTarget;
  slug: string | null; status: string;
  title: string | null; headline: string | null; description: string | null;
  imageUrl: string | null;
  sections: Record<string, boolean>;
  order: string[];
  featuredCount: number;
  viewCount: number;
}

export interface BuilderView {
  version: string;
  target: BuilderTarget;
  generatedAt: string;
  site: { slug: string | null; status: string; title: string | null; headline: string | null; published: boolean; viewCount: number };
  sections: BuilderSection[];
  templates: SiteTemplate[];
  recommendations: WebsiteRecommendation[];
  health: WebsiteHealth;
  seo: { title: string | null; description: string | null; ready: boolean; issues: WeakSeo[] };
  analytics: WebsiteAnalyticsLean;
  notes: string[];
}

/** Lean input for the pure assembler. */
export interface BuilderInput {
  config: SiteConfigLean;
  analytics: WebsiteAnalyticsLean;
  notes: string[];
}

// ── Broker + property integration read models ──────────────────────────────
export interface BrokerWebsiteSummary {
  hasSite: boolean; published: boolean; healthScore: number;
  seoAlerts: number; landingDrafts: number; approvalsPending: number;
  alerts: { title: string; detail: string }[];
}

export interface PropertyWebsitePresence {
  publishedPages: { label: string; href: string }[];
  landingPages: { label: string; href: string }[];
  seoStatus: "ok" | "partial" | "missing";
  views: number;
  campaignLinks: { label: string; href: string }[];
}
