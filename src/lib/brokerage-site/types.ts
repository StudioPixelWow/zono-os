// ============================================================================
// 🌐 ZONO — AI Brokerage Website™ (Office Website Platform) — types (pure). 32.1.
// ----------------------------------------------------------------------------
// A reusable framework that turns the EXISTING ZONO intelligence into a live,
// public, AI-powered brokerage website. It only CONSUMES existing services and
// exposes PUBLIC-SAFE view models — never internal notes, private missions,
// hidden workflows or raw internal scores. Evidence-only; nothing fabricated;
// nothing auto-executes. No engine modified; no business logic duplicated.
// ============================================================================
export const BROKERAGE_SITE_VERSION = "32.1";

// ── Branding / theme (from the office website config) ───────────────────────
export interface SiteBranding {
  officeName: string; logo: string | null; cover: string | null;
  accent: string; accent2: string;                 // hex; theme derives glass/gradients
  phone: string | null; whatsapp: string | null; email: string | null; address: string | null;
  /** Optional SiteTheme preset key (e.g. "dark-prestige"); themeVars validates it. */
  theme?: string;
}

// ── Public-safe intelligence badges (redacted presentations) ────────────────
export type TrustTier = "verified" | "reviewed" | "listed";        // NOT the raw truth score
export type DemandLevel = "high" | "medium" | "low";
export type MarketPosition = "below" | "within" | "above" | "unknown";

export interface PropertyBadges {
  trust: TrustTier; demand: DemandLevel; marketScore: number | null;   // 0..100 (safe to show)
  pricePosition: MarketPosition; priceGapPct: number | null;
  matchingBuyers: number;                                              // COUNT only (no identities)
  domBand: "fast" | "normal" | "slow" | null; competition: DemandLevel | null;
  strategyLabel: string | null;                                        // friendly public label
}

// ── Property AI landing (Part: PROPERTY PAGE) ───────────────────────────────
export interface PropertyAI {
  id: string; title: string; city: string | null; neighborhood: string | null;
  price: number | null; rooms: number | null; area: number | null; type: string; status: string;
  image: string | null; gallery: string[];
  aiSummary: string; highlights: string[];
  badges: PropertyBadges;
  related: { id: string; title: string; price: number | null; image: string | null }[];
}

// ── Neighborhood AI (Part: NEIGHBORHOOD PAGE) ───────────────────────────────
export interface NeighborhoodAI {
  name: string; city: string | null;
  overview: string;
  stats: { inventory: number; avgPrice: number | null; demand: DemandLevel; luxuryActivity: DemandLevel; growthScore: number | null; trend: "up" | "flat" | "down" };
  highlights: string[]; recommendedListings: { id: string; title: string; price: number | null; image: string | null }[];
  investmentScore: number | null;
}

// ── Office AI profile (Part: OFFICE PAGE) — public-safe ─────────────────────
export interface OfficeAI {
  name: string; story: string;
  coverage: { city: string; areas: string[] }[];
  stats: { properties: number; agents: number; cities: number; rating: number };
  trustBand: TrustTier;                              // derived, NOT the raw business score
  highlights: string[]; recentAreas: string[];
}

// ── Home dynamic content (Part: HOME PAGE) ──────────────────────────────────
export interface HomeAI {
  hero: { headline: string; subtitle: string };
  stats: { label: string; value: string }[];
  featured: { id: string; title: string; price: number | null; image: string | null; badge: string | null }[];
  marketSummary: string;
  featuredAreas: string[];
  insights: AiContentBlock[];
}

// ── AI content blocks (Part: AI CONTENT / BLOG) — evidence-only ─────────────
export type ContentKind = "market_update" | "neighborhood_spotlight" | "buying_tip" | "selling_tip" | "investment_insight" | "faq" | "featured_property";
export interface AiContentBlock { kind: ContentKind; title: string; body: string; evidence: string[]; cta: { label: string; href: string } | null }

// ── SEO (Part: SEO ENGINE) ──────────────────────────────────────────────────
export interface SeoMeta {
  title: string; description: string; canonical: string;
  openGraph: { title: string; description: string; image: string | null; type: string; url: string };
  twitter: { card: string; title: string; description: string; image: string | null };
  breadcrumbs: { name: string; href: string }[];
  jsonLd: Record<string, unknown>[];
}
export interface SitemapEntry { loc: string; changefreq: string; priority: number; lastmod?: string }

// ── Personalization (Part: CUSTOMER PORTAL / PERSONALIZATION) ───────────────
export interface PersonalizedBlock {
  welcomeBack: boolean; name: string | null;
  recentlyViewed: { id: string; title: string; image: string | null }[];
  recommendedListings: { id: string; title: string; price: number | null; image: string | null }[];
  recommendedAreas: string[];
  savedCount: number; openConversations: number; upcomingMeetings: number;
}

// ── Public Ask (Part: ASK ZONO) — redacted subset ──────────────────────────
export interface PublicAskAnswer { answer: string; followUps: string[]; confidence: number; scopedTo: string }

// ── Normalized inputs the pure assembler consumes (built by the server) ─────
export interface SiteListingInput {
  id: string; title: string; city: string | null; neighborhood: string | null; price: number | null;
  rooms: number | null; area: number | null; type: string; status: string; image: string | null; gallery: string[];
  healthLabel: string; classification: string[]; truthScore: number | null;
  valuationAvailable: boolean; rangePosition: MarketPosition; priceGapPct: number | null;
  marketScore: number | null; domBand: "fast" | "normal" | "slow" | "very_slow" | null;
  buyerDemandScore: number | null; matchingBuyers: number; competitionPressure: number | null;
  strategy: string; recommendationAction: string | null;
}
export interface SiteInput {
  branding: SiteBranding;
  officeStats: { properties: number; agents: number; cities: number; rating: number; businessHealth: number | null; dataQuality: number | null };
  listings: SiteListingInput[];
  coverage: { city: string; areas: string[] }[];
  recentAreas: string[];
  marketSummaryFacts: string[];
}
