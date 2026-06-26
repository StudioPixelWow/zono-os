"use server";
// ============================================================================
// ZONO — PHASE 26.12: Resolution Center server actions. Safe, typed wrappers for
// the human-in-the-loop review. Every call validates the org via the session,
// performs a conservative action, logs AI feedback + audit, and returns a typed
// result. No destructive deletes.
// ============================================================================
import {
  approveCandidate, rejectCandidate, ignoreCandidate, editAgency, mergeAgency, splitAgency,
  getCandidateDetail, type EditAgencyInput, type SplitSelection,
} from "./resolutionCenterService";
import type { CandidateDetail, ResolutionAction } from "./resolutionCenterFormat";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה. נסה שוב." };
}

export async function approveCandidateAction(candidateId: string, reason?: string): Promise<Result<{ agencyId: string }>> {
  try { return { ok: true, data: await approveCandidate(candidateId, reason) }; } catch (e) { return fail(e); }
}
export async function rejectCandidateAction(candidateId: string, reason?: string): Promise<Result<null>> {
  try { await rejectCandidate(candidateId, reason); return { ok: true, data: null }; } catch (e) { return fail(e); }
}
export async function ignoreCandidateAction(candidateId: string, reason?: string): Promise<Result<null>> {
  try { await ignoreCandidate(candidateId, reason); return { ok: true, data: null }; } catch (e) { return fail(e); }
}
export async function editAgencyAction(agencyId: string, patch: EditAgencyInput, reason?: string): Promise<Result<null>> {
  try { await editAgency(agencyId, patch, reason); return { ok: true, data: null }; } catch (e) { return fail(e); }
}
export async function mergeAgencyAction(primaryId: string, duplicateId: string, reason?: string): Promise<Result<{ movedCounts: Record<string, number> }>> {
  try { return { ok: true, data: await mergeAgency(primaryId, duplicateId, reason) }; } catch (e) { return fail(e); }
}
export async function splitAgencyAction(sourceAgencyId: string, newName: string, selection: SplitSelection, reason?: string): Promise<Result<{ newAgencyId: string; movedCounts: Record<string, number> }>> {
  try { return { ok: true, data: await splitAgency(sourceAgencyId, newName, selection, reason) }; } catch (e) { return fail(e); }
}
export async function getCandidateDetailAction(candidateId: string): Promise<Result<CandidateDetail | null>> {
  try { return { ok: true, data: await getCandidateDetail(candidateId) }; } catch (e) { return fail(e); }
}

/** Record an explicit learning signal (e.g. from a UI affordance). */
export async function recordLearningAction(input: { action: ResolutionAction; agencyId?: string; candidateId?: string; reason?: string }): Promise<Result<null>> {
  try {
    const { recordLearning } = await import("./learningService");
    await recordLearning({ action: input.action, agencyId: input.agencyId ?? null, candidateId: input.candidateId ?? null, reason: input.reason ?? null });
    return { ok: true, data: null };
  } catch (e) { return fail(e); }
}

export async function searchAgenciesAction(query: string): Promise<Result<{ id: string; name: string; city: string | null }[]>> {
  try { const { searchAgenciesLite } = await import("./resolutionCenterRepository"); return { ok: true, data: await searchAgenciesLite(query) }; } catch (e) { return fail(e); }
}
export async function getAgencyChildrenAction(agencyId: string): Promise<Result<import("./resolutionCenterRepository").AgencyChildren>> {
  try { const { listAgencyChildren } = await import("./resolutionCenterRepository"); return { ok: true, data: await listAgencyChildren(agencyId) }; } catch (e) { return fail(e); }
}
