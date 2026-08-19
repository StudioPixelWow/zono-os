/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Office Intelligence · server selector (server-only). Manager/owner-gated,
// org-scoped, BOUNDED period queries composed into the pure explainable core. Real
// facts only: lead-stage funnel, per-source progression, first-response cohorts
// (from activity events, gated), follow-up gap, deal-stage durations (deal_journeys),
// structured loss reasons (deal_objections), property demand, and the inventory gap
// map (demand_clusters). Each module degrades independently; nothing is fabricated,
// and where data is thin the core returns "insufficient_data". No warehouse — plain
// bounded aggregations over existing indexes.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getOfficeFollowUpStates } from "@/lib/follow-up/service";
import {
  buildFunnel, analyzeLeadSources, analyzeResponseTime, analyzeFollowupGap, analyzeDealBottleneck,
  analyzeLostReasons, classifyPropertyDemand, analyzeInventoryGaps, analyzeMarketing,
  buildRecommendations, pickHeroInsight, isLearningOffice,
  type Insight, type FunnelStep, type LeadSourceRow, type ResponseBandRow, type StageDurationInput,
  type PropertyDemandRow, type DemandClusterInput, type Recommendation, type Confidence,
} from "./intelligence-core";

export type IntelPeriod = 7 | 30 | 90;
const MARKETABLE = ["active", "under_offer", "in_contract"];
const REACHED_CONTACTED = new Set(["contacted", "qualified", "nurturing", "converted"]);
const REACHED_QUALIFIED = new Set(["qualified", "nurturing", "converted"]);

const SOURCE_LABEL: Record<string, string> = {
  yad2: "יד2", madlan: "מדלן", facebook: "פייסבוק", instagram: "אינסטגרם", website: "אתר",
  referral: "המלצה", sign_call: "שלט", open_house: "בית פתוח", cold_outreach: "פנייה יזומה",
  portal: "פורטל", partner: "שותף", other: "אחר",
};
const DEAL_STAGE_LABEL: Record<string, string> = {
  new_opportunity: "הזדמנות חדשה", contacted: "יצירת קשר", meeting_scheduled: "פגישה נקבעה",
  property_visit: "ביקור בנכס", negotiation: "משא ומתן", offer_sent: "הצעה נשלחה",
  offer_received: "הצעה התקבלה", agreement_draft: "טיוטת הסכם", legal_review: "בדיקה משפטית",
  signed: "נחתם", closed: "נסגר", lost: "אבוד",
};
const OBJECTION_LABEL: Record<string, string> = {
  price: "מחיר", financing: "מימון", location: "מיקום", timing: "תזמון",
  competition: "תחרות", seller_concern: "חשש מוכר", legal: "משפטי", other: "אחר",
};

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

export interface OfficeIntelligence {
  period: { days: IntelPeriod; label: string };
  role: "manager" | "owner";
  learning: boolean;
  hero: Insight | null;
  funnel: FunnelStep[];
  leadSources: LeadSourceRow[];
  responseTime: { bands: ResponseBandRow[]; confidence: Confidence };
  dealStages: StageDurationInput[];
  propertyDemand: { highDemandLowProgression: PropertyDemandRow[]; lowDemand: PropertyDemandRow[] };
  inventoryGaps: DemandClusterInput[];
  insights: Insight[];
  recommendations: Recommendation[];
  compare: { leads: Cmp; deals: Cmp } | null;
  dataQuality: string[];
  totals: { leads: number; deals: number; properties: number };
}
interface Cmp { current: number; previous: number; change: number | null }

const PERIOD_LABEL: Record<IntelPeriod, string> = { 7: "7 ימים", 30: "30 ימים", 90: "90 ימים" };

