// ============================================================================
// 🏠 ZONO — Unified AI Workspace™ — service (server-only). 30.2.
// Aggregates the OUTPUTS of the existing engines read-only (Chief of Staff,
// Multi-Agent Orchestrator, Mission Action Center, Agent Inbox, the CRM/Office
// agents, Organizational Memory) into the normalized HomeInput, then shapes it
// with the pure assembler. No engine modified; no business logic duplicated;
// evidence-only; nothing auto-executes.
// ============================================================================
import "server-only";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getOrchestratorDashboard } from "@/lib/agent-orchestrator";
import { getActionCenter, type Mission } from "@/lib/mission-engine";
import { getAgentsDashboard } from "@/lib/agent-framework/service";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import { getSellerAgentScorecards } from "@/lib/seller-agent";
import { getListingScorecards } from "@/lib/listing-agent";
import { getLeadAgentScorecards } from "@/lib/lead-agent";
import { getOfficeGrowthScorecard } from "@/lib/office-agent";
import { getOrgMemoryReport } from "@/lib/org-memory";
import { buildAiHome } from "./assemble";
import type { HomeInput, AiHomeData, EntityRef, MissionRef, HomeChain, HomeTimelineEvent, Impact } from "./types";

const SUGGESTED_QUESTIONS = ["מה עליי לעשות היום?", "אילו מוכרים בסיכון נטישה?", "אילו קונים קרובים לסגירה?", "אילו נכסים דורשים הורדת מחיר?", "אילו הזדמנויות עסקה פתוחות?", "היכן לגייס מתווכים?"];
const missionRef = (m: Mission): MissionRef => ({ id: m.id, title: m.goal || m.missionType, entity: m.entityName ?? (m.entityId ? `${m.entityType}:${m.entityId}` : m.entityType), status: m.status, priority: m.priority });

