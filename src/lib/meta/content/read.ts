// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SAFE READ MODELS / DTOs. Phase 2.
// ----------------------------------------------------------------------------
// PURE mappers from domain/rows to client-safe DTOs. NEVER expose: storage
// credentials, permanent private object paths, raw signed URLs beyond a short
// display need, raw Meta scopes, Graph payloads, tokens, or another org's data.
// The raw `storage_ref` is dropped; a short-lived preview URL (if any) is passed
// in by the server, never derived here.
// ============================================================================
import type { DraftState, DraftTargetState } from "./domain";
import type { MediaAssetRow, DraftVersionRow, ApprovalRequestRow, ApprovalCommentRow } from "./ports";
import { resolveEffectiveContent } from "./variant";

export interface DraftListItemDTO {
  id: string; internalName: string; status: string; approvalState: string;
  plannedAt: string | null; targetCount: number; currentVersion: number; updatedRevision: number; archived: boolean;
}
export function toDraftListItem(d: DraftState): DraftListItemDTO {
  return { id: d.id, internalName: d.internalName, status: d.status, approvalState: d.approvalState, plannedAt: d.plannedAt, targetCount: d.targets.length, currentVersion: d.currentVersion, updatedRevision: d.revision, archived: !!d.archivedAt };
}

export interface DraftTargetDTO {
  id: string; assetKind: string; assetId: string; platform: string; contentKind: string; enabled: boolean;
  caption: string; hashtags: readonly string[]; hasCaptionOverride: boolean; hasHashtagsOverride: boolean;
  mediaOrder: readonly string[]; plannedAt: string | null;
}
export function toTargetDTO(draft: DraftState, t: DraftTargetState): DraftTargetDTO {
  const eff = resolveEffectiveContent(draft, t);
  return { id: t.id, assetKind: t.assetKind, assetId: t.assetId, platform: t.platform, contentKind: t.contentKind, enabled: t.enabled, caption: eff.caption, hashtags: eff.hashtags, hasCaptionOverride: t.captionOverride !== null, hasHashtagsOverride: t.hashtagsOverride !== null, mediaOrder: t.mediaOrder, plannedAt: t.plannedAt };
}

export interface DraftEditorDTO {
  id: string; internalName: string; status: string; approvalState: string; contentClass: string;
  defaultCaption: string; defaultHashtags: readonly string[]; plannedAt: string | null; timezone: string | null;
  currentVersion: number; revision: number; archived: boolean; targets: readonly DraftTargetDTO[];
}
export function toDraftEditor(d: DraftState): DraftEditorDTO {
  return { id: d.id, internalName: d.internalName, status: d.status, approvalState: d.approvalState, contentClass: d.contentClass, defaultCaption: d.defaultCaption, defaultHashtags: d.defaultHashtags, plannedAt: d.plannedAt, timezone: d.timezone, currentVersion: d.currentVersion, revision: d.revision, archived: !!d.archivedAt, targets: d.targets.map((t) => toTargetDTO(d, t)) };
}

export interface MediaLibraryItemDTO {
  id: string; displayName: string; kind: string; mime: string; fileSize: number;
  width: number | null; height: number | null; durationMs: number | null; aspectRatio: number | null;
  processingStatus: string; validationStatus: string; archived: boolean;
  /** Short-lived signed URL for display ONLY (server-supplied). Never a permanent path. */
  previewUrl: string | null;
}
/** Map a media row to a DTO. `previewUrl` is a short-lived signed URL from the server. */
export function toMediaLibraryItem(m: MediaAssetRow, previewUrl: string | null): MediaLibraryItemDTO {
  return { id: m.id, displayName: m.displayFilename ?? "media", kind: m.mediaKind, mime: m.mimeType, fileSize: m.fileSize, width: m.width, height: m.height, durationMs: m.durationMs, aspectRatio: m.aspectRatio, processingStatus: m.processingStatus, validationStatus: m.validationStatus, archived: !!m.archivedAt, previewUrl };
}

export interface VersionHistoryItemDTO { versionNumber: number; contentHash: string; changedBy: string | null; changeReason: string | null; createdAt: string }
export function toVersionHistoryItem(v: DraftVersionRow): VersionHistoryItemDTO {
  return { versionNumber: v.versionNumber, contentHash: v.contentHash, changedBy: v.changedBy, changeReason: v.changeReason, createdAt: v.createdAt };
}

export interface ApprovalRequestDTO { id: string; status: string; requestedBy: string | null; requestedAt: string; decidedBy: string | null; decidedAt: string | null; decisionReason: string | null; draftVersionNumber: number }
export function toApprovalRequestDTO(r: ApprovalRequestRow): ApprovalRequestDTO {
  return { id: r.id, status: r.status, requestedBy: r.requestedBy, requestedAt: r.requestedAt, decidedBy: r.decidedBy, decidedAt: r.decidedAt, decisionReason: r.decisionReason, draftVersionNumber: r.draftVersionNumber };
}

export interface ApprovalCommentDTO { id: string; authorId: string | null; body: string; targetRef: string | null; mediaRef: string | null; resolved: boolean; createdAt: string }
export function toApprovalCommentDTO(c: ApprovalCommentRow): ApprovalCommentDTO {
  return { id: c.id, authorId: c.authorId, body: c.body, targetRef: c.targetRef, mediaRef: c.mediaRef, resolved: !!c.resolvedAt, createdAt: c.createdAt };
}
