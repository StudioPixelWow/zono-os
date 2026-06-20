/**
 * Property Intelligence service — orchestration (server-only).
 *
 * Initializes and recalculates a property's intelligence: selects a blueprint,
 * generates missions / levers / tasks / calendar suggestions / exposure
 * channels, detects risks, computes deterministic scores, and assembles the
 * Command Center payload. No AI and no external API calls — all deterministic.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import { activityEventRepository } from "@/lib/activity/repository";
import { createRelationship, logActivityEvent, logScoreChanged } from "@/lib/activity/service";
import { EVENT_TYPES, RELATIONSHIP_TYPES } from "@/lib/activity/types";
import { latestResearchForProperties } from "@/lib/transactions/service";
import { computeAllScores, type ScoreContext, type ScoreSet } from "./scoring";
import {
  defaultCalendar,
  defaultLevers,
  defaultMissions,
  defaultTasks,
  detectRiskCandidates,
  exposureChannels,
  inDays,
  selectBlueprintName,
  type PropertyShape,
} from "./blueprints";
import {
  propertyBlueprintRepository,
  propertyCalendarPlanRepository,
  propertyExposureRepository,
  propertyIntelligenceRepository,
  propertyLeverRepository,
  propertyMissionRepository,
  propertyRiskRepository,
  propertyScoreRepository,
  propertySellerTrustRepository,
  type CalendarPlanRow,
  type ExposureRow,
  type IntelligenceProfileRow,
  type LeverRow,
  type MissionRow,
  type RiskRow,
  type ScoreEventRow,
  type TouchpointRow,
} from "./repository";

type PropertyRow = Database["public"]["Tables"]["properties"]["Row"];
const DAY = 86_400_000;
const daysBetween = (iso: string | null, from = Date.now()) =>
  iso == null ? null : Math.floor((from - new Date(iso).getTime()) / DAY);

// ── Context gathering ────────────────────────────────────────────────────────
async function gatherContext(
  property: PropertyRow,
): Promise<{ ctx: ScoreContext; orgId: string }> {
  const supabase = await createClient();
  const id = property.id;
  const recent = new Date(Date.now() - 14 * DAY).toISOString();

  const [media, docs, acts, tasks, leads, meetings, exposure, touch, journey, events, sellerProfileRes, propertySellersRes] =
    await Promise.all([
      supabase.from("property_media").select("type,is_primary").eq("property_id", id),
      supabase.from("documents").select("id", { count: "exact", head: true }).eq("property_id", id),
      supabase.from("activities").select("occurred_at").eq("property_id", id).order("occurred_at", { ascending: false }).limit(100),
      supabase.from("tasks").select("status,due_at,completed_at").eq("property_id", id),
      supabase.from("leads").select("created_at").eq("property_id", id),
      supabase.from("meetings").select("type,status,start_at").eq("property_id", id),
      supabase.from("property_exposure_channels").select("status,views_count,clicks_count,leads_count").eq("property_id", id),
      supabase.from("property_seller_touchpoints").select("created_at,touchpoint_type,sentiment").eq("property_id", id),
      supabase.from("property_journeys").select("current_stage,last_activity_at").eq("property_id", id).maybeSingle(),
      activityEventRepository.listForEntity("property", id, 200),
      property.seller_id
        ? supabase.from("seller_intelligence_profiles").select("seller_trust_score,seller_churn_risk_score").eq("seller_id", property.seller_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("property_sellers").select("seller_id,is_primary,is_decision_maker,can_sign").eq("property_id", id).eq("status", "active"),
    ]);
  let sellerProfile = (sellerProfileRes as { data: { seller_trust_score: number; seller_churn_risk_score: number } | null }).data;
  // Seller readiness from property_sellers (preferred over legacy seller_id).
  const sellerLinks = (propertySellersRes as { data: { seller_id: string; is_primary: boolean; is_decision_maker: boolean; can_sign: boolean }[] | null }).data ?? [];
  const hasLinkedSeller = sellerLinks.length > 0;
  const hasDecisionMaker = sellerLinks.some((l) => l.is_decision_maker);
  const hasSigner = sellerLinks.some((l) => l.can_sign);
  let sellerAllowsMarketing = true;
  const primaryLink = sellerLinks.find((l) => l.is_primary) ?? sellerLinks[0];
  if (primaryLink) {
    const [intelRes, sellerRowRes] = await Promise.all([
      supabase.from("seller_intelligence_profiles").select("seller_trust_score,seller_churn_risk_score").eq("seller_id", primaryLink.seller_id).maybeSingle(),
      supabase.from("sellers").select("allows_marketing").eq("id", primaryLink.seller_id).maybeSingle(),
    ]);
    if (intelRes.data) sellerProfile = intelRes.data;
    sellerAllowsMarketing = sellerRowRes.data?.allows_marketing ?? true;
  }

  const mediaRows = media.data ?? [];
  // Unified activity layer feeds momentum/freshness alongside the legacy feed.
  const eventRows = events ?? [];
  const eventsRecentCount = eventRows.filter((e) => e.occurred_at >= recent).length;
  const lastEventAt = eventRows[0]?.occurred_at ?? null;
  const exposureRows = exposure.data ?? [];
  const touchRows = touch.data ?? [];
  const taskRows = tasks.data ?? [];
  const meetingRows = meetings.data ?? [];
  const actRows = acts.data ?? [];
  const leadRows = leads.data ?? [];

  const lastActivity =
    [actRows[0]?.occurred_at, lastEventAt, property.updated_at]
      .filter((v): v is string => !!v)
      .sort()
      .pop() ?? property.updated_at;
  const stage = journey.data?.current_stage ?? null;
  const loc = (property.location ?? {}) as { address?: string };

  const ctx: ScoreContext = {
    hasPrice: !!property.price && property.price > 0,
    hasCity: !!property.city,
    hasAddress: !!loc.address,
    hasRooms: property.rooms != null,
    hasSize: property.size_sqm != null,
    hasFloor: property.floor != null,
    hasDescription: !!property.description?.trim(),
    hasMarketingDescription: !!property.marketing_description?.trim(),
    hasPrimaryImage: !!property.primary_image_url || mediaRows.some((m) => m.is_primary),
    hasCoords: property.latitude != null && property.longitude != null,
    mediaCount: mediaRows.filter((m) => m.type === "image").length,
    hasVideo: mediaRows.some((m) => m.type === "video"),
    hasFloorPlan: mediaRows.some((m) => m.type === "floor_plan"),
    documentCount: docs.count ?? 0,
    stagePublished:
      property.status === "published" ||
      ["published", "active_marketing", "negotiation", "deal_signed", "closed"].includes(stage ?? ""),
    hasPriceHistory: property.price_before_discount != null,
    hasPricePerSqm: property.price_per_sqm != null,
    activeChannels: exposureRows.filter((c) => c.status === "published").length,
    totalViews: exposureRows.reduce((s, c) => s + (c.views_count ?? 0), 0),
    totalClicks: exposureRows.reduce((s, c) => s + (c.clicks_count ?? 0), 0),
    totalLeads: leadRows.length + exposureRows.reduce((s, c) => s + (c.leads_count ?? 0), 0),
    touchpointCount: touchRows.length,
    reportsSent: touchRows.filter((t) => (t.touchpoint_type ?? "").includes("דוח")).length,
    meetingsCompleted: meetingRows.filter((m) => m.status === "completed").length,
    positiveSellerResponses: touchRows.filter((t) => t.sentiment === "positive").length,
    daysSinceSellerUpdate: daysBetween(touchRows[0]?.created_at ?? null),
    recentActivities: actRows.filter((a) => a.occurred_at >= recent).length + eventsRecentCount,
    recentLeads: leadRows.filter((l) => l.created_at >= recent).length,
    recentVisits: meetingRows.filter((m) => m.type === "viewing" && m.start_at >= recent).length,
    recentTasksCompleted: taskRows.filter((t) => t.completed_at && t.completed_at >= recent).length,
    daysSinceActivity: daysBetween(lastActivity) ?? 0,
    openRisks: [],
    overdueTasks: taskRows.filter((t) => t.status !== "done" && t.due_at && t.due_at < new Date().toISOString()).length,
    stalled: (daysBetween(lastActivity) ?? 0) >= 14 && stage !== "closed",
    sellerProfileTrust: sellerProfile?.seller_trust_score ?? null,
    sellerChurnRisk: sellerProfile?.seller_churn_risk_score ?? null,
    hasLinkedSeller,
    hasDecisionMaker,
    hasSigner,
    sellerAllowsMarketing,
  };
  return { ctx, orgId: property.org_id };
}

async function loadProperty(propertyId: string): Promise<PropertyRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("properties")
    .select("*")
    .eq("id", propertyId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function shapeOf(p: PropertyRow): PropertyShape {
  return {
    type: p.type,
    listingKind: p.listing_kind,
    hasExclusivity: p.has_exclusivity,
  };
}

function nextBestAction(risks: { recommended_action: string | null; severity: string }[], levers: { title: string }[]): string {
  const hi = risks.find((r) => r.severity === "high" || r.severity === "critical");
  if (hi?.recommended_action) return hi.recommended_action;
  if (levers[0]) return levers[0].title;
  return "המשך בביצוע התוכנית";
}

// ── Generators ───────────────────────────────────────────────────────────────
export async function generatePropertyMissions(property: PropertyRow): Promise<void> {
  const shape = shapeOf(property);
  const rows = defaultMissions(shape).map((m) => ({
    org_id: property.org_id,
    property_id: property.id,
    title: m.title,
    description: m.description,
    target_metric: m.targetMetric,
    target_value: m.targetValue,
    due_date: inDays(m.dueInDays),
    priority: m.priority,
    status: "active",
  }));
  await propertyMissionRepository.insertMany(rows);
  await logActivityEvent({
    eventType: EVENT_TYPES.propertyMissionCreated,
    entityType: "property",
    entityId: property.id,
    title: `נוצרו ${rows.length} יעדים לנכס`,
  });
}

export async function generatePropertyLevers(property: PropertyRow): Promise<void> {
  const rows = defaultLevers.map((l) => ({
    org_id: property.org_id,
    property_id: property.id,
    lever_type: l.leverType,
    title: l.title,
    expected_impact: l.expectedImpact,
    impact_score: l.impact,
    effort_score: l.effort,
    urgency_score: l.urgency,
    confidence_score: l.confidence,
    status: "suggested",
  }));
  await propertyLeverRepository.insertMany(rows);
  await logActivityEvent({
    eventType: EVENT_TYPES.propertyLeverCreated,
    entityType: "property",
    entityId: property.id,
    title: `נוצרו ${rows.length} מנופי צמיחה`,
  });
}

export async function generatePropertyTasks(property: PropertyRow): Promise<void> {
  const { user, profile } = await getSessionContext();
  const shape = shapeOf(property);
  const rows = defaultTasks(shape).map((t) => ({
    org_id: property.org_id,
    created_by: user?.id ?? null,
    assignee_id: user?.id ?? profile?.id ?? null,
    property_id: property.id,
    title: t.title,
    priority: t.priority as Database["public"]["Tables"]["tasks"]["Row"]["priority"],
    due_at: inDays(t.dueInDays),
    status: "todo" as Database["public"]["Tables"]["tasks"]["Row"]["status"],
    entity_type: "property",
    entity_id: property.id,
    intelligence_source: "blueprint",
  }));
  if (!rows.length) return;
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").insert(rows);
  if (error) throw new Error(error.message);
  await logActivityEvent({
    eventType: EVENT_TYPES.taskCreated,
    entityType: "property",
    entityId: property.id,
    title: `נוצרו ${rows.length} משימות חכמות`,
  });
}

export async function generatePropertyCalendarPlan(property: PropertyRow): Promise<void> {
  const shape = shapeOf(property);
  const rows = defaultCalendar(shape).map((c) => ({
    org_id: property.org_id,
    property_id: property.id,
    title: c.title,
    description: c.reason,
    plan_type: c.planType,
    suggested_date: inDays(c.withinDays),
    priority: c.priority,
    status: "suggested",
  }));
  await propertyCalendarPlanRepository.insertMany(rows);
  await logActivityEvent({
    eventType: EVENT_TYPES.calendarSuggestionCreated,
    entityType: "property",
    entityId: property.id,
    title: `נוצרו ${rows.length} הצעות יומן`,
  });
}

async function ensureExposureChannels(property: PropertyRow): Promise<void> {
  const rows = exposureChannels.map((channel) => ({
    org_id: property.org_id,
    property_id: property.id,
    channel,
    status: "not_published",
  }));
  await propertyExposureRepository.ensureChannels(rows);
}

/** Re-detect risks from the live context (clears prior open risks first). */
export async function generatePropertyRisks(
  property: PropertyRow,
  ctx: ScoreContext,
): Promise<RiskRow[]> {
  await propertyRiskRepository.clearOpen(property.id);
  const candidates = detectRiskCandidates(ctx);
  // Seller readiness risks (from property_sellers).
  if (!ctx.hasLinkedSeller) {
    candidates.push({ riskType: "no_seller", severity: "high", title: "חסר מוכר מקושר", description: "לנכס לא מקושר מוכר פעיל.", recommendedAction: "לקשר מוכר לנכס" });
  } else {
    if (!ctx.hasDecisionMaker) candidates.push({ riskType: "no_decision_maker", severity: "medium", title: "לא מוגדר מקבל החלטות", description: "אף מוכר לא סומן כמקבל החלטות.", recommendedAction: "לסמן מקבל החלטות" });
    if (!ctx.hasSigner) candidates.push({ riskType: "no_signer", severity: "medium", title: "לא מוגדר גורם חתימה", description: "אף מוכר לא סומן כמורשה חתימה.", recommendedAction: "לסמן מורשה חתימה" });
    if (ctx.sellerAllowsMarketing === false) candidates.push({ riskType: "seller_no_marketing", severity: "high", title: "המוכר לא אישר שיווק", description: "המוכר הראשי לא אישר פעולות שיווק.", recommendedAction: "לקבל אישור שיווק מהמוכר" });
  }
  // Consume Seller Intelligence: high seller churn is a property-level risk.
  if (ctx.sellerChurnRisk != null && ctx.sellerChurnRisk >= 60) {
    candidates.push({
      riskType: "seller_churn",
      severity: ctx.sellerChurnRisk >= 75 ? "critical" : "high",
      title: "סיכון מצד המוכר",
      description: `סיכון נטישת המוכר גבוה (${ctx.sellerChurnRisk}). עלול לסכן את הבלעדיות.`,
      recommendedAction: "לחזק את הקשר עם המוכר — שיחת עדכון / דוח",
    });
  }
  // Consume Transactions Intelligence: asking price materially above the sold-price
  // market value is a listing risk (stale inventory, buyer drop-off). Deterministic,
  // sourced from real government transactions — never invented.
  try {
    const researchMap = await latestResearchForProperties(property.org_id, [property.id]);
    const research = researchMap.get(property.id);
    const comps = Array.isArray(research?.comparable_transactions) ? (research!.comparable_transactions as unknown[]).length : 0;
    if (research && research.gap_from_market_percent != null && comps > 0) {
      const gap = research.gap_from_market_percent;
      if (gap >= 12) {
        candidates.push({
          riskType: "overpriced_vs_transactions",
          severity: gap >= 20 ? "high" : "medium",
          title: "מחיר מעל שווי עסקאות",
          description: `המחיר המבוקש כ-${Math.round(gap)}% מעל שווי השוק לפי ${comps} עסקאות אמת. סיכון לקיפאון המודעה ולנשירת קונים.`,
          recommendedAction: "לבחון התאמת מחיר עם המוכר לפי עסקאות אזוריות",
        });
      } else if ((research.confidence_score ?? 0) < 40) {
        candidates.push({
          riskType: "weak_market_evidence",
          severity: "low",
          title: "ראיות שוק חלשות",
          description: `מעט עסקאות להשוואה באזור (ביטחון ${research.confidence_score ?? 0}%). קושי לאמוד שווי מדויק.`,
          recommendedAction: "להרחיב כיסוי עסקאות באזור",
        });
      }
    }
  } catch { /* research is additive — never block risk generation */ }
  const rows = candidates.map((r) => ({
    org_id: property.org_id,
    property_id: property.id,
    risk_type: r.riskType,
    severity: r.severity,
    title: r.title,
    description: r.description,
    recommended_action: r.recommendedAction,
    status: "open",
  }));
  await propertyRiskRepository.insertMany(rows);
  if (rows.length) {
    await logActivityEvent({
      eventType: EVENT_TYPES.propertyRiskCreated,
      entityType: "property",
      entityId: property.id,
      title: `זוהו ${rows.length} סיכונים פעילים`,
      priority: "high",
    });
  }
  return propertyRiskRepository.listOpen(property.id);
}

