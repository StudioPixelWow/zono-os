// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA SERVICE (server wiring). Phase 2.
// ----------------------------------------------------------------------------
// Secure Media Library service. Uses existing object storage; NEVER stores bytes
// in the DB, NEVER exposes a permanent private URL (only short-lived signed URLs
// for display), sanitizes filenames, restricts mime/size, inspects the file
// SERVER-SIDE (never trusts the browser mime), dedups by checksum, and audits
// upload/archive. No provider token is involved. No media byte enters app memory
// here — only metadata + an opaque storage reference.
// ============================================================================
import "server-only";
import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/audit/service";
import { createSupabaseContentStore } from "../content/store";
import { sanitizeFilename, mediaKindFromMime, isAllowedMime, isAllowedSize, dedupByChecksum, deletionPolicy } from "./library";
import { validateUpload, type MediaFacts } from "./validate";
import { toMediaLibraryItem, type MediaLibraryItemDTO } from "../content/read";
import type { MediaAssetRow } from "../content/ports";

const META_MEDIA_BUCKET = "meta-media";
const SIGNED_URL_TTL_SEC = 600; // short-lived display only

/** Server-inspected facts about an uploaded object (never browser-declared). */
export interface UploadFacts {
  storageRef: string;      // opaque object key already written to storage
  originalFilename: string;
  declaredMime?: string;   // browser-declared (used only to detect spoofing)
  actualMime: string;      // SERVER-inspected
  checksum: string;        // server-computed
  fileSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export type UploadResult = { ok: true; media: MediaLibraryItemDTO; deduped: boolean } | { ok: false; error: string; codes?: readonly unknown[] };

/** Complete an upload: validate, dedup, persist metadata, audit. */
export async function completeUpload(orgId: string, userId: string, facts: UploadFacts): Promise<UploadResult> {
  const kind = mediaKindFromMime(facts.actualMime);
  if (!kind) return { ok: false, error: "mime_not_allowed" };
  if (!isAllowedMime(kind, facts.actualMime)) return { ok: false, error: "mime_not_allowed" };
  if (!isAllowedSize(kind, facts.fileSize)) return { ok: false, error: "file_too_large" };

  const mediaFacts: MediaFacts = { mediaKind: kind, actualMime: facts.actualMime, fileSize: facts.fileSize, width: facts.width, height: facts.height, durationMs: facts.durationMs };
  const validation = validateUpload(mediaFacts, facts.declaredMime);
  if (validation.status === "invalid") return { ok: false, error: "invalid_media", codes: validation.codes };

  const store = createSupabaseContentStore();
  const existing = (await store.listMedia(orgId)).map((m) => ({ id: m.id, checksum: m.checksum, archivedAt: m.archivedAt }));
  const dedup = dedupByChecksum(facts.checksum, existing);
  if (dedup.isDuplicate && dedup.existingId) {
    const ex = await store.getMedia(orgId, dedup.existingId);
    if (ex) return { ok: true, media: toMediaLibraryItem(ex, await signedUrl(ex.storageRef)), deduped: true };
  }

  const row: MediaAssetRow = {
    id: crypto.randomUUID(), orgId, uploadedBy: userId, storageRef: facts.storageRef,
    originalFilename: facts.originalFilename, displayFilename: sanitizeFilename(facts.originalFilename),
    mediaKind: kind, mimeType: facts.actualMime, checksum: facts.checksum, fileSize: facts.fileSize,
    width: facts.width, height: facts.height, durationMs: facts.durationMs,
    aspectRatio: facts.width && facts.height ? Number((facts.width / facts.height).toFixed(4)) : null,
    processingStatus: "ready", validationStatus: validation.status, validationErrors: validation.codes, archivedAt: null,
  };
  await store.saveMedia(row);
  // Audit carries NO signed URL, NO storage secret — ids + safe status only.
  await logAudit({ action: "meta.media.uploaded", category: "configuration", entityType: "meta_media_asset", entityId: row.id, summary: `media uploaded (${kind})`, metadata: { kind, size: facts.fileSize, deduped: false } });
  return { ok: true, media: toMediaLibraryItem(row, await signedUrl(row.storageRef)), deduped: false };
}

/** List org media as DTOs with short-lived signed URLs (no permanent paths). */
export async function listMedia(orgId: string, opts?: { kind?: "image" | "video"; includeArchived?: boolean }): Promise<readonly MediaLibraryItemDTO[]> {
  const rows = await createSupabaseContentStore().listMedia(orgId);
  const filtered = rows.filter((m) => (opts?.includeArchived || !m.archivedAt) && (!opts?.kind || m.mediaKind === opts.kind));
  return Promise.all(filtered.map(async (m) => toMediaLibraryItem(m, await signedUrl(m.storageRef))));
}

/** Archive media (tombstone). Referenced media is archived, never hard-deleted. */
export async function archiveMedia(orgId: string, userId: string, mediaId: string): Promise<{ ok: boolean; error?: string }> {
  const store = createSupabaseContentStore();
  const m = await store.getMedia(orgId, mediaId);
  if (!m) return { ok: false, error: "not_found" };
  const policy = deletionPolicy(true); // Phase 2: always archive, never destructive
  await store.saveMedia({ ...m, archivedAt: new Date().toISOString() });
  await logAudit({ action: "meta.media.archived", category: "configuration", entityType: "meta_media_asset", entityId: mediaId, summary: `media archived (${policy.action})`, metadata: { reason: policy.reason } });
  return { ok: true };
}

/** Produce a short-lived signed URL for display; never a permanent private path. */
async function signedUrl(storageRef: string): Promise<string | null> {
  try {
    const { data } = await createServiceRoleClient().storage.from(META_MEDIA_BUCKET).createSignedUrl(storageRef, SIGNED_URL_TTL_SEC);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}
