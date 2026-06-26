// ============================================================================
// ZONO — PHASE 26.12: Resolution Center service (SERVER-ONLY). Orchestrates the
// six human-in-the-loop actions (approve/reject/merge/split/edit/ignore). Every
// action is conservative (never deletes), records an AI-feedback/audit row, and
// teaches the resolver (approved names become aliases). Real data only.
// ============================================================================
import "server-only";
import { AgencyService } from "../service";
import { updateCandidateStatus } from "../resolver/candidateRepository";
import { addAlias } from "../resolver/aliasRepository";
import {
  listQueue, getDetail, getAgencyLite, reassignAllChildren, reassignSelected,
  setIdentityStatus, setAgencyIdentityFields,
} from "./resolutionCenterRepository";
import { recordLearning, getLearningStats, getResolutionHistory } from "./learningService";
import type { CandidateDetail, ResolutionCandidate, LearningStats, FeedbackRecord } from "./resolutionCenterFormat";

export interface ResolutionCenterBundle {
  candidates: ResolutionCandidate[];
  learning: LearningStats;
  history: FeedbackRecord[];
}

export async function getResolutionCenterBundle(): Promise<ResolutionCenterBundle> {
  const [candidates, learning, history] = await Promise.all([listQueue(200), getLearningStats(), getResolutionHistory(60)]);
  return { candidates, learning, history };
}

export async function getCandidateDetail(candidateId: string): Promise<CandidateDetail | null> {
  return getDetail(candidateId);
}

// ── Actions ──────────────────────────────────────────────────────────────────
export async function approveCandidate(candidateId: string, reason?: string): Promise<{ agencyId: string }> {
  const detail = await getDetail(candidateId);
  if (!detail) throw new Error("מועמד לא נמצא.");
  if (!detail.suggestedAgencyId) throw new Error("אין משרד מוצע לאישור — בצע מיזוג או צור משרד חדש (פיצול).");
  await updateCandidateStatus(candidateId, "accepted", detail.suggestedAgencyId);
  await addAlias(detail.suggestedAgencyId, detail.detectedText, "human_approved").catch(() => {});
  await recordLearning({
    action: "approve", candidateId, agencyId: detail.suggestedAgencyId, previousConfidence: detail.confidence,
    finalResult: detail.suggestedAgencyId, reason,
    metadata: { detected_text: detail.detectedText, normalized: detail.normalizedText, agency_name: detail.suggestedAgencyName, alias: detail.detectedText },
  });
  return { agencyId: detail.suggestedAgencyId };
}

export async function rejectCandidate(candidateId: string, reason?: string): Promise<void> {
  const detail = await getDetail(candidateId);
  if (!detail) throw new Error("מועמד לא נמצא.");
  await updateCandidateStatus(candidateId, "rejected", null);
  await recordLearning({
    action: "reject", candidateId, previousConfidence: detail.confidence, finalResult: "rejected", reason,
    metadata: { detected_text: detail.detectedText, normalized: detail.normalizedText },
  });
}

export async function ignoreCandidate(candidateId: string, reason?: string): Promise<void> {
  const detail = await getDetail(candidateId);
  if (!detail) throw new Error("מועמד לא נמצא.");
  await updateCandidateStatus(candidateId, "ignored", null);
  await recordLearning({
    action: "ignore", candidateId, previousConfidence: detail.confidence, finalResult: "ignored", reason,
    metadata: { detected_text: detail.detectedText },
  });
}

export interface EditAgencyInput {
  displayName?: string | null; legalName?: string | null; brandName?: string | null; franchiseName?: string | null;
  headquartersCity?: string | null; website?: string | null; phone?: string | null; email?: string | null;
  aliases?: string[]; notes?: string | null;
}

export async function editAgency(agencyId: string, patch: EditAgencyInput, reason?: string): Promise<void> {
  const before = await getAgencyLite(agencyId);
  if (!before) throw new Error("משרד לא נמצא.");
  await AgencyService.updateAgency(agencyId, {
    ...(patch.displayName != null ? { name: patch.displayName } : {}),
    legalName: patch.legalName ?? undefined, headquartersCity: patch.headquartersCity ?? undefined,
    website: patch.website ?? undefined, phone: patch.phone ?? undefined, email: patch.email ?? undefined,
  });
  await setAgencyIdentityFields(agencyId, { displayName: patch.displayName, brandName: patch.brandName, franchiseName: patch.franchiseName });
  for (const alias of patch.aliases ?? []) await addAlias(agencyId, alias, "human_edit").catch(() => {});
  await recordLearning({
    action: "edit", agencyId, finalResult: agencyId, reason: reason ?? patch.notes ?? null,
    metadata: { agency_name: patch.displayName ?? before.name, old_value: before, new_value: patch },
  });
}

export async function mergeAgency(primaryId: string, duplicateId: string, reason?: string): Promise<{ movedCounts: Record<string, number> }> {
  if (primaryId === duplicateId) throw new Error("לא ניתן למזג משרד לעצמו.");
  const [primary, dup] = await Promise.all([getAgencyLite(primaryId), getAgencyLite(duplicateId)]);
  if (!primary || !dup) throw new Error("אחד המשרדים לא נמצא.");
  const movedCounts = await reassignAllChildren(duplicateId, primaryId);
  await addAlias(primaryId, dup.name, "merge").catch(() => {});
  await AgencyService.mergeDuplicateAgencies(primaryId, duplicateId);
  await setIdentityStatus(duplicateId, "merged", true);
  await recordLearning({
    action: "merge", agencyId: primaryId, finalResult: primaryId, reason,
    metadata: { agency_name: primary.name, merged_from: dup.name, moved_counts: movedCounts },
  });
  return { movedCounts };
}

export interface SplitSelection { agentIds?: string[]; relationshipIds?: string[]; signalIds?: string[]; aliasIds?: string[] }

export async function splitAgency(sourceAgencyId: string, newName: string, selection: SplitSelection, reason?: string): Promise<{ newAgencyId: string; movedCounts: Record<string, number> }> {
  const source = await getAgencyLite(sourceAgencyId);
  if (!source) throw new Error("משרד המקור לא נמצא.");
  if (!newName.trim()) throw new Error("נדרש שם למשרד החדש.");
  const { agency } = await AgencyService.createAgency({ name: newName.trim(), headquartersCity: source.city ?? undefined });
  const movedCounts = await reassignSelected(agency.id, [
    { table: "agency_agents", ids: selection.agentIds ?? [] },
    { table: "agency_entity_relationships", ids: selection.relationshipIds ?? [] },
    { table: "agency_signals", ids: selection.signalIds ?? [] },
    { table: "agency_aliases", ids: selection.aliasIds ?? [] },
  ]);
  await recordLearning({
    action: "split", agencyId: agency.id, finalResult: agency.id, reason,
    metadata: { agency_name: newName.trim(), split_from: source.name, moved_counts: movedCounts },
  });
  return { newAgencyId: agency.id, movedCounts };
}
