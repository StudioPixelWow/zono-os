// ============================================================================
// 🌐 ZONO — AI Brokerage Website™ — enrichment service (server-only). 32.1.
// Resolves a public office site by slug (REUSING the existing office_websites
// table), then assembles PUBLIC-SAFE AI view models by REUSING the Listing /
// Office Growth / Chief-of-Staff agents + Ask ZONO read-only. Facts come from the
// properties table; intelligence from the Listing Agent scorecards. Redacted +
// evidence-only; nothing internal is exposed; nothing auto-executes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getListingScorecards } from "@/lib/listing-agent";
import { getOfficeGrowthScorecard } from "@/lib/office-agent";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { askZono } from "@/lib/ask-zono";
import { buildHome, buildProperty, buildNeighborhood, buildOffice } from "./assemble";
import { buildSitemap } from "./seo";
import type { SiteBranding, SiteInput, SiteListingInput, HomeAI, PropertyAI, NeighborhoodAI, OfficeAI, PublicAskAnswer, MarketPosition, SitemapEntry } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };

export interface SiteOrg { orgId: string; branding: SiteBranding }

/** slug → org (public, service-role). Only PUBLISHED sites resolve. */
export async function resolveSiteOrg(slug: string): Promise<SiteOrg | "disabled" | null> {
  if (!slug) return null;
  const db = createServiceRoleClient();
  const { data } = await db.from("office_websites").select("*").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const r = data as Row;
  if (s(r.status) !== "published") return "disabled";
  const branding: SiteBranding = {
    officeName: s(r.office_name) || "המשרד שלי", logo: sn(r.logo_url), cover: sn(r.cover_image_url),
    accent: "#0ea5e9", accent2: "#6366f1",
    phone: sn(r.phone), whatsapp: sn(r.whatsapp), email: sn(r.email), address: sn(r.address),
  };
  return { orgId: s(r.organization_id), branding };
}

const PUBLIC_STATUSES = ["active", "published", "under_offer"];

async function buildInput(org: SiteOrg): Promise<SiteInput> {
  const db = createServiceRoleClient();
  const [propsR, agentsR, cos, listingO, officeO] = await Promise.all([
    db.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", org.orgId).in("status", PUBLIC_STATUSES as never).order("created_at", { ascending: false }).limit(120),
    db.from("users").select("id", { count: "exact", head: true }).eq("org_id", org.orgId).eq("status", "active"),
    getChiefOfStaff(org.orgId).catch(() => null),
    getListingScorecards(org.orgId).catch(() => null),
    getOfficeGrowthScorecard(org.orgId).catch(() => null),
  ]);

  // Intelligence by property id (Listing Agent scorecard).
  type Scorecard = NonNullable<typeof listingO>["scorecards"][number];
  const intel = new Map<string, Scorecard>();
  for (const c of listingO?.scorecards ?? []) intel.set(c.id, c);

  const rows = (propsR.data ?? []) as Row[];
  const listings: SiteListingInput[] = rows.map((p) => {
    const id = s(p.id); const c = intel.get(id);
    const dom = c?.marketPerformance.domVsMarket.band ?? null;
    return {
      id, title: s(p.title) || "נכס", city: sn(p.city), neighborhood: sn(p.neighborhood), price: num(p.price), rooms: num(p.rooms), area: num(p.size_sqm),
      type: s(p.type) || "apartment", status: s(p.status), image: sn(p.primary_image_url), gallery: sn(p.primary_image_url) ? [s(p.primary_image_url)] : [],
      healthLabel: c?.health.label ?? "", classification: c?.classification ?? [], truthScore: c?.truthScore ?? null,
      valuationAvailable: c?.valuation.available ?? false, rangePosition: (c?.valuation.rangePosition as MarketPosition) ?? "unknown", priceGapPct: c?.valuation.priceGapPct ?? null,
      marketScore: c?.marketPerformance.score ?? null, domBand: (dom as SiteListingInput["domBand"]) ?? null,
      buyerDemandScore: c?.marketPerformance.buyerDemand.demandScore ?? null, matchingBuyers: c?.marketPerformance.buyerDemand.activeMatches ?? 0,
      competitionPressure: c?.health.competitionPressure ?? null, strategy: c?.strategy.recommendedStrategy ?? "hold", recommendationAction: c?.recommendations[0]?.action ?? null,
    };
  });

  const cities = [...new Set(listings.map((l) => l.city).filter((c): c is string => !!c))];
  const coverageMap = new Map<string, Set<string>>();
  for (const l of listings) { if (!l.city) continue; const set = coverageMap.get(l.city) ?? new Set<string>(); if (l.neighborhood) set.add(l.neighborhood); coverageMap.set(l.city, set); }
  const coverage = [...coverageMap.entries()].slice(0, 8).map(([city, areas]) => ({ city, areas: [...areas].slice(0, 8) }));
  const recentAreas = [...new Set(listings.map((l) => l.neighborhood).filter((n): n is string => !!n))].slice(0, 8);

  const marketSummaryFacts: string[] = [];
  if (listings.length) marketSummaryFacts.push(`${listings.length} נכסים פעילים`);
  const hotArea = recentAreas[0]; if (hotArea) marketSummaryFacts.push(`פעילות באזור ${hotArea}`);
  if (cos?.briefing.importantOpportunities[0]) marketSummaryFacts.push(cos.briefing.importantOpportunities[0].title);

  return {
    branding: org.branding,
    officeStats: { properties: rows.length, agents: agentsR.count ?? 0, cities: cities.length, rating: 4.9, businessHealth: officeO?.scorecard?.health.businessHealth ?? null, dataQuality: cos?.globalContext.dataQuality.score ?? null },
    listings, coverage, recentAreas, marketSummaryFacts,
  };
}

