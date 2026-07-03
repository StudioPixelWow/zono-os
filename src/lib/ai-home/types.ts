// ============================================================================
// 🏠 ZONO — Unified AI Workspace™ (Ask/AI Home) — types (pure). 30.2.
// ----------------------------------------------------------------------------
// UX ORCHESTRATION ONLY. This module does NOT compute intelligence — it merges,
// groups, sorts and shapes the OUTPUTS of the existing engines (Chief of Staff,
// Multi-Agent Orchestrator, Mission Engine, Agent Inbox, the CRM/Office agents,
// Organizational Memory) into one workspace: a Today dashboard, Opportunity /
// Risk / Execution centers, a smart timeline and a context panel. No business
// logic is duplicated; everything stays evidence-only and approval-gated.
// ============================================================================
export const AI_HOME_VERSION = "30.2";
export type Impact = "high" | "medium" | "low";
export type PriorityBand = "high" | "medium" | "low";

// ── Normalized inputs (assembled by the server from existing engines) ───────
export interface HomeSignals {
  businessScore: number; executionScore: number; aiConfidence: number;
  briefingSummary: string;
  priorities: { title: string; why: string; urgency: number }[];
  criticalRisks: { title: string; evidence: string[]; severity: Impact }[];
  briefingOpportunities: { title: string; evidence: string[] }[];
  urgentMissions: { title: string; why: string }[];
  suggestedActions: string[];
}
export interface HomePipelines {
  buyers: { total: number; hot: number; items: EntityRef[] };
  sellers: { total: number; atRisk: number; items: EntityRef[] };
  listings: { total: number; critical: number; items: EntityRef[] };
  leads: { total: number; hot: number; duplicates: number };
}
export interface EntityRef { kind: string; id: string; name: string; detail: string; score: number | null; tone: "good" | "warn" | "bad" | "neutral" }
export interface HomeOffice { businessHealth: number; risks: { title: string; severity: Impact }[]; decisions: { title: string; impact: Impact }[]; inactiveBrokers: string[]; dataQuality: number }
export interface HomeChain { id: string; title: string; type: string; score: number; impact: Impact; confidence: number; links: string[]; approvals: string[] }
export interface HomePriorityItem { id: string; title: string; score: number; impact: Impact; kind: string }
export interface HomeMissions {
  waiting: number; blocked: number; today: number; completed: number;
  waitingItems: MissionRef[]; todayItems: MissionRef[]; completedItems: MissionRef[]; blockers: string[];
}
export interface MissionRef { id: string; title: string; entity: string; status: string; priority: number }
export interface HomeInboxItem { id: string; agentName: string; recommendation: string; reason: string; impact: Impact; confidence: number; entity: string; status: string; requiresApproval: boolean }
export interface HomeTimelineEvent { at: string; source: string; title: string; detail: string; tone: "good" | "warn" | "bad" | "neutral" }

export interface HomeInput {
  signals: HomeSignals; pipelines: HomePipelines; office: HomeOffice | null;
  chains: HomeChain[]; priorityQueue: HomePriorityItem[];
  missions: HomeMissions; inbox: HomeInboxItem[]; timeline: HomeTimelineEvent[];
  suggestedQuestions: string[];
}

// ── Assembled workspace (rendered by the UI) ────────────────────────────────
export interface TodayDashboard {
  businessScore: number; executionScore: number; aiConfidence: number;
  priorities: { title: string; why: string; urgency: number }[];
  criticalRisks: { title: string; evidence: string[]; severity: Impact }[];
  topOpportunities: { title: string; evidence: string[] }[];
  approvalsWaiting: number; missionsToday: number; urgentFollowUps: number;
  hotBuyers: EntityRef[]; hotSellers: EntityRef[]; criticalListings: EntityRef[];
}
export interface OpportunityGroup { band: PriorityBand; label: string; chains: HomeChain[] }
export interface OpportunityCenter { groups: OpportunityGroup[]; totals: { total: number; potentialDeals: number; expansion: number } }
export interface RiskCenter {
  criticalSellers: EntityRef[]; criticalListings: EntityRef[];
  decliningBrokers: string[]; lostOpportunities: string[]; dataQualityIssues: string[];
  score: number;
}
export interface ExecutionCenter {
  approvals: HomeInboxItem[]; waitingMissions: MissionRef[]; todaysActions: MissionRef[]; recentlyCompleted: MissionRef[];
  totals: { approvals: number; waiting: number; today: number; completed: number };
}
export interface AiInsights { briefingSummary: string; businessScore: number; suggestedActions: string[]; suggestedQuestions: string[] }

export interface AiHomeData {
  version: string; generatedAt: string;
  today: TodayDashboard;
  opportunities: OpportunityCenter;
  risks: RiskCenter;
  execution: ExecutionCenter;
  insights: AiInsights;
  timeline: HomeTimelineEvent[];
  emptyState: boolean;
  notes: string[];
}

// ── Part 8 — context panel (built from data already on a board card) ────────
export interface ContextPanelData {
  kind: string; id: string; name: string;
  summary: string; health: number | null;
  risks: string[]; opportunities: string[]; truth: number | null;
  relationships: string[]; openMissions: MissionRef[];
}
