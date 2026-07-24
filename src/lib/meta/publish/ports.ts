// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH ENGINE PORTS. Phase 3A.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the PURE publish engine. Persistence currency is
// canonical + secret-free (no token, signed URL, storage_ref, or raw Graph
// payload). Real adapters (Supabase store, sealed Graph publish gateway, media
// delivery, audit) are wired in service.ts; QA drives an in-memory store + a mock
// gateway. Credentials/media URLs are resolved just-in-time via ports and never
// persisted or surfaced.
// ============================================================================
import type { OperationStatus, TargetStatus, AttemptResult } from "./state";
import type { PublishGateway } from "./provider-types";
import type { Clock, IdGen, AuditSink } from "../connection/ports";

export type { Clock, IdGen, AuditSink } from "../connection/ports";
export type { PublishGateway } from "./provider-types";

export interface PublishOperationRow {
  id: string; orgId: string; draftId: string; draftVersionNumber: number; contentHash: string;
  requestedBy: string | null; requestedAt: string; mode: "immediate"; status: OperationStatus;
  targetCount: number; successfulTargetCount: number; failedTargetCount: number; skippedTargetCount: number;
  startedAt: string | null; completedAt: string | null; cancelledAt: string | null; cancellationReason: string | null;
  correlationId: string; idempotencyKey: string; revision: number;
}

export interface TargetExecContent {
  caption: string; hashtags: readonly string[];
  media: ReadonlyArray<{ mediaId: string; kind: "image" | "video"; storageRef: string; mime: string }>;
}

export interface PublishTargetRow {
  id: string; orgId: string; operationId: string; draftTargetId: string;
  platform: "facebook" | "instagram"; assetKind: "page" | "instagram"; assetId: string; contentKind: string;
  status: TargetStatus; idempotencyKey: string;
  providerObjectId: string | null; providerContainerId: string | null; providerPermalink: string | null;
  safeErrorKind: string | null; safeErrorMessage: string | null; retryable: boolean; retryClass: string | null;
  capabilityAllowed: boolean; exec: TargetExecContent; revision: number;
  startedAt: string | null; completedAt: string | null; lastAttemptAt: string | null;
}

export interface PublishAttemptRow {
  id: string; orgId: string; operationId: string; targetId: string; attemptNumber: number;
  initiatedBy: string | null; initiationKind: "initial" | "manual_retry"; startedAt: string; completedAt: string | null;
  result: AttemptResult | null; safeErrorKind: string | null; retryable: boolean | null; retryClass: string | null;
  providerCodeCategory: string | null; providerRequestId: string | null; correlationId: string | null; durationMs: number | null;
}

export interface ProviderObjectRow {
  id: string; orgId: string; operationId: string; targetId: string; platform: "facebook" | "instagram"; assetId: string;
  providerObjectType: string; externalObjectId: string; externalContainerId: string | null; permalink: string | null;
  providerStatus: string | null; createdTime: string | null;
}

export interface PublishStore {
  findOperationByIdem(orgId: string, idempotencyKey: string): Promise<PublishOperationRow | null>;
  insertOperation(row: PublishOperationRow): Promise<void>;
  getOperation(orgId: string, id: string): Promise<PublishOperationRow | null>;
  listOperations(orgId: string): Promise<readonly PublishOperationRow[]>;
  updateOperation(row: PublishOperationRow): Promise<void>;
  insertTarget(row: PublishTargetRow): Promise<void>;
  getTarget(orgId: string, id: string): Promise<PublishTargetRow | null>;
  listTargets(orgId: string, operationId: string): Promise<readonly PublishTargetRow[]>;
  updateTarget(row: PublishTargetRow): Promise<void>;
  insertAttempt(row: PublishAttemptRow): Promise<void>;
  listAttempts(orgId: string, targetId: string): Promise<readonly PublishAttemptRow[]>;
  insertProviderObject(row: ProviderObjectRow): Promise<void>;
}

export interface AssetPublishResolver {
  resolve(orgId: string, assetId: string): Promise<{ externalId: string; tokenPlain: string } | null>;
}
export interface MediaUrlResolver {
  resolve(orgId: string, mediaId: string, storageRef: string): Promise<string | null>;
}

export interface PublishPorts {
  store: PublishStore;
  gateway: PublishGateway;
  asset: AssetPublishResolver;
  media: MediaUrlResolver;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
}

/** Conservative bounded target concurrency (configurable via env in service). */
export const DEFAULT_TARGET_CONCURRENCY = 3;
