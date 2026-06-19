/**
 * Buyer Intelligence service — the buyer "digital twin" orchestration.
 * Deterministic. Logs buyer.* activity events; tracks property relationships.
 * Server-only.
 */
import { createClient } from "@/lib/supabase/server";
import { logActivityEvent, getEntityTimeline } from "@/lib/activity/service";
import { RELATIONSHIP_TYPES } from "@/lib/activity/types";
import type { Database } from "@/lib/supabase/types";
import {
  computeAllBuyerScores,
  readinessLabel,
  type BuyerScoreContext,
  type BuyerScoreSet,
} from "./scoring";
import {
  defaultBuyerMissions,
  detectBuyerRisks,
  inDays,
  nextBestBuyerActions,
  objectionAction,
  OBJECTION_LABELS,
  stageIndex,
  type BuyerActionSeed,
} from "./playbook";
import {
  buyerCommitmentRepository,
  buyerIntelligenceRepository,
  buyerMissionRepository,
  buyerObjectionRepository,
  buyerRiskRepository,
  buyerTouchpointRepository,
  type BuyerCommitmentRow,
  type BuyerMissionRow,
  type BuyerObjectionRow,
  type BuyerProfileRow,
  type BuyerRiskRow,
  type BuyerTouchpointRow,
} from "./repository";

const DAY = 86_400_000;
const daysSince = (iso: string | null) => (iso == null ? null : Math.floor((Date.now() - new Date(iso).getTime()) / DAY));

const REL = {
  viewed: RELATIONSHIP_TYPES.buyerViewedProperty,
  liked: RELATIONSHIP_TYPES.buyerLikedProperty,
  rejected: RELATIONSHIP_TYPES.buyerRejectedProperty,
  visited: RELATIONSHIP_TYPES.buyerVisitedProperty,
};

interface Gathered {
  ctx: BuyerScoreContext;
  lastActivityAt: string | null;
  lastVisitAt: string | null;
  metrics: {
    viewed_properties_count: number;
    visits_count: number;
    liked_properties_count: number;
    rejected_properties_count: number;
    offers_count: number;
    meetings_count: number;
    calls_count: number;
  };
  primaryObjection: string | null;
}

async function gatherBuyerContext(buyerId: string, stage: string): Promise<Gathered> {
  const supabase = await createClient();
  const recentIso = new Date(Date.now() - 30 * DAY).toISOString();
  const [buyerRes, tpRes, commitsRes, objsRes, meetingsRes, relsRes] = await Promise.all([
    supabase.from("buyers").select("budget_min,budget_max,preferred_areas,preferred_types,has_preapproval,last_contacted_at,updated_at").eq("id", buyerId).maybeSingle(),
    supabase.from("buyer_touchpoints").select("touchpoint_type,sentiment,occurred_at").eq("buyer_id", buyerId),
    supabase.from("buyer_commitments").select("status").eq("buyer_id", buyerId),
    supabase.from("buyer_objections").select("objection_type,resolved").eq("buyer_id", buyerId),
    supabase.from("meetings").select("id").eq("buyer_id", buyerId),
    supabase.from("entity_relationships").select("relationship_type").eq("source_entity_type", "buyer").eq("source_entity_id", buyerId).eq("status", "active"),
  ]);

  const buyer = buyerRes.data;
  const tps = tpRes.data ?? [];
  const commits = commitsRes.data ?? [];
  const objs = objsRes.data ?? [];
  const rels = relsRes.data ?? [];
  const relCount = (t: string) => rels.filter((r) => r.relationship_type === t).length;
  const tpOf = (t: string) => tps.filter((x) => x.touchpoint_type === t).length;

  const lastActivityAt = [...tps.map((t) => t.occurred_at), buyer?.last_contacted_at ?? null, buyer?.updated_at ?? null].filter((v): v is string => !!v).sort().pop() ?? null;
  const lastVisitAt = tps.filter((t) => t.touchpoint_type === "property_visit").map((t) => t.occurred_at).sort().pop() ?? null;
  const openObjs = objs.filter((o) => !o.resolved);
  const primaryObjection = openObjs[0]?.objection_type ? (OBJECTION_LABELS[openObjs[0].objection_type] ?? openObjs[0].objection_type) : null;

  const viewed = relCount(REL.viewed) || tpOf("property_viewed");
  const visits = relCount(REL.visited) || tpOf("property_visit");

  const ctx: BuyerScoreContext = {
    hasBudget: buyer?.budget_min != null || buyer?.budget_max != null,
    hasPreferredAreas: (buyer?.preferred_areas?.length ?? 0) > 0,
    hasPreferredTypes: (buyer?.preferred_types?.length ?? 0) > 0,
    hasPreapproval: buyer?.has_preapproval ?? false,
    daysSinceActivity: daysSince(lastActivityAt),
    recentTouchpoints: tps.filter((t) => t.occurred_at >= recentIso).length,
    callsCount: tpOf("phone_call"),
    meetingsCount: (meetingsRes.data ?? []).length,
    positiveResponses: tps.filter((t) => t.sentiment === "positive").length,
    negativeResponses: tps.filter((t) => t.sentiment === "negative").length,
    viewedCount: viewed,
    likedCount: relCount(REL.liked),
    rejectedCount: relCount(REL.rejected),
    visitsCount: visits,
    offersCount: relCount(RELATIONSHIP_TYPES.buyerSentOffer),
    fulfilledCommitments: commits.filter((c) => c.status === "fulfilled").length,
    brokenCommitments: commits.filter((c) => c.status === "broken").length,
    openObjections: openObjs.length,
    stageIndex: stageIndex(stage),
    openRisks: [],
  };

  return {
    ctx,
    lastActivityAt,
    lastVisitAt,
    primaryObjection,
    metrics: {
      viewed_properties_count: viewed,
      visits_count: visits,
      liked_properties_count: ctx.likedCount,
      rejected_properties_count: ctx.rejectedCount,
      offers_count: ctx.offersCount,
      meetings_count: ctx.meetingsCount,
      calls_count: ctx.callsCount,
    },
  };
}

