/**
 * decisionIntelligenceService — ZONO's Executive Brain (server-only).
 *
 * Aggregates Property Intelligence + Seller Intelligence + activity/commitment
 * signals into ranked attention items, opportunities, a priority queue and
 * recommendations, plus an org-level decision profile. Fully deterministic.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import {
  calculateAttentionScore,
  calculateChurnImpactScore,
  calculateImpactScore,
  calculateRelationshipImpactScore,
  calculateRevenueImpactScore,
  calculateUrgencyScore,
} from "./scoring";
import {
  attentionRepository,
  decisionIntelligenceRepository,
  decisionQueueRepository,
  opportunityRepository,
  recommendationRepository,
  type AttentionItemRow,
  type DecisionProfileRow,
  type OpportunityRow,
  type QueueRow,
  type RecommendationRow,
} from "./repository";

type AttentionInsert = Database["public"]["Tables"]["attention_items"]["Insert"];
type OppInsert = Database["public"]["Tables"]["opportunity_signals"]["Insert"];
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const ACTIVE = ["active", "published", "ready", "under_offer", "in_contract"];

async function currentOrgId(): Promise<string> {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile.org_id;
}

interface OrgData {
  propProfiles: { property_id: string; health_score: number; success_score: number; risk_score: number; marketing_score: number; exposure_score: number; momentum_score: number }[];
  propMap: Map<string, { title: string; price: number | null; status: string; seller_id: string | null }>;
  sellerProfiles: { seller_id: string; seller_trust_score: number; seller_churn_risk_score: number; seller_health_score: number; days_since_last_contact: number | null }[];
  sellerMap: Map<string, string>;
  activePropCountBySeller: Map<string, number>;
  overdueTasks: number;
  overdueCommitments: { seller_id: string; title: string }[];
}

async function gatherOrgData(): Promise<OrgData> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  const [pp, props, sp, sellers, tasks, commits] = await Promise.all([
    supabase.from("property_intelligence_profiles").select("property_id,health_score,success_score,risk_score,marketing_score,exposure_score,momentum_score"),
    supabase.from("properties").select("id,title,price,status,seller_id").neq("status", "archived"),
    supabase.from("seller_intelligence_profiles").select("seller_id,seller_trust_score,seller_churn_risk_score,seller_health_score,days_since_last_contact"),
    supabase.from("sellers").select("id,full_name"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).neq("status", "done").not("due_at", "is", null).lt("due_at", nowIso),
    supabase.from("seller_commitments").select("seller_id,title,due_date").eq("status", "open").not("due_date", "is", null).lt("due_date", nowIso),
  ]);

  const propMap = new Map((props.data ?? []).map((p) => [p.id, { title: p.title, price: p.price, status: p.status as string, seller_id: p.seller_id }]));
  const activePropCountBySeller = new Map<string, number>();
  for (const p of props.data ?? []) {
    if (p.seller_id && ACTIVE.includes(p.status as string)) activePropCountBySeller.set(p.seller_id, (activePropCountBySeller.get(p.seller_id) ?? 0) + 1);
  }
  return {
    propProfiles: pp.data ?? [],
    propMap,
    sellerProfiles: sp.data ?? [],
    sellerMap: new Map((sellers.data ?? []).map((s) => [s.id, s.full_name])),
    activePropCountBySeller,
    overdueTasks: tasks.count ?? 0,
    overdueCommitments: (commits.data ?? []).map((c) => ({ seller_id: c.seller_id, title: c.title })),
  };
}

// ── Attention ────────────────────────────────────────────────────────────────
function buildAttentionRows(orgId: string, d: OrgData): AttentionInsert[] {
  const rows: AttentionInsert[] = [];

  for (const p of d.propProfiles) {
    const info = d.propMap.get(p.property_id);
    if (!info) continue;
    const seller = info.seller_id ? d.sellerProfiles.find((s) => s.seller_id === info.seller_id) : undefined;
    let severity = "low", urgency = 0, reason = "", action = "";
    if (p.risk_score >= 60) { severity = "high"; urgency = 78; reason = "סיכונים פעילים בנכס"; action = "טפל בסיכונים במרכז ניהול הנכס"; }
    else if (p.momentum_score < 40) { severity = "medium"; urgency = 70; reason = "מומנטום נמוך — אין מספיק פעילות"; action = "בצע מנוף צמיחה או קדם שלב"; }
    else if (p.marketing_score < 45) { severity = "medium"; urgency = 48; reason = "ציון שיווק נמוך"; action = "השלם חומרי שיווק"; }
    else continue;

    const revenueImpact = calculateRevenueImpactScore({ price: info.price });
    const relationshipImpact = calculateRelationshipImpactScore({ trust: seller?.seller_trust_score, churn: seller?.seller_churn_risk_score });
    const churnImpact = calculateChurnImpactScore({ churnRisk: seller?.seller_churn_risk_score });
    const urgencyScore = calculateUrgencyScore({ overdue: p.momentum_score < 40, churnRisk: seller?.seller_churn_risk_score, severity });
    const u = clamp((urgency + urgencyScore) / 2);
    const impact = calculateImpactScore({ revenueImpact, relationshipImpact, churnImpact });
    rows.push({
      org_id: orgId, entity_type: "property", entity_id: p.property_id,
      attention_score: calculateAttentionScore({ urgency: u, impact, confidence: 75 }),
      urgency_score: u, impact_score: impact, confidence_score: 75,
      revenue_impact_score: revenueImpact, relationship_impact_score: relationshipImpact, churn_impact_score: churnImpact,
      title: info.title, reason, recommended_action: action, expected_outcome: "האצת המכירה והקטנת סיכון", status: "open",
    });
  }

  for (const s of d.sellerProfiles) {
    const churn = s.seller_churn_risk_score;
    const trust = s.seller_trust_score;
    const days = s.days_since_last_contact;
    if (!(churn >= 50 || trust < 45 || (days ?? 0) >= 21)) continue;
    const severity = churn >= 75 ? "critical" : churn >= 50 ? "high" : "medium";
    const revenueImpact = calculateRevenueImpactScore({ activeProperties: d.activePropCountBySeller.get(s.seller_id) ?? 0 });
    const relationshipImpact = calculateRelationshipImpactScore({ trust, churn });
    const u = calculateUrgencyScore({ daysSinceActivity: days, churnRisk: churn, severity });
    const impact = calculateImpactScore({ revenueImpact, relationshipImpact, churnImpact: churn });
    rows.push({
      org_id: orgId, entity_type: "seller", entity_id: s.seller_id,
      attention_score: calculateAttentionScore({ urgency: u, impact, confidence: 80 }),
      urgency_score: u, impact_score: impact, confidence_score: 80,
      revenue_impact_score: revenueImpact, relationship_impact_score: relationshipImpact, churn_impact_score: churn,
      title: d.sellerMap.get(s.seller_id) ?? "מוכר",
      reason: churn >= 50 ? `סיכון נטישה ${churn}` : trust < 45 ? `אמון נמוך ${trust}` : `אין קשר ${days} ימים`,
      recommended_action: "התקשר למוכר / שלח דוח עדכון", expected_outcome: "שימור בלעדיות וחיזוק אמון", status: "open",
    });
  }

  for (const c of d.overdueCommitments) {
    rows.push({
      org_id: orgId, entity_type: "seller", entity_id: c.seller_id,
      attention_score: 82, urgency_score: 88, impact_score: 70, confidence_score: 90,
      revenue_impact_score: 50, relationship_impact_score: 80, churn_impact_score: 60,
      title: `${d.sellerMap.get(c.seller_id) ?? "מוכר"} · התחייבות באיחור`,
      reason: `התחייבות לא קוימה: ${c.title}`, recommended_action: "השלם את ההתחייבות מיד", expected_outcome: "מניעת ירידת אמון", status: "open",
    });
  }

  return rows.sort((a, b) => (b.attention_score ?? 0) - (a.attention_score ?? 0));
}

function buildOpportunityRows(orgId: string, d: OrgData): OppInsert[] {
  const rows: OppInsert[] = [];
  for (const p of d.propProfiles) {
    const info = d.propMap.get(p.property_id);
    if (!info) continue;
    const revenue = calculateRevenueImpactScore({ price: info.price });
    if (p.marketing_score < 60)
      rows.push({ org_id: orgId, entity_type: "property", entity_id: p.property_id, opportunity_score: clamp((100 - p.marketing_score) * 0.6 + revenue * 0.4), impact_score: revenue, confidence_score: 75, title: `${info.title} · רענון שיווק`, description: "הוספת וידאו / תמונות / תיאור משפרת פניות.", recommended_action: "הוסף וידאו ורענן חומרי שיווק", status: "open" });
    if (p.exposure_score < 50)
      rows.push({ org_id: orgId, entity_type: "property", entity_id: p.property_id, opportunity_score: clamp((100 - p.exposure_score) * 0.5 + revenue * 0.5), impact_score: revenue, confidence_score: 70, title: `${info.title} · הרחבת חשיפה`, description: "פרסום בערוץ נוסף יגדיל פניות.", recommended_action: "הוסף ערוץ חשיפה חדש", status: "open" });
  }
  for (const s of d.sellerProfiles) {
    if (s.seller_trust_score >= 70 && (d.activePropCountBySeller.get(s.seller_id) ?? 0) > 0)
      rows.push({ org_id: orgId, entity_type: "seller", entity_id: s.seller_id, opportunity_score: 60, impact_score: 60, confidence_score: 70, title: `${d.sellerMap.get(s.seller_id) ?? "מוכר"} · חיזוק שותפות`, description: "מוכר באמון גבוה — הזדמנות להרחבת שיתוף פעולה.", recommended_action: "קבע פגישת אסטרטגיה לשימור", status: "open" });
  }
  return rows.sort((a, b) => (b.opportunity_score ?? 0) - (a.opportunity_score ?? 0)).slice(0, 20);
}

// ── Orchestration ────────────────────────────────────────────────────────────
export async function recalculateOrganizationDecisionBrain(): Promise<void> {
  const orgId = await currentOrgId();
  await decisionIntelligenceRepository.ensure(orgId);
  const d = await gatherOrgData();

  const attentionRows = buildAttentionRows(orgId, d);
  const oppRows = buildOpportunityRows(orgId, d);

  await attentionRepository.clearOpen(orgId);
  await attentionRepository.insertMany(attentionRows);
  await opportunityRepository.clear(orgId);
  await opportunityRepository.insertMany(oppRows);

  // Priority queue: attention items + (discounted) opportunities, ranked.
  type Cand = { entity_type: string; entity_id: string; priority: number; title: string; reason: string; action_type: string; impact: string };
  const cands: Cand[] = [
    ...attentionRows.map((a) => ({ entity_type: a.entity_type, entity_id: a.entity_id, priority: a.attention_score ?? 0, title: a.title, reason: a.reason ?? "", action_type: "attention", impact: a.recommended_action ?? "" })),
    ...oppRows.map((o) => ({ entity_type: o.entity_type, entity_id: o.entity_id, priority: clamp((o.opportunity_score ?? 0) * 0.8), title: o.title, reason: o.description ?? "", action_type: "opportunity", impact: o.recommended_action ?? "" })),
  ].sort((x, y) => y.priority - x.priority).slice(0, 25);

  await decisionQueueRepository.clear(orgId);
  await decisionQueueRepository.insertMany(cands.map((c, i) => ({
    org_id: orgId, entity_type: c.entity_type, entity_id: c.entity_id, priority_score: c.priority, rank_position: i + 1,
    title: c.title, reason: c.reason, action_type: c.action_type, action_payload: {} as never, expected_impact: c.impact, status: "open",
  })));

  await recommendationRepository.clear(orgId);
  await recommendationRepository.insertMany(cands.slice(0, 8).map((c) => ({
    org_id: orgId, entity_type: c.entity_type, entity_id: c.entity_id, recommendation_type: c.action_type,
    title: c.impact || c.title, description: c.reason, urgency_score: c.priority, impact_score: c.priority, confidence_score: 75,
    expected_result: c.action_type === "opportunity" ? "הגדלת פוטנציאל הכנסה" : "הקטנת סיכון והאצת ביצוע",
  })));

  // Org scores + metrics + decision outputs.
  const activeProperties = [...d.propMap.values()].filter((p) => ACTIVE.includes(p.status)).length;
  const highRiskProperties = d.propProfiles.filter((p) => p.risk_score >= 60).length;
  const stalledProperties = d.propProfiles.filter((p) => p.momentum_score < 40).length;
  const highRiskSellers = d.sellerProfiles.filter((s) => s.seller_churn_risk_score >= 60).length;
  const stalledSellers = d.sellerProfiles.filter((s) => (s.days_since_last_contact ?? 0) >= 21).length;
  const activeSellers = d.sellerProfiles.length;

  const health = clamp(avg([avg(d.propProfiles.map((p) => p.success_score)), avg(d.sellerProfiles.map((s) => s.seller_health_score))].filter((n) => n > 0)));
  const risk = clamp(avg([avg(d.propProfiles.map((p) => p.risk_score)), avg(d.sellerProfiles.map((s) => s.seller_churn_risk_score))]));
  const growth = clamp(avg([avg(d.propProfiles.map((p) => p.momentum_score)), avg(d.propProfiles.map((p) => p.exposure_score))]));
  const execution = clamp(100 - Math.min(100, d.overdueTasks * 10 + d.overdueCommitments.length * 15));
  const attentionScore = clamp(avg(attentionRows.slice(0, 5).map((a) => a.attention_score ?? 0)));
  const revenue = clamp(avg([...d.propMap.values()].filter((p) => ACTIVE.includes(p.status)).map((p) => calculateRevenueImpactScore({ price: p.price }))));

  const top = cands[0];
  await decisionIntelligenceRepository.update(orgId, {
    organization_health_score: health, organization_risk_score: risk, organization_growth_score: growth,
    organization_execution_score: execution, organization_attention_score: attentionScore, organization_revenue_score: revenue,
    active_properties: activeProperties, active_sellers: activeSellers,
    high_risk_properties: highRiskProperties, high_risk_sellers: highRiskSellers,
    stalled_properties: stalledProperties, stalled_sellers: stalledSellers,
    overdue_tasks: d.overdueTasks, overdue_commitments: d.overdueCommitments.length,
    top_priority_entity_id: top?.entity_id ?? null, top_priority_entity_type: top?.entity_type ?? null, top_priority_reason: top?.reason ?? null,
    executive_summary: `${activeProperties} נכסים פעילים · ${highRiskProperties} בסיכון · ${attentionRows.length} פריטים דורשים תשומת לב.`,
    risk_summary: `${highRiskProperties} נכסים ו-${highRiskSellers} מוכרים בסיכון גבוה · ${d.overdueCommitments.length} התחייבויות באיחור.`,
    growth_summary: oppRows[0] ? `הזדמנות מובילה: ${oppRows[0].title}.` : "אין הזדמנויות פתוחות כרגע.",
    next_best_business_action: top?.impact || top?.title || "אין פעולה דחופה",
    last_calculated_at: new Date().toISOString(),
  });
}

export async function initializeOrganizationDecisionBrain(): Promise<void> {
  const orgId = await currentOrgId();
  await decisionIntelligenceRepository.ensure(orgId);
  await recalculateOrganizationDecisionBrain();
}

// individual generators (exposed per spec; recalc runs them together)
export async function generateAttentionItems(): Promise<void> { await recalculateOrganizationDecisionBrain(); }
export async function generateOpportunitySignals(): Promise<void> { await recalculateOrganizationDecisionBrain(); }
export async function generateDecisionQueue(): Promise<void> { await recalculateOrganizationDecisionBrain(); }
export async function generateRecommendations(): Promise<void> { await recalculateOrganizationDecisionBrain(); }

// ── Read models ──────────────────────────────────────────────────────────────
export interface ExecutiveCommandCenter {
  profile: DecisionProfileRow | null;
  attention: AttentionItemRow[];
  opportunities: OpportunityRow[];
  queue: QueueRow[];
  recommendations: RecommendationRow[];
  upcomingCommitments: { id: string; title: string; due: string | null; sellerName: string }[];
}

export async function getExecutiveCommandCenter(): Promise<ExecutiveCommandCenter> {
  const orgId = await currentOrgId();
  const supabase = await createClient();
  const [profile, attention, opportunities, queue, recommendations, commitsRes, sellersRes] = await Promise.all([
    decisionIntelligenceRepository.get(orgId),
    attentionRepository.listOpen(),
    opportunityRepository.list(),
    decisionQueueRepository.list(),
    recommendationRepository.list(),
    supabase.from("seller_commitments").select("id,seller_id,title,due_date").eq("status", "open").order("due_date", { ascending: true, nullsFirst: false }).limit(8),
    supabase.from("sellers").select("id,full_name"),
  ]);
  const names = new Map((sellersRes.data ?? []).map((s) => [s.id, s.full_name]));
  return {
    profile,
    attention,
    opportunities,
    queue,
    recommendations,
    upcomingCommitments: (commitsRes.data ?? []).map((c) => ({ id: c.id, title: c.title, due: c.due_date, sellerName: names.get(c.seller_id) ?? "מוכר" })),
  };
}

export interface FocusItem {
  entityType: string;
  entityId: string;
  title: string;
  why: string;
  action: string;
  priority: number;
}

export async function getTodaysFocus(): Promise<FocusItem[]> {
  const queue = await decisionQueueRepository.list();
  return queue.slice(0, 5).map((q) => ({
    entityType: q.entity_type,
    entityId: q.entity_id,
    title: q.title,
    why: q.reason ?? "",
    action: q.expected_impact ?? "",
    priority: q.priority_score,
  }));
}
