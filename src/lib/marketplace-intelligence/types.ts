// ============================================================================
// 🛒 ZONO — Marketplace Intelligence — types (pure, client-safe). PHASE 58.0.
// Understands the external marketplace landscape from ALREADY-IMPORTED listings
// and turns them into acquisition + buyer-match opportunities. It NEVER scrapes
// and NEVER bypasses a website restriction — it only reads listings that were
// imported through the existing compliant flow. INTERNAL ROUTING FIRST: every
// listing routes to an internal ZONO surface; the original external URL is only
// ever a SECONDARY link (never a primary click).
// ============================================================================

export const MARKETPLACE_INTEL_VERSION = "58.0";

/** Compliance posture for a source. */
export type SourceCompliance = "official_api" | "manual_assisted" | "planning_only" | "unknown";

export interface SourceInfo {
  key: string; label: string;
  compliance: SourceCompliance;
  allowed: boolean;          // may we surface/import listings from it at all?
  scrapeForbidden: boolean;  // documentation flag — ZONO never scrapes regardless
  note: string;
}

/** Normalized listing (the service maps external_listings rows → this). */
export interface MarketListing {
  id: string;
  source: string;
  city: string | null; neighborhood: string | null; address: string | null;
  propertyType: string | null;
  price: number | null; rooms: number | null; sqm: number | null;
  listingUrl: string | null;
  status: string;
  opportunityScore: number;
  duplicateGroupId: string | null;
  primaryPropertyId: string | null;   // internal property this listing maps to (if any)
  promotedPropertyId: string | null;  // internal property promoted FROM this listing (if any)
  listingSourceType: string;          // "by_owner" | "broker" | …
  firstSeenAt: string | null;
}

// ── Routing (internal-first) ──────────────────────────────────────────────────
export interface ListingRoute {
  primaryHref: string;                 // ALWAYS internal — never an external URL
  primaryLabel: string;
  isInternalMatch: boolean;            // maps to an existing internal property
  external: { url: string; source: string; label: string } | null;  // secondary only
}

// ── Duplicate detection ───────────────────────────────────────────────────────
export type DuplicateKind = "in_inventory" | "cross_source" | "unique";
export interface DuplicateInfo { kind: DuplicateKind; groupId: string | null; note: string }

// ── Price anomaly ─────────────────────────────────────────────────────────────
export type AnomalyKind = "underpriced" | "overpriced" | "normal" | "unknown";
export interface PriceAnomaly { kind: AnomalyKind; deltaPct: number | null; confidence: number; isOpportunity: boolean; note: string }

// ── Opportunities ─────────────────────────────────────────────────────────────
export type OpportunityKind = "acquisition" | "buyer_match" | "watch";
export interface MarketOpportunity {
  listingId: string; kind: OpportunityKind; title: string; reasons: string[];
  score: number; route: ListingRoute; duplicate: DuplicateInfo; anomaly: PriceAnomaly;
  buyerMatches: number; requiresApproval: true;   // broker alerts are approval-gated
}

// ── Market health by area ─────────────────────────────────────────────────────
export type HealthBand = "hot" | "balanced" | "soft" | "unknown";
export interface AreaHealth {
  area: string; listings: number; medianPrice: number | null; medianPerSqm: number | null;
  byOwnerCount: number; anomalyCount: number; supply: "low" | "balanced" | "high";
  band: HealthBand; note: string;
}

export interface MarketplaceReport {
  version: string; generatedAt: string | null;
  sources: SourceInfo[];
  opportunities: MarketOpportunity[];
  areaHealth: AreaHealth[];
  totals: { listings: number; acquisitions: number; buyerMatches: number; duplicates: number; anomalies: number };
  hasData: boolean;
  notes: string[];
}

export const COMPLIANCE_NOTE =
  "ZONO אינו מבצע גרידה (scraping) ואינו עוקף מגבלות אתר. הליסטינגים מיובאים דרך הזרימה הקיימת בלבד. כל ליסטינג מנותב תחילה לתוך ZONO — הקישור החיצוני המקורי הוא משני בלבד ולעולם אינו לחיצה ראשית. התראות לסוכן דורשות אישור.";
