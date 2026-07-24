// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONTENT ENGINE (PURE). Phase 2.
// ----------------------------------------------------------------------------
// The draft + approval orchestration, over injected ports so the whole workflow
// is deterministically testable. Enforces: optimistic concurrency, deterministic
// versioning (no-op edits create no version; meaningful edits create exactly
// one), approval bound to an immutable version, edit-after-approval invalidation,
// one pending request per draft, internal-only comments, and audit + canonical
// notification events on every mutation. NOTHING here publishes or queues a job.
// ============================================================================
import type { ContentPorts, DraftVersionRow, ApprovalRequestRow, ApprovalCommentRow } from "./ports";
import type { DraftState, DraftTargetState } from "./domain";
import { buildSnapshot, contentHash, shouldCreateVersion } from "./version";
import { transition, guardApprovalAction, type ApprovalPermissionCtx } from "./approval";
import { buildMetaNotificationEvent } from "../notify/events";
import type { MetaNotificationEvent } from "../notify/types";

export interface EngineResult {
  ok: boolean;
  error: string | null;
  draft: DraftState;
  versionCreated: boolean;
  invalidatedApproval: boolean;
  events: readonly MetaNotificationEvent[];
}

const res = (draft: DraftState, over: Partial<EngineResult> = {}): EngineResult => ({ ok: true, error: null, draft, versionCreated: false, invalidatedApproval: false, events: [], ...over });
const fail = (draft: DraftState, error: string): EngineResult => ({ ok: false, error, draft, versionCreated: false, invalidatedApproval: false, events: [] });

function versionRow(ports: ContentPorts, draft: DraftState, userId: string | null, reason: string | null): DraftVersionRow {
  return { id: ports.ids.uuid(), orgId: draft.orgId, draftId: draft.id, versionNumber: draft.currentVersion, snapshot: buildSnapshot(draft), contentHash: draft.contentHash!, changedBy: userId, changeReason: reason, createdAt: ports.clock.nowIso() };
}

/** Create a new draft (version 1). */
export async function createDraft(ports: ContentPorts, input: { orgId: string; userId: string | null; internalName: string; contentClass?: string }): Promise<DraftState> {
  const draft0: DraftState = {
    id: ports.ids.uuid(), orgId: input.orgId, internalName: input.internalName || "טיוטה חדשה", createdBy: input.userId,
    currentVersion: 1, status: "draft", contentClass: input.contentClass ?? "standard",
    defaultCaption: "", defaultHashtags: [], plannedAt: null, timezone: null, approvalState: "not_required",
    contentHash: null, revision: 1, archivedAt: null, targets: [],
  };
  const draft: DraftState = { ...draft0, contentHash: contentHash(draft0) };
  await ports.store.saveDraft(draft);
  await ports.store.insertVersion(versionRow(ports, draft, input.userId, "created"));
  await ports.audit.log({ action: "meta.draft.created", entityId: draft.id, summary: `draft created: ${draft.internalName}`, metadata: { version: 1 } });
  return draft;
}

/** Core edit: concurrency-checked, deterministically versioned, approval-aware. */
export async function applyEdit(ports: ContentPorts, args: { draft: DraftState; mutate: (d: DraftState) => DraftState; expectedRevision?: number; userId: string | null; reason: string }): Promise<EngineResult> {
  const { draft } = args;
  if (draft.archivedAt) return fail(draft, "archived");
  if (args.expectedRevision !== undefined && args.expectedRevision !== draft.revision) return fail(draft, "conflict");

  const t = transition(draft.status, draft.approvalState, "edit");
  if (!t.ok) return fail(draft, t.reason ?? "edit_not_allowed");

  const mutated = args.mutate(draft);
  const nextHash = contentHash(mutated);
  if (!shouldCreateVersion(draft.contentHash, nextHash)) {
    return res(draft, { versionCreated: false }); // no-op → no new version, no revision bump
  }
  const next: DraftState = {
    ...mutated,
    status: t.nextStatus,
    approvalState: t.nextApproval,
    contentHash: nextHash,
    currentVersion: mutated.currentVersion + 1,
    revision: mutated.revision + 1,
  };
  await ports.store.saveDraft(next);
  await ports.store.insertVersion(versionRow(ports, next, args.userId, args.reason));
  await ports.audit.log({ action: "meta.draft.edited", entityId: next.id, summary: `draft edited (v${next.currentVersion})`, metadata: { reason: args.reason, invalidatedApproval: t.invalidatesApproval } });
  return res(next, { versionCreated: true, invalidatedApproval: t.invalidatesApproval });
}