// ── Scores ───────────────────────────────────────────────────────────────────
export async function updatePropertyScores(propertyId: string): Promise<ScoreSet> {
  const property = await loadProperty(propertyId);
  const { ctx } = await gatherContext(property);
  const openRisks = await generatePropertyRisks(property, ctx);
  ctx.openRisks = openRisks.map((r) => ({ severity: r.severity }));

  const scores = computeAllScores(ctx);
  const levers = await propertyLeverRepository.listByProperty(propertyId);
  const action = nextBestAction(
    openRisks.map((r) => ({ recommended_action: r.recommended_action, severity: r.severity })),
    levers,
  );

  const prev = await propertyIntelligenceRepository.getByProperty(propertyId);
  const summary = `ציון הצלחה ${scores.success} · בריאות ${scores.health} · ${openRisks.length} סיכונים פעילים`;

  await propertyIntelligenceRepository.update(propertyId, {
    health_score: scores.health,
    success_score: scores.success,
    risk_score: scores.risk,
    marketing_score: scores.marketing,
    exposure_score: scores.exposure,
    seller_trust_score: scores.sellerTrust,
    market_position_score: scores.marketPosition,
    momentum_score: scores.momentum,
    next_best_action: action,
    intelligence_summary: summary,
    last_calculated_at: new Date().toISOString(),
  });

  // Record changed scores in history.
  if (prev) {
    const orgId = property.org_id;
    const events: Database["public"]["Tables"]["property_score_events"]["Insert"][] = [];
    const pairs: [string, number, number][] = [
      ["health", prev.health_score, scores.health],
      ["success", prev.success_score, scores.success],
      ["risk", prev.risk_score, scores.risk],
      ["marketing", prev.marketing_score, scores.marketing],
      ["exposure", prev.exposure_score, scores.exposure],
      ["seller_trust", prev.seller_trust_score, scores.sellerTrust],
      ["market_position", prev.market_position_score, scores.marketPosition],
      ["momentum", prev.momentum_score, scores.momentum],
    ];
    for (const [type, oldS, newS] of pairs) {
      if (oldS !== newS)
        events.push({ org_id: orgId, property_id: propertyId, score_type: type, old_score: oldS, new_score: newS, reason: "recalculation" });
    }
    if (events.length) await propertyScoreRepository.insertMany(events);
    if (events.length) await logScoreChanged("property", propertyId, summary);
  }
  return scores;
}

