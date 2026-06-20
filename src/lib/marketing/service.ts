/**
 * Marketing Intelligence service — server-only. The Marketing Brain. Aggregates
 * existing buyers / buyer intelligence / properties / market / graph plus the
 * (manually curated) communities into community scores, buyer segments,
 * per-property marketing DNA, community matches and marketing opportunities.
 * Deterministic. No publishing. No LLM. Org-scoped.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import {
  buildMarketingDNA, classifyBuyerSegment, communityLevel, COMMUNITY_LEVEL_LABEL, computeCommunityScores,
  marketingHealthScore, rankCommunitiesForProperty, SEGMENT_LABEL,
  type CommunityForMatch, type SegmentKey,
} from "./engine";

type DB = Database["public"]["Tables"];
const ACTIVE_PROP = new Set(["active", "published", "ready", "under_offer", "in_contract"]);
const COMMERCIAL_TYPES = new Set(["commercial", "office", "land"]);
const SEGMENT_AUDIENCE: Record<SegmentKey, string> = {
  investors: "investors", luxury: "luxury", young_families: "families", first_home: "young", downsizers: "buyers", commercial: "commercial",
};
const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

async function requireOrg(): Promise<string> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile.org_id;
}

export interface MarketingRecomputeSummary { communities: number; segments: number; properties: number; opportunities: number; health: number }

export async function recomputeMarketingIntelligence(): Promise<MarketingRecomputeSummary> {
  const orgId = await requireOrg();
  const supabase = await createClient();

  const [commRes, buyersRes, propsRes, marketRes] = await Promise.all([
    supabase.from("community_profiles").select("*").limit(2000),
    supabase.from("buyers").select("id,budget_max,rooms_min,rooms_max,preferred_areas").limit(5000),
    supabase.from("properties").select("id,type,price,rooms,size_sqm,city,zono_score,status").limit(3000),
    supabase.from("market_area_snapshots").select("locality_name,demand_score,date").order("date", { ascending: false }).limit(500),
  ]);

  const communities = commRes.data ?? [];
  const buyers = buyersRes.data ?? [];
  const properties = (propsRes.data ?? []).filter((p) => ACTIVE_PROP.has(p.status as string));

  // Market demand by city (latest snapshot per locality).
  const demandByCity = new Map<string, number>();
  for (const m of marketRes.data ?? []) { const k = cityNorm(m.locality_name); if (!demandByCity.has(k)) demandByCity.set(k, m.demand_score); }

  // ── Buyer segments ─────────────────────────────────────────────────────────
  const segCount = new Map<SegmentKey, number>();
  for (const b of buyers) {
    const seg = classifyBuyerSegment({ budgetMax: b.budget_max, roomsMin: b.rooms_min, roomsMax: b.rooms_max, intent: null, propertyTypes: [] });
    segCount.set(seg, (segCount.get(seg) ?? 0) + 1);
  }
  const totalBuyers = buyers.length || 1;
  const segmentRows: DB["buyer_segments"]["Insert"][] = (Object.keys(SEGMENT_LABEL) as SegmentKey[]).map((key) => {
    const size = segCount.get(key) ?? 0;
    const share = Math.round((size / totalBuyers) * 100);
    return {
      organization_id: orgId, segment_key: key, label: SEGMENT_LABEL[key], segment_size: size,
      segment_quality: Math.min(100, 40 + size * 4), segment_activity: Math.min(100, share + 20),
      segment_conversion: Math.min(100, 20 + Math.round(share * 0.6)),
    };
  });
  await supabase.from("buyer_segments").delete().eq("organization_id", orgId);
  await supabase.from("buyer_segments").insert(segmentRows as never);

  // Audience demand (0..100) per audience_type, from segment shares.
  const audienceDemand = new Map<string, number>();
  for (const [key, count] of segCount) { const aud = SEGMENT_AUDIENCE[key]; audienceDemand.set(aud, (audienceDemand.get(aud) ?? 0) + Math.round((count / totalBuyers) * 100)); }
  const audDemand = (t: string) => Math.min(100, audienceDemand.get(t) ?? (t === "buyers" ? 50 : 20));

  // ── Community intelligence ──────────────────────────────────────────────────
  const intelRows: DB["community_intelligence_profiles"]["Insert"][] = [];
  const matchPool: CommunityForMatch[] = [];
  for (const c of communities) {
    const scores = computeCommunityScores({
      membersCount: c.members_count, engagementScore: c.engagement_score, leadScore: c.lead_score, dealScore: c.deal_score,
      roiScore: c.roi_score, trustScore: c.trust_score, status: c.status, audienceType: c.audience_type,
      audienceDemand: audDemand(c.audience_type), growthProxy: Math.min(100, 40 + Math.round(Math.log10(Math.max(1, c.members_count)) * 15)),
    });
    const level = communityLevel(scores, c.status);
    intelRows.push({
      organization_id: orgId, community_id: c.id, ...scores, level,
      ai_summary: `${c.name}: קהילה ${COMMUNITY_LEVEL_LABEL[level]} · בריאות ${scores.community_health_score} · איכות לידים ${scores.lead_quality_score} · ROI ${scores.roi_score}.`,
      last_calculated_at: new Date().toISOString(),
    });
    matchPool.push({ id: c.id, name: c.name, audienceType: c.audience_type, city: c.city, locality: c.locality, engagementScore: scores.activity_score, leadScore: scores.lead_quality_score, dealScore: scores.deal_generation_score, level });
  }
  await supabase.from("community_intelligence_profiles").delete().eq("organization_id", orgId);
  for (let i = 0; i < intelRows.length; i += 500) { const c = intelRows.slice(i, i + 500); if (c.length) await supabase.from("community_intelligence_profiles").insert(c as never); }

  // ── Property marketing DNA ──────────────────────────────────────────────────
  const dnaRows: DB["property_marketing_profiles"]["Insert"][] = [];
  for (const p of properties) {
    const marketDemand = demandByCity.get(cityNorm(p.city)) ?? 50;
    const dna = buildMarketingDNA({ type: p.type as string, price: p.price, rooms: p.rooms, sqm: p.size_sqm, city: p.city, zonoScore: p.zono_score }, marketDemand, audDemand(primaryAudience(p.type as string, p.price)));
    const matches = rankCommunitiesForProperty(dna.targetAudience, p.city, matchPool);
    dnaRows.push({
      organization_id: orgId, property_id: p.id,
      target_audience: dna.targetAudience as never, buyer_personas: dna.buyerPersonas as never,
      motivators: dna.motivators as never, objections: dna.objections as never, pain_points: dna.painPoints as never,
      angles: dna.angles as never, recommended_channels: dna.recommendedChannels as never,
      recommended_communities: matches.slice(0, 20) as never, recommended_content_types: dna.recommendedContentTypes as never,
      recommended_publishing_times: dna.recommendedPublishingTimes as never, recommended_budget_level: dna.recommendedBudgetLevel,
      expected_lead_volume: dna.expectedLeadVolume, expected_conversion: dna.expectedConversion, marketing_score: dna.marketingScore,
      ai_summary: `קהל יעד: ${dna.buyerPersonas.join(", ")} · תקציב ${dna.recommendedBudgetLevel} · ${matches.length ? `קהילה מובילה: ${matches[0].name}` : "אין קהילות מתאימות"} · ציון שיווק ${dna.marketingScore}.`,
      last_calculated_at: new Date().toISOString(),
    });
  }
  await supabase.from("property_marketing_profiles").delete().eq("organization_id", orgId);
  for (let i = 0; i < dnaRows.length; i += 500) { const c = dnaRows.slice(i, i + 500); if (c.length) await supabase.from("property_marketing_profiles").insert(c as never); }

  // ── Marketing opportunities ─────────────────────────────────────────────────
  const oppRows: DB["marketing_opportunity_signals"]["Insert"][] = [];
  // Locality demand / inventory hotspots.
  const invByCity = new Map<string, number>();
  for (const p of properties) { const k = cityNorm(p.city); invByCity.set(k, (invByCity.get(k) ?? 0) + 1); }
  for (const [k, demand] of demandByCity) {
    const inv = invByCity.get(k) ?? 0;
    const label = k.charAt(0).toUpperCase() + k.slice(1);
    if (demand >= 70) oppRows.push({ organization_id: orgId, signal_type: "high_demand_locality", entity_type: "locality", entity_id: k, title: `${label} · ביקוש גבוה`, description: `ביקוש ${demand} באזור — שיווק ממוקד יניב לידים`, impact_score: demand, confidence_score: 72, recommended_action: "מקד קמפיין שיווק באזור" });
    if (demand >= 60 && inv <= 2) oppRows.push({ organization_id: orgId, signal_type: "low_inventory_locality", entity_type: "locality", entity_id: k, title: `${label} · מלאי נמוך מול ביקוש`, description: "ביקוש גבוה עם מעט מלאי — הזדמנות גיוס+שיווק", impact_score: demand, confidence_score: 70, recommended_action: "גייס מלאי ושווק לאזור הביקוש" });
  }
  // Segment hotspots.
  const investorsShare = segCount.get("investors") ?? 0;
  const luxuryShare = segCount.get("luxury") ?? 0;
  const familyShare = segCount.get("young_families") ?? 0;
  if (investorsShare >= 3) oppRows.push({ organization_id: orgId, signal_type: "investor_hotspot", entity_type: "segment", entity_id: "investors", title: "מוקד משקיעים פעיל", description: `${investorsShare} משקיעים פעילים — דחוף תוכן תשואה`, impact_score: 70, confidence_score: 68, recommended_action: "הפץ נכסי תשואה לקהילות משקיעים" });
  if (luxuryShare >= 2) oppRows.push({ organization_id: orgId, signal_type: "luxury_hotspot", entity_type: "segment", entity_id: "luxury", title: "מוקד יוקרה", description: `${luxuryShare} רוכשי יוקרה — שיווק פרימיום`, impact_score: 66, confidence_score: 65, recommended_action: "שווק נכסי יוקרה בערוצים ייעודיים" });
  if (familyShare >= 3) oppRows.push({ organization_id: orgId, signal_type: "family_hotspot", entity_type: "segment", entity_id: "young_families", title: "מוקד משפחות", description: `${familyShare} משפחות צעירות — תוכן קהילתי`, impact_score: 62, confidence_score: 64, recommended_action: "הפץ נכסים מרווחים לקהילות שכונתיות" });
  // Promotion opportunities — top marketing-score properties.
  for (const d of [...dnaRows].sort((a, b) => (b.marketing_score ?? 0) - (a.marketing_score ?? 0)).slice(0, 6)) {
    if ((d.marketing_score ?? 0) < 55) continue;
    oppRows.push({ organization_id: orgId, signal_type: "promotion_opportunity", entity_type: "property", entity_id: d.property_id ?? null, title: "נכס מומלץ לקידום", description: d.ai_summary ?? "", impact_score: d.marketing_score ?? 0, confidence_score: 70, recommended_action: "קדם את הנכס בקהילות המומלצות" });
  }
  // Seller acquisition hotspot — high-demand low-inventory already covered; add explicit.
  for (const [k, demand] of demandByCity) { if (demand >= 75 && (invByCity.get(k) ?? 0) <= 1) { const label = k.charAt(0).toUpperCase() + k.slice(1); oppRows.push({ organization_id: orgId, signal_type: "seller_acquisition_hotspot", entity_type: "locality", entity_id: k, title: `${label} · מוקד גיוס מוכרים`, description: "ביקוש גבוה מאוד עם מלאי מינימלי", impact_score: demand, confidence_score: 70, recommended_action: "הפעל קמפיין גיוס מוכרים באזור" }); } }

  await supabase.from("marketing_opportunity_signals").delete().eq("organization_id", orgId);
  for (let i = 0; i < oppRows.length; i += 500) { const c = oppRows.slice(i, i + 500); if (c.length) await supabase.from("marketing_opportunity_signals").insert(c as never); }

  const avgCommHealth = intelRows.length ? Math.round(intelRows.reduce((s, r) => s + (r.community_health_score ?? 0), 0) / intelRows.length) : 0;
  const avgMarketingScore = dnaRows.length ? Math.round(dnaRows.reduce((s, r) => s + (r.marketing_score ?? 0), 0) / dnaRows.length) : 0;
  const coveredAudiences = new Set(communities.filter((c) => c.status === "active").map((c) => c.audience_type)).size;
  const health = marketingHealthScore({ activeCommunities: communities.filter((c) => c.status === "active").length, avgCommunityHealth: avgCommHealth, coveredAudiences, avgMarketingScore, openOpportunities: oppRows.length });

  return { communities: intelRows.length, segments: segmentRows.filter((s) => (s.segment_size ?? 0) > 0).length, properties: dnaRows.length, opportunities: oppRows.length, health };
}

function primaryAudience(type: string, price: number | null): string {
  if (COMMERCIAL_TYPES.has(type)) return "commercial";
  if ((price ?? 0) >= 4_000_000) return "luxury";
  if (price != null && price <= 1_800_000) return "young";
  return "families";
}

// ── Community management (manual — no Meta/FB/WhatsApp API) ───────────────────
export interface CommunityInput { name: string; platform?: string; city?: string | null; locality?: string | null; audienceType?: string; membersCount?: number; engagementScore?: number; leadScore?: number; dealScore?: number; roiScore?: number; trustScore?: number; status?: string; notes?: string | null }

export async function createCommunity(input: CommunityInput): Promise<void> {
  const orgId = await requireOrg();
  const supabase = await createClient();
  await supabase.from("community_profiles").insert({
    organization_id: orgId, name: input.name, platform: input.platform ?? "facebook", city: input.city ?? null, locality: input.locality ?? null,
    audience_type: input.audienceType ?? "buyers", members_count: input.membersCount ?? 0,
    engagement_score: input.engagementScore ?? 50, lead_score: input.leadScore ?? 40, deal_score: input.dealScore ?? 30,
    roi_score: input.roiScore ?? 40, trust_score: input.trustScore ?? 50, status: input.status ?? "active", notes: input.notes ?? null,
  } as never);
}

export async function importCommunitiesCsv(rows: CommunityInput[]): Promise<{ created: number }> {
  const orgId = await requireOrg();
  const supabase = await createClient();
  const insert = rows.filter((r) => r.name?.trim()).map((r) => ({
    organization_id: orgId, name: r.name.trim(), platform: r.platform ?? "facebook", city: r.city ?? null, locality: r.locality ?? null,
    audience_type: r.audienceType ?? "buyers", members_count: r.membersCount ?? 0, engagement_score: r.engagementScore ?? 50,
    lead_score: r.leadScore ?? 40, deal_score: r.dealScore ?? 30, roi_score: r.roiScore ?? 40, trust_score: r.trustScore ?? 50, status: r.status ?? "active", notes: r.notes ?? null,
  }));
  if (insert.length) await supabase.from("community_profiles").insert(insert as never);
  return { created: insert.length };
}

// ── Read model ───────────────────────────────────────────────────────────────
export interface MarketingBoard {
  health: number;
  communities: (DB["community_profiles"]["Row"] & { intel: DB["community_intelligence_profiles"]["Row"] | null })[];
  topCommunities: (DB["community_profiles"]["Row"] & { intel: DB["community_intelligence_profiles"]["Row"] | null })[];
  segments: DB["buyer_segments"]["Row"][];
  opportunities: DB["marketing_opportunity_signals"]["Row"][];
  propertyDna: { propertyId: string; title: string; score: number; budget: string | null; topCommunity: string | null; audience: string[]; summary: string | null }[];
}

export async function getMarketingBoard(): Promise<MarketingBoard> {
  const supabase = await createClient();
  const [commRes, intelRes, segRes, oppRes, dnaRes] = await Promise.all([
    supabase.from("community_profiles").select("*").order("members_count", { ascending: false }).limit(300),
    supabase.from("community_intelligence_profiles").select("*").limit(300),
    supabase.from("buyer_segments").select("*").order("segment_size", { ascending: false }).limit(20),
    supabase.from("marketing_opportunity_signals").select("*").eq("status", "open").order("impact_score", { ascending: false }).limit(40),
    supabase.from("property_marketing_profiles").select("property_id,marketing_score,recommended_budget_level,recommended_communities,target_audience,ai_summary").order("marketing_score", { ascending: false }).limit(30),
  ]);
  const intelByComm = new Map((intelRes.data ?? []).map((i) => [i.community_id, i]));
  const communities = (commRes.data ?? []).map((c) => ({ ...c, intel: intelByComm.get(c.id) ?? null }));

  // Property titles for DNA list.
  const dna = dnaRes.data ?? [];
  const propIds = dna.map((d) => d.property_id);
  const titles = new Map<string, string>();
  if (propIds.length) { const { data } = await supabase.from("properties").select("id,title,city").in("id", propIds); for (const p of data ?? []) titles.set(p.id, `${p.title}${p.city ? ` · ${p.city}` : ""}`); }

  const health = marketingHealthScore({
    activeCommunities: communities.filter((c) => c.status === "active").length,
    avgCommunityHealth: communities.length ? Math.round(communities.reduce((s, c) => s + (c.intel?.community_health_score ?? 0), 0) / communities.length) : 0,
    coveredAudiences: new Set(communities.filter((c) => c.status === "active").map((c) => c.audience_type)).size,
    avgMarketingScore: dna.length ? Math.round(dna.reduce((s, d) => s + d.marketing_score, 0) / dna.length) : 0,
    openOpportunities: (oppRes.data ?? []).length,
  });

  const sortedComm = [...communities].sort((a, b) => (b.intel?.community_health_score ?? 0) - (a.intel?.community_health_score ?? 0));

  return {
    health, communities, topCommunities: sortedComm.slice(0, 8), segments: segRes.data ?? [], opportunities: oppRes.data ?? [],
    propertyDna: dna.map((d) => {
      const comms = (d.recommended_communities as { name?: string }[] | null) ?? [];
      return { propertyId: d.property_id, title: titles.get(d.property_id) ?? "נכס", score: d.marketing_score, budget: d.recommended_budget_level, topCommunity: comms[0]?.name ?? null, audience: (d.target_audience as string[] | null) ?? [], summary: d.ai_summary };
    }),
  };
}
