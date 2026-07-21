// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ · server service (server-only). 45.0.
// CONSUMES existing engines and feeds the pure composer. It NEVER recomputes:
//   • Chief of Staff → org score, health, briefing, priorities/risks/opps
//   • Calendar Intelligence → calendar health score
//   • Approval Bundles → executive approval center
//   • Daily OS → unified executive timeline
//   • Calendar team availability → broker comparison
// Reuses compute-cache. No new engine, no new table, no duplicated calculation.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import { getChiefOfStaff } from "@/lib/chief-of-staff/service";
import { getWeekIntelligence } from "@/lib/calendar-os/intelligence-service";
import { getTeamAvailability } from "@/lib/calendar-os/service";
import { getInboxBundles } from "@/lib/approval-bundle/service";
import { getDailyOS } from "@/lib/daily-os/service";
import { getAutomationHealth } from "@/lib/automation-os/service";
import { groundGlobalContext, toGroundedSummary } from "@/lib/ai-context";
import { createClient } from "@/lib/supabase/server";
import { getJourneyCenter } from "@/lib/journey-center/service";
import { getBrokerIntelligenceQueue } from "@/lib/broker-intelligence/aggregate-service";
import { stageLabel, isJourneyType, type JourneyType } from "@/lib/journey-canonical";
import { buildExecJourneyProjection, mapJourneyQueueItems, type ExecJourneyAction } from "./journey-projection";
import { composeExecutive, answerExecutive } from "./compose";
import type { ExecutiveOS, ExecutiveInput, ExecItem, ExecDimension, ExecTimelineItem, OfficeTrend, BrokerCompareRow } from "./types";

async function ctx() { const sc = await getSessionContext(); return { orgId: sc.profile?.org_id ?? sc.organization?.id ?? null }; }

/**
 * Batch 5.6G — manager gate at the DATA boundary, not in the UI.
 * Uses the established `has_min_role` RPC (same pattern as ai-office/service.ts
 * and the cron routes). Fails CLOSED: any error → not a manager, so a broken
 * role check can never leak org-wide per-broker workload.
 */
async function isManager(): Promise<boolean> {
  try {
    const sb = await createClient();
    const { data } = await sb.rpc("has_min_role", { p_min: "manager" });
    return data === true;
  } catch {
    return false;
  }
}

/** Org-scoped owner display names — managers only, and only for owners the
 *  canonical KPI already returned. RLS scopes the read to the caller's org. */
async function ownerNamesFor(ids: string[]): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  try {
    const sb = await createClient();
    const { data } = await sb.from("users").select("id,full_name").in("id", ids).limit(200);
    const out: Record<string, string | null> = {};
    for (const r of (data as unknown as { id: string; full_name: string | null }[]) ?? []) out[r.id] = r.full_name ?? null;
    return out;
  } catch {
    return {};
  }
}
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

type Rec = { id?: string; title?: string; why?: string; evidence?: string[]; businessImpact?: string; confidence?: number; urgency?: number; sourceModule?: string };
const mapRec = (r: Rec, kind: ExecItem["kind"]): ExecItem => ({
  id: r.id ?? `${kind}-${Math.random().toString(36).slice(2, 7)}`, kind, title: r.title ?? "המלצה", why: r.why ?? "",
  evidence: Array.isArray(r.evidence) ? r.evidence : [], impact: r.businessImpact ?? "medium",
  confidence: num(r.confidence) ?? 60, urgency: num(r.urgency) ?? 50, sourceModule: r.sourceModule ?? "chief-of-staff",
});

