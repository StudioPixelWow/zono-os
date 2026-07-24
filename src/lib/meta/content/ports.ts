// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CONTENT ENGINE PORTS. Phase 2.
// ----------------------------------------------------------------------------
// Dependency-inversion seams for the PURE content engine. Persistence currency is
// canonical + secret-free (no tokens, no signed URLs, no raw Graph fields, no
// media bytes — only storage refs + metadata). Real adapters are wired in
// content/service.ts (server-only); QA drives an in-memory store.
// ============================================================================
import type { DraftState } from "./domain";
import type { DraftSnapshot } from "./version";
import type { Clock, IdGen, AuditSink } from "../connection/ports";

export type { Clock, IdGen, AuditSink } from "../connection/ports";

// ── Persistence rows ─────────────────────────────────────────────────────────
export interface MediaAssetRow {
  id: string; orgId: string; uploadedBy: string | null; storageRef: string;
  originalFilename: string | null; displayFilename: string | null;
  mediaKind: "image" | "video"; mimeType: string; checksum: string; fileSize: number;
  width: number | null; height: number | null; durationMs: number | null; aspectRatio: number | null;
  processingStatus: string; validationStatus: string; validationErrors: readonly unknown[];
  archivedAt: string | null;
}
export interface DraftVersionRow {
  id: string; orgId: string; draftId: string; versionNumber: number;
  snapshot: DraftSnapshot; contentHash: string; changedBy: string | null; changeReason: string | null; createdAt: string;
}
export interface ApprovalRequestRow {
  id: string; orgId: string; draftId: string; requestedBy: string | null; requestedAt: string;
  status: "pending" | "approved" | "rejected" | "changes_requested" | "cancelled";
  assignedApprover: string | null; approverRole: string | null;
  decidedBy: string | null; decidedAt: string | null; decisionReason: string | null; draftVersionNumber: number;
}
export interface ApprovalCommentRow {
  id: string; orgId: string; approvalRequestId: string | null; draftId: string; authorId: string | null;
  body: string; targetRef: string | null; mediaRef: string | null; resolvedAt: string | null; createdAt: string;
}

// ── Store port ────────────────────────────────────────────────────────────────
export interface ContentStore {
  saveDraft(draft: DraftState): Promise<void>;
  getDraft(orgId: string, draftId: string): Promise<DraftState | null>;
  listDrafts(orgId: string): Promise<readonly DraftState[]>;
  insertVersion(row: DraftVersionRow): Promise<void>;
  listVersions(orgId: string, draftId: string): Promise<readonly DraftVersionRow[]>;
  getMedia(orgId: string, mediaId: string): Promise<MediaAssetRow | null>;
  listMedia(orgId: string): Promise<readonly MediaAssetRow[]>;
  saveMedia(row: MediaAssetRow): Promise<void>;
  getPendingApproval(orgId: string, draftId: string): Promise<ApprovalRequestRow | null>;
  insertApproval(row: ApprovalRequestRow): Promise<void>;
  updateApproval(row: ApprovalRequestRow): Promise<void>;
  listApprovals(orgId: string, draftId: string): Promise<readonly ApprovalRequestRow[]>;
  insertComment(row: ApprovalCommentRow): Promise<void>;
  updateComment(row: ApprovalCommentRow): Promise<void>;
  listComments(orgId: string, draftId: string): Promise<readonly ApprovalCommentRow[]>;
}

export interface ContentPorts {
  store: ContentStore;
  clock: Clock;
  ids: IdGen;
  audit: AuditSink;
}
