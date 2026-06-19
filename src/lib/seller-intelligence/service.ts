/**
 * Seller Intelligence service — the seller "digital twin" orchestration.
 * Deterministic: builds context from touchpoints/commitments/meetings/properties,
 * detects risks, computes scores, and assembles the Seller Command Center.
 * Logs seller.* activity events. Server-only.
 */
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { logActivityEvent } from "@/lib/activity/service";
import { getEntityTimeline } from "@/lib/activity/service";
import {
  churnLevel,
  computeAllSellerScores,
  type SellerScoreContext,
  type SellerScoreSet,
} from "./scoring";
import {
  defaultSellerMissions,
  detectSellerRisks,
  inDays,
  nextBestSellerActions,
  type SellerActionSeed,
} from "./playbook";
import {
  sellerCommitmentRepository,
  sellerIntelligenceRepository,
  sellerMissionRepository,
  sellerRiskRepository,
  sellerTouchpointRepository,
  type SellerCommitmentRow,
  type SellerMissionRow,
  type SellerProfileRow,
  type SellerRiskRow,
  type SellerTouchpointRow,
} from "./repository";

const DAY = 86_400_000;
const daysSince = (iso: string | null) =>
  iso == null ? null : Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
const trend = (oldV: number, newV: number) => (newV > oldV ? "up" : newV < oldV ? "down" : "flat");
const ACTIVE_STATUSES = ["active", "published", "ready", "under_offer", "in_contract"];

interface GatheredContext {
  ctx: SellerScoreContext;
  lastContactAt: string | null;
  metrics: {
    meetings_count: number;
    calls_count: number;
    reports_sent_count: number;
    reports_opened_count: number;
    properties_count: number;
    active_properties_count: number;
  };
}

async function gatherSellerContext(sellerId: string): Promise<GatheredContext> {
  const supabase = await createClient();
  const recentIso = new Date(Date.now() - 30 * DAY).toISOString();
  const [tp, commits, meetings, props, risks, sellerRow] = await Promise.all([
    supabase.from("seller_touchpoints").select("touchpoint_type,sentiment,occurred_at").eq("seller_id", sellerId),
    supabase.from("seller_commitments").select("status").eq("seller_id", sellerId),
    supabase.from("meetings").select("id").eq("seller_id", sellerId),
    supabase.from("properties").select("status").eq("seller_id", sellerId),
    supabase.from("seller_risks").select("severity,risk_type").eq("seller_id", sellerId).eq("status", "open"),
    supabase.from("sellers").select("cooperation_score,allows_marketing,available_for_showings,has_signed_agreement,urgency_level,decision_style,minimum_price,desired_price").eq("id", sellerId).maybeSingle(),
  ]);

  const s360 = sellerRow.data;
  const tps = tp.data ?? [];
  const commitRows = commits.data ?? [];
  const propRows = props.data ?? [];
  const riskRows = risks.data ?? [];
  const lastContactAt = tps.map((t) => t.occurred_at).sort().pop() ?? null;
  const ofType = (t: string) => tps.filter((x) => x.touchpoint_type === t).length;

  const ctx: SellerScoreContext = {
    daysSinceContact: daysSince(lastContactAt),
    touchpointCount: tps.length,
    recentTouchpoints: tps.filter((t) => t.occurred_at >= recentIso).length,
    reportsSent: ofType("report_sent"),
    reportsOpened: ofType("report_opened"),
    meetingsCount: (meetings.data ?? []).length,
    callsCount: ofType("phone_call"),
    positiveResponses: tps.filter((t) => t.sentiment === "positive").length,
    negativeResponses: tps.filter((t) => t.sentiment === "negative").length,
    openCommitments: commitRows.filter((c) => c.status === "open").length,
    brokenCommitments: commitRows.filter((c) => c.status === "broken").length,
    fulfilledCommitments: commitRows.filter((c) => c.status === "fulfilled").length,
    propertiesCount: propRows.length,
    activePropertiesCount: propRows.filter((p) => ACTIVE_STATUSES.includes(p.status as string)).length,
    hasPricingConflict:
      riskRows.some((r) => r.risk_type === "pricing_conflict") ||
      tps.some((t) => t.touchpoint_type === "pricing_discussion" && t.sentiment === "negative") ||
      (s360?.minimum_price != null && s360?.desired_price != null && s360.minimum_price > s360.desired_price),
    cooperationScore: s360?.cooperation_score ?? 50,
    allowsMarketing: s360?.allows_marketing ?? true,
    availableForShowings: s360?.available_for_showings ?? true,
    hasSignedAgreement: s360?.has_signed_agreement ?? false,
    urgencyCritical: s360?.urgency_level === "critical",
    decisionHesitant: s360?.decision_style === "hesitant",
    openRisks: [],
  };

  return {
    ctx,
    lastContactAt,
    metrics: {
      meetings_count: ctx.meetingsCount,
      calls_count: ctx.callsCount,
      reports_sent_count: ctx.reportsSent,
      reports_opened_count: ctx.reportsOpened,
      properties_count: ctx.propertiesCount,
      active_properties_count: ctx.activePropertiesCount,
    },
  };
}

