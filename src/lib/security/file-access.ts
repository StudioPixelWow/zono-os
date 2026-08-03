// ============================================================================
// 🔐 ZONO Wave 0 — authorized document access (PURE core + wrapper contract).
// The server derives the authorized storage path FROM a database record and
// permission check — the client may NEVER pass an arbitrary bucket/path and get
// a signed URL. This module holds the pure, testable decisions; the DB-integrated
// wrapper (load record → check membership+permission → sign) is built on top.
// ============================================================================
import { authorizeWrite, type ActorContext } from "./org-scope";

const ALLOWED_BUCKETS = new Set(["documents", "property-media", "zono-marketing-assets"]);

/** A stored file record (the source of truth for the path — never client input). */
export interface FileRecord {
  bucket: string;
  /** storage object path; first segment MUST be the owning org id. */
  path: string;
  organizationId: string;
  /** owner user of the related record (null = org-shared). */
  ownerUserId?: string | null;
}

export interface FileAccessDecision {
  allow: boolean;
  reason: string;
}

/** Reject path traversal / cross-org paths / unknown buckets. */
export function isSafeObjectPath(bucket: string, path: string, organizationId: string): boolean {
  if (!ALLOWED_BUCKETS.has(bucket)) return false;
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  const firstSeg = path.split("/")[0];
  return firstSeg === organizationId; // org id must prefix the object path
}

/**
 * Decide whether an actor may receive a signed URL for a stored file. Requires:
 * active membership, same org, record-level permission, and a structurally safe
 * path that matches the stored record. Deny-by-default with a stable reason.
 */
export function authorizeFileAccess(actor: ActorContext, file: FileRecord, requestedPath?: string): FileAccessDecision {
  // The requested path (if the client supplied one) must EQUAL the stored path —
  // the client can never widen access by supplying its own path.
  if (requestedPath != null && requestedPath !== file.path) return { allow: false, reason: "path_mismatch" };
  if (!isSafeObjectPath(file.bucket, file.path, file.organizationId)) return { allow: false, reason: "unsafe_path" };
  // Reuse the org-scope authorization for the read (treated as a non-mutating
  // "read" via the same tenant + ownership rules).
  const d = authorizeWrite(actor, { targetOrganizationId: file.organizationId, action: "update", ownerUserId: file.ownerUserId });
  if (!d.allow) return { allow: false, reason: d.reason };
  return { allow: true, reason: "authorized" };
}

// ── Upload validation (pure) ────────────────────────────────────────────────
const ALLOWED_MIME = new Set([
  "application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain", "text/csv",
]);
const BLOCKED_EXT = new Set(["exe", "sh", "bat", "cmd", "js", "com", "scr", "msi", "app", "dll"]);
const MAX_BYTES = 25 * 1024 * 1024; // 25MB

export interface UploadCheck { ok: boolean; reason?: string; safeName?: string }

export function validateUpload(input: { filename: string; mime: string; size: number }): UploadCheck {
  const ext = (input.filename.split(".").pop() ?? "").toLowerCase();
  if (BLOCKED_EXT.has(ext)) return { ok: false, reason: "blocked_extension" };
  if (!ALLOWED_MIME.has(input.mime)) return { ok: false, reason: "unsupported_mime" };
  if (!(input.size > 0 && input.size <= MAX_BYTES)) return { ok: false, reason: "invalid_size" };
  // Sanitize display name (store original separately at the call site).
  const safeName = input.filename.replace(/[/\\]/g, "_").replace(/[^\w.\- ֐-׿]/g, "").slice(0, 200).trim();
  if (!safeName) return { ok: false, reason: "invalid_name" };
  return { ok: true, safeName };
}

/** Server generates the storage path — never the client. */
export function buildObjectPath(organizationId: string, recordId: string, safeName: string): string {
  return `${organizationId}/${recordId}/${Date.now()}_${safeName}`;
}