// ── Field / target / media edits (all routed through applyEdit) ──────────────
export const editFields = (ports: ContentPorts, draft: DraftState, patch: Partial<Pick<DraftState, "internalName" | "defaultCaption" | "defaultHashtags" | "plannedAt" | "timezone" | "contentClass">>, expectedRevision: number, userId: string | null) =>
  applyEdit(ports, { draft, expectedRevision, userId, reason: "fields", mutate: (d) => ({ ...d, ...patch }) });

export const addTarget = (ports: ContentPorts, draft: DraftState, target: Omit<DraftTargetState, "id">, expectedRevision: number, userId: string | null) =>
  applyEdit(ports, { draft, expectedRevision, userId, reason: "target_added", mutate: (d) => ({ ...d, targets: [...d.targets, { ...target, id: ports.ids.uuid() }] }) });

export const removeTarget = (ports: ContentPorts, draft: DraftState, targetId: string, expectedRevision: number, userId: string | null) =>
  applyEdit(ports, { draft, expectedRevision, userId, reason: "target_removed", mutate: (d) => ({ ...d, targets: d.targets.filter((t) => t.id !== targetId) }) });

export const updateTarget = (ports: ContentPorts, draft: DraftState, targetId: string, patch: Partial<DraftTargetState>, expectedRevision: number, userId: string | null) =>
  applyEdit(ports, { draft, expectedRevision, userId, reason: "target_updated", mutate: (d) => ({ ...d, targets: d.targets.map((t) => (t.id === targetId ? { ...t, ...patch } : t)) }) });

export const attachMedia = (ports: ContentPorts, draft: DraftState, targetId: string, mediaId: string, expectedRevision: number, userId: string | null) =>
  applyEdit(ports, { draft, expectedRevision, userId, reason: "media_attached", mutate: (d) => ({ ...d, targets: d.targets.map((t) => (t.id === targetId && !t.mediaOrder.includes(mediaId) ? { ...t, mediaOrder: [...t.mediaOrder, mediaId] } : t)) }) });

export const detachMedia = (ports: ContentPorts, draft: DraftState, targetId: string, mediaId: string, expectedRevision: number, userId: string | null) =>
  applyEdit(ports, { draft, expectedRevision, userId, reason: "media_detached", mutate: (d) => ({ ...d, targets: d.targets.map((t) => (t.id === targetId ? { ...t, mediaOrder: t.mediaOrder.filter((m) => m !== mediaId) } : t)) }) });

export const reorderMedia = (ports: ContentPorts, draft: DraftState, targetId: string, order: readonly string[], expectedRevision: number, userId: string | null) =>
  applyEdit(ports, { draft, expectedRevision, userId, reason: "media_reordered", mutate: (d) => ({ ...d, targets: d.targets.map((t) => (t.id === targetId ? { ...t, mediaOrder: [...order] } : t)) }) });

/** Duplicate a draft into a fresh draft (new ids, status draft, version 1). */
export async function duplicateDraft(ports: ContentPorts, draft: DraftState, userId: string | null): Promise<DraftState> {
  const copy0: DraftState = {
    ...draft, id: ports.ids.uuid(), internalName: `${draft.internalName} (עותק)`, createdBy: userId,
    currentVersion: 1, status: "draft", approvalState: "not_required", contentHash: null, revision: 1, archivedAt: null,
    targets: draft.targets.map((t) => ({ ...t, id: ports.ids.uuid() })),
  };
  const copy: DraftState = { ...copy0, contentHash: contentHash(copy0) };
  await ports.store.saveDraft(copy);
  await ports.store.insertVersion(versionRow(ports, copy, userId, "duplicated"));
  await ports.audit.log({ action: "meta.draft.duplicated", entityId: copy.id, summary: `duplicated from ${draft.id}`, metadata: { from: draft.id } });
  return copy;
}