/** The explainable office intelligence for the current manager/owner (null if not permitted). */
export async function getOfficeIntelligence(periodDays: IntelPeriod = 30): Promise<OfficeIntelligence | null> {
  const { organization } = await getSessionContext();
  if (!organization) return null;
  const orgId = organization.id;
  const supabase = await createClient();

  let isManager = false, isOwner = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* agent */ }
  if (!isManager) return null;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "owner" }); isOwner = data === true; } catch { /* not owner */ }

  const nowMs = Date.now();
  const fromIso = new Date(nowMs - periodDays * 86_400_000).toISOString();
  const prevFromIso = new Date(nowMs - 2 * periodDays * 86_400_000).toISOString();
  const sb: any = supabase;   // analytics reads use the untyped surface (many tables aren't in generated types)
  const svc: any = createServiceRoleClient();
  const dataQuality: string[] = [];
  const insights: Insight[] = [];

  // ── Leads window → funnel + sources + response cohorts ────────────────────
  let funnel: FunnelStep[] = [];
  let leadSources: LeadSourceRow[] = [];
  let responseTime: OfficeIntelligence["responseTime"] = { bands: [], confidence: "insufficient_data" };
  let leadsCount = 0;
  const leadIds: string[] = [];
  const leadCreatedAt = new Map<string, string>();
  const leadQualified = new Map<string, boolean>();
  try {
    const { data: leads } = await sb.from("leads").select("id,source,stage,created_at").eq("org_id", orgId).gte("created_at", fromIso).limit(2000);
    const rows = (leads ?? []) as any[];
    leadsCount = rows.length;
    const contacted = rows.filter((l) => REACHED_CONTACTED.has(l.stage)).length;
    const qualified = rows.filter((l) => REACHED_QUALIFIED.has(l.stage)).length;
    const converted = rows.filter((l) => l.stage === "converted").length;
    funnel = buildFunnel([
      { key: "new", label: "לידים חדשים", count: rows.length },
      { key: "contacted", label: "נוצר קשר", count: contacted },
      { key: "qualified", label: "מוסמך", count: qualified },
      { key: "converted", label: "הומר", count: converted },
    ]);

    // Sources (null source flagged, never a fake "unknown" source insight).
    const bySource = new Map<string, { leads: number; contacted: number; progressed: number }>();
    let missingSource = 0;
    for (const l of rows) {
      leadIds.push(l.id); leadCreatedAt.set(l.id, l.created_at); leadQualified.set(l.id, REACHED_QUALIFIED.has(l.stage));
      if (!l.source) { missingSource++; continue; }
      const cur = bySource.get(l.source) ?? { leads: 0, contacted: 0, progressed: 0 };
      cur.leads++; if (REACHED_CONTACTED.has(l.stage)) cur.contacted++; if (REACHED_QUALIFIED.has(l.stage)) cur.progressed++;
      bySource.set(l.source, cur);
    }
    if (missingSource > 0 && rows.length > 0) dataQuality.push(`מקור הליד חסר ב-${Math.round((missingSource / rows.length) * 100)}% מהלידים — לא נספר כמקור.`);
    const srcAnalysis = analyzeLeadSources([...bySource.entries()].map(([source, v]) => ({ source, label: SOURCE_LABEL[source] ?? source, leads: v.leads, contacted: v.contacted, progressed: v.progressed, deals: 0 })));
    leadSources = srcAnalysis.rows;
    if (srcAnalysis.insight) insights.push(srcAnalysis.insight);
  } catch { /* degrade */ }

  // Response cohorts — first documented touch from activity events (best-effort, gated).
  try {
    if (leadIds.length >= 8) {
      const firstTouch = new Map<string, string>();
      for (let i = 0; i < leadIds.length; i += 300) {
        const chunk = leadIds.slice(i, i + 300);
        const { data: acts } = await sb.from("activity_events").select("entity_id,occurred_at,actor_type").eq("org_id", orgId).eq("entity_type", "lead").in("entity_id", chunk).order("occurred_at", { ascending: true }).limit(3000);
        for (const a of (acts ?? []) as any[]) { if (a.actor_type && a.actor_type !== "user") continue; if (!firstTouch.has(a.entity_id)) firstTouch.set(a.entity_id, a.occurred_at); }
      }
      const bandDefs = [
        { band: "עד שעה", max: 1 }, { band: "1-4 שעות", max: 4 }, { band: "4-24 שעות", max: 24 }, { band: "מעל יממה", max: Infinity },
      ];
      const bands = bandDefs.map((b) => ({ band: b.band, leads: 0, progressed: 0 }));
      let measured = 0;
      for (const id of leadIds) {
        const ft = firstTouch.get(id); const created = leadCreatedAt.get(id);
        if (!ft || !created) continue;
        const h = (Date.parse(ft) - Date.parse(created)) / 3_600_000;
        if (!Number.isFinite(h) || h < 0) continue;
        measured++;
        const idx = bandDefs.findIndex((b) => h <= b.max);
        bands[idx].leads++; if (leadQualified.get(id)) bands[idx].progressed++;
      }
      if (measured < leadIds.length) dataQuality.push(`מגע ראשון מתועד קיים ל-${measured} מתוך ${leadIds.length} לידים — ניתוח זמני המענה מבוסס עליהם בלבד.`);
      const rt = analyzeResponseTime(bands.filter((b) => b.leads > 0));
      responseTime = { bands: rt.bands, confidence: rt.confidence };
      if (rt.insight) insights.push(rt.insight);
    }
  } catch { /* degrade */ }

  // ── Follow-up gap ─────────────────────────────────────────────────────────
  try {
    const office = await getOfficeFollowUpStates({ limit: 200 });
    const active = office.states.length;
    const noNext = office.states.filter((s) => !s.nextAction || s.state === "needs_action" || s.state === "unassigned").length;
    const overdue = office.states.filter((s) => (s.overdueByHours ?? 0) > 0 || s.state === "followup_overdue").length;
    const gap = analyzeFollowupGap({ activeLeads: active, noNextAction: noNext, overdue });
    if (gap) insights.push(gap);
  } catch { /* degrade */ }

  // ── Deal stage durations (deal_journeys — real enter/exit) ────────────────
  let dealStages: StageDurationInput[] = [];
  try {
    const { data: journeys } = await svc.from("deal_journeys").select("stage,duration_hours,exited_at,entered_at").eq("organization_id", orgId).gte("entered_at", prevFromIso).limit(2000);
    const byStage = new Map<string, number[]>();
    for (const j of (journeys ?? []) as any[]) {
      if (j.duration_hours == null || j.exited_at == null) continue;
      const arr = byStage.get(j.stage) ?? []; arr.push(j.duration_hours / 24); byStage.set(j.stage, arr);
    }
    dealStages = [...byStage.entries()].map(([stage, days]) => ({ stage, label: DEAL_STAGE_LABEL[stage] ?? stage, medianDays: median(days), count: days.length }));
    const bottleneck = analyzeDealBottleneck(dealStages);
    if (bottleneck.insight) insights.push(bottleneck.insight);
  } catch { /* degrade */ }

  // ── Lost reasons (structured objections only) ─────────────────────────────
  try {
    const { data: objs } = await svc.from("deal_objections").select("objection_type").eq("organization_id", orgId).gte("created_at", fromIso).limit(1000);
    const byType = new Map<string, number>();
    for (const o of (objs ?? []) as any[]) byType.set(o.objection_type, (byType.get(o.objection_type) ?? 0) + 1);
    if (byType.size) {
      const li = analyzeLostReasons([...byType.entries()].map(([reason, count]) => ({ reason, label: OBJECTION_LABEL[reason] ?? reason, count })));
      if (li) insights.push(li);
    }
  } catch { /* degrade */ }

  // ── Property demand ───────────────────────────────────────────────────────
  let propertyDemand: OfficeIntelligence["propertyDemand"] = { highDemandLowProgression: [], lowDemand: [] };
  let propsCount = 0;
  try {
    const { data: props } = await sb.from("properties").select("id,title").eq("org_id", orgId).in("status", MARKETABLE).limit(80);
    const pr = (props ?? []) as any[];
    propsCount = pr.length;
    if (pr.length) {
      const ids = pr.map((p) => p.id);
      const matches = new Map<string, number>(), interested = new Map<string, number>(), viewings = new Map<string, number>(), deals = new Map<string, number>();
      const tally = (m: Map<string, number>, rows: any[], key = "property_id") => { for (const r of rows) if (r[key]) m.set(r[key], (m.get(r[key]) ?? 0) + 1); };
      const [mRes, iRes, vRes, dRes] = await Promise.all([
        sb.from("match_intelligence_profiles").select("property_id").eq("org_id", orgId).eq("match_status", "active").gte("compatibility_score", 70).in("property_id", ids).limit(4000),
        sb.from("customer_property_recommendations").select("property_id,status").eq("org_id", orgId).in("status", ["interested", "viewing_requested"]).in("property_id", ids).limit(4000),
        sb.from("meetings").select("property_id,status,type").eq("org_id", orgId).in("type", ["viewing", "open_house"]).eq("status", "completed").in("property_id", ids).limit(4000),
        sb.from("deals").select("property_id,status").eq("org_id", orgId).in("property_id", ids).limit(4000),
      ]);
      tally(matches, (mRes.data ?? []) as any[]); tally(interested, (iRes.data ?? []) as any[]); tally(viewings, (vRes.data ?? []) as any[]); tally(deals, (dRes.data ?? []) as any[]);
      const demand = classifyPropertyDemand(pr.map((p) => ({ propertyId: p.id, title: (p.title as string) ?? "נכס", matches: matches.get(p.id) ?? 0, interested: interested.get(p.id) ?? 0, viewings: viewings.get(p.id) ?? 0, deals: deals.get(p.id) ?? 0 })));
      propertyDemand = { highDemandLowProgression: demand.highDemandLowProgression, lowDemand: demand.lowDemand };
      if (demand.insight) insights.push(demand.insight);
    }
  } catch { /* degrade */ }

  // ── Inventory gaps (demand_clusters) ──────────────────────────────────────
  let inventoryGaps: DemandClusterInput[] = [];
  try {
    const { data: clusters } = await sb.from("demand_clusters").select("area,property_type,rooms_bucket,active_buyers,inventory_count,gap_band").eq("org_id", orgId).order("gap_score", { ascending: false }).limit(50);
    const mapped: DemandClusterInput[] = ((clusters ?? []) as any[]).map((c) => ({ area: (c.area as string) ?? "אזור", propertyType: c.property_type ?? null, roomsBucket: c.rooms_bucket != null ? `${c.rooms_bucket} חדרים` : null, activeBuyers: c.active_buyers ?? 0, inventory: c.inventory_count ?? 0, gapBand: (c.gap_band as string) ?? "low" }));
    const gaps = analyzeInventoryGaps(mapped);
    inventoryGaps = gaps.gaps;
    if (gaps.insight) insights.push(gaps.insight);
  } catch { /* degrade */ }

  // ── Marketing (correlation-safe) ──────────────────────────────────────────
  try {
    const [postsRes, sendsRes, noMktRes] = await Promise.all([
      sb.from("distribution_posts").select("property_id,status,published_at").eq("org_id", orgId).gte("created_at", fromIso).limit(4000),
      sb.from("customer_property_recommendations").select("status,responded_at").eq("org_id", orgId).gte("recommended_at", fromIso).limit(4000),
      sb.from("properties").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("status", "active"),
    ]);
    const posts = (postsRes.data ?? []) as any[];
    const publications = posts.filter((p) => p.status === "published").length;
    const failures = posts.filter((p) => p.status === "failed").length;
    const propsPublished = new Set(posts.filter((p) => p.status === "published" && p.property_id).map((p) => p.property_id)).size;
    const sends = (sendsRes.data ?? []) as any[];
    const responses = sends.filter((s) => s.responded_at || ["interested", "viewing_requested", "rejected", "viewed"].includes(s.status)).length;
    const activeProps = noMktRes.count ?? 0;
    const propsNoMarketing = Math.max(0, activeProps - propsPublished);
    const mkt = analyzeMarketing({ publications, propertiesPublished: propsPublished, matchSends: sends.length, responses, failures, propertiesNoMarketing: propsNoMarketing });
    if (mkt) insights.push(mkt);
  } catch { /* degrade */ }

  // ── Period comparison (light — counts only, gated in the UI/ZI) ───────────
  let compare: OfficeIntelligence["compare"] = null;
  let dealsCount = 0;
  try {
    const [dCur, dPrev, lPrev] = await Promise.all([
      sb.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", fromIso),
      sb.from("deals").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", prevFromIso).lt("created_at", fromIso),
      sb.from("leads").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", prevFromIso).lt("created_at", fromIso),
    ]);
    dealsCount = dCur.count ?? 0;
    const cmp = (cur: number, prev: number): Cmp => ({ current: cur, previous: prev, change: prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null });
    compare = { leads: cmp(leadsCount, lPrev.count ?? 0), deals: cmp(dealsCount, dPrev.count ?? 0) };
  } catch { /* degrade */ }

  const totals = { leads: leadsCount, deals: dealsCount, properties: propsCount };
  const learning = isLearningOffice(totals);

  return {
    period: { days: periodDays, label: PERIOD_LABEL[periodDays] },
    role: isOwner ? "owner" : "manager",
    learning,
    hero: learning ? null : pickHeroInsight(insights),
    funnel, leadSources, responseTime, dealStages, propertyDemand, inventoryGaps,
    insights: learning ? [] : insights,
    recommendations: learning ? [] : buildRecommendations(insights),
    compare, dataQuality, totals,
  };
}

