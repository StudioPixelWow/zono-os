// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · INSIGHTS SERVICE (server wiring). Phase 2.
// ----------------------------------------------------------------------------
// Wires the insight refresh engine to production adapters: the Supabase insights
// store (SKIP LOCKED claim), the sealed READ-ONLY insights gateway, the same
// server credential resolver publishing uses, and a capability resolver on the
// existing evaluator (analytics.basic.read via resolveRuntime). Refresh scheduling
// is bounded (decaying cadence, quiesce); the dispatcher/recover entrypoints are
// protected internal routes. Reads return safe, secret-free DTOs.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { logAudit } from "@/lib/audit/service";
import { resolveAssetCredential, resolveRuntime } from "../publish/service";
import { createInsightsGateway } from "../provider/graph";
import { createSupabaseInsightsStore } from "./store";
import type { InsightsPorts, CapabilityResolver } from "./ports";
import * as engine from "./engine";
import { toInsightSummary, type InsightSummaryDTO } from "./read";
import { canViewInsights } from "./roles";
export { canViewInsights } from "./roles";
import type { MetaPlatform } from "../types";

const analyticsCap = () => "analytics.basic.read";
function capabilityResolver(): CapabilityResolver {
  return { async analyticsReadAllowed(orgId, assetId) { const rt = await resolveRuntime(orgId, assetId, analyticsCap()); return rt.capability.allowed; } };
}

export function buildInsightsPorts(): InsightsPorts {
  return {
    store: createSupabaseInsightsStore(),
    gateway: createInsightsGateway(),
    credential: { resolve: (orgId, assetId) => resolveAssetCredential(orgId, assetId) },
    capability: capabilityResolver(),
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_insight_refresh_job", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── Seed refreshes (user-triggered or post-publish) ────────────────────────────
export async function refreshObjectInsights(orgId: string, role: string, providerObjectId: string): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canViewInsights(role)) return { ok: false, error: "forbidden" };
  const ports = buildInsightsPorts();
  const ref = await ports.store.objectRef(orgId, providerObjectId);
  if (!ref) return { ok: false, error: "not_found" };
  if (!(await ports.capability.analyticsReadAllowed(orgId, ref.assetId, ref.platform))) return { ok: false, error: "capability_denied" };
  const idem = crypto.createHash("sha256").update(`${orgId}|insight|object|${providerObjectId}|seed`).digest("hex");
  const r = await engine.scheduleRefresh(ports, { orgId, subjectKind: "object", subjectRef: providerObjectId, platform: ref.platform, availableAtMs: Date.now(), priority: 60, correlationId: crypto.randomUUID(), idempotencyKey: idem });
  return { ok: true, jobId: r.job.id };
}
export async function refreshAccountInsights(orgId: string, role: string, assetId: string, platform: MetaPlatform): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canViewInsights(role)) return { ok: false, error: "forbidden" };
  const ports = buildInsightsPorts();
  if (!(await ports.capability.analyticsReadAllowed(orgId, assetId, platform))) return { ok: false, error: "capability_denied" };
  const idem = crypto.createHash("sha256").update(`${orgId}|insight|account|${assetId}|seed`).digest("hex");
  const r = await engine.scheduleRefresh(ports, { orgId, subjectKind: "account", subjectRef: assetId, platform, availableAtMs: Date.now(), priority: 70, correlationId: crypto.randomUUID(), idempotencyKey: idem });
  return { ok: true, jobId: r.job.id };
}

// ── Internal worker entrypoints (protected routes only) ────────────────────────
export interface InsightTickResult { claimed: number; appended: number; succeeded: number; failed: number; retries: number }
export async function runInsightDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<InsightTickResult> {
  const ports = buildInsightsPorts();
  const leaseOwner = `insight:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: InsightTickResult = { claimed: claimed.length, appended: 0, succeeded: 0, failed: 0, retries: 0 };
  for (const job of claimed) {
    const out = await engine.workJob(ports, job);
    res.appended += out.appended ?? 0;
    if (out.job.status === "succeeded") res.succeeded++;
    else if (out.job.status === "failed" || out.job.status === "dead_letter") res.failed++;
    else if (out.job.status === "retry_wait") res.retries++;
  }
  return res;
}
export async function runInsightRecoveryTick(opts?: { limit?: number }): Promise<{ recovered: number; requeued: number }> {
  return engine.recoverAbandoned(buildInsightsPorts(), { limit: opts?.limit });
}

// ── Reads (safe DTOs; org-scoped) ─────────────────────────────────────────────
export async function getObjectInsights(orgId: string, providerObjectId: string): Promise<InsightSummaryDTO> {
  return toInsightSummary(await createSupabaseInsightsStore().listObjectSeries(orgId, providerObjectId));
}
export async function getAccountInsights(orgId: string, assetId: string): Promise<InsightSummaryDTO> {
  return toInsightSummary(await createSupabaseInsightsStore().listAccountSeries(orgId, assetId));
}

// ── Queue health (Batch 7 · Production GA) — secret-free status-count snapshot ─
export async function getInsightsQueueHealth(orgId: string | null): Promise<{ byStatus: Readonly<Record<string, number>>; deadLetter: number; oldestDueMs: number | null }> {
  return createSupabaseInsightsStore().queueHealth(orgId, Date.now());
}