// ── Initialize / recalc ──────────────────────────────────────────────────────
export async function initializePropertyIntelligence(
  propertyId: string,
): Promise<IntelligenceProfileRow> {
  const existing = await propertyIntelligenceRepository.getByProperty(propertyId);
  if (existing) {
    await updatePropertyScores(propertyId);
    return (await propertyIntelligenceRepository.getByProperty(propertyId))!;
  }

  const property = await loadProperty(propertyId);
  const shape = shapeOf(property);
  const blueprintName = selectBlueprintName(shape);
  const blueprint = await propertyBlueprintRepository.getByName(blueprintName);
  const missions = defaultMissions(shape);
  const firstMission = missions[0];

  await propertyIntelligenceRepository.create({
    org_id: property.org_id,
    property_id: property.id,
    blueprint_id: blueprint?.id ?? null,
    mission_type: blueprintName,
    mission_title: firstMission?.title ?? null,
    mission_description: firstMission?.description ?? null,
    target_sale_days: blueprint?.target_days ?? null,
    target_price: property.price ?? null,
    target_leads: 10,
    target_visits: 5,
    target_offers: 1,
    current_stage: "new",
  });

  await Promise.all([
    generatePropertyMissions(property),
    generatePropertyLevers(property),
    generatePropertyCalendarPlan(property),
    ensureExposureChannels(property),
  ]);
  await generatePropertyTasks(property);
  await updatePropertyScores(propertyId);

  // Unified activity layer: record initialization + base relationships.
  await logActivityEvent({
    eventType: EVENT_TYPES.propertyIntelligenceInitialized,
    entityType: "property",
    entityId: property.id,
    title: "ZONO Intelligence הופעל לנכס",
    priority: "medium",
  });
  if (property.owner_id) {
    await createRelationship({
      sourceType: "user",
      sourceId: property.owner_id,
      targetType: "property",
      targetId: property.id,
      relationshipType: RELATIONSHIP_TYPES.agentAssignedToProperty,
    });
  }
  if (property.seller_id) {
    await createRelationship({
      sourceType: "seller",
      sourceId: property.seller_id,
      targetType: "property",
      targetId: property.id,
      relationshipType: RELATIONSHIP_TYPES.sellerOwnsProperty,
    });
  }

  return (await propertyIntelligenceRepository.getByProperty(propertyId))!;
}

