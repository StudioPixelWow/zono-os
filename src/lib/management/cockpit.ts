// ============================================================================
// ZONO — Management Center COCKPIT · pure presentation derivations (no I/O, deps).
// ----------------------------------------------------------------------------
// The executive cockpit view model. It NEVER recomputes a business number — the
// service feeds it the outputs of the CANONICAL engines (Executive OS score/
// health/risks, the Deals board money/pipeline/at-risk, the office management
// board team/leads/deals, and the Executive Decision queue). This layer only
// SHAPES them into a decision-oriented cockpit: a money split that keeps
// POTENTIAL vs EXPECTED vs CEILING vs CLOSED-COUNT distinct (never presenting
// potential as earned), a real stage funnel, a deterministic team leaderboard
// (activity — NOT conversion/targets, which aren't measured), a consolidated risk
// center, evidence-gated ZONO insights (≤3, hidden without evidence) and the
// health-score factor breakdown. Dependency-free → unit tested directly.
// ============================================================================

export interface MgmtScore { overall: number; grade: string; state: string; trend: "up" | "flat" | "down"; confidence: number; dimensions: { key: string; label: string; score: number | null; basis: string }[] }
export interface MgmtRevenue { pipelineValue: number; weightedRevenue: number; expectedCommission: number }
export interface MgmtPipelineStage { stage: string; label: string; count: number; value: number }
export interface MgmtRiskDeal { id: string; title: string; value: number | null; risk: number; href: string }
export interface MgmtAgent { id: string; name: string; avatarUrl: string | null; activeProperties: number; openLeads: number; activeDeals: number; todayMeetings: number; overdueFollowups: number; attention: number }
export interface MgmtMeeting { id: string; title: string; time: string; agentName: string | null; kind: string }
export interface MgmtExecItem { kind: "priority" | "risk" | "opportunity"; title: string; why: string; impact: string; evidence: string[]; confidence: number; href: string | null }
export interface MgmtDecision { id: string; headline: string; summary: string; whyNow: string; action: string; impact: string; confidence: number | null; href: string | null }
export interface MgmtAutomation { active: number; failed: number; successPct: number | null }

export interface ManagementInput {
  managerName: string | null;
  hasTeamAccess: boolean;                 // false → team/roster gated off for this member
  score: MgmtScore | null;
  revenue: MgmtRevenue | null;
  pipeline: MgmtPipelineStage[];
  atRisk: MgmtRiskDeal[];
  deals: { active: number; stuck: number; lateStage: number; wonPeriod: number } | null;
  leads: { unassigned: number; hot: number; overdue: number; newToday: number } | null;
  agents: MgmtAgent[];
  meetingsToday: MgmtMeeting[];
  approvals: number;
  automation: MgmtAutomation | null;
  execItems: MgmtExecItem[];
  decisions: MgmtDecision[];
  nowMs: number;
}

export type MoneyKind = "potential" | "expected" | "ceiling";
export interface MoneySplit { potential: number; expected: number; ceiling: number; closedCount: number; avgDeal: number | null }
export interface FunnelStage { stage: string; label: string; count: number; value: number; pct: number }
export interface Funnel { stages: FunnelStage[]; totalCount: number; totalValue: number }
export interface HeroMetric { key: string; label: string; value: number; kind: "count" | "ils"; hint: string | null }
export interface TeamRow { id: string; name: string; avatarUrl: string | null; activeDeals: number; openLeads: number; todayMeetings: number; overdueFollowups: number; attention: number; activityScore: number }
export interface RiskCategory { key: string; label: string; count: number; detail: string; href: string; tone: "danger" | "warning" | "brand" }
export interface HealthFactor { key: string; label: string; score: number | null; basis: string; dragging: boolean }
export interface Insight { id: string; kind: string; what: string; why: string; action: string | null; href: string | null; tone: "danger" | "warning" | "success" | "brand" }

export interface ManagementCockpit {
  hasData: boolean;
  managerName: string | null;
  hasTeamAccess: boolean;
  hero: HeroMetric[];
  score: (MgmtScore & { factors: HealthFactor[] }) | null;
  money: MoneySplit | null;
  funnel: Funnel;
  insights: Insight[];
  decisions: MgmtDecision[];
  team: { rows: TeamRow[]; total: number };
  risks: RiskCategory[];
  meetings: MgmtMeeting[];
  approvals: number;
  automation: (MgmtAutomation & { healthy: boolean }) | null;
  generatedAtMs: number;
}

