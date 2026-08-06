// ============================================================================
// ZONO — deterministic Alpha/Beta test fixtures (test runtime only).
// Data only — no secrets. Consumed by the test runtime + browser E2E to seed a
// reproducible two-organization world. Never import into production paths.
// ============================================================================
import type { ResolvedBrand } from "../creative-studio/brand-asset-resolver";

export interface TestUser { id: string; orgId: string; role: "owner" | "manager" | "agent"; active: boolean }
export interface TestProperty { id: string; orgId: string; title: string; city: string; price: number; images: string[]; valid: boolean }
export interface TestMarketStat { source: string; sourceReference: string; geography: string; period: string; freshnessTimestamp: string; metricName: string; value: string; comparisonBasis: string; classification: "factual" | "inferred"; subtype: "price_change" }

function brand(org: string, name: string, color: string): ResolvedBrand {
  return {
    logo: `${org}/logo.png`, logoTransparent: `${org}/logo-t.png`, logoLight: `${org}/logo-l.png`, logoDark: `${org}/logo-d.png`,
    profileImage: `${org}/agent.jpg`, primaryColor: color, secondaryColor: "#1b1b20", accentColor: "#C9A24B",
    phone: "050-1234567", whatsapp: "050-1234567", email: `${org}@zono.test`, officeName: `${name} נדל\"ן`, agentName: name,
    website: null, footerText: "© ZONO", sources: { profileImage: "agent.profile_image", logo: "agent.logo" }, warnings: [],
  };
}

export const ALPHA = {
  orgId: "org-alpha",
  users: [
    { id: "alpha-owner", orgId: "org-alpha", role: "owner", active: true },
    { id: "alpha-manager", orgId: "org-alpha", role: "manager", active: true },
    { id: "alpha-agent", orgId: "org-alpha", role: "agent", active: true },
    { id: "alpha-inactive", orgId: "org-alpha", role: "agent", active: false },
  ] as TestUser[],
  brand: brand("org-alpha", "דנה כהן", "#101014"),
  properties: [
    { id: "alpha-prop-1", orgId: "org-alpha", title: "דירת 4 חדרים", city: "תל אביב", price: 2450000, images: ["a/1.jpg", "a/2.jpg"], valid: true },
    { id: "alpha-prop-2", orgId: "org-alpha", title: "פנטהאוז", city: "הרצליה", price: 6900000, images: ["a/3.jpg"], valid: true },
    { id: "alpha-prop-invalid", orgId: "org-alpha", title: "", city: "", price: 0, images: [], valid: false },
  ] as TestProperty[],
  marketStatValid: { source: "רשות המסים", sourceReference: "gov.il/tax/2026-07", geography: "תל אביב", period: "2026-07", freshnessTimestamp: "2026-07-28T00:00:00Z", metricName: "שינוי מחיר", value: "3.2%", comparisonBasis: "לעומת החודש הקודם", classification: "factual", subtype: "price_change" } as TestMarketStat,
  marketStatStale: { source: "רשות המסים", sourceReference: "gov.il/tax/2025-12", geography: "תל אביב", period: "2025-12", freshnessTimestamp: "2025-12-01T00:00:00Z", metricName: "שינוי מחיר", value: "1.0%", comparisonBasis: "שנתי", classification: "factual", subtype: "price_change" } as TestMarketStat,
  contentItemId: "alpha-content-1",
  campaignId: "alpha-campaign-1",
};

export const BETA = {
  orgId: "org-beta",
  users: [{ id: "beta-owner", orgId: "org-beta", role: "owner", active: true }] as TestUser[],
  brand: brand("org-beta", "יוסי לוי", "#0A1F2C"),
  properties: [{ id: "beta-prop-1", orgId: "org-beta", title: "דירת 3 חדרים", city: "חיפה", price: 1650000, images: ["b/1.jpg"], valid: true }] as TestProperty[],
  contentItemId: "beta-content-1",
};

export const ANONYMOUS = { orgId: null, userId: null, active: false } as const;

/** Look up a test session by a stable header/role token (test runtime only). */
export function resolveTestSession(token: string): { orgId: string | null; userId: string | null; role: string | null; active: boolean } {
  const map: Record<string, { orgId: string | null; userId: string | null; role: string | null; active: boolean }> = {
    "alpha-owner": { orgId: ALPHA.orgId, userId: "alpha-owner", role: "owner", active: true },
    "alpha-agent": { orgId: ALPHA.orgId, userId: "alpha-agent", role: "agent", active: true },
    "alpha-inactive": { orgId: ALPHA.orgId, userId: "alpha-inactive", role: "agent", active: false },
    "beta-owner": { orgId: BETA.orgId, userId: "beta-owner", role: "owner", active: true },
    anonymous: { orgId: null, userId: null, role: null, active: false },
  };
  return map[token] ?? map.anonymous;
}