export async function recalculatePropertyIntelligence(propertyId: string): Promise<void> {
  await updatePropertyScores(propertyId);
}

// ── Command Center payload ───────────────────────────────────────────────────
export interface CommandCenter {
  profile: IntelligenceProfileRow;
  missions: MissionRow[];
  levers: LeverRow[];
  risks: RiskRow[];
  exposure: ExposureRow[];
  touchpoints: TouchpointRow[];
  calendar: CalendarPlanRow[];
  scoreEvents: ScoreEventRow[];
}

// ── Dashboard board (intelligence widgets) ───────────────────────────────────
export interface IntelBoardItem {
  propertyId: string;
  title: string;
  meta: string;
}
export interface IntelligenceBoard {
  lowHealth: IntelBoardItem[];
  sellerUpdate: IntelBoardItem[];
  upcomingCalendar: IntelBoardItem[];
  total: number;
}

export async function listIntelligenceBoard(): Promise<IntelligenceBoard> {
  const supabase = await createClient();
  const [profilesRes, propsRes, calRes] = await Promise.all([
    supabase
      .from("property_intelligence_profiles")
      .select("property_id,health_score,seller_trust_score,success_score")
      .limit(500),
    supabase.from("properties").select("id,title").neq("status", "archived"),
    supabase
      .from("property_calendar_plans")
      .select("property_id,title,suggested_date,status")
      .eq("status", "suggested")
      .order("suggested_date", { ascending: true })
      .limit(8),
  ]);

  const profiles = profilesRes.data ?? [];
  const titles = new Map((propsRes.data ?? []).map((p) => [p.id, p.title]));
  const title = (id: string) => titles.get(id) ?? "נכס";

  const lowHealth = profiles
    .filter((p) => p.health_score < 50)
    .sort((a, b) => a.health_score - b.health_score)
    .slice(0, 6)
    .map((p) => ({ propertyId: p.property_id, title: title(p.property_id), meta: `בריאות ${p.health_score}` }));

  const sellerUpdate = profiles
    .filter((p) => p.seller_trust_score < 45)
    .sort((a, b) => a.seller_trust_score - b.seller_trust_score)
    .slice(0, 6)
    .map((p) => ({ propertyId: p.property_id, title: title(p.property_id), meta: `אמון ${p.seller_trust_score}` }));

  const upcomingCalendar = (calRes.data ?? [])
    .filter((c) => titles.has(c.property_id))
    .slice(0, 6)
    .map((c) => ({
      propertyId: c.property_id,
      title: c.title,
      meta: c.suggested_date ? new Date(c.suggested_date).toLocaleDateString("he-IL") : "—",
    }));

  return { lowHealth, sellerUpdate, upcomingCalendar, total: profiles.length };
}

export async function getPropertyCommandCenter(
  propertyId: string,
): Promise<CommandCenter | null> {
  const profile = await propertyIntelligenceRepository.getByProperty(propertyId);
  if (!profile) return null;
  const [missions, levers, risks, exposure, touchpoints, calendar, scoreEvents] =
    await Promise.all([
      propertyMissionRepository.listByProperty(propertyId),
      propertyLeverRepository.listByProperty(propertyId),
      propertyRiskRepository.listByProperty(propertyId),
      propertyExposureRepository.listByProperty(propertyId),
      propertySellerTrustRepository.listByProperty(propertyId),
      propertyCalendarPlanRepository.listByProperty(propertyId),
      propertyScoreRepository.listByProperty(propertyId, 20),
    ]);
  return { profile, missions, levers, risks, exposure, touchpoints, calendar, scoreEvents };
}
