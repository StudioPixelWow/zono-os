// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH ENGINE (PURE). Phase 3A.
// ----------------------------------------------------------------------------
// Immediate multi-target publishing over injected ports — deterministically
// testable with a mock gateway + in-memory store. Guarantees: idempotent create
// (duplicate command resumes the existing operation); each target executes
// INDEPENDENTLY with bounded concurrency; partial success is first-class (one
// failure never rolls back a sibling success); provider objects are persisted
// ONLY after confirmed success; ambiguous writes are NEVER auto-retried (→
// manual_review_required); manual retry creates a NEW attempt without a new
// target and never republishes a success; cancellation is allowed only before
// execution. Every transition is audited; canonical events emit once.
// ============================================================================
import type { PublishPorts, PublishOperationRow, PublishTargetRow, PublishAttemptRow, TargetExecContent } from "./ports";
import { DEFAULT_TARGET_CONCURRENCY } from "./ports";
import type { PublishSnapshot } from "./snapshot";
import { deriveOperationStatus, canExecuteTarget, TARGET_TERMINAL, type TargetStatus } from "./state";
import { classifyFailure } from "./classify";
import type { ProviderPublishRequest, ProviderPublishResult } from "./provider-types";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent, MetaNotificationEventName } from "../notify/types";
import type { MetaProviderErrorKind } from "../provider/errors";

export interface CreateResult { operation: PublishOperationRow; targets: readonly PublishTargetRow[]; resumed: boolean }

/** Create (or resume) an immediate publish operation from an immutable snapshot. */
export async function createOperation(ports: PublishPorts, snapshot: PublishSnapshot, publishableTargetIds: readonly string[]): Promise<CreateResult> {
  const existing = await ports.store.findOperationByIdem(snapshot.orgId, snapshot.operationIdempotencyKey);
  if (existing) {
    const targets = await ports.store.listTargets(snapshot.orgId, existing.id);
    return { operation: existing, targets, resumed: true };
  }
  const now = ports.clock.nowIso();
  const selected = snapshot.targets.filter((t) => publishableTargetIds.includes(t.draftTargetId));
  const op: PublishOperationRow = {
    id: ports.ids.uuid(), orgId: snapshot.orgId, draftId: snapshot.draftId, draftVersionNumber: snapshot.draftVersionNumber,
    contentHash: snapshot.contentHash, requestedBy: snapshot.requestedBy, requestedAt: now, mode: "immediate",
    status: "ready", targetCount: selected.length, successfulTargetCount: 0, failedTargetCount: 0, skippedTargetCount: 0,
    startedAt: null, completedAt: null, cancelledAt: null, cancellationReason: null,
    correlationId: snapshot.correlationId, idempotencyKey: snapshot.operationIdempotencyKey, revision: 1,
  };
  await ports.store.insertOperation(op);
  const targets: PublishTargetRow[] = [];
  for (const s of selected) {
    const exec: TargetExecContent = { caption: s.caption, hashtags: s.hashtags, media: s.media.map((m) => ({ mediaId: m.mediaId, kind: m.kind, storageRef: m.storageRef, mime: m.mime })) };
    const row: PublishTargetRow = {
      id: ports.ids.uuid(), orgId: snapshot.orgId, operationId: op.id, draftTargetId: s.draftTargetId,
      platform: s.platform, assetKind: s.assetKind, assetId: s.assetId, contentKind: s.contentKind,
      status: "ready", idempotencyKey: s.idempotencyKey, providerObjectId: null, providerContainerId: null, providerPermalink: null,
      safeErrorKind: null, safeErrorMessage: null, retryable: false, retryClass: null,
      capabilityAllowed: s.capabilityDecision.allowed, exec, revision: 1,
      startedAt: null, completedAt: null, lastAttemptAt: null,
    };
    await ports.store.insertTarget(row);
    targets.push(row);
  }
  await ports.audit.log({ action: "meta.publish.operation_created", entityId: op.id, summary: `publish operation created (${selected.length} targets)`, metadata: { draftId: snapshot.draftId, version: snapshot.draftVersionNumber, targets: selected.length } });
  return { operation: op, targets, resumed: false };
}

async function runBounded<T>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx], idx); }
  });
  await Promise.all(workers);
}

const TARGET_EVENT: Record<"succeeded" | "failed" | "manual_review", MetaNotificationEventName> = {
  succeeded: "meta.post.published", failed: "meta.post.failed", manual_review: "meta.post.manual_review_required",
};

