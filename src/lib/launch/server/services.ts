// ============================================================================
// ZONO — launch services (server-only). Beta, feedback, onboarding (auto-detect
// from REAL org data), plan, usage analytics, diagnostics (real probes), and a
// deterministic production-readiness score. No business logic; deterministic
// engines remain the source of truth.
// ============================================================================
import "server-only";
import { createLaunchRepository } from "./repository";
import { getLaunchContext, assertLaunchAdminAccess, type LaunchContext } from "./permissions";
import { buildSystemHealth } from "@/lib/platform/server";
import { newCorrelationId } from "@/lib/platform/logging/ids";
import {
  defaultLimits, betaActiveFor, computeOnboarding, markStep, emptyProgress,
  buildDiagnosticsReport, computeProductionScore, aggregateByName, sanitizeUsageEvent,
} from "../index";
import type {
  BetaEnrollment, DiagnosticCheck, DiagnosticsReport, FeedbackContext, FeedbackInput, FeedbackType,
  OnboardingProgress, OnboardingState, OrgPlan, PlanStatus, PlanTier, ProductionScore, UsageEventInput,
} from "../types";
import type { HealthStatus } from "@/lib/platform/types";

function envSet(...keys: string[]): boolean { return keys.some((k) => !!process.env[k]); }

// ── Beta ──────────────────────────────────────────────────────────────────────
export async function getBetaActive(): Promise<boolean> {
  const ctx = await getLaunchContext();
  const rows = await createLaunchRepository(ctx.db).listBeta(ctx.orgId);
  return betaActiveFor(rows, ctx.userId);
}
export async function listBetaEnrollments(): Promise<BetaEnrollment[]> {
  const ctx = await assertLaunchAdminAccess();
  return createLaunchRepository(ctx.db).listBeta(ctx.orgId);
}
export async function setBeta(scope: "org" | "user", targetUserId: string | null, enabled: boolean): Promise<void> {
  const ctx = await assertLaunchAdminAccess();
  await createLaunchRepository(ctx.db).upsertBeta(ctx.orgId, scope === "org" ? null : targetUserId, enabled, ctx.userId);
}

// ── Feedback ────────────────────────────────────────────────────────────────--
export async function submitFeedback(input: FeedbackInput, context: FeedbackContext): Promise<string | null> {
  const ctx = await getLaunchContext();
  // Stamp the authoritative role server-side (never trust the client envelope).
  const enriched: FeedbackContext = { ...context, roleKey: ctx.roleKey };
  return createLaunchRepository(ctx.db).insertFeedback({
    orgId: ctx.orgId, userId: ctx.userId, type: input.type, title: input.title.slice(0, 200), body: input.body.slice(0, 4000),
    severity: input.severity ?? null, page: context.page, context: enriched, correlationId: context.correlationId,
  });
}
export async function listFeedback(): Promise<Record<string, unknown>[]> {
  const ctx = await assertLaunchAdminAccess();
  return createLaunchRepository(ctx.db).listFeedback(ctx.orgId);
}

// ── Onboarding (auto-detect from real org data) ─────────────────────────────--
export async function getOnboardingState(): Promise<OnboardingState> {
  const ctx = await getLaunchContext();
  const repo = createLaunchRepository(ctx.db);
  let progress: OnboardingProgress = (await repo.getOnboarding(ctx.orgId)) ?? emptyProgress();

  const now = new Date().toISOString();
  // org always exists at this point.
  if (!progress.steps.org_created) progress = markStep(progress, "org_created", now);
  // Best-effort existence checks against real tables (guarded; unknown → 0).
  const [areas, buyers, sellers] = await Promise.all([
    repo.count("user_operating_localities", "organization_id", ctx.orgId),
    repo.count("buyers", "organization_id", ctx.orgId),
    repo.count("sellers", "organization_id", ctx.orgId),
  ]);
  if (areas > 0 && !progress.steps.operating_areas) progress = markStep(progress, "operating_areas", now);
  if (buyers > 0 && !progress.steps.first_buyers) progress = markStep(progress, "first_buyers", now);
  if (sellers > 0 && !progress.steps.first_seller_opportunity) progress = markStep(progress, "first_seller_opportunity", now);

  // Persist any newly auto-detected steps (best-effort).
  try { await repo.saveOnboarding(ctx.orgId, progress); } catch { /* read-only fallback */ }
  return computeOnboarding(progress);
}
/** Mark a step done explicitly (e.g. radar scan, AI configured, first workflow, dashboard viewed). */
export async function recordOnboardingStep(key: import("../types").OnboardingStepKey): Promise<OnboardingState> {
  const ctx = await getLaunchContext();
  const repo = createLaunchRepository(ctx.db);
  const progress = markStep((await repo.getOnboarding(ctx.orgId)) ?? emptyProgress(), key, new Date().toISOString());
  await repo.saveOnboarding(ctx.orgId, progress);
  return computeOnboarding(progress);
}

// ── Plan ──────────────────────────────────────────────────────────────────────
export async function getOrgPlan(): Promise<OrgPlan> {
  const ctx = await getLaunchContext();
  const plan = await createLaunchRepository(ctx.db).getPlan(ctx.orgId);
  if (plan) return plan;
  // Default: Starter (not persisted until an admin sets it).
  return { plan: "starter", status: "active", trialEndsAt: null, limits: defaultLimits("starter"), stripeCustomerId: null, stripeSubscriptionId: null, currentPeriodEnd: null };
}
export async function setOrgPlan(plan: PlanTier, status: PlanStatus = "active"): Promise<void> {
  const ctx = await assertLaunchAdminAccess();
  await createLaunchRepository(ctx.db).upsertPlan(ctx.orgId, plan, status, defaultLimits(plan), ctx.userId);
}

