/**
 * Matching Intelligence service — the Deal Brain (server-only).
 * Fuses buyer + property + seller intelligence into match "deal twins" with a
 * closing probability, risks, opportunities and revenue signals. Deterministic.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent, getEntityTimeline } from "@/lib/activity/service";
import type { Database } from "@/lib/supabase/types";
import {
  calculateCompatibility,
  computeMatchScores,
  type CompatInput,
  type MatchInput,
} from "./scoring";
import {
  detectMatchRisks,
  estimatedCommission,
  dealValue,
  matchStageIndex,
  nextBestMatchActions,
  type MatchActionSeed,
} from "./playbook";
import {
  matchIntelligenceRepository,
  matchObjectionRepository,
  matchOpportunityRepository,
  matchRiskRepository,
  revenueSignalRepository,
  type MatchObjectionRow,
  type MatchOpportunityRow,
  type MatchProfileRow,
  type MatchRiskRow,
  type RevenueSignalRow,
} from "./repository";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const COMPAT_THRESHOLD = 40;
const MAX_MATCHES = 200;
const revenueScoreOf = (price: number | null) => clamp((price ?? 0) / 50_000);

async function currentOrgId(): Promise<string> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile.org_id;
}

interface Candidate {
  buyerId: string;
  propertyId: string;
  sellerId: string | null;
  compat: ReturnType<typeof calculateCompatibility>;
  input: MatchInput;
  scores: ReturnType<typeof computeMatchScores>;
  price: number | null;
  stage: string;
}

export async function generateMatchesForOrg(): Promise<number> {
  const orgId = await currentOrgId();
  const supabase = await createClient();
  const [bpRes, buyersRes, propsRes, ppRes, spRes, existingRes, visitsRes] = await Promise.all([
    supabase.from("buyer_intelligence_profiles").select("buyer_id,buyer_readiness_score,buyer_engagement_score,buyer_trust_score,buyer_financing_score,buyer_conversion_probability,days_since_activity").limit(200),
    supabase.from("buyers").select("id,budget_min,budget_max,rooms_min,rooms_max,preferred_areas,preferred_types,must_have_parking,must_have_elevator,must_have_safe_room").limit(500),
    supabase.from("properties").select("id,price,rooms,city,neighborhood,type,has_parking,has_elevator,has_safe_room,seller_id,status").in("status", ["active", "published", "ready"]).limit(300),
    supabase.from("property_intelligence_profiles").select("property_id,success_score,market_position_score,momentum_score"),
    supabase.from("seller_intelligence_profiles").select("seller_id,seller_trust_score,seller_churn_risk_score,seller_confidence_score"),
    supabase.from("match_intelligence_profiles").select("buyer_id,property_id,match_stage"),
    supabase.from("entity_relationships").select("source_entity_id,target_entity_id").eq("relationship_type", "buyer_visited_property").eq("status", "active"),
  ]);

  const buyerIntel = bpRes.data ?? [];
  const buyerPrefs = new Map((buyersRes.data ?? []).map((b) => [b.id, b]));
  const props = propsRes.data ?? [];
  const propIntel = new Map((ppRes.data ?? []).map((p) => [p.property_id, p]));
  const sellerIntel = new Map((spRes.data ?? []).map((s) => [s.seller_id, s]));
  const existing = new Map((existingRes.data ?? []).map((m) => [`${m.buyer_id}|${m.property_id}`, m.match_stage]));
  const visited = new Set((visitsRes.data ?? []).map((r) => `${r.source_entity_id}|${r.target_entity_id}`));

  const candidates: Candidate[] = [];
  for (const bi of buyerIntel) {
    const prefs = buyerPrefs.get(bi.buyer_id);
    if (!prefs) continue;
    for (const p of props) {
      const ci: CompatInput = {
        budgetMin: prefs.budget_min, budgetMax: prefs.budget_max, roomsMin: prefs.rooms_min, roomsMax: prefs.rooms_max,
        preferredAreas: prefs.preferred_areas ?? [], preferredTypes: prefs.preferred_types ?? [],
        mustParking: prefs.must_have_parking, mustElevator: prefs.must_have_elevator, mustSafeRoom: prefs.must_have_safe_room,
        price: p.price, rooms: p.rooms, city: p.city, neighborhood: p.neighborhood, type: p.type,
        hasParking: p.has_parking, hasElevator: p.has_elevator, hasSafeRoom: p.has_safe_room,
      };
      const compat = calculateCompatibility(ci);
      if (compat.score < COMPAT_THRESHOLD) continue;
      const pi = propIntel.get(p.id);
      const si = p.seller_id ? sellerIntel.get(p.seller_id) : undefined;
      const stage = existing.get(`${bi.buyer_id}|${p.id}`) ?? "recommended";
      const input: MatchInput = {
        buyerReadiness: bi.buyer_readiness_score, buyerEngagement: bi.buyer_engagement_score, buyerTrust: bi.buyer_trust_score,
        buyerFinancing: bi.buyer_financing_score, buyerConversion: bi.buyer_conversion_probability, buyerDaysSinceActivity: bi.days_since_activity,
        sellerTrust: si?.seller_trust_score ?? null, sellerChurn: si?.seller_churn_risk_score ?? null, sellerConfidence: si?.seller_confidence_score ?? null,
        propertySuccess: pi?.success_score ?? 40, propertyMarketPosition: pi?.market_position_score ?? 40, propertyMomentum: pi?.momentum_score ?? 40,
        visits: visited.has(`${bi.buyer_id}|${p.id}`) ? 1 : 0, feedbackPositive: false, openObjections: 0, matchStageIndex: matchStageIndex(stage),
      };
      const scores = computeMatchScores(input, compat.score);
      candidates.push({ buyerId: bi.buyer_id, propertyId: p.id, sellerId: p.seller_id, compat, input, scores, price: p.price, stage });
    }
  }

  // Keep the global strongest matches.
  candidates.sort((a, b) => b.scores.closing - a.scores.closing);
  const kept = candidates.slice(0, MAX_MATCHES);

  const profileRows = kept.map((c) => {
    const revenue = revenueScoreOf(c.price);
    const opportunity = clamp(c.scores.closing * 0.6 + revenue * 0.4);
    const urgency = clamp(c.scores.timing * 0.5 + c.scores.closing * 0.3 + (100 - c.scores.risk) * 0.2);
    return {
      org_id: orgId, buyer_id: c.buyerId, property_id: c.propertyId, seller_id: c.sellerId,
      compatibility_score: c.scores.compatibility, readiness_score: c.scores.readiness, engagement_score: c.scores.engagement,
      trust_score: c.scores.trust, timing_score: c.scores.timing, momentum_score: c.scores.momentum, risk_score: c.scores.risk,
      closing_probability: c.scores.closing, opportunity_score: opportunity, revenue_score: revenue, urgency_score: urgency,
      match_status: "active", match_stage: c.stage,
      next_best_action: nextBestMatchActions(c.input, c.stage)[0]?.title ?? null,
      primary_blocker: c.compat.blocker, strongest_advantage: c.compat.advantage,
      estimated_deal_value: dealValue(c.price), estimated_commission: estimatedCommission(c.price),
      intelligence_summary: `הסתברות סגירה ${c.scores.closing}% · התאמה ${c.scores.compatibility} · סיכון ${c.scores.risk}`,
      ai_summary: `הסתברות סגירה ${c.scores.closing}%. התאמה ${c.scores.compatibility}/100, מוכנות ${c.scores.readiness}, תזמון ${c.scores.timing}.`,
      ai_risk_summary: c.compat.blocker ? `חסם עיקרי: ${c.compat.blocker}.` : "אין חסם משמעותי.",
      ai_recommendation_summary: `פעולה מומלצת: ${nextBestMatchActions(c.input, c.stage)[0]?.title ?? "—"}.`,
      last_calculated_at: new Date().toISOString(),
    };
  });

  await matchIntelligenceRepository.upsertMany(profileRows);

  // Map pair → id (re-read current org matches).
  const all = await matchIntelligenceRepository.listForOrg();
  const idByPair = new Map(all.map((m) => [`${m.buyer_id}|${m.property_id}`, m.id]));

  // Regenerate child tables for the org.
  await Promise.all([matchRiskRepository.clearForOrg(orgId), matchOpportunityRepository.clearForOrg(orgId), revenueSignalRepository.clearForOrg(orgId)]);

  const riskRows: Database["public"]["Tables"]["match_risks"]["Insert"][] = [];
  const oppRows: Database["public"]["Tables"]["match_opportunities"]["Insert"][] = [];
  const revRows: Database["public"]["Tables"]["revenue_signals"]["Insert"][] = [];
  for (const c of kept) {
    const matchId = idByPair.get(`${c.buyerId}|${c.propertyId}`);
    if (!matchId) continue;
    for (const r of detectMatchRisks(c.input)) riskRows.push({ org_id: orgId, match_id: matchId, risk_type: r.riskType, severity: r.severity, title: r.title, description: r.description, recommended_action: r.recommendedAction, status: "open" });
    const revenue = revenueScoreOf(c.price);
    const commission = estimatedCommission(c.price);
    oppRows.push({ org_id: orgId, match_id: matchId, opportunity_score: clamp(c.scores.closing * 0.6 + revenue * 0.4), revenue_score: revenue, urgency_score: clamp(c.scores.timing * 0.5 + c.scores.closing * 0.5), estimated_deal_value: dealValue(c.price), estimated_commission: commission, recommended_action: nextBestMatchActions(c.input, c.stage)[0]?.title ?? null, status: "open" });
    revRows.push({ org_id: orgId, match_id: matchId, estimated_commission: commission, expected_revenue: commission, confidence: c.scores.closing, probability_weighted_revenue: Math.round((commission * c.scores.closing) / 100) });
  }
  await matchRiskRepository.insertMany(riskRows);
  await matchOpportunityRepository.insertMany(oppRows);
  await revenueSignalRepository.insertMany(revRows);

  await logActivityEvent({ eventType: "match.score_changed", entityType: "organization", entityId: orgId, title: `חושבו ${kept.length} התאמות`, description: `${kept.length} עסקאות פוטנציאליות עודכנו` });
  return kept.length;
}

// ── Command Center ───────────────────────────────────────────────────────────
export interface MatchCommandCenter {
  profile: MatchProfileRow;
  risks: MatchRiskRow[];
  objections: MatchObjectionRow[];
  opportunity: MatchOpportunityRow | null;
  revenue: RevenueSignalRow | null;
  buyer: { id: string; name: string; readiness: number; conversion: number } | null;
  property: { id: string; title: string; success: number; price: number | null } | null;
  seller: { id: string; name: string; trust: number; churn: number } | null;
  timeline: Database["public"]["Tables"]["activity_events"]["Row"][];
  actions: MatchActionSeed[];
}

export async function getMatchCommandCenter(matchId: string): Promise<MatchCommandCenter | null> {
  const profile = await matchIntelligenceRepository.getById(matchId);
  if (!profile) return null;
  const supabase = await createClient();
  const [risks, objections, oppRes, revRes, buyerRes, biRes, propRes, piRes, sellerRes, siRes, timeline] = await Promise.all([
    matchRiskRepository.listByMatch(matchId),
    matchObjectionRepository.listByMatch(matchId),
    supabase.from("match_opportunities").select("*").eq("match_id", matchId).maybeSingle(),
    supabase.from("revenue_signals").select("*").eq("match_id", matchId).maybeSingle(),
    supabase.from("buyers").select("id,full_name").eq("id", profile.buyer_id).maybeSingle(),
    supabase.from("buyer_intelligence_profiles").select("buyer_readiness_score,buyer_conversion_probability,buyer_financing_score,days_since_activity").eq("buyer_id", profile.buyer_id).maybeSingle(),
    supabase.from("properties").select("id,title,price").eq("id", profile.property_id).maybeSingle(),
    supabase.from("property_intelligence_profiles").select("success_score,market_position_score,momentum_score").eq("property_id", profile.property_id).maybeSingle(),
    profile.seller_id ? supabase.from("sellers").select("id,full_name").eq("id", profile.seller_id).maybeSingle() : Promise.resolve({ data: null }),
    profile.seller_id ? supabase.from("seller_intelligence_profiles").select("seller_trust_score,seller_churn_risk_score,seller_confidence_score").eq("seller_id", profile.seller_id).maybeSingle() : Promise.resolve({ data: null }),
    getEntityTimeline("match", matchId, 40),
  ]);

  const bi = biRes.data as { buyer_readiness_score: number; buyer_conversion_probability: number; buyer_financing_score: number; days_since_activity: number | null } | null;
  const pi = piRes.data as { success_score: number; market_position_score: number; momentum_score: number } | null;
  const si = siRes.data as { seller_trust_score: number; seller_churn_risk_score: number; seller_confidence_score: number } | null;
  const buyerRow = buyerRes.data as { id: string; full_name: string } | null;
  const propRow = propRes.data as { id: string; title: string; price: number | null } | null;
  const sellerRow = sellerRes.data as { id: string; full_name: string } | null;

  const input: MatchInput = {
    buyerReadiness: bi?.buyer_readiness_score ?? profile.readiness_score, buyerEngagement: profile.engagement_score, buyerTrust: profile.trust_score,
    buyerFinancing: bi?.buyer_financing_score ?? 50, buyerConversion: bi?.buyer_conversion_probability ?? profile.closing_probability, buyerDaysSinceActivity: bi?.days_since_activity ?? null,
    sellerTrust: si?.seller_trust_score ?? null, sellerChurn: si?.seller_churn_risk_score ?? null, sellerConfidence: si?.seller_confidence_score ?? null,
    propertySuccess: pi?.success_score ?? 40, propertyMarketPosition: pi?.market_position_score ?? 40, propertyMomentum: pi?.momentum_score ?? 40,
    visits: 0, feedbackPositive: false, openObjections: objections.filter((o) => !o.resolved).length, matchStageIndex: matchStageIndex(profile.match_stage),
  };

  return {
    profile, risks, objections,
    opportunity: (oppRes.data as MatchOpportunityRow | null) ?? null,
    revenue: (revRes.data as RevenueSignalRow | null) ?? null,
    buyer: buyerRow ? { id: buyerRow.id, name: buyerRow.full_name, readiness: bi?.buyer_readiness_score ?? 0, conversion: bi?.buyer_conversion_probability ?? 0 } : null,
    property: propRow ? { id: propRow.id, title: propRow.title, success: pi?.success_score ?? 0, price: propRow.price } : null,
    seller: sellerRow ? { id: sellerRow.id, name: sellerRow.full_name, trust: si?.seller_trust_score ?? 0, churn: si?.seller_churn_risk_score ?? 0 } : null,
    timeline,
    actions: nextBestMatchActions(input, profile.match_stage),
  };
}

// ── Recommended lists for the three entity command centers ───────────────────
export interface RecoItem { matchId: string; otherId: string; title: string; compatibility: number; closing: number; opportunity: number; stage: string }

async function buyerNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("buyers").select("id,full_name").in("id", ids);
  return new Map((data ?? []).map((r) => [r.id, r.full_name]));
}
async function propertyNames(ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const supabase = await createClient();
  const { data } = await supabase.from("properties").select("id,title").in("id", ids);
  return new Map((data ?? []).map((r) => [r.id, r.title]));
}

export async function recommendedPropertiesForBuyer(buyerId: string): Promise<RecoItem[]> {
  const matches = await matchIntelligenceRepository.listForBuyer(buyerId);
  const names = await propertyNames(matches.map((m) => m.property_id));
  return matches.map((m) => ({ matchId: m.id, otherId: m.property_id, title: names.get(m.property_id) ?? "נכס", compatibility: m.compatibility_score, closing: m.closing_probability, opportunity: m.opportunity_score, stage: m.match_stage }));
}
export async function recommendedBuyersForProperty(propertyId: string): Promise<RecoItem[]> {
  const matches = await matchIntelligenceRepository.listForProperty(propertyId);
  const names = await buyerNames(matches.map((m) => m.buyer_id));
  return matches.map((m) => ({ matchId: m.id, otherId: m.buyer_id, title: names.get(m.buyer_id) ?? "קונה", compatibility: m.compatibility_score, closing: m.closing_probability, opportunity: m.opportunity_score, stage: m.match_stage }));
}
export async function interestedBuyersForSeller(sellerId: string): Promise<RecoItem[]> {
  const matches = await matchIntelligenceRepository.listForSeller(sellerId);
  const names = await buyerNames(matches.map((m) => m.buyer_id));
  return matches.map((m) => ({ matchId: m.id, otherId: m.buyer_id, title: names.get(m.buyer_id) ?? "קונה", compatibility: m.compatibility_score, closing: m.closing_probability, opportunity: m.opportunity_score, stage: m.match_stage }));
}

// ── Board for Decision / Executive ───────────────────────────────────────────
export interface MatchBoardItem { matchId: string; title: string; meta: string }
export interface MatchBoard {
  bestOpportunities: MatchBoardItem[];
  dealsAtRisk: MatchBoardItem[];
  highestClosing: MatchBoardItem[];
  stalled: MatchBoardItem[];
  revenuePipeline: number;
  total: number;
}

export async function listMatchBoard(): Promise<MatchBoard> {
  const supabase = await createClient();
  const [matches, revenue, buyersRes, propsRes] = await Promise.all([
    matchIntelligenceRepository.listForOrg(),
    revenueSignalRepository.listForOrg(),
    supabase.from("buyers").select("id,full_name"),
    supabase.from("properties").select("id,title"),
  ]);
  const bn = new Map((buyersRes.data ?? []).map((b) => [b.id, b.full_name]));
  const pn = new Map((propsRes.data ?? []).map((p) => [p.id, p.title]));
  const label = (m: MatchProfileRow) => `${bn.get(m.buyer_id) ?? "קונה"} ← ${pn.get(m.property_id) ?? "נכס"}`;
  const item = (m: MatchProfileRow, meta: string): MatchBoardItem => ({ matchId: m.id, title: label(m), meta });
  const active = matches.filter((m) => m.match_status === "active" && m.match_stage !== "closed" && m.match_stage !== "lost");

  return {
    bestOpportunities: [...active].sort((a, b) => b.opportunity_score - a.opportunity_score).slice(0, 6).map((m) => item(m, `הזדמנות ${m.opportunity_score}`)),
    dealsAtRisk: active.filter((m) => m.risk_score >= 55).sort((a, b) => b.risk_score - a.risk_score).slice(0, 6).map((m) => item(m, `סיכון ${m.risk_score}`)),
    highestClosing: [...active].sort((a, b) => b.closing_probability - a.closing_probability).slice(0, 6).map((m) => item(m, `${m.closing_probability}%`)),
    stalled: active.filter((m) => m.momentum_score < 40 && matchStageIndex(m.match_stage) >= 1).slice(0, 6).map((m) => item(m, `מומנטום ${m.momentum_score}`)),
    revenuePipeline: revenue.reduce((s, r) => s + (r.probability_weighted_revenue ?? 0), 0),
    total: matches.length,
  };
}
