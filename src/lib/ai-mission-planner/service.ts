"use server";
// ============================================================================
// 🎯 AI Mission Planner™ — official server actions. Phase 27.4.
// ----------------------------------------------------------------------------
// Creates reviewable mission DRAFTS from existing evidence and lets reviewers
// approve/reject them. NO execution: approval only flips status to "approved";
// it never sends a message, creates a task, or modifies CRM data. OpenAI is
// reached ONLY through the existing AI Reasoning Gateway (answerWithZonoAI).
// ============================================================================
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { getSessionContext } from "@/lib/auth/session";
import { answerWithZonoAI } from "@/lib/ai-reasoning/service";
import { planFromReasoning, planFromAlert, applyStatusTransition } from "./planner";
import { findActiveDuplicate, getDraftById, insertMissionDraft, listMissionDrafts, updateDraftStatus } from "./repository";
import type { MissionCategory, MissionDraft, PlanSkip } from "./types";
import type { AlertDescriptor } from "./evidence";
import type { ContextType } from "@/lib/context-engine/types";

export interface MissionPlanActionResult { drafts: MissionDraft[]; skipped: PlanSkip[] }

async function persist(orgId: string, userId: string | null, created: { sourceType: string; sourceId?: string | null; category: string; relatedEntity: { id: string | null } }[], plan: { created: import("./types").MissionDraftInput[]; skipped: PlanSkip[] }): Promise<MissionPlanActionResult> {
  void created;
  const drafts: MissionDraft[] = [];
  const skipped: PlanSkip[] = [...plan.skipped];
  for (const d of plan.created) {
    if (await findActiveDuplicate(d.sourceType, d.category, d.relatedEntity.id)) { skipped.push({ reason: "duplicate", detail: d.title }); continue; }
    const saved = await insertMissionDraft(orgId, userId, d);
    if (saved) drafts.push(saved); else skipped.push({ reason: "unsafe", detail: `insert failed: ${d.title}` });
  }
  return { drafts, skipped };
}

export interface ReasoningDraftInput {
  question: string;
  contextType?: ContextType;
  city?: string | null;
  neighborhood?: string | null;
  entityId?: string | null;
  relatedEntityType?: string | null;
  category?: MissionCategory;
}

export async function createMissionDraftFromReasoningAction(input: ReasoningDraftInput): Promise<MissionPlanActionResult> {
  const orgId = await currentSessionOrgId();
  if (!orgId) return { drafts: [], skipped: [{ reason: "unsafe", detail: "no organization in session" }] };
  const session = await getSessionContext().catch(() => null);
  const userId = session?.user?.id ?? null;

  const resp = await answerWithZonoAI({
    question: input.question, mode: "answer", language: "he",
    contextType: input.contextType, city: input.city ?? null, neighborhood: input.neighborhood ?? null, entityId: input.entityId ?? null,
  });

  const plan = planFromReasoning({
    question: input.question, response: resp, sourceId: resp.cacheKey,
    relatedEntity: { type: input.relatedEntityType ?? null, id: input.entityId ?? null },
    category: input.category,
  });
  return persist(orgId, userId, [], plan);
}

export async function createMissionDraftFromAlertAction(alert: AlertDescriptor): Promise<MissionPlanActionResult> {
  const orgId = await currentSessionOrgId();
  if (!orgId) return { drafts: [], skipped: [{ reason: "unsafe", detail: "no organization in session" }] };
  const session = await getSessionContext().catch(() => null);
  const userId = session?.user?.id ?? null;
  const plan = planFromAlert(alert);
  return persist(orgId, userId, [], plan);
}

export async function listMissionDraftsAction(): Promise<MissionDraft[]> {
  return listMissionDrafts();
}

async function review(id: string, action: "approve" | "reject"): Promise<{ ok: boolean; draft?: MissionDraft; reason?: string }> {
  const current = await getDraftById(id);
  if (!current) return { ok: false, reason: "not found" };
  const next = applyStatusTransition(current.status, action);
  if (!next) return { ok: false, reason: `cannot ${action} from ${current.status}` };
  const session = await getSessionContext().catch(() => null);
  const saved = await updateDraftStatus(id, next, session?.user?.id ?? null);
  return saved ? { ok: true, draft: saved } : { ok: false, reason: "update failed (permission?)" };
}

export async function approveMissionDraftAction(id: string): Promise<{ ok: boolean; draft?: MissionDraft; reason?: string }> {
  // Approval ONLY changes status to approved. It does NOT convert to a task or
  // execute anything — task conversion belongs to a later phase.
  return review(id, "approve");
}

export async function rejectMissionDraftAction(id: string): Promise<{ ok: boolean; draft?: MissionDraft; reason?: string }> {
  return review(id, "reject");
}
