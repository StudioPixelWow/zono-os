// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA LIBRARY (PURE helpers). Phase 2.
// ----------------------------------------------------------------------------
// Pure, deterministic media-library rules used by the media service: filename
// sanitization, mime/size guards, checksum dedup decisions, and archive/attach
// rules. No storage I/O, no signed URLs, no secrets. Bytes never touch these
// functions — only metadata + an opaque storage reference.
// ============================================================================
import { UPLOAD_GUARDS } from "./requirements";

/** Sanitize a user-provided filename into a safe display name. */
export function sanitizeFilename(name: string): string {
  const base = (name || "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\-_. ]/gu, "_") // keep letters/numbers (incl. Hebrew), dash, underscore, dot, space
    .replace(/\.{2,}/g, ".")               // collapse dot runs (no path traversal)
    .replace(/^\.+/, "")                    // no leading dots
    .trim()
    .slice(0, 180);
  return cleaned || "untitled";
}

/** True when a server-inspected mime is an accepted image/video type. */
export function isAllowedMime(mediaKind: "image" | "video", actualMime: string): boolean {
  const allowed = mediaKind === "image" ? UPLOAD_GUARDS.allowedImageMime : UPLOAD_GUARDS.allowedVideoMime;
  return (allowed as readonly string[]).includes(actualMime);
}

/** True when a file size is within the per-kind ceiling. */
export function isAllowedSize(mediaKind: "image" | "video", bytes: number): boolean {
  const max = mediaKind === "image" ? UPLOAD_GUARDS.maxImageBytes : UPLOAD_GUARDS.maxVideoBytes;
  return bytes > 0 && bytes <= max;
}

/** Infer the media kind from an inspected mime (null if neither). */
export function mediaKindFromMime(actualMime: string): "image" | "video" | null {
  if ((UPLOAD_GUARDS.allowedImageMime as readonly string[]).includes(actualMime)) return "image";
  if ((UPLOAD_GUARDS.allowedVideoMime as readonly string[]).includes(actualMime)) return "video";
  return null;
}

export interface DedupDecision {
  isDuplicate: boolean;
  /** The existing asset id to reuse when a duplicate is detected. */
  existingId: string | null;
}

/** Decide whether an upload duplicates existing org media (same checksum). */
export function dedupByChecksum(checksum: string, existing: ReadonlyArray<{ id: string; checksum: string; archivedAt: string | null }>): DedupDecision {
  const hit = existing.find((m) => m.checksum === checksum && !m.archivedAt);
  return { isDuplicate: !!hit, existingId: hit?.id ?? null };
}

/** An archived asset may not be freshly attached to a draft. */
export function canAttachMedia(media: { archivedAt: string | null; processingStatus?: string }): { ok: boolean; reason: string | null } {
  if (media.archivedAt) return { ok: false, reason: "media_archived" };
  return { ok: true, reason: null };
}

/**
 * Media referenced by a non-archived draft must NOT be destructively deleted —
 * archive/tombstone it instead. Returns the safe action to take.
 */
export function deletionPolicy(referencedByActiveDraft: boolean): { action: "archive" | "hard_delete"; reason: string } {
  return referencedByActiveDraft
    ? { action: "archive", reason: "referenced by an active draft — archived instead of deleted" }
    : { action: "hard_delete", reason: "not referenced — safe to remove" };
}
