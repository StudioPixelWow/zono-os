// ============================================================================
// 🌍 ZONO — AI Area & Neighborhood Portal™ (Location Intelligence) — types. 32.5.
// ----------------------------------------------------------------------------
// PUBLIC, SEO-first AI pages for every City / Neighborhood / Street, powered by
// PUBLIC-SAFE market intelligence only: public transactions, public listings and
// the public brokerage knowledge base. NEVER exposes CRM, private buyers/sellers,
// private listings, internal scores, missions or workflows. Evidence-only —
// nothing fabricated; honest empties when data is missing.
// ============================================================================
import type { PropertyAI } from "@/lib/brokerage-site/types";

export const AREA_PORTAL_VERSION = "32.5";

export type AreaLevel = "city" | "neighborhood" | "street";

/** Public-safe market snapshot for an area (all values traceable to real data). */
export interface AreaMarket {
  avgPrice: number | null;          // ₪ average asking (public listings)
  medianPrice: number | null;
  pricePerSqm: number | null;       // ₪/m² (transactions)
  avgSoldPrice: number | null;      // ₪ avg closed deal
  avgSize: number | null;           // m²
  inventory: number;                // active public listings
  transactions: number;             // closed deals in window
  newListings: number;
  priceReductions: number;
  luxuryPct: number;                // % listings above luxury threshold
  rentalPct: number;                // % listings that are rentals
  commercialPct: number;
  priceTrendPct: number | null;     // signed % over the window (transactions)
  momentum: "up" | "down" | "stable";
  supplyLevel: "low" | "medium" | "high";
  demandLevel: "low" | "medium" | "high";  // derived proxy from velocity — flagged
  derived: boolean;
}

export interface AreaListingCard {
  id: string; title: string; price: number | null; image: string | null;
  rooms: number | null; area: number | null; type: string | null;
  neighborhood: string | null; street: string | null;
  tags: string[];                   // "יוקרה" / "חדש" / "הזדמנות מחיר" ...
}

export interface AreaTransaction {
  date: string | null; price: number | null; pricePerSqm: number | null;
  rooms: number | null; area: number | null; street: string | null; type: string | null;
}

export interface AreaOffice { name: string; brokers: number; listings: number; city: string | null }
export interface AreaBroker { name: string; agency: string | null; listings: number; city: string | null; verified: boolean }

export interface AreaInsight { kind: "summary" | "buy" | "sell" | "invest" | "warning" | "luxury" | "demand" | "outlook"; title: string; body: string; evidence: string[] }

export interface NeighborhoodRef { name: string; inventory: number; avgPrice: number | null; transactions: number }

// ── The normalized public input the pure assembler consumes ──────────────────
export interface AreaData {
  level: AreaLevel;
  city: string;
  neighborhood: string | null;
  street: string | null;
  market: AreaMarket;
  listings: AreaListingCard[];
  transactions: AreaTransaction[];
  offices: AreaOffice[];
  brokers: AreaBroker[];
  neighborhoods: NeighborhoodRef[];  // for city pages
  population: number | null;         // only if a public source provides it; else null
}

// ── View models ──────────────────────────────────────────────────────────────
export interface CityView {
  city: string; overview: string; market: AreaMarket;
  topNeighborhoods: NeighborhoodRef[]; opportunities: AreaInsight[];
  featured: AreaListingCard[]; offices: AreaOffice[]; brokers: AreaBroker[];
  recommendation: string; insights: AreaInsight[]; population: number | null;
}
export interface NeighborhoodView {
  city: string; neighborhood: string; summary: string; market: AreaMarket;
  featured: AreaListingCard[]; transactions: AreaTransaction[];
  offices: AreaOffice[]; brokers: AreaBroker[]; insights: AreaInsight[];
  topTypes: { type: string; count: number }[];
}
export interface StreetView {
  city: string; neighborhood: string | null; street: string; summary: string;
  market: AreaMarket; transactions: AreaTransaction[]; featured: AreaListingCard[]; brokers: AreaBroker[];
}

export type { PropertyAI };