export async function getExecutiveOS(): Promise<ExecutiveOS> {
  const { orgId } = await ctx();
  // Batch 5.6G — the role is resolved BEFORE the cache read because manager and
  // member outputs differ (ownerWorkload). Caching them under one key would let
  // a manager-warmed payload leak per-broker workload to a member.
  const manager = await isManager();
  const roleKey = manager ? "manager" : "member";
  if (orgId) { const hit = await getCache<ExecutiveOS>(orgId, "executive_os", ["v46", roleKey]); if (hit) return hit.value; }

  const [cos, cal, bundles, daily, team, grounded] = await Promise.all([
    getChiefOfStaff(orgId),
    getWeekIntelligence().catch(() => null),
    getInboxBundles().catch(() => []),
    getDailyOS().catch(() => null),
    getTeamAvailability().catch(() => []),
    // Executive mode: org memory + org-wide recs; broker-PRIVATE memory is NEVER
    // included (enforced by the mode policy). Best-effort — failure never breaks the OS.
    groundGlobalContext("executive").catch(() => null),
  ]);

  // Dimensions — REUSED from Chief-of-Staff score dims + calendar health (+ honest "insufficient").
  const dims: ExecDimension[] = (cos.organizationScore?.dims ?? []).map((d) => ({ key: d.key, label: d.label, score: d.score, basis: d.basis, status: "ok", sourceModule: "chief-of-staff" }));
  const calScore = cal?.health?.calendarScore ?? null;
  dims.push({ key: "calendar", label: "בריאות יומן", score: calScore, basis: cal?.health ? `ניצול ${cal.health.busyPct}% · ${cal.health.grade}` : "אין נתוני יומן", status: calScore == null ? "insufficient" : "ok", sourceModule: "calendar-os" });
  dims.push({ key: "satisfaction", label: "שביעות רצון לקוח", score: null, basis: "אין מקור נתונים מובנה — לא מחושב", status: "insufficient", sourceModule: "—" });

  // Recommendations — REUSED from Chief-of-Staff.
  const recs: ExecItem[] = [
    ...(cos.recommendations?.topPriorities ?? []).map((r) => mapRec(r as Rec, "priority")),
    ...(cos.recommendations?.topRisks ?? []).map((r) => mapRec(r as Rec, "risk")),
    ...(cos.recommendations?.topOpportunities ?? []).map((r) => mapRec(r as Rec, "opportunity")),
  ];

  // Trend — light inference from the REUSED growth score (no new metric).
  const growth = cos.organizationScore?.growth ?? cos.organizationScore?.overall ?? 50;
  const trend: OfficeTrend = growth >= 65 ? "up" : growth <= 40 ? "down" : "flat";

  // Timeline — REUSED Daily OS unified timeline (already merges meetings/priorities/calendar).
  const timeline: ExecTimelineItem[] = (daily?.timeline ?? []).map((t) => ({ at: t.at, kind: t.source, title: t.title, detail: t.detail ?? null, href: t.href ?? null }));

  // Approval center — REUSED approval bundles.
  const bundleItems = bundles.map((b) => ({ bundleId: b.bundleId, title: b.title, priority: b.priority, entityHref: entityHref(b.entityType, b.entityId) }));

  // Broker comparison — REUSED team availability (workload proxy; no performance recompute).
  const brokers: BrokerCompareRow[] = team.map((t) => ({ brokerId: t.brokerId, name: t.name, score: null, label: availLabel(t.state), note: `${t.todayEvents} אירועים היום` }));

  // ── Batch 5.6G — canonical Journey projection ────────────────────────────
  // TWO providers, deliberately distinct:
  //   · Journey Center → measurable STATE (a stalled count is a KPI).
  //   · Broker Intelligence queue → ACTIONABLE items (evidence-gated, with
  //     their own identity/lifecycle/confidence). A KPI is never promoted here.
  // `undefined` marks a FAILED provider so the projection can report
  // "unavailable" rather than an empty state that reads as healthy.
  const [jc, jq] = await Promise.all([
    getJourneyCenter().catch(() => undefined),
    getBrokerIntelligenceQueue({ limit: 40 }).catch(() => undefined),
  ]);

  // Journey-area recommendations, carried with canonical identity intact so
  // Executive agrees with Queue / Daily / Home / Agenda (the 5.6F identity rule).
  // 5.6H: the mapping is the ONE shared pure mapper (journey-projection.ts) —
  // the Home Journey Command section and the Copilot use the SAME function, so
  // no surface can re-derive or re-score a queue item differently.
  const journeyActions: ExecJourneyAction[] = mapJourneyQueueItems(jq?.items ?? []);

  // Owner names are read ONLY for managers, and only for owners the org-scoped
  // canonical KPI already returned — no broader directory read.
  const ownerIds = manager ? Object.keys(jc?.kpis?.ownerWorkload ?? {}) : [];
  const ownerNames = ownerIds.length ? await ownerNamesFor(ownerIds) : {};

  const journey = buildExecJourneyProjection({
    // A failed provider is `null` (unavailable); a successful one with zero rows
    // is a real measurement. The distinction is the point.
    kpis: jc === undefined ? null : jc.kpis ?? null,
    actions: jq === undefined ? [] : journeyActions,
    isManager: manager,
    ownerNames,
    stageLabel: (t, s) => (isJourneyType(t) ? stageLabel(t as JourneyType, s) : s),
  });

  const input: ExecutiveInput = {
    orgId, cosOverall: cos.organizationScore?.overall ?? 0, cosConfidence: cos.organizationScore?.confidence ?? cos.dashboard?.aiConfidence ?? 50,
    dimensions: dims, healthScores: cos.dashboard?.health ?? [], trend, recs, timeline, bundles: bundleItems, brokers,
    briefingHeadline: cos.briefing ? `ציון עסקי ${Math.round(cos.briefing.businessScore)} · ביצוע ${Math.round(cos.briefing.executionScore)}` : "",
    briefingPoints: [...(cos.briefing?.notes ?? []), ...(cos.briefing?.criticalRisks ?? []).map((r) => `סיכון: ${(r as Rec).title ?? ""}`), ...(cos.briefing?.marketAlerts ?? [])].filter(Boolean),
  };

  const os = composeExecutive(input);
  os.automation = await getAutomationHealth().catch(() => null);   // 46.0 — Executive OS receives unified automation health
  if (grounded) os.grounding = toGroundedSummary(grounded);        // 4.5D — shared assembler (executive mode)
  // Batch 5.6G — Journey is a PROJECTION attached after compose: it must never
  // reach composeExecutive, because nothing in it may influence the org score.
  os.journey = journey;
  if (orgId) await setCache(orgId, "executive_os", ["v46", roleKey], os as unknown as Parameters<typeof setCache>[3], { ttlSeconds: 600 });
  return os;
}

export interface ExecAsk { answer: string; items: { title: string; detail: string }[] }
export async function answerExecutiveQuestion(question: string): Promise<ExecAsk> {
  const os = await getExecutiveOS();
  return answerExecutive(os, question);
}

function entityHref(kind: string, id: string): string | null {
  if (kind === "lead") return `/leads/${id}`; if (kind === "buyer") return `/buyers/${id}`;
  if (kind === "seller") return `/sellers/${id}`; if (kind === "property") return `/properties/${id}`;
  return null;
}
// Batch 5.6G/5.6H — journey recommendation routing lives in the shared mapper
// (journey-projection.ts::journeySubjectHref): the SUBJECT's real cockpit, with
// `/journeys` as the safe aggregate fallback — never `/today`, never a raw
// journey UUID route, never a legacy journey-intelligence screen.
function availLabel(state: string): string {
  return state === "overloaded" ? "עמוס" : state === "free" ? "פנוי" : state === "meeting" ? "בפגישה" : state === "field" ? "בשטח" : "מאוזן";
}
