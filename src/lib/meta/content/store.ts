// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONTENT STORE ADAPTER. Phase 2 (server).
// ----------------------------------------------------------------------------
// Supabase-backed ContentStore. Org-scoped, service-role writes; token/secret
// columns do not exist on these tables. A DraftState maps to a draft row + its
// target rows (targets replaced atomically on save). No media bytes touch the DB —
// only metadata + an opaque storage_ref.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { ContentStore, MediaAssetRow, DraftVersionRow, ApprovalRequestRow, ApprovalCommentRow } from "./ports";
import type { DraftState, DraftTargetState } from "./domain";

type Row = Record<string, unknown>;
const db = () => createServiceRoleClient();
const now = () => new Date().toISOString();

function draftFromRow(d: Row, targets: DraftTargetState[]): DraftState {
  return {
    id: String(d.id), orgId: String(d.org_id), internalName: String(d.internal_name ?? ""), createdBy: (d.created_by as string) ?? null,
    currentVersion: Number(d.current_version ?? 1), status: (d.status as DraftState["status"]) ?? "draft", contentClass: String(d.content_class ?? "standard"),
    defaultCaption: String(d.default_caption ?? ""), defaultHashtags: (d.default_hashtags as string[]) ?? [], plannedAt: (d.planned_at as string) ?? null,
    timezone: (d.timezone as string) ?? null, approvalState: (d.approval_state as DraftState["approvalState"]) ?? "not_required",
    contentHash: (d.content_hash as string) ?? null, revision: Number(d.revision ?? 0), archivedAt: (d.archived_at as string) ?? null, targets,
  };
}
function targetFromRow(t: Row): DraftTargetState {
  return { id: String(t.id), assetKind: t.asset_kind as DraftTargetState["assetKind"], assetId: String(t.asset_id), platform: t.platform as DraftTargetState["platform"], contentKind: String(t.content_kind), enabled: Boolean(t.enabled), captionOverride: (t.caption_override as string) ?? null, hashtagsOverride: (t.hashtags_override as string[]) ?? null, mediaOrder: (t.media_order as string[]) ?? [], plannedAt: (t.planned_at as string) ?? null };
}

export function createSupabaseContentStore(): ContentStore {
  return {
    async saveDraft(draft) {
      const d = db();
      await d.from("meta_content_draft" as never).upsert({ id: draft.id, org_id: draft.orgId, internal_name: draft.internalName, created_by: draft.createdBy, current_version: draft.currentVersion, status: draft.status, content_class: draft.contentClass, default_caption: draft.defaultCaption, default_hashtags: draft.defaultHashtags, planned_at: draft.plannedAt, timezone: draft.timezone, approval_state: draft.approvalState, content_hash: draft.contentHash, revision: draft.revision, archived_at: draft.archivedAt, updated_at: now() } as never, { onConflict: "id" } as never);
      await d.from("meta_content_draft_target" as never).delete().eq("org_id", draft.orgId).eq("draft_id", draft.id);
      if (draft.targets.length) await d.from("meta_content_draft_target" as never).insert(draft.targets.map((t) => ({ id: t.id, org_id: draft.orgId, draft_id: draft.id, asset_kind: t.assetKind, asset_id: t.assetId, platform: t.platform, content_kind: t.contentKind, enabled: t.enabled, caption_override: t.captionOverride, hashtags_override: t.hashtagsOverride, media_order: t.mediaOrder, planned_at: t.plannedAt })) as never);
    },
    async getDraft(orgId, draftId) {
      const dr = await db().from("meta_content_draft" as never).select("*").eq("org_id", orgId).eq("id", draftId).maybeSingle();
      if (!dr.data) return null;
      const tr = await db().from("meta_content_draft_target" as never).select("*").eq("org_id", orgId).eq("draft_id", draftId);
      return draftFromRow(dr.data as Row, ((tr.data as Row[]) ?? []).map(targetFromRow));
    },
    async listDrafts(orgId) {
      const dr = await db().from("meta_content_draft" as never).select("*").eq("org_id", orgId);
      return ((dr.data as Row[]) ?? []).map((d) => draftFromRow(d, []));
    },
    async insertVersion(row) {
      await db().from("meta_content_draft_version" as never).insert({ id: row.id, org_id: row.orgId, draft_id: row.draftId, version_number: row.versionNumber, snapshot: row.snapshot, content_hash: row.contentHash, changed_by: row.changedBy, change_reason: row.changeReason } as never);
    },
    async listVersions(orgId, draftId) {
      const r = await db().from("meta_content_draft_version" as never).select("*").eq("org_id", orgId).eq("draft_id", draftId).order("version_number", { ascending: false } as never);
      return ((r.data as Row[]) ?? []).map((v) => ({ id: String(v.id), orgId, draftId, versionNumber: Number(v.version_number), snapshot: v.snapshot as DraftVersionRow["snapshot"], contentHash: String(v.content_hash), changedBy: (v.changed_by as string) ?? null, changeReason: (v.change_reason as string) ?? null, createdAt: String(v.created_at) }));
    },
    async getMedia(orgId, mediaId) {
      const r = await db().from("meta_media_asset" as never).select("*").eq("org_id", orgId).eq("id", mediaId).maybeSingle();
      return r.data ? mediaFromRow(r.data as Row) : null;
    },
    async listMedia(orgId) {
      const r = await db().from("meta_media_asset" as never).select("*").eq("org_id", orgId);
      return ((r.data as Row[]) ?? []).map(mediaFromRow);
    },
    async saveMedia(row) {
      await db().from("meta_media_asset" as never).upsert({ id: row.id, org_id: row.orgId, uploaded_by: row.uploadedBy, storage_ref: row.storageRef, original_filename: row.originalFilename, display_filename: row.displayFilename, media_kind: row.mediaKind, mime_type: row.mimeType, checksum: row.checksum, file_size: row.fileSize, width: row.width, height: row.height, duration_ms: row.durationMs, aspect_ratio: row.aspectRatio, processing_status: row.processingStatus, validation_status: row.validationStatus, validation_errors: row.validationErrors, archived_at: row.archivedAt, updated_at: now() } as never, { onConflict: "org_id,checksum" } as never);
    },
    async getPendingApproval(orgId, draftId) {
      const r = await db().from("meta_approval_request" as never).select("*").eq("org_id", orgId).eq("draft_id", draftId).eq("status", "pending").maybeSingle();
      return r.data ? approvalFromRow(r.data as Row) : null;
    },
    async insertApproval(row) { await db().from("meta_approval_request" as never).insert(approvalToRow(row) as never); },
    async updateApproval(row) { await db().from("meta_approval_request" as never).update({ ...approvalToRow(row), updated_at: now() } as never).eq("id", row.id); },
    async listApprovals(orgId, draftId) {
      const r = await db().from("meta_approval_request" as never).select("*").eq("org_id", orgId).eq("draft_id", draftId);
      return ((r.data as Row[]) ?? []).map(approvalFromRow);
    },
    async insertComment(row) { await db().from("meta_approval_comment" as never).insert(commentToRow(row) as never); },
    async updateComment(row) { await db().from("meta_approval_comment" as never).update({ ...commentToRow(row), updated_at: now() } as never).eq("id", row.id); },
    async listComments(orgId, draftId) {
      const r = await db().from("meta_approval_comment" as never).select("*").eq("org_id", orgId).eq("draft_id", draftId);
      return ((r.data as Row[]) ?? []).map(commentFromRow);
    },
  };
}

