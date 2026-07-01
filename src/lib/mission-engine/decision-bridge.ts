// ============================================================================
// 🌉 Decision → Mission bridge (pure). Phase 27.5 · Part 2/8.
// Turns a Decision (from the Decision Engine, unchanged) into a CreateMissionInput
// for ANY entity. Evidence and priority carry through — nothing is invented.
// Deterministic. No DB, no AI.
// ============================================================================
import type { Decision, ExecutionReadiness } from "@/lib/decision-engine";
import { defaultGoal } from "./templates";
import type { CreateMissionInput, EntityType, ExecStatus, Impact, MissionType } from "./types";

/** Map a decision category + title to a mission type (extensible). */
export function missionTypeFromDecision(category: string, title: string): MissionType {
  const t = title;
  switch (category) {
    case "BROKERAGE": return /גייס|מתווכ/.test(t) ? "RECRUIT_BROKER" : "BROKER_FOLLOWUP";
    case "TERRITORY": return "EXPAND_TERRITORY";
    case "COMPETITIVE": return "COMPETITIVE_RESPONSE";
    case "MARKETING": return "MARKETING_CAMPAIGN";
    case "PROPERTY": return /תקוע|תמחר|רענן/.test(t) ? "RECOVER_LISTINGS" : "PROPERTY_FOLLOWUP";
    case "SELLER": return "SELLER_OPPORTUNITY";
    case "BUYER": return "BUYER_OPPORTUNITY";
    case "BROKER": return "BROKER_FOLLOWUP";
    case "MARKET": return "MARKET_RESEARCH";
    case "OPERATIONS": return /התנגש|שיוך/.test(t) ? "OFFICE_CLEANUP" : "PORTFOLIO_REVIEW";
    case "SALES": return "LEAD_FOLLOWUP";
    default: return "GENERAL";
  }
}

const READINESS_TO_STATUS: Record<ExecutionReadiness, ExecStatus> = {
  can_execute: "READY", needs_approval: "WAITING_FOR_APPROVAL", blocked: "BLOCKED", waiting_for_data: "WAITING_FOR_DATA",
};

/** Build a mission input from a decision + entity context. */
export function decisionToMissionInput(
  decision: Decision,
  ctx: { organizationId?: string | null; entityType: EntityType; entityId?: string | null; entityName?: string | null; createdBy?: string | null },
): CreateMissionInput {
  const missionType = missionTypeFromDecision(decision.category, decision.title);
  const topAction = decision.actions[0];
  const businessImpact: Impact = topAction?.expectedImpact ?? (decision.priorityScore >= 70 ? "high" : decision.priorityScore >= 45 ? "medium" : "low");
  const confidence = topAction?.confidence ?? 50;
  return {
    organizationId: ctx.organizationId ?? null,
    sourceDecision: `${decision.id}: ${decision.title}`,
    entityType: ctx.entityType, entityId: ctx.entityId ?? null, entityName: ctx.entityName ?? null,
    missionType, priority: decision.priorityScore, businessImpact, confidence,
    reason: decision.why || decision.title,
    goal: decision.title || defaultGoal(missionType),
    expectedOutcome: topAction?.reason ?? decision.why,
    evidence: decision.evidence, status: READINESS_TO_STATUS[decision.executionReadiness],
    createdBy: ctx.createdBy ?? null,
  };
}
