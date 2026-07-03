// ============================================================================
// 👤 ZONO — AI Agent Website™ (Personal Broker Website) — types (pure). 32.2.
// ----------------------------------------------------------------------------
// A PERSONAL public AI website for every broker. REUSES the AI Brokerage Website
// framework (32.1) for property/area rendering + SEO + redaction, and scopes
// everything to ONE broker. Public-safe: never exposes private notes, missions,
// workflows, private CRM fields, unpublished listings or internal scores.
// Evidence-only; no fabrication (no fake awards/sales/testimonials).
// ============================================================================
import type { SiteBranding, SiteListingInput, PropertyAI, NeighborhoodAI, TrustTier } from "@/lib/brokerage-site/types";

export const AGENT_SITE_VERSION = "32.2";

// Person branding (extends office branding with broker identity).
export interface AgentBranding extends SiteBranding {
  brokerName: string; title: string | null; photo: string | null;
  bio: string | null; languages: string[]; specialties: string[];
  yearsExperience: number | null; calendarLink: string | null; social: Record<string, string>;
}

export interface AgentStat { label: string; value: string }

// ── Home ────────────────────────────────────────────────────────────────────
export interface AgentHome {
  hero: { name: string; title: string | null; office: string; specialty: string | null; focus: string[]; tagline: string };
  stats: AgentStat[];
  intro: string;
  featured: { id: string; title: string; price: number | null; image: string | null; badge: string | null }[];
  topAreas: string[];
  insights: { title: string; body: string; evidence: string[] }[];
}

// ── About ───────────────────────────────────────────────────────────────────
export interface AgentAbout {
  name: string; title: string | null; photo: string | null; office: string;
  bio: string; languages: string[]; specialties: string[];
  areasServed: string[]; experienceYears: number | null;
  trustBand: TrustTier;                    // redacted (NOT raw scores)
  contact: { phone: string | null; whatsapp: string | null; email: string | null; calendarLink: string | null };
  faq: { q: string; a: string; evidence: string[] }[];
}

// ── Areas ───────────────────────────────────────────────────────────────────
export interface AgentAreaSummary { name: string; city: string | null; inventory: number; avgPrice: number | null; expertise: TrustTier }
export interface AgentAreas { areas: AgentAreaSummary[] }

// Re-export framework view models used directly by agent pages.
export type { PropertyAI, NeighborhoodAI, SiteBranding, SiteListingInput } from "@/lib/brokerage-site/types";

// ── Normalized input the pure assembler consumes (built by the server) ──────
export interface AgentInput {
  branding: AgentBranding;
  listings: SiteListingInput[];
  perf: { closedDeals: number | null; satisfaction: number | null };
  serviceAreas: string[];
  dataQuality: number | null;              // → redacted trust band
  marketFacts: string[];
}