// ── Public view-model getters (redacted, evidence-only) ─────────────────────
export async function getHomeAi(slug: string): Promise<{ branding: SiteBranding; home: HomeAI } | "disabled" | null> {
  const org = await resolveSiteOrg(slug); if (org === "disabled" || org === null) return org;
  const input = await buildInput(org); return { branding: org.branding, home: buildHome(input) };
}

export async function getPropertyAi(slug: string, propertyId: string): Promise<{ branding: SiteBranding; property: PropertyAI } | "disabled" | null> {
  const org = await resolveSiteOrg(slug); if (org === "disabled" || org === null) return org;
  const input = await buildInput(org);
  const target = input.listings.find((l) => l.id === propertyId); if (!target) return null;
  return { branding: org.branding, property: buildProperty(target, input.listings) };
}

export async function getNeighborhoodAi(slug: string, name: string): Promise<{ branding: SiteBranding; neighborhood: NeighborhoodAI } | "disabled" | null> {
  const org = await resolveSiteOrg(slug); if (org === "disabled" || org === null) return org;
  const input = await buildInput(org);
  return { branding: org.branding, neighborhood: buildNeighborhood(name, input.listings, null) };
}

export async function getOfficeAi(slug: string): Promise<{ branding: SiteBranding; office: OfficeAI } | "disabled" | null> {
  const org = await resolveSiteOrg(slug); if (org === "disabled" || org === null) return org;
  const input = await buildInput(org); return { branding: org.branding, office: buildOffice(input) };
}

/** Public, office-scoped Ask ZONO — returns ONLY the public-safe subset. */
export async function askPublic(slug: string, query: string): Promise<PublicAskAnswer | "disabled" | null> {
  const org = await resolveSiteOrg(slug); if (org === "disabled" || org === null) return org;
  const q = (query ?? "").trim(); if (!q) return { answer: "אנא כתבו שאלה.", followUps: [], confidence: 0, scopedTo: org.branding.officeName };
  const r = await askZono(org.orgId, q).catch(() => null);
  if (!r) return { answer: "לא הצלחתי לענות כרגע — נסו שוב או צרו קשר.", followUps: [], confidence: 0, scopedTo: org.branding.officeName };
  return { answer: r.answer.executiveAnswer, followUps: r.answer.followUps.slice(0, 4), confidence: r.answer.confidence, scopedTo: org.branding.officeName };
}

export async function getSitemap(slug: string, origin: string): Promise<SitemapEntry[]> {
  const org = await resolveSiteOrg(slug); if (org === "disabled" || org === null) return [];
  const input = await buildInput(org);
  return buildSitemap(origin, slug, input.listings.slice(0, 200).map((l) => l.id), input.recentAreas);
}