/** Archive / restore. */
export async function setArchived(ports: ContentPorts, draft: DraftState, archived: boolean): Promise<EngineResult> {
  const t = transition(draft.status, draft.approvalState, archived ? "archive" : "restore");
  if (!t.ok) return fail(draft, t.reason ?? "not_allowed");
  const next: DraftState = { ...draft, status: t.nextStatus, approvalState: t.nextApproval, archivedAt: archived ? ports.clock.nowIso() : null, revision: draft.revision + 1 };
  await ports.store.saveDraft(next);
  await ports.audit.log({ action: archived ? "meta.draft.archived" : "meta.draft.restored", entityId: draft.id, summary: archived ? "archived" : "restored", metadata: {} });
  return res(next);
}

// ── Approval workflow ────────────────────────────────────────────────────────
export async function submitForApproval(ports: ContentPorts, draft: DraftState, userId: string | null, perm: Omit<ApprovalPermissionCtx, "hasPendingRequest">): Promise<EngineResult> {
  const pending = await ports.store.getPendingApproval(draft.orgId, draft.id);
  const guard = guardApprovalAction("submit", { ...perm, hasPendingRequest: !!pending });
  if (!guard.ok) return fail(draft, guard.reason ?? "not_permitted");
  const t = transition(draft.status, draft.approvalState, "submit");
  if (!t.ok) return fail(draft, t.reason ?? "invalid_transition");

  const request: ApprovalRequestRow = {
    id: ports.ids.uuid(), orgId: draft.orgId, draftId: draft.id, requestedBy: userId, requestedAt: ports.clock.nowIso(),
    status: "pending", assignedApprover: null, approverRole: null, decidedBy: null, decidedAt: null, decisionReason: null,
    draftVersionNumber: draft.currentVersion,
  };
  await ports.store.insertApproval(request);
  const next: DraftState = { ...draft, status: t.nextStatus, approvalState: t.nextApproval, revision: draft.revision + 1 };
  await ports.store.saveDraft(next);
  const evt = buildMetaNotificationEvent({ event: "meta.post.approval_requested", orgId: draft.orgId, occurredAt: ports.clock.nowIso(), actorId: userId, data: { draftId: draft.id, version: draft.currentVersion } });
  await ports.audit.log({ action: "meta.approval.requested", entityId: draft.id, summary: `approval requested (v${draft.currentVersion})`, metadata: { version: draft.currentVersion } });
  return res(next, { events: [evt] });
}

const DECISION_EVENT: Record<"approve" | "reject" | "request_changes", "meta.post.approved" | "meta.post.rejected" | "meta.post.changes_requested"> = {
  approve: "meta.post.approved", reject: "meta.post.rejected", request_changes: "meta.post.changes_requested",
};

export async function decideApproval(ports: ContentPorts, draft: DraftState, action: "approve" | "reject" | "request_changes", approverId: string | null, perm: Omit<ApprovalPermissionCtx, "hasPendingRequest">, reason: string | null): Promise<EngineResult> {
  const pending = await ports.store.getPendingApproval(draft.orgId, draft.id);
  if (!pending) return fail(draft, "no_pending_request");
  const guard = guardApprovalAction(action, { ...perm, hasPendingRequest: true });
  if (!guard.ok) return fail(draft, guard.reason ?? "not_permitted");
  const t = transition(draft.status, draft.approvalState, action);
  if (!t.ok) return fail(draft, t.reason ?? "invalid_transition");

  const decided: ApprovalRequestRow = { ...pending, status: action === "approve" ? "approved" : action === "reject" ? "rejected" : "changes_requested", decidedBy: approverId, decidedAt: ports.clock.nowIso(), decisionReason: reason };
  await ports.store.updateApproval(decided);
  const next: DraftState = { ...draft, status: t.nextStatus, approvalState: t.nextApproval, revision: draft.revision + 1 };
  await ports.store.saveDraft(next);
  const evt = buildMetaNotificationEvent({ event: DECISION_EVENT[action], orgId: draft.orgId, occurredAt: ports.clock.nowIso(), actorId: approverId, data: { draftId: draft.id, version: pending.draftVersionNumber } });
  await ports.audit.log({ action: `meta.approval.${action}`, entityId: draft.id, summary: `${action} (v${pending.draftVersionNumber})`, metadata: { version: pending.draftVersionNumber } });
  return res(next, { events: [evt] });
}