async function loadBuyerOrg(buyerId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("buyers").select("org_id").eq("id", buyerId).maybeSingle();
  return data?.org_id ?? null;
}

export async function generateBuyerMissions(orgId: string, buyerId: string): Promise<void> {
  const rows = defaultBuyerMissions().map((m) => ({
    org_id: orgId, buyer_id: buyerId, title: m.title, description: m.description,
    target_metric: m.targetMetric, target_value: m.targetValue, due_date: inDays(m.dueInDays), priority: m.priority, status: "active",
  }));
  await buyerMissionRepository.insertMany(rows);
  await logActivityEvent({ eventType: "buyer.mission_created", entityType: "buyer", entityId: buyerId, title: `נוצרו ${rows.length} משימות קונה` });
}

export async function generateBuyerRisks(orgId: string, buyerId: string, ctx: BuyerScoreContext): Promise<BuyerRiskRow[]> {
  await buyerRiskRepository.clearOpen(buyerId);
  const rows = detectBuyerRisks(ctx).map((r) => ({
    org_id: orgId, buyer_id: buyerId, risk_type: r.riskType, severity: r.severity, title: r.title,
    description: r.description, recommended_action: r.recommendedAction, status: "open",
  }));
  await buyerRiskRepository.insertMany(rows);
  if (rows.length) await logActivityEvent({ eventType: "buyer.risk_created", entityType: "buyer", entityId: buyerId, title: `זוהו ${rows.length} סיכוני קונה`, priority: "high" });
  return buyerRiskRepository.listOpen(buyerId);
}

