// ============================================================================
// ZONO — Agency Territory Dominance™ (Phase 26.4). Domain models + PURE helpers.
// CLIENT-SAFE: no server-only deps, no IO. The calculator/scoring/repository
// (server-only) reuse these so the math is unit-testable without a database.
// DATA SAFETY: averages / shares / velocities are `number | null` — missing data
// stays null and is NEVER fabricated as 0.
// ============================================================================
import { areaKey } from "../graph/agencyGraphTypes";

export type TerritoryType = "city" | "neighborhood" | "street";
export type TerritoryTrend = "growing" | "stable" | "declining" | "unknown";
export type TerritoryPeriodDays = 7 | 30 | 90 | 180 | 365;

export const TERRITORY_PERIODS: TerritoryPeriodDays[] = [7, 30, 90, 180, 365];
export const DEFAULT_TERRITORY_PERIOD: TerritoryPeriodDays = 90;

/** Persisted per-agency, per-territory dominance statistics (domain model). */
export interface AgencyTerritoryStats {
  id: string;
  organizationId: string;
  agencyId: string;
  territoryType: TerritoryType | string;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  territoryKey: string;
  periodStart: string | null;
  periodEnd: string | null;
  periodDays: number;
  activeListingsCount: number;
  historicalListingsCount: number;
  soldCount: number;
  dealsCount: number;
  exclusiveCount: number;
  priceDropCount: number | null;
  avgPrice: number | null;
  avgPricePerSqm: number | null;
  avgDaysOnMarket: number | null;
  listingVelocity: number | null;
  salesVelocity: number | null;
  inventoryShare: number | null;
  salesShare: number | null;
  luxuryShare: number | null;
  dominanceScore: number | null;
  momentumScore: number | null;
  trend: TerritoryTrend | string | null;
  confidence: number | null;
  metadata: Record<string, unknown>;
  calculatedAt: string;
}

/** One agency-owned listing/property within a territory (pure calc input). */
export interface TerritoryListingRow {
  price: number | null;
  sqm: number | null;
  status: "active" | "sold" | "historical";
  daysOnMarket: number | null;
  isExclusive: boolean;
  firstSeenAt: string | null; // when the listing entered the market
  saleDate: string | null;    // when sold (if sold)
  priceDropped: boolean | null; // null when no price-history data
}

/** Territory-wide denominators across ALL agencies (for share calculations). */
export interface TerritoryTotals {
  activeAll: number | null;
  soldAll: number | null;
  luxuryAll: number | null;
  medianPrice: number | null; // territory price median, drives the luxury threshold
}

/** Prior-period snapshot for momentum (same length window, immediately before). */
export interface TerritoryPreviousPeriod {
  newListings: number;
  sold: number;
  activeInventory: number;
}

/** Full pure input for one (agency, territory, period) calculation. */
export interface TerritoryCalcInput {
  agencyId: string;
  territoryType: TerritoryType;
  city: string | null;
  neighborhood: string | null;
  street: string | null;
  periodDays: TerritoryPeriodDays;
  periodStart: string;
  periodEnd: string;
  listings: TerritoryListingRow[];
  totals: TerritoryTotals;
  previous: TerritoryPreviousPeriod | null;
}

/** Computed (pre-persist) stats — mirrors AgencyTerritoryStats numeric fields. */
export interface ComputedTerritoryStats {
  activeListingsCount: number;
  historicalListingsCount: number;
  soldCount: number;
  exclusiveCount: number;
  priceDropCount: number | null;
  avgPrice: number | null;
  avgPricePerSqm: number | null;
  avgDaysOnMarket: number | null;
  listingVelocity: number | null;
  salesVelocity: number | null;
  inventoryShare: number | null;
  salesShare: number | null;
  luxuryShare: number | null;
  exclusiveShare: number | null;
  dominanceScore: number | null;
  momentumScore: number | null;
  trend: TerritoryTrend;
  confidence: number | null;
}

export interface TerritoryOpportunity {
  type: "territory_opportunity" | "competitor_dominance" | "user_weak_area" | "competitor_momentum" | "low_competition_area";
  severity: "info" | "warning" | "critical";
  title: string;
  description: string | null;
  territoryType: TerritoryType | string;
  territoryLabel: string;
  metadata: Record<string, unknown>;
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Stable normalized key for a territory path (idempotency + lookups). */
export function territoryKey(type: TerritoryType | string, city?: string | null, neighborhood?: string | null, street?: string | null): string {
  const parts = [type, areaKey(city), areaKey(neighborhood), areaKey(street)];
  return parts.join("::");
}

/** Human label for a territory (deepest available level). */
export function territoryLabel(city?: string | null, neighborhood?: string | null, street?: string | null): string {
  return [street, neighborhood, city].find((p) => p && p.trim()) ?? "—";
}

export function avgOrNull(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 100) / 100;
}

export function medianOrNull(xs: Array<number | null | undefined>): number | null {
  const v = xs.filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Share = part / whole, or null when the denominator is unknown/zero. */
export function shareOrNull(part: number, whole: number | null): number | null {
  if (whole == null || whole <= 0) return null;
  return Math.round(Math.min(1, part / whole) * 1000) / 1000;
}