export async function cancelApproval(ports: ContentPorts, draft: DraftState, userId: string | null, perm: Omit<ApprovalPermissionCtx, "hasPendingRequest">): Promise<EngineResult> {
  const pending = await ports.store.getPendingApproval(draft.orgId, draft.id);
  if (!pending) return fail(draft, "no_pending_request");
  const guard = guardApprovalAction("cancel", { ...perm, hasPendingRequest: true });
  if (!guard.ok) return fail(draft, guard.reason ?? "not_permitted");
  const t = transition(draft.status, draft.approvalState, "cancel");
  if (!t.ok) return fail(draft, t.reason ?? "invalid_transition");
  await ports.store.updateApproval({ ...pending, status: "cancelled", decidedBy: userId, decidedAt: ports.clock.nowIso(), decisionReason: "cancelled" });
  const next: DraftState = { ...draft, status: t.nextStatus, approvalState: t.nextApproval, revision: draft.revision + 1 };
  await ports.store.saveDraft(next);
  await ports.audit.log({ action: "meta.approval.cancelled", entityId: draft.id, summary: "approval cancelled", metadata: {} });
  return res(next);
}

// ── Internal review comments (NEVER sent to Meta) ────────────────────────────
export async function addComment(ports: ContentPorts, draft: DraftState, authorId: string | null, body: string, refs?: { targetRef?: string; mediaRef?: string; approvalRequestId?: string }): Promise<ApprovalCommentRow> {
  const row: ApprovalCommentRow = { id: ports.ids.uuid(), orgId: draft.orgId, approvalRequestId: refs?.approvalRequestId ?? null, draftId: draft.id, authorId, body, targetRef: refs?.targetRef ?? null, mediaRef: refs?.mediaRef ?? null, resolvedAt: null, createdAt: ports.clock.nowIso() };
  await ports.store.insertComment(row);
  await ports.audit.log({ action: "meta.review.comment_added", entityId: draft.id, summary: "review comment added", metadata: { internalOnly: true } });
  return row;
}

export async function resolveComment(ports: ContentPorts, comment: ApprovalCommentRow): Promise<ApprovalCommentRow> {
  const resolved = { ...comment, resolvedAt: ports.clock.nowIso() };
  await ports.store.updateComment(resolved);
  await ports.audit.log({ action: "meta.review.comment_resolved", entityId: comment.draftId, summary: "review comment resolved", metadata: {} });
  return resolved;
}

/** Restore a draft from an immutable version — creates a NEW version (never mutates history). */
export async function restoreVersion(ports: ContentPorts, draft: DraftState, versionNumber: number, userId: string | null): Promise<EngineResult> {
  if (draft.archivedAt) return fail(draft, "archived");
  const versions = await ports.store.listVersions(draft.orgId, draft.id);
  const target = versions.find((v) => v.versionNumber === versionNumber);
  if (!target) return fail(draft, "version_not_found");
  const s = target.snapshot;
  const restored0: DraftState = {
    ...draft,
    internalName: s.internalName, contentClass: s.contentClass, defaultCaption: s.defaultCaption,
    defaultHashtags: [...s.defaultHashtags], plannedAt: s.plannedAt, timezone: s.timezone,
    targets: s.targets.map((t) => ({ id: ports.ids.uuid(), assetKind: t.assetKind as DraftTargetState["assetKind"], assetId: t.assetId, platform: t.platform as DraftTargetState["platform"], contentKind: t.contentKind, enabled: t.enabled, captionOverride: t.captionOverride, hashtagsOverride: t.hashtagsOverride, mediaOrder: [...t.mediaOrder], plannedAt: t.plannedAt })),
    status: "draft", approvalState: "not_required",
  };
  const next: DraftState = { ...restored0, currentVersion: draft.currentVersion + 1, revision: draft.revision + 1, contentHash: contentHash(restored0) };
  await ports.store.saveDraft(next);
  await ports.store.insertVersion(versionRow(ports, next, userId, `restored from v${versionNumber}`));
  await ports.audit.log({ action: "meta.draft.version_restored", entityId: draft.id, summary: `restored from v${versionNumber}`, metadata: { from: versionNumber, newVersion: next.currentVersion } });
  return res(next, { versionCreated: true });
}