export async function updateBuyerScores(buyerId: string): Promise<BuyerScoreSet> {
  const prev = await buyerIntelligenceRepository.getByBuyer(buyerId);
  const orgId = prev?.org_id ?? (await loadBuyerOrg(buyerId));
  if (!orgId) throw new Error("buyer org not found");
  const stage = prev?.current_stage ?? "new_lead";

  const { ctx, lastActivityAt, lastVisitAt, metrics, primaryObjection } = await gatherBuyerContext(buyerId, stage);
  const openRisks = await generateBuyerRisks(orgId, buyerId, ctx);
  ctx.openRisks = openRisks.map((r) => ({ severity: r.severity }));

  const scores = computeAllBuyerScores(ctx);
  const actions = nextBestBuyerActions(ctx);
  const status = readinessLabel(scores.readiness);
  const urgency = scores.conversion >= 70 ? "גבוה" : scores.conversion >= 45 ? "בינוני" : "נמוך";
  const topRisks = openRisks.slice(0, 3).map((r) => r.title).join(", ") || "אין סיכונים פעילים";

  await buyerIntelligenceRepository.update(buyerId, {
    buyer_health_score: scores.health,
    buyer_readiness_score: scores.readiness,
    buyer_engagement_score: scores.engagement,
    buyer_qualification_score: scores.qualification,
    buyer_trust_score: scores.trust,
    buyer_financing_score: scores.financing,
    buyer_momentum_score: scores.momentum,
    buyer_conversion_probability: scores.conversion,
    current_status: status,
    next_best_action: actions[0]?.title ?? null,
    ...metrics,
    last_activity_at: lastActivityAt,
    last_visit_at: lastVisitAt,
    days_since_activity: ctx.daysSinceActivity,
    primary_objection: primaryObjection,
    urgency_level: urgency,
    intelligence_summary: `מוכנות ${scores.readiness} · הסתברות סגירה ${scores.conversion} · ${status}`,
    ai_summary: `הקונה במצב "${status}". מוכנות ${scores.readiness}/100, מעורבות ${scores.engagement}/100, הסתברות סגירה ${scores.conversion}%.`,
    ai_risk_summary: `סיכונים: ${topRisks}.`,
    ai_recommendation_summary: `הפעולה המומלצת: ${actions[0]?.title ?? "—"} (רווח המרה צפוי +${actions[0]?.conversionGain ?? 0}).`,
    last_calculated_at: new Date().toISOString(),
  });

  await logActivityEvent({ eventType: "buyer.score_changed", entityType: "buyer", entityId: buyerId, title: "ציוני הקונה עודכנו", description: `מוכנות ${scores.readiness} · הסתברות ${scores.conversion}` });
  return scores;
}

export async function initializeBuyerIntelligence(buyerId: string): Promise<BuyerProfileRow> {
  const existing = await buyerIntelligenceRepository.getByBuyer(buyerId);
  if (existing) {
    await updateBuyerScores(buyerId);
    return (await buyerIntelligenceRepository.getByBuyer(buyerId))!;
  }
  const orgId = await loadBuyerOrg(buyerId);
  if (!orgId) throw new Error("buyer org not found");
  await buyerIntelligenceRepository.create({ org_id: orgId, buyer_id: buyerId, current_stage: "new_lead", current_status: "early" });
  await generateBuyerMissions(orgId, buyerId);
  await updateBuyerScores(buyerId);
  await logActivityEvent({ eventType: "buyer.qualified", entityType: "buyer", entityId: buyerId, title: "ZONO Buyer Intelligence הופעל" });
  return (await buyerIntelligenceRepository.getByBuyer(buyerId))!;
}

export async function recalculateBuyerIntelligence(buyerId: string): Promise<void> {
  await updateBuyerScores(buyerId);
}

// ── Command Center ───────────────────────────────────────────────────────────
export interface BuyerPropertyLink {
  id: string;
  title: string;
  relationship: string;
}
export interface BuyerCommandCenter {
  profile: BuyerProfileRow;
  missions: BuyerMissionRow[];
  risks: BuyerRiskRow[];
  touchpoints: BuyerTouchpointRow[];
  objections: BuyerObjectionRow[];
  commitments: BuyerCommitmentRow[];
  timeline: Database["public"]["Tables"]["activity_events"]["Row"][];
  viewed: BuyerPropertyLink[];
  liked: BuyerPropertyLink[];
  rejected: BuyerPropertyLink[];
  actions: BuyerActionSeed[];
}

