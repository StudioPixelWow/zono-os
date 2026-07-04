// ============================================================================
// 🎯 ZONO AI Landing Experience™ — types (client-safe). 38.3.
// A reusable landing FRAMEWORK, not a new page type. Every campaign landing
// follows ONE premium hierarchy and renders through the shared site-ui
// (SiteNav/SiteHero/SiteSection/SiteFooter/PropertyCard/AskWidget). No new
// renderer, no schema — landings compose the EXISTING evidence-only data.
// ============================================================================

export const LANDING_VERSION = "38.3";
export type Impact = "high" | "medium" | "low";

export type LandingType =
  | "property" | "project" | "neighborhood" | "area"
  | "luxury" | "investment" | "open_house" | "price_reduction" | "new_listing"
  | "seller_recruitment" | "buyer_recruitment" | "valuation" | "market_report"
  | "broker_campaign" | "office_campaign";

/** Which existing renderer/data family backs a landing type. */
export type LandingFamily = "property" | "area" | "office";
export type CtaKind = "whatsapp" | "phone" | "meeting" | "match" | "valuation" | "visit";
export type SectionKey = "hero" | "trust" | "content" | "showcase" | "faq" | "ask";

export interface LandingConfig {
  key: LandingType;
  label: string;
  family: LandingFamily;
  eyebrow: string;            // hero eyebrow (campaign framing)
  ctaKinds: CtaKind[];        // ordered CTA intents for this campaign
  sections: SectionKey[];     // ordered sections
  ask: string[];              // context-aware Ask ZONO questions
  seoSuffix: string;          // appended to SEO title for the campaign
}

// ── Lean context the pure assembler consumes (mapped by the service) ─────────
export interface LandingBadge { label: string; tone: "brand" | "success" | "warning" | "neutral" }
export interface LandingShowcaseItem { id: string; title: string; price: number | null; image: string | null; badge: string | null }
export interface LandingFaq { q: string; a: string }
export interface LandingContact { phone: string | null; whatsapp: string | null; email: string | null; meeting: string | null }

export interface LandingCtx {
  slug: string;
  base: "ai-site" | "ai-agent";
  officeName: string;
  logo: string | null;
  cover: string | null;
  title: string;
  subtitle: string;
  aiSummary: string | null;
  badges: LandingBadge[];
  stats: { label: string; value: string }[];
  highlights: string[];
  showcase: LandingShowcaseItem[];
  contact: LandingContact;
  entityHref: string | null;   // canonical page for the landing subject
  faq: LandingFaq[];
  seoReady: boolean;
}

// ── Assembled landing view ──────────────────────────────────────────────────
export interface LandingCta { label: string; href: string; kind: CtaKind; variant: "primary" | "secondary" }

export interface LandingView {
  version: string;
  type: LandingType;
  label: string;
  hero: { eyebrow: string; headline: string; subtitle: string; badges: LandingBadge[]; aiSummary: string | null; cover: string | null; logo: string | null; stats: { label: string; value: string }[]; ctas: LandingCta[] };
  trust: { stats: { label: string; value: string }[]; badges: LandingBadge[] };
  content: { highlights: string[] };
  showcase: LandingShowcaseItem[];
  faq: LandingFaq[];
  ask: string[];
  stickyCta: LandingCta | null;
  sections: SectionKey[];
  notes: string[];
}

export interface LandingRecommendation {
  kind: "missing_cta" | "weak_trust" | "weak_seo" | "missing_faq" | "low_content" | "poor_conversion" | "missing_stats";
  title: string; why: string; evidence: string[]; impact: Impact;
}
