// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION SERVICE (server wiring). Phase 3C.
// ----------------------------------------------------------------------------
// Wires the reconciliation queue engine to production adapters: the Supabase
// reconcile store (SKIP LOCKED claim), the sealed READ-ONLY Graph inspection
// gateway, and the same server credential resolver publishing uses. Enforces role
// gates (a support operator can never silently mark provider success; there is no
// generic mark-success action) and org-scoped access. The dispatcher/recover
// entrypoints are driven only by the protected internal routes. Returns safe DTOs.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { logAudit } from "@/lib/audit/service";
import { resolveAssetCredential } from "../publish/service";
import { createInspectionGateway } from "../provider/graph";
import { createSupabaseReconcileStore } from "./store";
import type { ReconcilePorts } from "./ports";
import * as engine from "./engine";
import { toDiscrepancyListItem, toDiscrepancyDetail, type DiscrepancyListItemDTO, type DiscrepancyDetailDTO } from "./read";
import { evaluateReconcileQueueHealth, type HealthResult } from "./health";
import { canRequestVerification, canResolveDiscrepancy } from "./roles";
export { canRequestVerification, canResolveDiscrepancy } from "./roles";

export function buildReconcilePorts(): ReconcilePorts {
  return {
    store: createSupabaseReconcileStore(),
    inspect: createInspectionGateway(),
    credential: { resolve: (orgId, assetId) => resolveAssetCredential(orgId, assetId) },
    clock: { nowMs: () => Date.now(), nowIso: () => new Date().toISOString() },
    ids: { uuid: () => crypto.randomUUID() },
    audit: { log: (i) => logAudit({ action: i.action, category: "configuration", entityType: "meta_reconciliation_job", entityId: i.entityId, summary: i.summary, metadata: i.metadata }) },
    random: { fraction: () => Math.random() },
  };
}

// ── Internal worker entrypoints (protected routes only) ────────────────────────
export interface ReconcileTickResult { claimed: number; verified: number; discrepancies: number; unresolved: number; retries: number }
export async function runReconcileDispatchTick(opts?: { limit?: number; perOrgMax?: number }): Promise<ReconcileTickResult> {
  const ports = buildReconcilePorts();
  const leaseOwner = `recon:${crypto.randomUUID()}`;
  const claimed = await engine.dispatchDue(ports, { leaseOwner, limit: opts?.limit, perOrgMax: opts?.perOrgMax });
  const res: ReconcileTickResult = { claimed: claimed.length, verified: 0, discrepancies: 0, unresolved: 0, retries: 0 };
  for (const job of claimed) {
    const out = await engine.workJob(ports, job);
    if (out.outcome === "discrepancy_open") res.discrepancies++;
    else if (out.job.status === "verified") res.verified++;
    else if (out.job.status === "unresolved") res.unresolved++;
    else if (out.job.status === "retry_wait") res.retries++;
  }
  return res;
}
export async function runReconcileRecoveryTick(opts?: { limit?: number }): Promise<{ recovered: number; requeued: number }> {
  return engine.recoverAbandoned(buildReconcilePorts(), { limit: opts?.limit });
}
export async function reconcileHeartbeat(orgId: string, jobId: string, owner: string, token: string): Promise<{ ok: boolean; reason?: string }> {
  const r = await engine.heartbeat(buildReconcilePorts(), orgId, jobId, owner, token);
  return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? "heartbeat_failed" };
}

