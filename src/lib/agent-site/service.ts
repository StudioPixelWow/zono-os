// ============================================================================
// 👤 ZONO — AI Agent Website™ — service (server-only). 32.2.
// Resolves a broker's public site by slug via the existing agent_websites table,
// scopes listings to the broker (properties.owner_id), enriches with the Listing
// Agent scorecards + broker performance, and REUSES the 32.1 framework builders.
// Public-safe, evidence-only; nothing internal exposed; nothing auto-executes.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getListingScorecards } from "@/lib/listing-agent";
import { askZono } from "@/lib/ask-zono";
import { buildProperty, buildNeighborhood } from "@/lib/brokerage-site";
import { buildAgentHome, buildAgentAbout, buildAgentAreas } from "./assemble";
import { buildAgentSitemap } from "./seo";
import type { AgentBranding, AgentInput, SiteListingInput, AgentHome, AgentAbout, AgentAreas } from "./types";
import type { PropertyAI, NeighborhoodAI, MarketPosition } from "@/lib/brokerage-site/types";
import type { SitemapEntry } from "@/lib/brokerage-site/types";
import type { PublicAskAnswer } from "@/lib/brokerage-site/types";

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : "");
const sn = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const PUBLIC_STATUSES = ["active", "published", "under_offer"];

export interface AgentSite { orgId: string; brokerId: string; branding: AgentBranding; serviceAreas: string[] }

export async function resolveAgentSite(slug: string): Promise<AgentSite | "disabled" | null> {
  if (!slug) return null;
  const db = createServiceRoleClient();
  const { data } = await db.from("agent_websites").select("*").eq("slug", slug).maybeSingle();
  if (!data) return null;
  const r = data as Row;
  if (s(r.status) !== "published") return "disabled";
  const orgId = s(r.organization_id), brokerId = s(r.user_id);
  // Office name from organizations (reliable); logo from office website if present. Public-safe.
  const [orgR, offR] = await Promise.all([
    db.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    db.from("office_websites").select("logo_url").eq("organization_id", orgId).maybeSingle(),
  ]);
  const preset = (r.theme as { preset?: unknown } | null)?.preset;
  const branding: AgentBranding = {
    officeName: s((orgR.data as Row | null)?.name) || "המשרד", logo: sn((offR.data as Row | null)?.logo_url), cover: sn(r.cover_image_url),
    accent: "#7c3aed", accent2: "#a78bfa",
    phone: sn(r.phone), whatsapp: sn(r.whatsapp), email: sn(r.email), address: null,
    ...(typeof preset === "string" && preset ? { theme: preset } : {}),
    brokerName: s(r.display_name) || "מתווך/ת", title: sn(r.title_hebrew), photo: sn(r.profile_image_url),
    bio: sn(r.bio_hebrew), languages: strArr(r.languages), specialties: strArr(r.specialties),
    yearsExperience: num(r.years_experience), calendarLink: sn(r.calendar_link), social: (r.social_links as Record<string, string>) ?? {},
  };
  return { orgId, brokerId, branding, serviceAreas: strArr(r.service_areas) };
}