async function loadSellerOrg(sellerId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("sellers").select("org_id").eq("id", sellerId).maybeSingle();
  return data?.org_id ?? null;
}

export async function generateSellerMissions(orgId: string, sellerId: string): Promise<void> {
  const rows = defaultSellerMissions().map((m) => ({
    org_id: orgId,
    seller_id: sellerId,
    title: m.title,
    description: m.description,
    target_metric: m.targetMetric,
    target_value: m.targetValue,
    due_date: inDays(m.dueInDays),
    priority: m.priority,
    status: "active",
  }));
  await sellerMissionRepository.insertMany(rows);
  await logActivityEvent({ eventType: "seller.mission_created", entityType: "seller", entityId: sellerId, title: `נוצרו ${rows.length} משימות מוכר` });
}

export async function generateSellerRisks(orgId: string, sellerId: string, ctx: SellerScoreContext): Promise<SellerRiskRow[]> {
  await sellerRiskRepository.clearOpen(sellerId);
  const rows = detectSellerRisks(ctx).map((r) => ({
    org_id: orgId,
    seller_id: sellerId,
    risk_type: r.riskType,
    severity: r.severity,
    title: r.title,
    description: r.description,
    recommended_action: r.recommendedAction,
    status: "open",
  }));
  await sellerRiskRepository.insertMany(rows);
  if (rows.length) {
    await logActivityEvent({ eventType: "seller.risk_created", entityType: "seller", entityId: sellerId, title: `זוהו ${rows.length} סיכוני מוכר`, priority: "high" });
  }
  return sellerRiskRepository.listOpen(sellerId);
}

export async function updateSellerScores(sellerId: string): Promise<SellerScoreSet> {
  const prev = await sellerIntelligenceRepository.getBySeller(sellerId);
  const orgId = prev?.org_id ?? (await loadSellerOrg(sellerId));
  if (!orgId) throw new Error("seller org not found");

  const { ctx, lastContactAt, metrics } = await gatherSellerContext(sellerId);
  const openRisks = await generateSellerRisks(orgId, sellerId, ctx);
  ctx.openRisks = openRisks.map((r) => ({ severity: r.severity }));

  const scores = computeAllSellerScores(ctx);
  const actions = nextBestSellerActions(ctx);
  const status = churnLevel(scores.churnRisk);
  const topRisks = openRisks.slice(0, 3).map((r) => r.title).join(", ") || "אין סיכונים פעילים";

  await sellerIntelligenceRepository.update(sellerId, {
    seller_health_score: scores.health,
    seller_trust_score: scores.trust,
    seller_engagement_score: scores.engagement,
    seller_confidence_score: scores.confidence,
    seller_satisfaction_score: scores.satisfaction,
    seller_churn_risk_score: scores.churnRisk,
    seller_response_score: scores.response,
    seller_relationship_score: scores.relationship,
    current_status: status,
    last_contact_at: lastContactAt,
    days_since_last_contact: ctx.daysSinceContact,
    next_best_action: actions[0]?.title ?? null,
    intelligence_summary: `מצב: ${status} · אמון ${scores.trust} · מעורבות ${scores.engagement} · סיכון נטישה ${scores.churnRisk}`,
    trust_trend: prev ? trend(prev.seller_trust_score, scores.trust) : "flat",
    engagement_trend: prev ? trend(prev.seller_engagement_score, scores.engagement) : "flat",
    satisfaction_trend: prev ? trend(prev.seller_satisfaction_score, scores.satisfaction) : "flat",
    ai_summary: `הקשר עם המוכר במצב "${status}". אמון ${scores.trust}/100, מעורבות ${scores.engagement}/100, ביטחון ${scores.confidence}/100.`,
    ai_risk_summary: `סיכונים מרכזיים: ${topRisks}.`,
    ai_opportunity_summary: `הפעולה המומלצת ביותר: ${actions[0]?.title ?? "—"} (השפעת אמון +${actions[0]?.trustImpact ?? 0}).`,
    ...metrics,
    last_calculated_at: new Date().toISOString(),
  });

  await logActivityEvent({ eventType: "seller.score_changed", entityType: "seller", entityId: sellerId, title: "ציוני המוכר עודכנו", description: `אמון ${scores.trust} · סיכון נטישה ${scores.churnRisk}` });
  return scores;
}