const mediaFromRow = (m: Row): MediaAssetRow => ({ id: String(m.id), orgId: String(m.org_id), uploadedBy: (m.uploaded_by as string) ?? null, storageRef: String(m.storage_ref), originalFilename: (m.original_filename as string) ?? null, displayFilename: (m.display_filename as string) ?? null, mediaKind: (m.media_kind as "image" | "video") ?? "image", mimeType: String(m.mime_type), checksum: String(m.checksum), fileSize: Number(m.file_size ?? 0), width: (m.width as number) ?? null, height: (m.height as number) ?? null, durationMs: (m.duration_ms as number) ?? null, aspectRatio: (m.aspect_ratio as number) ?? null, processingStatus: String(m.processing_status ?? "pending"), validationStatus: String(m.validation_status ?? "pending"), validationErrors: (m.validation_errors as unknown[]) ?? [], archivedAt: (m.archived_at as string) ?? null });
const approvalFromRow = (r: Row): ApprovalRequestRow => ({ id: String(r.id), orgId: String(r.org_id), draftId: String(r.draft_id), requestedBy: (r.requested_by as string) ?? null, requestedAt: String(r.requested_at), status: (r.status as ApprovalRequestRow["status"]) ?? "pending", assignedApprover: (r.assigned_approver as string) ?? null, approverRole: (r.approver_role as string) ?? null, decidedBy: (r.decided_by as string) ?? null, decidedAt: (r.decided_at as string) ?? null, decisionReason: (r.decision_reason as string) ?? null, draftVersionNumber: Number(r.draft_version_number ?? 1) });
const approvalToRow = (r: ApprovalRequestRow): Row => ({ id: r.id, org_id: r.orgId, draft_id: r.draftId, requested_by: r.requestedBy, requested_at: r.requestedAt, status: r.status, assigned_approver: r.assignedApprover, approver_role: r.approverRole, decided_by: r.decidedBy, decided_at: r.decidedAt, decision_reason: r.decisionReason, draft_version_number: r.draftVersionNumber });
const commentFromRow = (c: Row): ApprovalCommentRow => ({ id: String(c.id), orgId: String(c.org_id), approvalRequestId: (c.approval_request_id as string) ?? null, draftId: String(c.draft_id), authorId: (c.author_id as string) ?? null, body: String(c.body ?? ""), targetRef: (c.target_ref as string) ?? null, mediaRef: (c.media_ref as string) ?? null, resolvedAt: (c.resolved_at as string) ?? null, createdAt: String(c.created_at) });
const commentToRow = (c: ApprovalCommentRow): Row => ({ id: c.id, org_id: c.orgId, approval_request_id: c.approvalRequestId, draft_id: c.draftId, author_id: c.authorId, body: c.body, target_ref: c.targetRef, media_ref: c.mediaRef, resolved_at: c.resolvedAt });
