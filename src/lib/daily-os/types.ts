// ============================================================================
// ☀️ ZONO Daily AI Operating System™ — types (client-safe). 40.0.
// The new default workspace: ONE daily operating system that RE-FRAMES the
// existing BrokerWorkspace (which already composes missions/inbox/whatsapp/
// facebook/website/territory/performance) into a briefing + merged timeline +
// unified ranked action feed + conversation/territory/marketing/deals/approvals,
// plus an executive mode from the Chief-of-Staff. No new engine, no schema.
// ============================================================================
import type { WsCommItem, ScoredEntity, BrokerTerritoryLite } from "@/lib/broker-workspace/types";

export const DAILY_OS_VERSION = "40.0";
export type Impact = "high" | "medium" | "low";

export interface DailyBriefing {
  greeting: string;
  dailyScore: number;
  focus: string;
  biggestOpportunity: { label: string; detail: string; href: string } | null;
  biggestRisk: { label: string; detail: string; href: string } | null;
  aiSummary: string;
}

export type TimelineSource = "meeting" | "mission" | "suggested";
export interface TimelineItem { at: string; source: TimelineSource; title: string; detail: string | null; icon: string; href: string }

export type ActionKind = "approve" | "reply_whatsapp" | "draft" | "facebook" | "mission" | "acquisition" | "seller_risk" | "hot_buyer";
export interface ActionItem { id: string; title: string; kind: ActionKind; priority: Impact; why: string; href: string }

export interface DailyConversation {
  whatsappUnread: number; whatsappWaiting: number; facebookComments: number; facebookLeads: number;
  waiting: { name: string; reason: string; href: string }[];
  drafts: WsCommItem[];
}

export interface DailyMarketing { scheduledToday: number; commentsWaiting: number; leadApprovals: number; groupsToPublish: number; tasks: { title: string; detail: string; href: string }[] }

export interface DailyDeals { hotBuyers: ScoredEntity[]; sellersAtRisk: ScoredEntity[]; criticalListings: ScoredEntity[]; leadFollowUps: ScoredEntity[] }

export interface DailyPerformance {
  daily: number; weekly: number; conversionOpportunities: number; followUpRatePct: number;
  weakSpots: { title: string; detail: string; impact: Impact }[];
}

export interface ApprovalItem { id: string; title: string; why: string; source: string; href: string }

export interface DailyOS {
  version: string;
  brokerName: string;
  generatedAt: string;
  briefing: DailyBriefing;
  timeline: TimelineItem[];
  actionFeed: ActionItem[];
  conversation: DailyConversation;
  territory: BrokerTerritoryLite;
  marketing: DailyMarketing;
  deals: DailyDeals;
  performance: DailyPerformance;
  approvals: ApprovalItem[];
  ask: string[];
  notes: string[];
}

// ── Executive mode (office managers) — mapped from the Chief-of-Staff ────────
export interface ExecRecLean { title: string; why: string; evidence: string[]; impact: Impact; urgency: number }
export interface ExecInsightLean { title: string; recommendation: string; modules: string[]; impact: Impact }
export interface ExecInput {
  orgScore: { overall: number; growth: number; execution: number; coverage: number; competitivePosition: number; confidence: number };
  priorities: ExecRecLean[]; risks: ExecRecLean[]; opportunities: ExecRecLean[];
  insights: ExecInsightLean[]; notes: string[];
}
export interface ExecutiveDaily {
  version: string; generatedAt: string;
  orgScore: ExecInput["orgScore"];
  officeHealth: "strong" | "fair" | "weak";
  priorities: ExecRecLean[]; risks: ExecRecLean[]; opportunities: ExecRecLean[]; insights: ExecInsightLean[];
  notes: string[];
}