const TEAM_TOP = 5;
const RISK_MAX = 3;
const TODAY_MAX = 5;

/** Keep POTENTIAL / EXPECTED / CEILING distinct — never blur or present potential
 *  as earned. `closedCount` is a real ACTIVITY figure (deals closed in the
 *  period), NOT a money claim. */
export function moneySplit(revenue: MgmtRevenue, wonPeriod: number, activeDeals: number): MoneySplit {
  return {
    potential: revenue.pipelineValue,
    expected: revenue.weightedRevenue,
    ceiling: revenue.expectedCommission,
    closedCount: wonPeriod,
    avgDeal: activeDeals > 0 ? Math.round(revenue.pipelineValue / activeDeals) : null,
  };
}

/** Real stage funnel from the canonical pipeline (count + value per stage). Never
 *  invents stage-to-stage conversion (no progression history exists). */
export function pipelineFunnel(pipeline: MgmtPipelineStage[]): Funnel {
  const maxCount = Math.max(1, ...pipeline.map((p) => p.count));
  const stages = pipeline.map((p) => ({ ...p, pct: Math.round((p.count / maxCount) * 100) }));
  return { stages, totalCount: pipeline.reduce((a, p) => a + p.count, 0), totalValue: pipeline.reduce((a, p) => a + p.value, 0) };
}

/** Deterministic team ranking. "performance" ranks by an ACTIVITY score (deals,
 *  meetings, leads) — labelled honestly as activity, never conversion or target
 *  attainment (not measured). "attention" ranks by needs-attention count. */
export function teamLeaderboard(agents: MgmtAgent[], mode: "performance" | "attention" = "performance"): TeamRow[] {
  const rows: TeamRow[] = agents.map((a) => ({
    id: a.id, name: a.name, avatarUrl: a.avatarUrl, activeDeals: a.activeDeals, openLeads: a.openLeads,
    todayMeetings: a.todayMeetings, overdueFollowups: a.overdueFollowups, attention: a.attention,
    activityScore: a.activeDeals * 3 + a.todayMeetings * 2 + a.openLeads,
  }));
  rows.sort((x, y) => mode === "attention"
    ? y.attention - x.attention || y.activityScore - x.activityScore || x.name.localeCompare(y.name, "he")
    : y.activityScore - x.activityScore || y.activeDeals - x.activeDeals || x.name.localeCompare(y.name, "he"));
  return rows.slice(0, TEAM_TOP);
}

/** Consolidate scattered warnings into ≤3 categories with real counts. Only
 *  categories with a positive count appear; red is reserved for genuinely
 *  critical (at-risk deals). */
export function riskCenter(input: ManagementInput): RiskCategory[] {
  const out: RiskCategory[] = [];
  const atRiskValue = input.atRisk.reduce((a, d) => a + (d.value ?? 0), 0);
  if (input.atRisk.length > 0) out.push({ key: "at_risk", label: "עסקאות בסיכון", count: input.atRisk.length, detail: atRiskValue > 0 ? `≈ ${ilsShort(atRiskValue)} בסיכון` : "דורשות התערבות", href: "/deals", tone: "danger" });
  if (input.leads && input.leads.overdue > 0) out.push({ key: "overdue_leads", label: "לידים ללא מענה", count: input.leads.overdue, detail: "מעבר לזמן התגובה", href: "/leads", tone: "warning" });
  if (input.deals && input.deals.stuck > 0) out.push({ key: "stuck_deals", label: "עסקאות תקועות", count: input.deals.stuck, detail: "ללא התקדמות 21+ ימים", href: "/deals", tone: "warning" });
  if (input.leads && input.leads.unassigned > 0 && out.length < RISK_MAX) out.push({ key: "unassigned", label: "לידים לא משויכים", count: input.leads.unassigned, detail: "ממתינים לשיוך לסוכן", href: "/leads", tone: "brand" });
  return out.slice(0, RISK_MAX);
}

