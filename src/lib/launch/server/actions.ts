"use server";
// ============================================================================
// ZONO — launch platform server actions. Member-safe (feedback, onboarding,
// usage, beta read) + admin-gated (plan, beta write, diagnostics, support,
// production score, deployment validation). Each returns a discriminated Result.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  getBetaActive, listBetaEnrollments, setBeta, submitFeedback, listFeedback,
  getOnboardingState, recordOnboardingStep, getOrgPlan, setOrgPlan, recordUsage, usageSummary,
  runDiagnostics, getProductionScore, startImpersonation, endImpersonation, listImpersonation,
} from "./services";
import { runDeploymentValidation } from "./deploy-validation";
import { validateFeedback } from "../feedback";
import type {
  BetaEnrollment, DiagnosticsReport, FeedbackContext, FeedbackInput, OnboardingState, OnboardingStepKey,
  OrgPlan, PlanStatus, PlanTier, ProductionScore, UsageEventInput,
} from "../types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } { return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." }; }

// ── Beta ────────────────────────────────────────────────────────────────────--
export async function getBetaActiveAction(): Promise<Result<{ active: boolean }>> {
  try { return { ok: true, data: { active: await getBetaActive() } }; } catch (e) { return fail(e); }
}
export async function listBetaAction(): Promise<Result<{ rows: BetaEnrollment[] }>> {
  try { return { ok: true, data: { rows: await listBetaEnrollments() } }; } catch (e) { return fail(e); }
}
export async function setBetaAction(scope: "org" | "user", targetUserId: string | null, enabled: boolean): Promise<Result<{ ok: true }>> {
  try { await setBeta(scope, targetUserId, enabled); revalidatePath("/platform-admin"); return { ok: true, data: { ok: true } }; } catch (e) { return fail(e); }
}

// ── Feedback ──────────────────────────────────────────────────────────────────
export async function submitFeedbackAction(input: FeedbackInput, context: FeedbackContext): Promise<Result<{ id: string | null }>> {
  try {
    const err = validateFeedback(input);
    if (err) return { ok: false, error: err };
    return { ok: true, data: { id: await submitFeedback(input, context) } };
  } catch (e) { return fail(e); }
}
export async function listFeedbackAction(): Promise<Result<{ rows: Record<string, unknown>[] }>> {
  try { return { ok: true, data: { rows: await listFeedback() } }; } catch (e) { return fail(e); }
}

// ── Onboarding ────────────────────────────────────────────────────────────────
export async function getOnboardingAction(): Promise<Result<OnboardingState>> {
  try { return { ok: true, data: await getOnboardingState() }; } catch (e) { return fail(e); }
}
export async function recordOnboardingStepAction(key: OnboardingStepKey): Promise<Result<OnboardingState>> {
  try { return { ok: true, data: await recordOnboardingStep(key) }; } catch (e) { return fail(e); }
}

// ── Plan ──────────────────────────────────────────────────────────────────────
export async function getPlanAction(): Promise<Result<OrgPlan>> {
  try { return { ok: true, data: await getOrgPlan() }; } catch (e) { return fail(e); }
}
export async function setPlanAction(plan: PlanTier, status: PlanStatus = "active"): Promise<Result<{ ok: true }>> {
  try { await setOrgPlan(plan, status); revalidatePath("/settings/plan"); return { ok: true, data: { ok: true } }; } catch (e) { return fail(e); }
}

// ── Usage ─────────────────────────────────────────────────────────────────────
export async function recordUsageAction(input: UsageEventInput): Promise<Result<{ ok: true }>> {
  try { await recordUsage(input); return { ok: true, data: { ok: true } }; } catch (e) { return fail(e); }
}
export async function usageSummaryAction(days = 30): Promise<Result<{ total: number; byName: { name: string; count: number }[]; byCategory: { name: string; count: number }[] }>> {
  try { return { ok: true, data: await usageSummary(days) }; } catch (e) { return fail(e); }
}

// ── Diagnostics + production score + deployment validation ────────────────────
export async function runDiagnosticsAction(): Promise<Result<DiagnosticsReport>> {
  try { return { ok: true, data: await runDiagnostics() }; } catch (e) { return fail(e); }
}
export async function getProductionScoreAction(): Promise<Result<{ score: ProductionScore; diagnostics: DiagnosticsReport }>> {
  try { return { ok: true, data: await getProductionScore() }; } catch (e) { return fail(e); }
}
export async function runDeploymentValidationAction(): Promise<Result<Awaited<ReturnType<typeof runDeploymentValidation>>>> {
  try { return { ok: true, data: await runDeploymentValidation() }; } catch (e) { return fail(e); }
}

// ── Support ───────────────────────────────────────────────────────────────────
export async function startImpersonationAction(targetUserId: string, reason: string | null): Promise<Result<{ id: string | null }>> {
  try { return { ok: true, data: { id: await startImpersonation(targetUserId, reason) } }; } catch (e) { return fail(e); }
}
export async function endImpersonationAction(id: string): Promise<Result<{ ok: true }>> {
  try { await endImpersonation(id); revalidatePath("/admin/support"); return { ok: true, data: { ok: true } }; } catch (e) { return fail(e); }
}
export async function listImpersonationAction(): Promise<Result<{ rows: Record<string, unknown>[] }>> {
  try { return { ok: true, data: { rows: await listImpersonation() } }; } catch (e) { return fail(e); }
}
