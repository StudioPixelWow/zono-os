// ============================================================================
// ZONO — Journey Intelligence OS · Service (server-only)
// ----------------------------------------------------------------------------
// Maintains a living journey per buyer/seller/lead. Consumes Communication
// Intelligence (events, objections, engagement), Buyer/Seller Intelligence
// (scores) and Deals (value) WITHOUT rebuilding them. Deterministic recompute
// of scores, velocity, blockers, predictions and milestones. Feeds Decision
// Brain + Automation via additive signals only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Json } from "@/lib/supabase/types";
import {
  stagesFor, stageDef, stageLabel, stageProgress, computeVelocity, expectedStageDays, computeScores,
  detectBlockers, predict, milestonesFor, milestonesReachedByStage, isReady, nextBestAction, aiSummary,
  VELOCITY_LABELS, BLOCKER_LABELS, type JourneyScores, type VelocityState,
} from "./engine";

const DAY = 86_400_000;
const daysSince = (iso: string | null) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : null);
const COMMISSION_RATE = 0.02;

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default */ }
  return { userId: user.id, orgId: profile.org_id, isManager, supabase };
}
type DB = Awaited<ReturnType<typeof createClient>>;

async function entityLabel(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<string> {
  const table = entityType === "seller" ? "sellers" : entityType === "buyer" ? "buyers" : entityType === "lead" ? "leads" : null;
  if (!table) return "לקוח";
  try { const { data } = await supabase.from(table).select("full_name").eq("org_id", orgId).eq("id", entityId).maybeSingle(); return (data as { full_name?: string } | null)?.full_name ?? "לקוח"; } catch { return "לקוח"; }
}

// ── DTOs ─────────────────────────────────────────────────────────────────────
export interface JourneyCard {
  id: string; journey_type: string; entity_type: string; entity_id: string; label: string; current_stage: string; stage_label: string;
  progress: number; health_score: number; conversion_score: number; risk_score: number; velocity_state: string; velocity_label: string;
  status: string; next_best_action: string | null; probability_convert: number | null; expected_commission: number | null; days_since_activity: number | null;
}
export interface RiskCard { id: string; entity_type: string; entity_id: string; label: string; risk_type: string; severity: string; score: number; reason: string | null; recommended_action: string | null }
export interface OppCard { id: string; entity_type: string; entity_id: string; label: string; opportunity_type: string; score: number; reason: string | null; recommended_action: string | null }
export interface MilestoneCard { entity_type: string; entity_id: string; label: string; milestone_label: string; reached: boolean; reached_at: string | null }
export interface JourneyKpis { readyBuyers: number; readySellers: number; stuckJourneys: number; journeyRisks: number; journeyOpportunities: number; activeJourneys: number; expectedCommission: number }
export interface JourneyAnalytics { byStageBuyer: { stage: string; label: string; count: number }[]; byStageSeller: { stage: string; label: string; count: number }[]; avgConversion: number; avgHealth: number }
export interface JourneyCommandCenter {
  kpis: JourneyKpis; buyers: JourneyCard[]; sellers: JourneyCard[]; stuck: JourneyCard[]; ready: JourneyCard[];
  risks: RiskCard[]; opportunities: OppCard[]; milestones: MilestoneCard[]; analytics: JourneyAnalytics; isManager: boolean;
}

// ── ensure + advance ────────────────────────────────────────────────────────
export async function ensureJourney(entityType: string, entityId: string, journeyType?: string): Promise<{ id: string }> {
  const { orgId, supabase } = await ctx();
  const jType = journeyType ?? (entityType === "seller" ? "seller" : "buyer");
  const { data: existing } = await supabase.from("journeys").select("id").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle();
  if (existing) return { id: (existing as { id: string }).id };
  const firstStage = stagesFor(jType)[0].key;
  const { data, error } = await supabase.from("journeys").insert({ org_id: orgId, journey_type: jType, entity_type: entityType, entity_id: entityId, current_stage: firstStage }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "יצירת המסע נכשלה");
  const id = (data as { id: string }).id;
  await seedMilestones(supabase, orgId, id, jType, entityType, entityId);
  await recomputeJourney(supabase, orgId, id);
  return { id };
}

async function seedMilestones(supabase: DB, orgId: string, journeyId: string, journeyType: string, entityType: string, entityId: string) {
  const rows = milestonesFor(journeyType).map((m) => ({ org_id: orgId, journey_id: journeyId, entity_type: entityType, entity_id: entityId, milestone_key: m.key, label: m.label, reached: false }));
  try { await supabase.from("journey_milestones").insert(rows); } catch { /* best-effort */ }
}

export async function advanceStage(journeyId: string, toStage: string): Promise<void> {
  const { orgId, supabase } = await ctx();
  const { data: j } = await supabase.from("journeys").select("journey_type,current_stage,stage_history,entity_type,entity_id").eq("org_id", orgId).eq("id", journeyId).maybeSingle();
  const row = j as { journey_type: string; current_stage: string; stage_history: Json; entity_type: string; entity_id: string } | null;
  if (!row) throw new Error("המסע לא נמצא");
  const def = stageDef(row.journey_type, toStage);
  if (!def) throw new Error("שלב לא חוקי");
  const fromStage = row.current_stage;
  const history = Array.isArray(row.stage_history) ? [...(row.stage_history as unknown[])] : [];
  history.push({ from: fromStage, to: toStage, at: new Date().toISOString() });
  const status = def.terminal ? (def.won ? "completed" : "dropped") : "active";
  await supabase.from("journeys").update({ current_stage: toStage, stage_entered_at: new Date().toISOString(), last_activity_at: new Date().toISOString(), status, stage_history: history.slice(-50) as Json }).eq("org_id", orgId).eq("id", journeyId);
  await supabase.from("journey_events").insert({ org_id: orgId, journey_id: journeyId, entity_type: row.entity_type, entity_id: row.entity_id, event_type: "stage_change", from_stage: fromStage, to_stage: toStage, title: `מעבר ל${stageLabel(row.journey_type, toStage)}` });
  await recomputeJourney(supabase, orgId, journeyId);
}

// ── recompute one journey ─────────────────────────────────────────────────────
export async function recomputeJourney(supabase: DB, orgId: string, journeyId: string): Promise<void> {
  const { data: j } = await supabase.from("journeys").select("*").eq("org_id", orgId).eq("id", journeyId).maybeSingle();
  const jr = j as Record<string, unknown> | null;
  if (!jr) return;
  const journeyType = jr.journey_type as string;
  const entityType = jr.entity_type as string;
  const entityId = jr.entity_id as string;
  const stageKey = jr.current_stage as string;

  // last activity from communication_events (fallback to journey last_activity_at)
  const { data: lastEv } = await supabase.from("communication_events").select("occurred_at").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).order("occurred_at", { ascending: false }).limit(1).maybeSingle();
  const lastActivityAt = (lastEv as { occurred_at?: string } | null)?.occurred_at ?? (jr.last_activity_at as string);
  const { count: commCount } = await supabase.from("communication_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId);

  // engagement from client_memory
  let engagementSignal = 50;
  try { const { data: cm } = await supabase.from("client_memory").select("engagement_score").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle(); engagementSignal = (cm as { engagement_score?: number } | null)?.engagement_score ?? 50; } catch { /* default */ }

  // open communication objections → blockers source
  const { data: objs } = await supabase.from("communication_objections").select("objection_type").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("resolved", false);
  const objectionTypes = ((objs ?? []) as { objection_type: string }[]).map((o) => o.objection_type);

  // open communication risks count
  const { count: commRisks } = await supabase.from("communication_risks").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("status", "open");

  // velocity inputs
  const daysInStage = daysSince(jr.stage_entered_at as string) ?? 0;
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();
  const { count: changes30 } = await supabase.from("journey_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("journey_id", journeyId).eq("event_type", "stage_change").gte("occurred_at", since30);
  const history = Array.isArray(jr.stage_history) ? (jr.stage_history as { from?: string; to?: string }[]) : [];
  const regressed = detectRegression(journeyType, history);
  const exp = expectedStageDays(journeyType, stageKey);
  const velocity = computeVelocity({ daysInStage, stageChanges30d: changes30 ?? 0, regressed, expectedStageDays: exp });

  // unanswered outbound (rough)
  const { count: outbound } = await supabase.from("communication_events").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).eq("direction", "outbound");
  const unanswered = (daysSince(lastActivityAt) ?? 0) > 3 ? Math.min(5, outbound ?? 0) : 0;

  const leadScore = await fetchLeadScore(supabase, orgId, entityType, entityId);
  const lowEngagement = engagementSignal < 35;

  const blockers = detectBlockers({ objectionTypes, daysSinceActivity: daysSince(lastActivityAt), unansweredOutbound: unanswered, journeyType, stageKey, hasInventoryGap: false, lowEngagement });

  const scores: JourneyScores = computeScores({
    journeyType, stageKey, daysSinceActivity: daysSince(lastActivityAt), engagementSignal,
    openBlockers: blockers.length, openRisks: commRisks ?? 0, positiveMomentum: velocity.state === "fast", velocityScore: velocity.score, leadScore, commCount: commCount ?? 0,
  });

  const expectedDealValue = await fetchExpectedDealValue(supabase, orgId, entityType, entityId);
  const prediction = predict({ journeyType, stageKey, conversion: scores.conversion, risk: scores.risk, velocityScore: velocity.score, daysSinceActivity: daysSince(lastActivityAt), expectedDealValue, commissionRate: COMMISSION_RATE });

  const label = await entityLabel(supabase, orgId, entityType, entityId);
  const nba = nextBestAction(journeyType, stageKey, blockers, velocity.state);
  const summary = aiSummary(journeyType, label, stageKey, scores, velocity.state, prediction);

  // persist journey scores
  await supabase.from("journeys").update({
    progress: stageProgress(journeyType, stageKey), health_score: scores.health, engagement_score: scores.engagement,
    conversion_score: scores.conversion, risk_score: scores.risk, velocity_score: scores.velocity, velocity_state: velocity.state,
    last_activity_at: lastActivityAt, next_best_action: nba, ai_summary: summary,
  }).eq("org_id", orgId).eq("id", journeyId);

  // snapshot history
  await supabase.from("journey_scores").insert({ org_id: orgId, journey_id: journeyId, health_score: scores.health, engagement_score: scores.engagement, conversion_score: scores.conversion, risk_score: scores.risk, velocity_score: scores.velocity });

  // velocity row (replace latest)
  await supabase.from("journey_velocity").delete().eq("org_id", orgId).eq("journey_id", journeyId);
  await supabase.from("journey_velocity").insert({ org_id: orgId, journey_id: journeyId, entity_type: entityType, entity_id: entityId, velocity_state: velocity.state, days_in_stage: daysInStage, stage_changes_30d: changes30 ?? 0 });

  // prediction row (replace latest)
  await supabase.from("journey_predictions").delete().eq("org_id", orgId).eq("journey_id", journeyId);
  await supabase.from("journey_predictions").insert({ org_id: orgId, journey_id: journeyId, entity_type: entityType, entity_id: entityId, probability_convert: prediction.probabilityConvert, probability_drop: prediction.probabilityDrop, expected_days_to_convert: prediction.expectedDaysToConvert, expected_deal_value: prediction.expectedDealValue, expected_commission: prediction.expectedCommission });

  // blockers (replace open)
  await supabase.from("journey_blockers").delete().eq("org_id", orgId).eq("journey_id", journeyId).eq("resolved", false);
  if (blockers.length) await supabase.from("journey_blockers").insert(blockers.map((b) => ({ org_id: orgId, journey_id: journeyId, entity_type: entityType, entity_id: entityId, blocker_type: b.type, severity: b.severity, detail: BLOCKER_LABELS[b.type] })));

  // risks + opportunities snapshot (journey-level)
  await refreshRisksAndOpps(supabase, orgId, journeyId, entityType, entityId, journeyType, stageKey, scores, velocity.state, prediction, blockers.length);

  // milestones auto-reach by stage
  await reachMilestones(supabase, orgId, journeyId, entityType, entityId, journeyType, stageKey);
}

function detectRegression(journeyType: string, history: { from?: string; to?: string }[]): boolean {
  if (!history.length) return false;
  const last = history[history.length - 1];
  const fp = stageDef(journeyType, last.from ?? "")?.position ?? 0;
  const tp = stageDef(journeyType, last.to ?? "")?.position ?? 0;
  return tp > 0 && fp > 0 && tp < fp && !stageDef(journeyType, last.to ?? "")?.terminal;
}

async function refreshRisksAndOpps(supabase: DB, orgId: string, journeyId: string, entityType: string, entityId: string, journeyType: string, stageKey: string, scores: JourneyScores, velocity: VelocityState, prediction: { probabilityConvert: number }, blockerCount: number) {
  await supabase.from("journey_risks").delete().eq("org_id", orgId).eq("journey_id", journeyId).eq("status", "open");
  const risks: { risk_type: string; severity: string; score: number; reason: string; recommended_action: string }[] = [];
  if (velocity === "stuck") risks.push({ risk_type: "journey_stuck", severity: "high", score: Math.max(60, scores.risk), reason: `תקוע בשלב ${stageLabel(journeyType, stageKey)}`, recommended_action: "צור קשר יזום והסר חסמים" });
  if (velocity === "regression") risks.push({ risk_type: "journey_regression", severity: "high", score: 70, reason: "המסע נסוג לשלב קודם", recommended_action: "ברר מה השתנה והחזר אמון" });
  if (scores.risk >= 55) risks.push({ risk_type: "drop_risk", severity: scores.risk >= 70 ? "high" : "medium", score: scores.risk, reason: "סיכון נשירה גבוה", recommended_action: "התערבות אישית מיידית" });
  if (blockerCount >= 2) risks.push({ risk_type: "multiple_blockers", severity: "medium", score: 58, reason: `${blockerCount} חסמים פעילים`, recommended_action: "טפל בחסם הקריטי ביותר" });
  if (risks.length) await supabase.from("journey_risks").insert(risks.map((r) => ({ org_id: orgId, journey_id: journeyId, entity_type: entityType, entity_id: entityId, ...r, status: "open" })));

  await supabase.from("journey_opportunities").delete().eq("org_id", orgId).eq("journey_id", journeyId).eq("status", "open");
  const opps: { opportunity_type: string; score: number; reason: string; recommended_action: string }[] = [];
  if (isReady(journeyType, scores, stageKey)) opps.push({ opportunity_type: journeyType === "buyer" ? "buyer_ready" : "seller_ready", score: scores.conversion, reason: "בשל לסגירה — המרה גבוהה וסיכון נמוך", recommended_action: journeyType === "buyer" ? "הצע צעד סגירה (הצעה/חוזה)" : "קדם לחתימה/סגירה" });
  if (velocity === "fast" && scores.conversion >= 55) opps.push({ opportunity_type: "accelerating", score: clampNum(scores.conversion + 10), reason: "המסע מואץ", recommended_action: "נצל את המומנטום — קדם צעד מהותי" });
  if (prediction.probabilityConvert >= 75) opps.push({ opportunity_type: "high_conversion", score: prediction.probabilityConvert, reason: "סיכוי המרה גבוה מאוד", recommended_action: "תעדף את הלקוח הזה היום" });
  if (opps.length) await supabase.from("journey_opportunities").insert(opps.map((o) => ({ org_id: orgId, journey_id: journeyId, entity_type: entityType, entity_id: entityId, ...o, status: "open" })));
}
function clampNum(n: number) { return Math.max(0, Math.min(100, Math.round(n))); }

async function reachMilestones(supabase: DB, orgId: string, journeyId: string, entityType: string, entityId: string, journeyType: string, stageKey: string) {
  const reached = new Set(milestonesReachedByStage(journeyType, stageKey));
  const { data: ms } = await supabase.from("journey_milestones").select("id,milestone_key,reached").eq("org_id", orgId).eq("journey_id", journeyId);
  for (const m of (ms ?? []) as { id: string; milestone_key: string; reached: boolean }[]) {
    if (reached.has(m.milestone_key) && !m.reached) {
      await supabase.from("journey_milestones").update({ reached: true, reached_at: new Date().toISOString() }).eq("id", m.id);
      await supabase.from("journey_events").insert({ org_id: orgId, journey_id: journeyId, entity_type: entityType, entity_id: entityId, event_type: "milestone", title: `אבן דרך: ${m.milestone_key}` });
    }
  }
}

async function fetchLeadScore(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<number> {
  const table = entityType === "buyer" ? "buyer_intelligence_profiles" : entityType === "seller" ? "seller_intelligence_profiles" : null;
  if (!table) return 50;
  try { const { data } = await supabase.from(table).select("overall_score").eq("org_id", orgId).eq((entityType === "buyer" ? "buyer_id" : "seller_id") as never, entityId).maybeSingle(); return (data as { overall_score?: number } | null)?.overall_score ?? 50; } catch { return 50; }
}
async function fetchExpectedDealValue(supabase: DB, orgId: string, entityType: string, entityId: string): Promise<number | null> {
  try {
    const col = entityType === "buyer" ? "buyer_id" : entityType === "seller" ? "seller_id" : null;
    if (col) { const { data } = await supabase.from("deals").select("value").eq("org_id", orgId).eq(col as never, entityId).order("created_at", { ascending: false }).limit(1).maybeSingle(); const v = (data as { value?: number } | null)?.value; if (v) return v; }
  } catch { /* fall through */ }
  try { const { data } = await supabase.from("client_memory").select("budget").eq("org_id", orgId).eq("entity_type", entityType).eq("entity_id", entityId).maybeSingle(); const b = (data as { budget?: { amount?: number } } | null)?.budget; return b?.amount ?? null; } catch { return null; }
}

// ── recompute all (cron-friendly) ──────────────────────────────────────────────
export async function recomputeAllJourneys(): Promise<{ journeys: number }> {
  const { orgId, supabase } = await ctx();
  const { data } = await supabase.from("journeys").select("id").eq("org_id", orgId).eq("status", "active").limit(300);
  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
  for (const id of ids) { try { await recomputeJourney(supabase, orgId, id); } catch { /* isolate */ } }
  return { journeys: ids.length };
}

// ── command center ─────────────────────────────────────────────────────────────
export async function getJourneyCommandCenter(): Promise<JourneyCommandCenter> {
  const { orgId, isManager, supabase } = await ctx();
  const { data: js } = await supabase.from("journeys").select("*").eq("org_id", orgId).order("conversion_score", { ascending: false }).limit(400);
  const journeys = ((js ?? []) as Record<string, unknown>[]);

  // predictions map
  const { data: preds } = await supabase.from("journey_predictions").select("journey_id,probability_convert,expected_commission").eq("org_id", orgId);
  const predMap = new Map<string, { pc: number; ec: number | null }>();
  for (const p of (preds ?? []) as { journey_id: string; probability_convert: number; expected_commission: number | null }[]) predMap.set(p.journey_id, { pc: p.probability_convert, ec: p.expected_commission });

  const labels = new Map<string, string>();
  await Promise.all(journeys.slice(0, 120).map(async (j) => { labels.set(j.id as string, await entityLabel(supabase, orgId, j.entity_type as string, j.entity_id as string)); }));

  const toCard = (j: Record<string, unknown>): JourneyCard => {
    const pred = predMap.get(j.id as string);
    return {
      id: j.id as string, journey_type: j.journey_type as string, entity_type: j.entity_type as string, entity_id: j.entity_id as string,
      label: labels.get(j.id as string) ?? "לקוח", current_stage: j.current_stage as string, stage_label: stageLabel(j.journey_type as string, j.current_stage as string),
      progress: (j.progress as number) ?? 0, health_score: (j.health_score as number) ?? 0, conversion_score: (j.conversion_score as number) ?? 0,
      risk_score: (j.risk_score as number) ?? 0, velocity_state: j.velocity_state as string, velocity_label: VELOCITY_LABELS[j.velocity_state as string] ?? (j.velocity_state as string),
      status: j.status as string, next_best_action: (j.next_best_action as string) ?? null,
      probability_convert: pred?.pc ?? null, expected_commission: pred?.ec ?? null, days_since_activity: daysSince(j.last_activity_at as string),
    };
  };

  const active = journeys.filter((j) => j.status === "active");
  const buyers = active.filter((j) => j.journey_type === "buyer").map(toCard);
  const sellers = active.filter((j) => j.journey_type === "seller").map(toCard);
  const stuck = active.filter((j) => ["stuck", "regression"].includes(j.velocity_state as string)).map(toCard);
  const ready = active.filter((j) => (j.conversion_score as number) >= 70 && (j.risk_score as number) < 45).map(toCard).sort((a, b) => b.conversion_score - a.conversion_score);

  const { data: rk } = await supabase.from("journey_risks").select("id,entity_type,entity_id,risk_type,severity,score,reason,recommended_action").eq("org_id", orgId).eq("status", "open").order("score", { ascending: false }).limit(40);
  const risks: RiskCard[] = ((rk ?? []) as Record<string, unknown>[]).map((r) => ({ id: r.id as string, entity_type: r.entity_type as string, entity_id: r.entity_id as string, label: labels.get("") ?? "לקוח", risk_type: r.risk_type as string, severity: r.severity as string, score: (r.score as number) ?? 0, reason: (r.reason as string) ?? null, recommended_action: (r.recommended_action as string) ?? null }));

  const { data: op } = await supabase.from("journey_opportunities").select("id,entity_type,entity_id,opportunity_type,score,reason,recommended_action").eq("org_id", orgId).eq("status", "open").order("score", { ascending: false }).limit(40);
  const opportunities: OppCard[] = ((op ?? []) as Record<string, unknown>[]).map((o) => ({ id: o.id as string, entity_type: o.entity_type as string, entity_id: o.entity_id as string, label: "לקוח", opportunity_type: o.opportunity_type as string, score: (o.score as number) ?? 0, reason: (o.reason as string) ?? null, recommended_action: (o.recommended_action as string) ?? null }));

  const { data: ms } = await supabase.from("journey_milestones").select("entity_type,entity_id,label,reached,reached_at").eq("org_id", orgId).eq("reached", true).order("reached_at", { ascending: false }).limit(30);
  const milestones: MilestoneCard[] = ((ms ?? []) as Record<string, unknown>[]).map((m) => ({ entity_type: m.entity_type as string, entity_id: m.entity_id as string, label: "לקוח", milestone_label: m.label as string, reached: true, reached_at: (m.reached_at as string) ?? null }));

  const byStage = (type: string) => {
    const defs = stagesFor(type);
    const counts = new Map<string, number>();
    for (const j of active.filter((x) => x.journey_type === type)) counts.set(j.current_stage as string, (counts.get(j.current_stage as string) ?? 0) + 1);
    return defs.map((d) => ({ stage: d.key, label: d.label, count: counts.get(d.key) ?? 0 }));
  };
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, x) => s + x, 0) / arr.length) : 0;
  const analytics: JourneyAnalytics = { byStageBuyer: byStage("buyer"), byStageSeller: byStage("seller"), avgConversion: avg(active.map((j) => (j.conversion_score as number) ?? 0)), avgHealth: avg(active.map((j) => (j.health_score as number) ?? 0)) };

  const expectedCommission = ready.reduce((s, c) => s + (c.expected_commission ?? 0), 0);
  const kpis: JourneyKpis = {
    readyBuyers: ready.filter((c) => c.journey_type === "buyer").length, readySellers: ready.filter((c) => c.journey_type === "seller").length,
    stuckJourneys: stuck.length, journeyRisks: risks.length, journeyOpportunities: opportunities.length, activeJourneys: active.length, expectedCommission,
  };
  return { kpis, buyers, sellers, stuck, ready, risks, opportunities, milestones, analytics, isManager };
}

export type { Json };
