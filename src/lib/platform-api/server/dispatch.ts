// ============================================================================
// 🔌 Platform API — dispatch (server-only). 31.0. Parts 2 + 3.
// Maps a registered endpoint to the EXISTING service (read-only or approval-gated
// action). No business logic here — pure delegation. Actions create artifacts
// that are themselves approval-gated (WAITING_FOR_APPROVAL / unsent draft).
// ============================================================================
import "server-only";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent";
import { getSellerAgentScorecards } from "@/lib/seller-agent";
import { getLeadAgentScorecards } from "@/lib/lead-agent";
import { getListingScorecards } from "@/lib/listing-agent";
import { getOfficeGrowthScorecard } from "@/lib/office-agent";
import { getActionCenter, createMission } from "@/lib/mission-engine";
import { listActiveWorkflows, startPersistentWorkflow } from "@/lib/workflow-builder";
import { getChiefOfStaff } from "@/lib/chief-of-staff";
import { getOrgTruthReport } from "@/lib/truth-engine";
import { getOrchestratorDashboard } from "@/lib/agent-orchestrator";
import { askZono } from "@/lib/ask-zono";
import { generateDraft } from "@/lib/draft-studio";
import type { EndpointSpec } from "../types";

export interface DispatchCtx { orgId: string | null; createdBy: string | null; query: URLSearchParams; body: Record<string, unknown> }
const str = (v: unknown): string => (typeof v === "string" ? v : "");

export async function dispatch(endpoint: EndpointSpec, ctx: DispatchCtx): Promise<{ ok: boolean; data?: unknown; status?: number; error?: string }> {
  const { orgId, body } = ctx;
  switch (endpoint.id) {
    // ── Reads ──
    case "buyers.list": return { ok: true, data: await getBuyerAgentScorecards(orgId) };
    case "sellers.list": return { ok: true, data: await getSellerAgentScorecards(orgId) };
    case "leads.list": return { ok: true, data: await getLeadAgentScorecards(orgId) };
    case "properties.list": return { ok: true, data: await getListingScorecards(orgId) };
    case "offices.get": return { ok: true, data: await getOfficeGrowthScorecard(orgId) };
    case "missions.list": return { ok: true, data: await getActionCenter(orgId) };
    case "workflows.list": return { ok: true, data: (await listActiveWorkflows(orgId)).rows };
    // ── AI ──
    case "ai.chief": return { ok: true, data: await getChiefOfStaff(orgId) };
    case "ai.truth": return { ok: true, data: await getOrgTruthReport(orgId) };
    case "ai.orchestrator": return { ok: true, data: await getOrchestratorDashboard(orgId) };
    case "ai.ask": {
      const q = str(body.query); if (!q) return { ok: false, status: 400, error: "missing 'query'" };
      return { ok: true, data: await askZono(orgId, q) };
    }
    // ── Approval-gated actions ──
    case "missions.create": {
      const entityType = str(body.entityType), missionType = str(body.missionType), reason = str(body.reason);
      if (!entityType || !missionType || !reason) return { ok: false, status: 400, error: "missing entityType/missionType/reason" };
      const r = await createMission({ organizationId: orgId, entityType, entityId: str(body.entityId) || null, entityName: str(body.entityName) || null, missionType, reason, createdBy: ctx.createdBy });
      return r.ok ? { ok: true, data: { missionId: r.mission?.id, status: r.mission?.status } } : { ok: false, status: 422, error: r.error ?? "create failed" };
    }
    case "drafts.create": {
      const entityKind = str(body.entityKind), entityId = str(body.entityId), name = str(body.name);
      if (!entityKind || !entityId || !name) return { ok: false, status: 400, error: "missing entityKind/entityId/name" };
      const bundle = await generateDraft(orgId, { entityKind: entityKind as never, entityId, name }, { channel: (str(body.channel) || "whatsapp") as never, purpose: (str(body.purpose) || "follow_up") as never, tone: "professional", language: "he" });
      return { ok: true, data: { primary: bundle.primary, versions: Object.keys(bundle.versions), requiresApproval: true } };
    }
    case "workflows.start": {
      const templateId = str(body.templateId), entityKind = str(body.entityKind), entityId = str(body.entityId), entityName = str(body.entityName);
      if (!templateId || !entityKind || !entityId || !entityName) return { ok: false, status: 400, error: "missing templateId/entityKind/entityId/entityName" };
      const r = await startPersistentWorkflow(orgId, templateId, { entityKind: entityKind as never, entityId, entityName }, ctx.createdBy);
      return r.ok ? { ok: true, data: { workflowId: r.workflow?.id, status: r.workflow?.status } } : { ok: false, status: r.duplicate ? 409 : 422, error: r.error ?? "start failed" };
    }
    default:
      return { ok: false, status: 404, error: "unknown endpoint" };
  }
}