export async function getAiHome(orgId: string | null): Promise<AiHomeData> {
  const [cos, orch, ac, agents, buyers, sellers, listings, leads, office, mem] = await Promise.all([
    getChiefOfStaff(orgId).catch(() => null),
    getOrchestratorDashboard(orgId).catch(() => null),
    getActionCenter(orgId).catch(() => null),
    getAgentsDashboard(orgId).catch(() => null),
    getBuyerAgentScorecards(orgId).catch(() => null),
    getSellerAgentScorecards(orgId).catch(() => null),
    getListingScorecards(orgId).catch(() => null),
    getLeadAgentScorecards(orgId).catch(() => null),
    getOfficeGrowthScorecard(orgId).catch(() => null),
    getOrgMemoryReport(orgId).catch(() => null),
  ]);

  const b = cos?.briefing;
  const dq = cos?.globalContext.dataQuality.score ?? 0;

  // Pipelines → entity refs.
  const hotBuyers: EntityRef[] = (buyers?.scorecards ?? [])
    .filter((c) => (c.health.label === "בריא" && c.health.buyingConfidence >= 55) || ["CLOSE_DEAL", "NEGOTIATE", "BOOK_VISIT", "BOOK_SECOND_VISIT"].includes(c.strategy.recommendedStrategy))
    .slice(0, 8).map((c) => ({ kind: "buyer", id: c.id, name: c.name, detail: c.aiRecommendation, score: c.aiConfidence, tone: "good" as const }));
  const atRiskSellers: EntityRef[] = (sellers?.scorecards ?? [])
    .filter((c) => c.health.churnRisk >= 55 || c.health.label === "בסיכון")
    .slice(0, 8).map((c) => ({ kind: "seller", id: c.id, name: c.name, detail: `נטישה ${c.health.churnRisk} · ${c.aiRecommendation}`, score: c.aiConfidence, tone: (c.health.churnRisk >= 70 ? "bad" : "warn") as "bad" | "warn" }));
  const criticalListings: EntityRef[] = (listings?.scorecards ?? [])
    .filter((c) => c.health.label === "קריטי" || c.classification.includes("קריטי") || c.classification.includes("מתיישן"))
    .slice(0, 8).map((c) => ({ kind: "property", id: c.id, name: c.title, detail: `${c.health.label} · ${c.strategy.recommendedStrategy}`, score: c.aiConfidence, tone: (c.health.label === "קריטי" ? "bad" : "warn") as "bad" | "warn" }));

  const chains: HomeChain[] = (orch?.opportunities ?? []).map((c) => ({ id: c.id, title: c.title, type: c.type, score: c.opportunityScore, impact: c.businessImpact as Impact, confidence: c.confidence, links: c.links.map((l) => l.entityName), approvals: c.requiredApprovals }));

  const oc = office?.scorecard ?? null;

  // Timeline merge: Org Memory (mission history) + agent runs (activity).
  const timeline: HomeTimelineEvent[] = [
    ...((mem?.timeline ?? []).map((t) => ({ at: t.at, source: "memory", title: `${t.entity}: ${t.outcomeText}`, detail: t.reason, tone: (t.outcome === "success" ? "good" : t.outcome === "failure" ? "bad" : "neutral") as HomeTimelineEvent["tone"] }))),
    ...((agents?.runs ?? []).map((r) => ({ at: r.ranAt, source: "agent", title: `סוכן ${r.agentId}: ${r.proposals} הצעות`, detail: r.skipped ? "דילג" : `${r.blocked} חסומות`, tone: "neutral" as const }))),
  ];

  const input: HomeInput = {
    signals: {
      businessScore: b?.businessScore ?? 0, executionScore: b?.executionScore ?? 0, aiConfidence: b?.aiConfidence ?? 0,
      briefingSummary: b ? `ציון עסקי ${b.businessScore} · ביצוע ${b.executionScore} · ${b.todaysPriorities.length} עדיפויות · ${b.criticalRisks.length} סיכונים · ${b.importantOpportunities.length} הזדמנויות` : "",
      priorities: (b?.todaysPriorities ?? []).map((p) => ({ title: p.title, why: p.why, urgency: p.urgency })),
      criticalRisks: (b?.criticalRisks ?? []).map((r) => ({ title: r.title, evidence: r.evidence, severity: r.businessImpact as Impact })),
      briefingOpportunities: (b?.importantOpportunities ?? []).map((o) => ({ title: o.title, evidence: o.evidence })),
      urgentMissions: (b?.urgentMissions ?? []).map((m) => ({ title: m.title, why: m.why })),
      suggestedActions: [...new Set([...(b?.todaysPriorities ?? []).map((p) => p.title), ...(b?.urgentMissions ?? []).map((m) => m.title)])].slice(0, 6),
    },
    pipelines: {
      buyers: { total: buyers?.totals.buyers ?? 0, hot: buyers?.totals.hot ?? 0, items: hotBuyers },
      sellers: { total: sellers?.totals.sellers ?? 0, atRisk: sellers?.totals.atRisk ?? 0, items: atRiskSellers },
      listings: { total: listings?.totals.properties ?? 0, critical: listings?.totals.critical ?? 0, items: criticalListings },
      leads: { total: leads?.totals.leads ?? 0, hot: leads?.totals.hot ?? 0, duplicates: leads?.totals.duplicates ?? 0 },
    },
    office: oc ? { businessHealth: oc.health.businessHealth, risks: oc.risks.map((r) => ({ title: r.title, severity: r.severity as Impact })), decisions: oc.decisions.map((d) => ({ title: d.title, impact: d.impact as Impact })), inactiveBrokers: oc.brokerFindings.filter((f) => f.type === "inactive_broker" || f.type === "declining_broker").flatMap((f) => f.evidence).slice(0, 6), dataQuality: dq } : null,
    chains,
    priorityQueue: (orch?.priorityQueue ?? []).map((p) => ({ id: p.id, title: p.title, score: p.priorityScore, impact: p.impact as Impact, kind: p.kind })),
    missions: {
      waiting: ac?.totals.waiting ?? 0, blocked: ac?.totals.blocked ?? 0, today: ac?.totals.today ?? 0, completed: ac?.totals.completed ?? 0,
      waitingItems: (ac?.waiting ?? []).map(missionRef), todayItems: (ac?.todaysMissions ?? []).map(missionRef), completedItems: (ac?.completed ?? []).slice(0, 12).map(missionRef), blockers: b?.missionBlockers ?? [],
    },
    inbox: (agents?.inbox ?? []).filter((i) => i.status === "pending").map((i) => ({ id: i.id, agentName: i.agentName, recommendation: i.recommendation, reason: i.reason, impact: i.impact as Impact, confidence: i.confidence, entity: i.entity, status: i.status, requiresApproval: i.requiresApproval })),
    timeline,
    suggestedQuestions: SUGGESTED_QUESTIONS,
  };

  return buildAiHome(input);
}