export async function initializeSellerIntelligence(sellerId: string): Promise<SellerProfileRow> {
  const existing = await sellerIntelligenceRepository.getBySeller(sellerId);
  if (existing) {
    await updateSellerScores(sellerId);
    return (await sellerIntelligenceRepository.getBySeller(sellerId))!;
  }
  const orgId = await loadSellerOrg(sellerId);
  if (!orgId) throw new Error("seller org not found");

  await sellerIntelligenceRepository.create({ org_id: orgId, seller_id: sellerId, current_status: "stable", current_stage: "active" });
  await generateSellerMissions(orgId, sellerId);
  await updateSellerScores(sellerId);
  await logActivityEvent({ eventType: "seller.intelligence_initialized", entityType: "seller", entityId: sellerId, title: "ZONO Seller Intelligence הופעל" });
  return (await sellerIntelligenceRepository.getBySeller(sellerId))!;
}

export async function recalculateSellerIntelligence(sellerId: string): Promise<void> {
  await updateSellerScores(sellerId);
}

// ── Command Center ───────────────────────────────────────────────────────────
export interface SellerActiveProperty {
  id: string;
  title: string;
  status: string;
}
export interface SellerCommandCenter {
  profile: SellerProfileRow;
  missions: SellerMissionRow[];
  risks: SellerRiskRow[];
  touchpoints: SellerTouchpointRow[];
  commitments: SellerCommitmentRow[];
  properties: SellerActiveProperty[];
  timeline: Database["public"]["Tables"]["activity_events"]["Row"][];
  actions: SellerActionSeed[];
}

export async function getSellerCommandCenter(sellerId: string): Promise<SellerCommandCenter | null> {
  const profile = await sellerIntelligenceRepository.getBySeller(sellerId);
  if (!profile) return null;
  const supabase = await createClient();
  const [missions, risks, touchpoints, commitments, propsRes, timeline, gathered] = await Promise.all([
    sellerMissionRepository.listBySeller(sellerId),
    sellerRiskRepository.listBySeller(sellerId),
    sellerTouchpointRepository.listBySeller(sellerId),
    sellerCommitmentRepository.listBySeller(sellerId),
    supabase.from("properties").select("id,title,status").eq("seller_id", sellerId).limit(50),
    getEntityTimeline("seller", sellerId, 50),
    gatherSellerContext(sellerId),
  ]);
  return {
    profile,
    missions,
    risks,
    touchpoints,
    commitments,
    properties: (propsRes.data ?? []) as SellerActiveProperty[],
    timeline,
    actions: nextBestSellerActions(gathered.ctx),
  };
}

// ── Dashboard board ──────────────────────────────────────────────────────────
export interface SellerBoardItem {
  sellerId: string;
  name: string;
  meta: string;
}
export interface SellerBoard {
  needingAttention: SellerBoardItem[];
  highChurn: SellerBoardItem[];
  lowTrust: SellerBoardItem[];
  noContact: SellerBoardItem[];
  upcomingCommitments: SellerBoardItem[];
  trustChanges: SellerBoardItem[];
  total: number;
}

export async function listSellerBoard(): Promise<SellerBoard> {
  const supabase = await createClient();
  const [profiles, sellersRes, commitsRes] = await Promise.all([
    sellerIntelligenceRepository.listForOrg(),
    supabase.from("sellers").select("id,full_name"),
    supabase
      .from("seller_commitments")
      .select("seller_id,title,due_date,status")
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(8),
  ]);
  const names = new Map((sellersRes.data ?? []).map((s) => [s.id, s.full_name]));
  const name = (id: string) => names.get(id) ?? "מוכר";
  const item = (p: SellerProfileRow, meta: string): SellerBoardItem => ({ sellerId: p.seller_id, name: name(p.seller_id), meta });

  return {
    needingAttention: profiles.filter((p) => p.seller_churn_risk_score >= 50 || p.seller_health_score < 45).sort((a, b) => b.seller_churn_risk_score - a.seller_churn_risk_score).slice(0, 6).map((p) => item(p, `סיכון ${p.seller_churn_risk_score}`)),
    highChurn: profiles.filter((p) => p.seller_churn_risk_score >= 60).sort((a, b) => b.seller_churn_risk_score - a.seller_churn_risk_score).slice(0, 6).map((p) => item(p, `${p.seller_churn_risk_score}`)),
    lowTrust: profiles.filter((p) => p.seller_trust_score < 45).sort((a, b) => a.seller_trust_score - b.seller_trust_score).slice(0, 6).map((p) => item(p, `אמון ${p.seller_trust_score}`)),
    noContact: profiles.filter((p) => p.days_since_last_contact == null || p.days_since_last_contact >= 21).slice(0, 6).map((p) => item(p, p.days_since_last_contact == null ? "אין קשר" : `${p.days_since_last_contact} ימים`)),
    upcomingCommitments: (commitsRes.data ?? []).map((c) => ({ sellerId: c.seller_id, name: name(c.seller_id), meta: c.due_date ? new Date(c.due_date).toLocaleDateString("he-IL") : c.title })),
    trustChanges: profiles.filter((p) => p.trust_trend !== "flat").slice(0, 6).map((p) => item(p, p.trust_trend === "up" ? "▲ אמון" : "▼ אמון")),
    total: profiles.length,
  };
}