export async function getBuyerCommandCenter(buyerId: string): Promise<BuyerCommandCenter | null> {
  const profile = await buyerIntelligenceRepository.getByBuyer(buyerId);
  if (!profile) return null;
  const supabase = await createClient();
  const [missions, risks, touchpoints, objections, commitments, timeline, relsRes, gathered] = await Promise.all([
    buyerMissionRepository.listByBuyer(buyerId),
    buyerRiskRepository.listByBuyer(buyerId),
    buyerTouchpointRepository.listByBuyer(buyerId),
    buyerObjectionRepository.listByBuyer(buyerId),
    buyerCommitmentRepository.listByBuyer(buyerId),
    getEntityTimeline("buyer", buyerId, 50),
    supabase.from("entity_relationships").select("relationship_type,target_entity_id").eq("source_entity_type", "buyer").eq("source_entity_id", buyerId).eq("status", "active").limit(100),
    gatherBuyerContext(buyerId, profile.current_stage),
  ]);

  const rels = relsRes.data ?? [];
  const propIds = [...new Set(rels.map((r) => r.target_entity_id))];
  const titles = new Map<string, string>();
  if (propIds.length) {
    const { data } = await supabase.from("properties").select("id,title").in("id", propIds);
    for (const p of data ?? []) titles.set(p.id, p.title);
  }
  const linksOf = (t: string): BuyerPropertyLink[] => rels.filter((r) => r.relationship_type === t).map((r) => ({ id: r.target_entity_id, title: titles.get(r.target_entity_id) ?? "נכס", relationship: t }));

  return {
    profile, missions, risks, touchpoints, objections, commitments, timeline,
    viewed: linksOf(REL.viewed), liked: linksOf(REL.liked), rejected: linksOf(REL.rejected),
    actions: nextBestBuyerActions(gathered.ctx),
  };
}

// ── Dashboard board ──────────────────────────────────────────────────────────
export interface BuyerIntelBoardItem { buyerId: string; name: string; meta: string }
export interface BuyerIntelBoard {
  needingAttention: BuyerIntelBoardItem[];
  closeToPurchase: BuyerIntelBoardItem[];
  financingRisks: BuyerIntelBoardItem[];
  highEngagement: BuyerIntelBoardItem[];
  newQualified: BuyerIntelBoardItem[];
  noActivity: BuyerIntelBoardItem[];
  total: number;
}

export async function listBuyerIntelBoard(): Promise<BuyerIntelBoard> {
  const supabase = await createClient();
  const [profiles, buyersRes] = await Promise.all([
    buyerIntelligenceRepository.listForOrg(),
    supabase.from("buyers").select("id,full_name"),
  ]);
  const names = new Map((buyersRes.data ?? []).map((b) => [b.id, b.full_name]));
  const item = (p: BuyerProfileRow, meta: string): BuyerIntelBoardItem => ({ buyerId: p.buyer_id, name: names.get(p.buyer_id) ?? "קונה", meta });
  return {
    needingAttention: profiles.filter((p) => p.buyer_health_score < 45 || (p.days_since_activity ?? 0) >= 14).sort((a, b) => a.buyer_health_score - b.buyer_health_score).slice(0, 6).map((p) => item(p, `בריאות ${p.buyer_health_score}`)),
    closeToPurchase: profiles.filter((p) => p.buyer_conversion_probability >= 70).sort((a, b) => b.buyer_conversion_probability - a.buyer_conversion_probability).slice(0, 6).map((p) => item(p, `${p.buyer_conversion_probability}%`)),
    financingRisks: profiles.filter((p) => p.buyer_financing_score < 45).sort((a, b) => a.buyer_financing_score - b.buyer_financing_score).slice(0, 6).map((p) => item(p, `מימון ${p.buyer_financing_score}`)),
    highEngagement: profiles.filter((p) => p.buyer_engagement_score >= 70).sort((a, b) => b.buyer_engagement_score - a.buyer_engagement_score).slice(0, 6).map((p) => item(p, `מעורבות ${p.buyer_engagement_score}`)),
    newQualified: profiles.filter((p) => p.current_stage === "qualified").slice(0, 6).map((p) => item(p, "מוסמך")),
    noActivity: profiles.filter((p) => p.days_since_activity == null || p.days_since_activity >= 14).slice(0, 6).map((p) => item(p, p.days_since_activity == null ? "אין פעילות" : `${p.days_since_activity} ימים`)),
    total: profiles.length,
  };
}

export { objectionAction };