/** Execute one target independently. Never republishes a terminal success. */
async function executeTarget(ports: PublishPorts, op: PublishOperationRow, target: PublishTargetRow, initiation: "initial" | "manual_retry", actor: string | null): Promise<PublishTargetRow> {
  if (!canExecuteTarget(target.status) && target.status !== "failed") return target;
  const startMs = ports.clock.nowMs();
  const attemptNumber = (await ports.store.listAttempts(op.orgId, target.id)).length + 1;
  const attempt: PublishAttemptRow = {
    id: ports.ids.uuid(), orgId: op.orgId, operationId: op.id, targetId: target.id, attemptNumber,
    initiatedBy: actor, initiationKind: initiation, startedAt: ports.clock.nowIso(), completedAt: null,
    result: null, safeErrorKind: null, retryable: null, retryClass: null, providerCodeCategory: null, providerRequestId: null, correlationId: op.correlationId, durationMs: null,
  };
  await ports.store.insertAttempt(attempt);
  let t: PublishTargetRow = { ...target, status: "executing", startedAt: ports.clock.nowIso(), lastAttemptAt: ports.clock.nowIso(), revision: target.revision + 1 };
  await ports.store.updateTarget(t);
  await ports.audit.log({ action: "meta.publish.target_started", entityId: target.id, summary: `target executing (${target.platform})`, metadata: { platform: target.platform, contentKind: target.contentKind, attempt: attemptNumber } });

  const asset = await ports.asset.resolve(op.orgId, target.assetId);
  let result: ProviderPublishResult;
  if (!asset) {
    result = { ok: false, providerObjectId: null, providerContainerId: null, permalink: null, processingState: "done", ambiguous: false, error: { kind: "asset_disconnected", safeMessage: "asset credential unavailable", providerCodeCategory: null, retryClass: "retry_after_reauth" }, warnings: [] };
  } else {
    const media = [];
    let mediaOk = true;
    for (const m of target.exec.media) {
      const url = await ports.media.resolve(op.orgId, m.mediaId, m.storageRef);
      if (!url) { mediaOk = false; break; }
      media.push({ url, kind: m.kind, mime: m.mime });
    }
    if (!mediaOk) {
      result = { ok: false, providerObjectId: null, providerContainerId: null, permalink: null, processingState: "done", ambiguous: false, error: { kind: "invalid_media", safeMessage: "media could not be prepared for delivery", providerCodeCategory: null, retryClass: "retryable" }, warnings: [] };
    } else {
      const req: ProviderPublishRequest = { platform: target.platform, contentKind: target.contentKind, assetExternalId: asset.externalId, tokenPlain: asset.tokenPlain, caption: target.exec.caption, hashtags: target.exec.hashtags, media, idempotencyKey: target.idempotencyKey, correlationId: op.correlationId, timeoutMs: 15_000, pollMaxAttempts: 10, pollMaxMs: 60_000 };
      result = await ports.gateway.publish(req);
    }
  }

  const durationMs = ports.clock.nowMs() - startMs;
  let status: TargetStatus; let aResult: PublishAttemptRow["result"]; let event: MetaNotificationEventName | null = null;
  if (result.ok && result.providerObjectId) {
    status = "succeeded"; aResult = "succeeded"; event = TARGET_EVENT.succeeded;
    await ports.store.insertProviderObject({ id: ports.ids.uuid(), orgId: op.orgId, operationId: op.id, targetId: target.id, platform: target.platform, assetId: target.assetId, providerObjectType: target.contentKind, externalObjectId: result.providerObjectId, externalContainerId: result.providerContainerId, permalink: result.permalink, providerStatus: "published", createdTime: ports.clock.nowIso() });
    t = { ...t, status, providerObjectId: result.providerObjectId, providerContainerId: result.providerContainerId, providerPermalink: result.permalink, completedAt: ports.clock.nowIso(), retryable: false, retryClass: null, safeErrorKind: null, safeErrorMessage: null, revision: t.revision + 1 };
  } else {
    const kind = (result.error?.kind ?? "internal") as MetaProviderErrorKind;
    const cls = classifyFailure(kind, result.ambiguous);
    if (cls.manualReviewRequired) { status = "manual_review_required"; aResult = "ambiguous"; event = TARGET_EVENT.manual_review; }
    else if (result.processingState === "processing") { status = "provider_processing"; aResult = "failed"; }
    else { status = "failed"; aResult = "failed"; event = TARGET_EVENT.failed; }
    t = { ...t, status, providerContainerId: result.providerContainerId ?? t.providerContainerId, completedAt: status === "provider_processing" ? null : ports.clock.nowIso(), retryable: cls.manualRetryEligible, retryClass: cls.retryClass, safeErrorKind: result.error?.kind ?? "internal", safeErrorMessage: result.error?.safeMessage ?? "publish failed", revision: t.revision + 1 };
  }
  await ports.store.updateTarget(t);
  await ports.store.insertAttempt({ ...attempt, completedAt: ports.clock.nowIso(), result: aResult, safeErrorKind: t.safeErrorKind, retryable: t.retryable, retryClass: t.retryClass, providerCodeCategory: result.error?.providerCodeCategory ?? null, durationMs });
  await ports.audit.log({ action: `meta.publish.target_${status}`, entityId: target.id, summary: `target ${status}`, metadata: { platform: target.platform, status, errorKind: t.safeErrorKind, attempt: attemptNumber } });
  (t as { _event?: MetaNotificationEventName })._event = event ?? undefined;
  return t;
}