/** The health factors that best explain the score — the lowest-scoring dimensions
 *  (the drags) first, so "why 42?" is answerable. Reuses the engine's basis text. */
export function healthFactors(score: MgmtScore): HealthFactor[] {
  const scored = score.dimensions.filter((d) => d.score != null) as { key: string; label: string; score: number; basis: string }[];
  const sorted = [...scored].sort((a, b) => a.score - b.score);
  return sorted.slice(0, 3).map((d) => ({ key: d.key, label: d.label, score: d.score, basis: d.basis, dragging: d.score < score.overall }));
}

/** Evidence-gated executive insights (≤3). Prefers the canonical decision queue,
 *  then reused risks/priorities/opportunities. An item WITHOUT evidence or a
 *  reason is dropped — no generic "check the office" copy. */
export function execBrief(execItems: MgmtExecItem[], decisions: MgmtDecision[]): Insight[] {
  const out: Insight[] = [];
  for (const dcn of decisions) {
    if (!dcn.whyNow?.trim()) continue;
    out.push({ id: `d-${dcn.id}`, kind: "decision", what: dcn.headline, why: dcn.whyNow, action: dcn.action || null, href: dcn.href, tone: "warning" });
    if (out.length >= 3) return out;
  }
  const order: MgmtExecItem["kind"][] = ["risk", "priority", "opportunity"];
  for (const kind of order) {
    const it = execItems.find((e) => e.kind === kind && (e.evidence.length > 0 || e.why.trim().length > 0));
    if (!it) continue;
    if (out.some((o) => o.what === it.title)) continue;
    out.push({ id: `${kind}-${it.title}`, kind, what: it.title, why: it.why || it.evidence[0] || it.impact, action: null, href: it.href, tone: kind === "risk" ? "danger" : kind === "opportunity" ? "success" : "brand" });
    if (out.length >= 3) break;
  }
  return out.slice(0, 3);
}

function ilsShort(n: number): string {
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `₪${Math.round(n / 1000)}K`;
  return `₪${Math.round(n)}`;
}

/** Assemble the whole management cockpit. Pure + deterministic. */
export function buildManagementCockpit(input: ManagementInput): ManagementCockpit {
  const hasData = Boolean(input.score || input.revenue || input.agents.length);
  const money = input.revenue ? moneySplit(input.revenue, input.deals?.wonPeriod ?? 0, input.deals?.active ?? 0) : null;
  const funnel = pipelineFunnel(input.pipeline);
  const decisionsBounded = input.decisions.slice(0, 3);

  const hero: HeroMetric[] = [
    { key: "pipeline", label: "שווי צנרת (פוטנציאל)", value: input.revenue?.pipelineValue ?? 0, kind: "ils", hint: input.deals ? `${input.deals.active} עסקאות פעילות` : null },
    { key: "expected", label: "עמלה צפויה (משוקללת)", value: input.revenue?.weightedRevenue ?? 0, kind: "ils", hint: "לפי הסתברות סגירה" },
    { key: "deals", label: "עסקאות פעילות", value: input.deals?.active ?? 0, kind: "count", hint: input.deals ? `${input.deals.wonPeriod} נסגרו ב-30 ימים` : null },
    { key: "decisions", label: "מחכה להחלטה שלך", value: decisionsBounded.length + input.approvals, kind: "count", hint: input.approvals > 0 ? `${input.approvals} אישורים` : null },
  ];

  return {
    hasData,
    managerName: input.managerName,
    hasTeamAccess: input.hasTeamAccess,
    hero,
    score: input.score ? { ...input.score, factors: healthFactors(input.score) } : null,
    money,
    funnel,
    insights: execBrief(input.execItems, decisionsBounded),
    decisions: decisionsBounded,
    team: { rows: input.hasTeamAccess ? teamLeaderboard(input.agents, "performance") : [], total: input.agents.length },
    risks: riskCenter(input),
    meetings: input.meetingsToday.slice(0, TODAY_MAX),
    approvals: input.approvals,
    automation: input.automation ? { ...input.automation, healthy: input.automation.failed === 0 } : null,
    generatedAtMs: input.nowMs,
  };
}