// ── User-facing actions ────────────────────────────────────────────────────────
/** Request provider verification for a target/operation (role-gated). */
export async function requestVerification(orgId: string, userId: string, role: string, params: { targetId?: string; operationId?: string; providerObjectId?: string }): Promise<{ ok: boolean; error?: string; jobId?: string }> {
  if (!canRequestVerification(role)) return { ok: false, error: "forbidden" };
  const ports = buildReconcilePorts();
  const correlationId = crypto.randomUUID();
  const anchor = params.providerObjectId ?? params.targetId ?? params.operationId ?? "";
  if (!anchor) return { ok: false, error: "bad_request" };
  const idempotencyKey = crypto.createHash("sha256").update(`${orgId}|manual|${anchor}|${Math.floor(Date.now() / 60000)}`).digest("hex");
  const r = await engine.scheduleVerification(ports, { orgId, jobKind: "manual_verification", operationId: params.operationId ?? null, targetId: params.targetId ?? null, providerObjectId: params.providerObjectId ?? null, availableAtMs: Date.now(), priority: 50, correlationId, idempotencyKey, reason: "manual_request" });
  await logAudit({ action: "meta.reconcile.manual_verification_requested", category: "configuration", entityType: "meta_reconciliation_job", entityId: r.job.id, summary: "manual verification requested", metadata: { by: userId, anchor } });
  return { ok: true, jobId: r.job.id };
}

/** Acknowledge a discrepancy (explicit actor + audit; never a silent success). */
export async function acknowledgeDiscrepancy(orgId: string, userId: string, role: string, discrepancyId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!canResolveDiscrepancy(role)) return { ok: false, error: "forbidden" };
  const store = createSupabaseReconcileStore();
  const d = await store.getDiscrepancy(orgId, discrepancyId);
  if (!d) return { ok: false, error: "not_found" };
  await store.updateDiscrepancy({ ...d, status: "acknowledged", resolvedBy: userId, resolutionReason: reason || "acknowledged" });
  await logAudit({ action: "meta.reconcile.discrepancy_acknowledged", category: "configuration", entityType: "meta_publish_discrepancy", entityId: discrepancyId, summary: "discrepancy acknowledged", metadata: { by: userId, reason } });
  return { ok: true };
}

/** Resolve a discrepancy as a false positive (requires an explicit reason). */
export async function resolveFalsePositive(orgId: string, userId: string, role: string, discrepancyId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  if (!canResolveDiscrepancy(role)) return { ok: false, error: "forbidden" };
  if (!reason || !reason.trim()) return { ok: false, error: "reason_required" };
  const store = createSupabaseReconcileStore();
  const d = await store.getDiscrepancy(orgId, discrepancyId);
  if (!d) return { ok: false, error: "not_found" };
  await store.updateDiscrepancy({ ...d, status: "false_positive", resolution: "false_positive", resolvedBy: userId, resolutionReason: reason });
  await logAudit({ action: "meta.reconcile.discrepancy_false_positive", category: "configuration", entityType: "meta_publish_discrepancy", entityId: discrepancyId, summary: "discrepancy resolved as false positive", metadata: { by: userId, reason } });
  return { ok: true };
}

// ── Reads ──────────────────────────────────────────────────────────────────────
export async function listDiscrepancies(orgId: string): Promise<readonly DiscrepancyListItemDTO[]> {
  return (await createSupabaseReconcileStore().listDiscrepancies(orgId)).map(toDiscrepancyListItem);
}
export async function getDiscrepancyDetail(orgId: string, id: string): Promise<DiscrepancyDetailDTO | null> {
  const d = await createSupabaseReconcileStore().getDiscrepancy(orgId, id);
  return d ? toDiscrepancyDetail(d) : null;
}
export async function getReconcileQueueHealth(orgId: string | null): Promise<HealthResult & { backlog: number; inFlight: number; deadLetter: number }> {
  const counts = await createSupabaseReconcileStore().queueHealth(orgId, Date.now());
  const backlog = (counts.byStatus.scheduled ?? 0) + (counts.byStatus.available ?? 0) + (counts.byStatus.retry_wait ?? 0);
  const inFlight = (counts.byStatus.claimed ?? 0) + (counts.byStatus.executing ?? 0);
  const health = evaluateReconcileQueueHealth({ backlog, inFlight, oldestDueMs: counts.oldestDueMs, deadLetter: counts.deadLetter, unresolved: counts.unresolved });
  return { ...health, backlog, inFlight, deadLetter: counts.deadLetter };
}