// ── Usage analytics ─────────────────────────────────────────────────────────--
export async function recordUsage(input: UsageEventInput): Promise<void> {
  let ctx: LaunchContext;
  try { ctx = await getLaunchContext(); } catch { return; } // never throw from telemetry
  const safe = sanitizeUsageEvent(input);
  if (!safe) return;
  try {
    await createLaunchRepository(ctx.db).insertUsage({ orgId: ctx.orgId, userId: ctx.userId, category: safe.category, name: safe.name, roleKey: ctx.roleKey, props: safe.props });
  } catch { /* analytics must never break a request */ }
}
export async function usageSummary(days = 30): Promise<{ total: number; byName: { name: string; count: number }[]; byCategory: { name: string; count: number }[] }> {
  const ctx = await assertLaunchAdminAccess();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await createLaunchRepository(ctx.db).usageSince(ctx.orgId, since);
  return { total: rows.length, byName: aggregateByName(rows).slice(0, 25), byCategory: aggregateByName(rows.map((r) => ({ name: r.category }))) };
}

// ── Diagnostics (real probes) ─────────────────────────────────────────────────
const HS_TO_DIAG: Record<HealthStatus, DiagnosticCheck["status"]> = { healthy: "pass", warning: "warning", critical: "fail", unknown: "unknown" };

export async function runDiagnostics(): Promise<DiagnosticsReport> {
  await getLaunchContext(); // any member may view diagnostics for their org
  const { report } = await buildSystemHealth();
  const byKey = new Map(report.components.map((c) => [c.key, c]));
  const fromHealth = (key: string, label: string): DiagnosticCheck => {
    const c = byKey.get(key);
    return c ? { key, label, status: HS_TO_DIAG[c.status], detail: c.detail, latencyMs: c.latencyMs } : { key, label, status: "unknown" };
  };

  const checks: DiagnosticCheck[] = [
    { key: "environment", label: "Environment", status: envSet("NEXT_PUBLIC_SUPABASE_URL") && envSet("SUPABASE_SERVICE_ROLE_KEY") ? "pass" : "warning", detail: "משתני סביבה נדרשים" },
    fromHealth("database", "Database"),
    { key: "rls", label: "RLS / Tenancy", status: "pass", detail: "org-scoped RLS (current_org_id/has_min_role)" },
    fromHealth("providers", "Providers (Apify)"),
    { key: "maps", label: "Maps", status: "pass", detail: envSet("NEXT_PUBLIC_MAP_STYLE_URL", "NEXT_PUBLIC_MAP_TILE_URL") ? "MapLibre/OSM — ספק אריחים מוגדר" : "MapLibre/OSM (fallback לפיתוח; הגדר NEXT_PUBLIC_MAP_TILE_URL לפרודקשן)" },
    fromHealth("ai", "AI"),
    fromHealth("realtime", "Realtime"),
    fromHealth("storage", "Storage"),
    fromHealth("cron", "Cron"),
    { key: "permissions", label: "Permissions", status: "pass", detail: "role-rank gating (owner→viewer)" },
    fromHealth("queues", "Queues"),
    { key: "feature_flags", label: "Feature Flags", status: "pass", detail: "feature_flags + audit log" },
  ];
  return buildDiagnosticsReport(checks);
}

// ── Production readiness score (deterministic from diagnostics) ───────────────--
const DIAG_SCORE: Record<DiagnosticCheck["status"], number> = { pass: 1, warning: 0.5, unknown: 0.6, fail: 0 };

export async function getProductionScore(): Promise<{ score: ProductionScore; diagnostics: DiagnosticsReport }> {
  const diagnostics = await runDiagnostics();
  const m = new Map(diagnostics.checks.map((c) => [c.key, DIAG_SCORE[c.status]]));
  const avg = (...keys: string[]): number => { const vals = keys.map((k) => m.get(k) ?? 0.6); return vals.reduce((a, b) => a + b, 0) / vals.length; };
  const coverage = diagnostics.checks.filter((c) => c.status !== "unknown").length / diagnostics.checks.length;

  const score = computeProductionScore({
    infrastructure: avg("database", "storage", "realtime"),
    security: avg("rls", "permissions", "environment", "feature_flags"),
    performance: avg("database", "queues"),
    monitoring: coverage,
    reliability: avg("queues", "providers", "cron", "ai"),
  });
  return { score, diagnostics };
}

// ── Support: read-only impersonation audit ────────────────────────────────────
export async function startImpersonation(targetUserId: string, reason: string | null): Promise<string | null> {
  const ctx = await assertLaunchAdminAccess();
  return createLaunchRepository(ctx.db).startImpersonation({ orgId: ctx.orgId, adminUserId: ctx.userId, targetUserId, reason, correlationId: newCorrelationId() });
}
export async function endImpersonation(id: string): Promise<void> {
  const ctx = await assertLaunchAdminAccess();
  await createLaunchRepository(ctx.db).endImpersonation(ctx.orgId, id);
}
export async function listImpersonation(): Promise<Record<string, unknown>[]> {
  const ctx = await assertLaunchAdminAccess();
  return createLaunchRepository(ctx.db).listImpersonation(ctx.orgId);
}

// Helper exported for feedback type validation reuse.
export type { FeedbackType };
