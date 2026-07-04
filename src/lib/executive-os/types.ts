// ============================================================================
// 🧠 ZONO — Executive Intelligence OS™ · models. PHASE 45.0.
// The HIGHEST layer. It CONSUMES + EXPLAINS existing engine outputs (Chief of
// Staff org score/health/briefing/recs, agent scorecards, calendar health,
// action center, approval bundles). It NEVER recomputes an engine's numbers.
// ============================================================================

export type DimStatus = "ok" | "insufficient";
/** One executive dimension — its score is REUSED from an existing engine (or null = insufficient data, never fabricated). */
export interface ExecDimension { key: string; label: string; score: number | null; basis: string; status: DimStatus; sourceModule: string }

export interface ExecutiveScore {
  overall: number;            // REUSED from Chief-of-Staff organizationScore.overall (not recomputed)
  confidence: number;         // REUSED
  grade: string;              // מצוין / טוב / בינוני / דורש שיפור
  dimensions: ExecDimension[];
}

export type OfficeState = "healthy" | "needs_attention" | "critical" | "growth" | "decline";
export type OfficeTrend = "up" | "flat" | "down";
export interface OfficeHealth { state: OfficeState; trend: OfficeTrend; confidence: number; evidence: string[] }

export type ExecItemKind = "priority" | "risk" | "opportunity";
/** Mirrors Chief-of-Staff ExecutiveRecommendation — reused, not regenerated. */
export interface ExecItem {
  id: string; kind: ExecItemKind; title: string; why: string; evidence: string[];
  impact: string; confidence: number; urgency: number; sourceModule: string;
}

export interface ExecDecision {
  title: string; impact: string; risk: string; cost: string;
  confidence: number; affectedModules: string[]; approvalRequired: boolean;
}

export type BriefPeriod = "morning" | "afternoon" | "weekly" | "monthly" | "quarterly";
export interface ExecBriefing { period: BriefPeriod; label: string; headline: string; points: string[] }

export interface ExecTimelineItem { at: string; kind: string; title: string; detail: string | null; href: string | null }

export interface BrokerCompareRow { brokerId: string; name: string | null; score: number | null; label: string | null; note: string | null }

export interface ExecApprovalCenter { count: number; bundles: { bundleId: string; title: string; priority: number; entityHref: string | null }[] }

import type { AutomationHealth } from "@/lib/automation-os/unify";

export interface ExecutiveOS {
  version: string; orgId: string | null; generatedAt: string;
  score: ExecutiveScore;
  health: OfficeHealth;
  automation: AutomationHealth | null;   // 46.0 — consumed from Automation OS (unified), never recomputed
  briefings: ExecBriefing[];
  priorities: ExecItem[];
  risks: ExecItem[];
  opportunities: ExecItem[];
  timeline: ExecTimelineItem[];
  decisions: ExecDecision[];
  approvalCenter: ExecApprovalCenter;
  brokerComparison: BrokerCompareRow[];
  notes: string[];
}

/** Everything the pure compose consumes — filled by the service from existing engines. */
export interface ExecutiveInput {
  orgId: string | null;
  cosOverall: number; cosConfidence: number;
  dimensions: ExecDimension[];
  healthScores: { key: string; label: string; score: number; basis: string }[]; // Chief-of-Staff dashboard.health
  trend: OfficeTrend;
  recs: ExecItem[];                 // reused Chief-of-Staff recommendations (priority/risk/opportunity)
  timeline: ExecTimelineItem[];     // merged from calendar / daily-os / bundles
  bundles: ExecApprovalCenter["bundles"];
  brokers: BrokerCompareRow[];
  briefingHeadline: string;
  briefingPoints: string[];
}