/** Recompute + persist the operation aggregate from its targets. Idempotent. */
async function refreshAggregate(ports: PublishPorts, op: PublishOperationRow): Promise<PublishOperationRow> {
  const targets = await ports.store.listTargets(op.orgId, op.id);
  const statuses = targets.map((t) => t.status);
  const successful = statuses.filter((s) => s === "succeeded").length;
  const failed = statuses.filter((s) => s === "failed" || s === "manual_review_required" || s === "blocked").length;
  const skipped = statuses.filter((s) => s === "skipped" || s === "cancelled").length;
  const derived = deriveOperationStatus(statuses);
  const next: PublishOperationRow = { ...op, status: derived, successfulTargetCount: successful, failedTargetCount: failed, skippedTargetCount: skipped, completedAt: statuses.every((s) => TARGET_TERMINAL.has(s) || s === "failed") ? ports.clock.nowIso() : op.completedAt, revision: op.revision + 1 };
  await ports.store.updateOperation(next);
  return next;
}

export interface ExecuteResult { operation: PublishOperationRow; events: readonly MetaNotificationEvent[] }

/** Execute all ready targets of an operation with bounded concurrency. */
export async function executeOperation(ports: PublishPorts, orgId: string, operationId: string, opts?: { concurrency?: number }): Promise<ExecuteResult> {
  const op0 = await ports.store.getOperation(orgId, operationId);
  if (!op0) throw new Error("operation_not_found");
  if (op0.status === "cancelled") return { operation: op0, events: [] };
  const started: PublishOperationRow = { ...op0, status: "executing", startedAt: ports.clock.nowIso(), revision: op0.revision + 1 };
  await ports.store.updateOperation(started);
  await ports.audit.log({ action: "meta.publish.execution_started", entityId: op0.id, summary: "execution started", metadata: { targets: op0.targetCount } });

  const targets = (await ports.store.listTargets(orgId, operationId)).filter((t) => t.status === "ready");
  const events: MetaNotificationEvent[] = [];
  await runBounded(targets, opts?.concurrency ?? DEFAULT_TARGET_CONCURRENCY, async (target) => {
    const done = await executeTarget(ports, started, target, "initial", started.requestedBy);
    const evName = (done as { _event?: MetaNotificationEventName })._event;
    if (evName) events.push(buildMetaNotificationEvent({ event: evName, orgId, occurredAt: ports.clock.nowIso(), assetRef: done.assetId, actorId: started.requestedBy, correlationId: started.correlationId, data: { targetId: done.id, platform: done.platform } }));
  });

  const finalOp = await refreshAggregate(ports, started);
  const summary: MetaNotificationEventName | null = finalOp.status === "succeeded" ? "meta.post.published" : finalOp.status === "partially_succeeded" ? "meta.post.partially_published" : finalOp.status === "failed" ? "meta.post.failed" : null;
  if (summary) events.push(buildMetaNotificationEvent({ event: summary, orgId, occurredAt: ports.clock.nowIso(), assetRef: finalOp.draftId, actorId: finalOp.requestedBy, correlationId: finalOp.correlationId, data: { operationId: finalOp.id, successful: finalOp.successfulTargetCount, failed: finalOp.failedTargetCount } }));
  await ports.audit.log({ action: `meta.publish.operation_${finalOp.status}`, entityId: finalOp.id, summary: `operation ${finalOp.status}`, metadata: { successful: finalOp.successfulTargetCount, failed: finalOp.failedTargetCount } });
  return { operation: finalOp, events };
}