/** Deterministic ZI answer about office intelligence (facts from the same DTO). */
export async function summarizeOfficeIntelligenceForZi(periodDays: IntelPeriod = 30): Promise<string | null> {
  const intel = await getOfficeIntelligence(periodDays);
  if (!intel) return null;
  if (intel.learning) return "ZONO עדיין לומדת את הפעילות במשרד — כשיצטברו יותר לידים, עסקאות ונכסים, יופיעו כאן תובנות מבוססות. בינתיים מרכז השליטה (/office) ממשיך לעבוד.";
  const lines: string[] = [`📊 תובנות על המשרד (${intel.period.label})`];
  if (intel.hero) lines.push(`הדבר המרכזי: ${intel.hero.title} — ${intel.hero.explanation}`);
  intel.insights.filter((i) => i.id !== intel.hero?.id && i.confidence !== "insufficient_data").slice(0, 4).forEach((i) => lines.push(`• ${i.title}`));
  if (intel.compare?.leads.change != null) lines.push(`לידים: ${intel.compare.leads.current} החודש לעומת ${intel.compare.leads.previous} בתקופה הקודמת (${intel.compare.leads.change > 0 ? "+" : ""}${intel.compare.leads.change}%).`);
  lines.push("לתמונה המלאה: /office/intelligence");
  return lines.join("\n");
}
