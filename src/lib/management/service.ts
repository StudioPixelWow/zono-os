// ============================================================================
// ZONO — Management Center COCKPIT · server aggregation (server-only).
// ----------------------------------------------------------------------------
// The ONE selector for the executive cockpit. It REUSES canonical engines and
// recomputes nothing: Executive OS (org score/health/dimensions, risks/
// priorities/opportunities, automation, approvals), the Deals board (money split,
// stage pipeline, at-risk), the office management board (team roster + leads +
// deal counts + today's meetings — manager-gated), and the Executive Decision
// queue. It maps their outputs into the pure `buildManagementCockpit` model.
// Team data is fail-closed (null → no team access); org isolation is the engines'
// existing RLS/role gating. No new business logic, no fabricated financials.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { getExecutiveOS } from "@/lib/executive-os/service";
import { getDealsBoard } from "@/lib/deals/service";
import { getOfficeManagementBoard, type OfficeAgentCard, type OfficeAgentOption } from "@/lib/office/management-board";
import { getExecutiveDecisions } from "@/lib/executive-decision/service";
import { buildManagementCockpit, type ManagementCockpit, type MgmtExecItem } from "./cockpit";

export interface ManagementCockpitBundle {
  cockpit: ManagementCockpit;
  agentCards: OfficeAgentCard[];      // raw roster cards — feed the in-place agent drawer
  agentOptions: OfficeAgentOption[];  // reassignment targets for the drawer
}

export async function getManagementCockpit(): Promise<ManagementCockpitBundle> {
  const now = Date.now();
  const [ctxR, execR, dealsR, boardR, decisionsR] = await Promise.allSettled([
    getSessionContext(), getExecutiveOS(), getDealsBoard(), getOfficeManagementBoard(), getExecutiveDecisions(),
  ]);
  const profile = ctxR.status === "fulfilled" ? ctxR.value.profile : null;
  const exec = execR.status === "fulfilled" ? execR.value : null;
  const deals = dealsR.status === "fulfilled" ? dealsR.value : null;
  const board = boardR.status === "fulfilled" ? boardR.value : null;
  const decisions = decisionsR.status === "fulfilled" ? decisionsR.value : null;

  const execItems: MgmtExecItem[] = exec
    ? [
        ...exec.risks.map((r) => ({ kind: "risk" as const, title: r.title, why: r.why, impact: r.impact, evidence: r.evidence, confidence: r.confidence, href: null })),
        ...exec.priorities.map((p) => ({ kind: "priority" as const, title: p.title, why: p.why, impact: p.impact, evidence: p.evidence, confidence: p.confidence, href: null })),
        ...exec.opportunities.map((o) => ({ kind: "opportunity" as const, title: o.title, why: o.why, impact: o.impact, evidence: o.evidence, confidence: o.confidence, href: null })),
      ]
    : [];

  const cockpit = buildManagementCockpit({
    managerName: (profile?.full_name ?? "").trim().split(/\s+/)[0] || null,
    hasTeamAccess: Boolean(board),
    score: exec ? { overall: exec.score.overall, grade: exec.score.grade, state: exec.health.state, trend: exec.health.trend, confidence: exec.score.confidence, dimensions: exec.score.dimensions.map((d) => ({ key: d.key, label: d.label, score: d.score, basis: d.basis })) } : null,
    revenue: deals ? deals.revenue : null,
    pipeline: deals ? deals.pipeline : [],
    atRisk: deals ? deals.atRisk.slice(0, 6).map((d) => ({ id: d.id, title: `${d.buyerName ?? "קונה"} ← ${d.propertyTitle ?? "נכס"}`, value: d.deal_value, risk: d.deal_risk, href: "/deals" })) : [],
    deals: board ? { active: board.deals.active, stuck: board.deals.stuck, lateStage: board.deals.lateStage, wonPeriod: board.deals.wonPeriod } : (deals ? { active: deals.deals.length, stuck: 0, lateStage: 0, wonPeriod: 0 } : null),
    leads: board ? board.leads : null,
    agents: board ? board.agents.map((a) => ({ id: a.id, name: a.name, avatarUrl: a.avatarUrl, activeProperties: a.activeProperties, openLeads: a.openLeads, activeDeals: a.activeDeals, todayMeetings: a.todayMeetings, overdueFollowups: a.overdueFollowups, attention: a.attention })) : [],
    meetingsToday: board ? board.meetingsToday.map((m) => ({ id: m.id, title: m.title, time: m.time, agentName: m.agentName, kind: m.kind })) : [],
    approvals: exec ? exec.approvalCenter.count : (board ? board.approvals.count : 0),
    automation: exec?.automation ? { active: exec.automation.enabled, failed: exec.automation.failed, successPct: Math.round(exec.automation.successRate) } : null,
    execItems,
    decisions: decisions ? decisions.decisions.map((d) => ({ id: d.id, headline: d.headline, summary: d.summary, whyNow: d.whyNow, action: d.recommendedAction, impact: d.expectedImpact, confidence: d.confidence, href: d.links[0] ?? null })) : [],
    nowMs: now,
  });

  return { cockpit, agentCards: board?.agents ?? [], agentOptions: board?.agentOptions ?? [] };
}