async function buildInput(site: AgentSite): Promise<AgentInput> {
  const db = createServiceRoleClient();
  const [propsR, perfR, localR, listingO] = await Promise.all([
    db.from("properties").select("id,title,price,city,neighborhood,rooms,size_sqm,type,status,primary_image_url").eq("org_id", site.orgId).eq("owner_id", site.brokerId).in("status", PUBLIC_STATUSES as never).order("created_at", { ascending: false }).limit(120),
    db.from("agent_intelligence_profiles").select("total_closed_deals,satisfaction_score").eq("organization_id", site.orgId).eq("user_id", site.brokerId).maybeSingle(),
    db.from("agent_locality_performance").select("locality").eq("organization_id", site.orgId).eq("user_id", site.brokerId).order("deals_count", { ascending: false }).limit(12),
    getListingScorecards(site.orgId).catch(() => null),
  ]);

  type Scorecard = NonNullable<typeof listingO>["scorecards"][number];
  const intel = new Map<string, Scorecard>();
  for (const c of listingO?.scorecards ?? []) intel.set(c.id, c);

  const listings: SiteListingInput[] = ((propsR.data ?? []) as Row[]).map((p) => {
    const id = s(p.id); const c = intel.get(id); const dom = c?.marketPerformance.domVsMarket.band ?? null;
    return {
      id, title: s(p.title) || "נכס", city: sn(p.city), neighborhood: sn(p.neighborhood), price: num(p.price), rooms: num(p.rooms), area: num(p.size_sqm),
      type: s(p.type) || "apartment", status: s(p.status), image: sn(p.primary_image_url), gallery: sn(p.primary_image_url) ? [s(p.primary_image_url)] : [],
      healthLabel: c?.health.label ?? "", classification: c?.classification ?? [], truthScore: c?.truthScore ?? null,
      valuationAvailable: c?.valuation.available ?? false, rangePosition: (c?.valuation.rangePosition as MarketPosition) ?? "unknown", priceGapPct: c?.valuation.priceGapPct ?? null,
      marketScore: c?.marketPerformance.score ?? null, domBand: (dom as SiteListingInput["domBand"]) ?? null,
      buyerDemandScore: c?.marketPerformance.buyerDemand.demandScore ?? null, matchingBuyers: c?.marketPerformance.buyerDemand.activeMatches ?? 0,
      competitionPressure: c?.health.competitionPressure ?? null, strategy: c?.strategy.recommendedStrategy ?? "hold", recommendationAction: null,
    };
  });

  const perf = { closedDeals: num((perfR.data as Row | null)?.total_closed_deals), satisfaction: num((perfR.data as Row | null)?.satisfaction_score) };
  const localAreas = ((localR.data ?? []) as Row[]).map((x) => s(x.locality)).filter(Boolean);
  const serviceAreas = [...new Set([...site.serviceAreas, ...localAreas, ...listings.map((l) => l.neighborhood ?? l.city).filter((x): x is string => !!x)])].slice(0, 12);
  // Data-verification proxy (public-safe): average of listing truth scores.
  const truths = listings.map((l) => l.truthScore).filter((t): t is number => t != null);
  const dataQuality = truths.length ? Math.round(truths.reduce((a, b) => a + b, 0) / truths.length) : null;

  return { branding: site.branding, listings, perf, serviceAreas, dataQuality, marketFacts: listings.length ? [`${listings.length} נכסים פעילים בייצוג`] : [] };
}

export async function getAgentHomeAi(slug: string): Promise<{ branding: AgentBranding; home: AgentHome } | "disabled" | null> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return site;
  const input = await buildInput(site); return { branding: site.branding, home: buildAgentHome(input) };
}
export async function getAgentAbout(slug: string): Promise<{ branding: AgentBranding; about: AgentAbout } | "disabled" | null> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return site;
  const input = await buildInput(site); return { branding: site.branding, about: buildAgentAbout(input) };
}
export async function getAgentAreas(slug: string): Promise<{ branding: AgentBranding; areas: AgentAreas } | "disabled" | null> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return site;
  const input = await buildInput(site); return { branding: site.branding, areas: buildAgentAreas(input) };
}
export async function getAgentProperties(slug: string): Promise<{ branding: AgentBranding; listings: SiteListingInput[] } | "disabled" | null> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return site;
  const input = await buildInput(site); return { branding: site.branding, listings: input.listings };
}
export async function getAgentPropertyAi(slug: string, propertyId: string): Promise<{ branding: AgentBranding; property: PropertyAI } | "disabled" | null> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return site;
  const input = await buildInput(site);
  const target = input.listings.find((l) => l.id === propertyId); if (!target) return null;
  return { branding: site.branding, property: buildProperty(target, input.listings) };
}
export async function getAgentAreaAi(slug: string, name: string): Promise<{ branding: AgentBranding; neighborhood: NeighborhoodAI } | "disabled" | null> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return site;
  const input = await buildInput(site);
  return { branding: site.branding, neighborhood: buildNeighborhood(name, input.listings, null) };
}

/** Public, broker-scoped Ask Agent — redacted subset only. */
export async function askAgent(slug: string, query: string): Promise<PublicAskAnswer | "disabled" | null> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return site;
  const q = (query ?? "").trim(); if (!q) return { answer: "אנא כתבו שאלה.", followUps: [], confidence: 0, scopedTo: site.branding.brokerName };
  const scoped = `בהקשר של המתווך/ת ${site.branding.brokerName} מ${site.branding.officeName} והנכסים שהם מייצגים: ${q}`;
  const r = await askZono(site.orgId, scoped).catch(() => null);
  if (!r) return { answer: "לא הצלחתי לענות כרגע — נסו שוב או צרו קשר.", followUps: [], confidence: 0, scopedTo: site.branding.brokerName };
  return { answer: r.answer.executiveAnswer, followUps: r.answer.followUps.slice(0, 4), confidence: r.answer.confidence, scopedTo: site.branding.brokerName };
}

export async function getAgentSitemap(slug: string, origin: string): Promise<SitemapEntry[]> {
  const site = await resolveAgentSite(slug); if (site === "disabled" || site === null) return [];
  const input = await buildInput(site);
  const areas = [...new Set(input.listings.map((l) => l.neighborhood ?? l.city).filter((x): x is string => !!x))];
  return buildAgentSitemap(origin, slug, input.listings.slice(0, 200).map((l) => l.id), areas);
}
