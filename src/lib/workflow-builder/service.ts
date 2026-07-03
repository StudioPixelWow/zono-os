// ============================================================================
// 🔁 ZONO — Workflow Builder — service (server-only). 30.4.
// Assembles the WorkflowContext for an entity by REUSING existing engine outputs
// read-only (Chief of Staff for the business score + the buyer/seller/lead/
// listing/office agent scorecards for confidence/truth/journey), then instantiates
// a workflow with the pure engine. Advancing happens client-side via the same
// pure engine — nothing executes automatically; every action step is approval-gated.
// ============================================================================
import "server-only";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import { getSellerAgentScorecards } from "@/lib/seller-agent";
import { getLeadAgentScorecards } from "@/lib/lead-agent";
import { getListingScorecards } from "@/lib/listing-agent";
import { getOfficeGrowthScorecard } from "@/lib/office-agent";
import { instantiateWorkflow } from "./engine";
import { WORKFLOW_TEMPLATES, getTemplate } from "./templates";
import type { WorkflowContext, Workflow, EntityKind, TriggerType } from "./types";

export interface WorkflowTemplateSummary { id: string; name: string; entityKind: EntityKind; trigger: TriggerType; description: string; expectedOutcome: string; steps: number }
export interface WorkflowTarget { entityKind: EntityKind; entityId: string; entityName: string }

export function listWorkflowTemplates(): WorkflowTemplateSummary[] {
  return WORKFLOW_TEMPLATES.map((t) => ({ id: t.id, name: t.name, entityKind: t.entityKind, trigger: t.trigger, description: t.description, expectedOutcome: t.expectedOutcome, steps: t.steps.length }));
}

export async function buildWorkflowContext(orgId: string | null, target: WorkflowTarget): Promise<WorkflowContext> {
  const base: WorkflowContext = { truthScore: null, confidence: 60, businessScore: 50, relationshipStrength: null, journeyStage: null, missionState: null, now: Date.now() };
  const cos = await getChiefOfStaff(orgId).catch(() => null);
  if (cos) base.businessScore = cos.briefing.businessScore;
  try {
    switch (target.entityKind) {
      case "buyer": case "customer": {
        const c = (await getBuyerAgentScorecards(orgId).catch(() => null))?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...base, confidence: c.aiConfidence, truthScore: c.truthScore, journeyStage: c.lifecycleStage, relationshipStrength: c.health.relationshipHealth };
        break;
      }
      case "seller": {
        const c = (await getSellerAgentScorecards(orgId).catch(() => null))?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...base, confidence: c.aiConfidence, truthScore: c.truthScore, journeyStage: c.lifecycleStage, relationshipStrength: c.health.trust };
        break;
      }
      case "lead": {
        const c = (await getLeadAgentScorecards(orgId).catch(() => null))?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...base, confidence: c.aiConfidence, truthScore: c.truthScore, journeyStage: c.lifecycleStage };
        break;
      }
      case "property": {
        const c = (await getListingScorecards(orgId).catch(() => null))?.scorecards.find((x) => x.id === target.entityId);
        if (c) return { ...base, confidence: c.aiConfidence, truthScore: c.truthScore };
        break;
      }
      case "office": {
        const c = (await getOfficeGrowthScorecard(orgId).catch(() => null))?.scorecard;
        if (c) return { ...base, confidence: c.aiConfidence, truthScore: c.truthScore, businessScore: c.health.businessHealth };
        break;
      }
      default: break;
    }
  } catch { /* fall back to base */ }
  return base;
}

/** Instantiate a workflow with real context (advancing happens client-side). */
export async function startWorkflow(orgId: string | null, templateId: string, target: WorkflowTarget): Promise<{ workflow: Workflow; context: WorkflowContext } | null> {
  const t = getTemplate(templateId);
  if (!t) return null;
  const context = await buildWorkflowContext(orgId, target);
  const workflow = instantiateWorkflow(templateId, t.trigger, target, context);
  if (!workflow) return null;
  return { workflow, context };
}