export interface RetryEligibility { eligible: boolean; reason: string | null }

/** Determine whether a failed target may be MANUALLY retried (never automatic). */
export function retryEligibility(target: PublishTargetRow, ctx: { actorCanPublish: boolean; assetActive: boolean; capabilityAllowed: boolean; draftVersionMatches: boolean; mediaValid: boolean }): RetryEligibility {
  if (!ctx.actorCanPublish) return { eligible: false, reason: "not_permitted" };
  if (target.status === "succeeded") return { eligible: false, reason: "already_succeeded" };
  if (target.status === "manual_review_required") return { eligible: false, reason: "ambiguous_manual_review" };
  if (target.status !== "failed") return { eligible: false, reason: `not_failed:${target.status}` };
  if (!target.retryable) return { eligible: false, reason: "not_retryable_class" };
  if (!ctx.assetActive) return { eligible: false, reason: "asset_inactive" };
  if (!ctx.capabilityAllowed) return { eligible: false, reason: "capability_denied" };
  if (!ctx.draftVersionMatches) return { eligible: false, reason: "version_changed" };
  if (!ctx.mediaValid) return { eligible: false, reason: "media_invalid" };
  return { eligible: true, reason: null };
}

/** Manually retry an eligible failed target (new attempt; never a new target). */
export async function manualRetry(ports: PublishPorts, orgId: string, targetId: string, actor: string | null, ctx: { actorCanPublish: boolean; assetActive: boolean; capabilityAllowed: boolean; draftVersionMatches: boolean; mediaValid: boolean }): Promise<{ ok: boolean; error: string | null; target: PublishTargetRow | null; events: readonly MetaNotificationEvent[] }> {
  const target = await ports.store.getTarget(orgId, targetId);
  if (!target) return { ok: false, error: "not_found", target: null, events: [] };
  const elig = retryEligibility(target, ctx);
  if (!elig.eligible) return { ok: false, error: elig.reason, target, events: [] };
  const op = await ports.store.getOperation(orgId, target.operationId);
  if (!op) return { ok: false, error: "operation_not_found", target, events: [] };
  await ports.audit.log({ action: "meta.publish.manual_retry_started", entityId: target.id, summary: "manual retry started", metadata: { platform: target.platform } });
  const ready: PublishTargetRow = { ...target, status: "ready", revision: target.revision + 1 };
  await ports.store.updateTarget(ready);
  const done = await executeTarget(ports, op, ready, "manual_retry", actor);
  const evName = (done as { _event?: MetaNotificationEventName })._event;
  const events: MetaNotificationEvent[] = evName ? [buildMetaNotificationEvent({ event: evName, orgId, occurredAt: ports.clock.nowIso(), assetRef: done.assetId, actorId: actor, correlationId: op.correlationId, data: { targetId: done.id, platform: done.platform, retry: true } })] : [];
  await refreshAggregate(ports, op);
  return { ok: true, error: null, target: done, events };
}

/** Cancel an operation — only before provider execution begins. */
export async function cancelOperation(ports: PublishPorts, orgId: string, operationId: string, reason = "user_cancel"): Promise<{ ok: boolean; error: string | null; operation: PublishOperationRow | null }> {
  const op = await ports.store.getOperation(orgId, operationId);
  if (!op) return { ok: false, error: "not_found", operation: null };
  if (op.status === "cancelled") return { ok: true, error: null, operation: op };
  if (op.status === "executing" || op.status === "succeeded" || op.status === "partially_succeeded" || op.status === "failed") {
    return { ok: false, error: "already_executing_or_terminal", operation: op };
  }
  const targets = await ports.store.listTargets(orgId, operationId);
  for (const t of targets) if (t.status === "pending" || t.status === "ready" || t.status === "validating") await ports.store.updateTarget({ ...t, status: "cancelled", completedAt: ports.clock.nowIso(), revision: t.revision + 1 });
  const cancelled: PublishOperationRow = { ...op, status: "cancelled", cancelledAt: ports.clock.nowIso(), cancellationReason: reason, revision: op.revision + 1 };
  await ports.store.updateOperation(cancelled);
  await ports.audit.log({ action: "meta.publish.operation_cancelled", entityId: op.id, summary: "operation cancelled", metadata: { reason } });
  return { ok: true, error: null, operation: cancelled };
}
