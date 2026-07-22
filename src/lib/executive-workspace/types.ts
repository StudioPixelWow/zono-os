// ============================================================================
// 🏛️ ZONO OS 2.0 — STAGE 6 · Batch 6.0 · EXECUTIVE WORKSPACE — types.
//
// The Executive Workspace is the office manager's home screen. It introduces
// NO business logic: it is COMPOSITION ONLY over canonical providers. These
// types are view-models for the composed surface — they carry NO new numbers,
// no new priorities, no new confidence. Every value shown is inherited verbatim
// from an existing canonical provider (Executive Decisions, Executive Memory,
// Journey Coach, Executive OS projection, Broker Intelligence queue).
// ============================================================================
import type { DecisionAudience } from "@/lib/executive-decision/types";

/** Who is looking. Resolved from the SAME canonical role check (has_min_role)
 *  every provider uses — never a new role model. */
export type WorkspaceAudience = "manager" | "broker" | "member";

/** Stable identity of every workspace card, for QA + telemetry. */
export type WorkspaceCardId =
  | "executive_decisions" | "executive_memory" | "morning_brief"
  | "organization_score" | "journey_overview" | "broker_intelligence"
  | "market_summary" | "opportunity_summary"
  | "coverage" | "recent_activity" | "quick_actions";

/** The three visual bands of the manager workspace. */
export type WorkspaceSection = "top" | "middle" | "bottom";

/** Which canonical provider a card composes — audited, never a second source. */
export const CARD_SOURCE: Record<WorkspaceCardId, string> = {
  executive_decisions: "@/lib/executive-decision/service#getExecutiveDecisions",
  executive_memory: "@/lib/executive-memory/service#getExecutiveMemory",
  morning_brief: "compose(getExecutiveDecisions, getExecutiveMemory, getJourneyCoach)",
  organization_score: "@/lib/executive-os/service#getExecutiveOS.score",
  journey_overview: "@/lib/executive-os/service#getExecutiveOS.journey",
  broker_intelligence: "@/lib/executive-os/service#getExecutiveOS.journey (queue projection)",
  market_summary: "@/lib/executive-os/service#getExecutiveOS.risks/opportunities (Market)",
  opportunity_summary: "@/lib/executive-os/service#getExecutiveOS.opportunities",
  coverage: "@/lib/executive-os/service#getExecutiveOS.journey.coverage",
  recent_activity: "@/lib/executive-os/service#getExecutiveOS.timeline",
  quick_actions: "@/lib/executive-os/service#getExecutiveOS.approvalCenter (existing bundles)",
};

/** One line of the Morning Brief. `text` is VERBATIM from an existing provider —
 *  the workspace never generates prose. `source` records which fact it stitched. */
export interface MorningBriefPoint {
  source: "decisions" | "memory" | "journey";
  label: string;         // UI chrome only (section label), never a business fact
  text: string;          // inherited verbatim from the upstream provider
  href: string | null;
}

/** The composed Morning Brief — assembled ONLY from already-fetched facts. */
export interface MorningBrief {
  points: MorningBriefPoint[];
  /** TRUE when no upstream fact was available to compose (honest empty state). */
  empty: boolean;
  audience: DecisionAudience;
}
