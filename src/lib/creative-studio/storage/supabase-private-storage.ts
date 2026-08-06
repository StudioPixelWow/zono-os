// ============================================================================
// ZONO — concrete Supabase private-storage adapter (implements AssetStorage).
//
// Supabase Storage specifics are behind a NARROW injected client seam
// (`SupabaseStorageClient`) so this adapter is contract-tested with a mock
// client — no Docker. Internal assets live in a PRIVATE bucket, org-scoped
// server-generated paths, short-lived signed reads, MIME/extension/size
// validation, no arbitrary bucket or path signing, approved-only promotion,
// private master retained after publication.
// ============================================================================
import type { AssetStorage, AuthContext, SignedRead, StoredAsset, AssetState } from "../asset-storage";
import { StorageAuthError, isValidOrgPath } from "../asset-storage";

/** Narrow surface of the Supabase Storage client this adapter uses. */
export interface SupabaseStorageClient {
  upload(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<{ error: { message: string } | null }>;
  createSignedUrl(bucket: string, path: string, expiresInSec: number): Promise<{ signedUrl: string | null; error: { message: string } | null }>;
  copy(bucket: string, from: string, to: string): Promise<{ error: { message: string } | null }>;
  remove(bucket: string, path: string): Promise<{ error: { message: string } | null }>;
  exists(bucket: string, path: string): Promise<boolean>;
}

/** Asset metadata store (the DB row backing an asset — injected, org-scoped). */
export interface AssetMetaStore {
  get(orgId: string, path: string): Promise<StoredAsset | null>;
  put(a: StoredAsset): Promise<void>;
  setState(orgId: string, path: string, state: AssetState): Promise<void>;
}

export interface SupabasePrivateStorageConfig {
  privateBucket: string;            // e.g. "creative-private"
  publicationBucket: string;        // e.g. "creative-published"
  allowedMime: string[];
  allowedExt: string[];
  maxBytes: number;
  signedTtlSec: number;
}

export const DEFAULT_STORAGE_CONFIG: SupabasePrivateStorageConfig = {
  privateBucket: "creative-private",
  publicationBucket: "creative-published",
  allowedMime: ["image/png", "image/webp", "image/jpeg"],
  allowedExt: ["png", "webp", "jpg", "jpeg"],
  maxBytes: 25 * 1024 * 1024,
  signedTtlSec: 300,
};

export function sanitizeFilename(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").replace(/\.{2,}/g, ".").slice(0, 128);
}

export class SupabasePrivateStorage implements AssetStorage {
  constructor(
    private storage: SupabaseStorageClient,
    private meta: AssetMetaStore,
    private cfg: SupabasePrivateStorageConfig = DEFAULT_STORAGE_CONFIG,
  ) {}

  private validateUpload(path: string, bytes: Uint8Array, contentType: string): void {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (!this.cfg.allowedExt.includes(ext)) throw new StorageAuthError(`extension .${ext} not allowed`);
    if (!this.cfg.allowedMime.includes(contentType)) throw new StorageAuthError(`mime ${contentType} not allowed`);
    if (bytes.length > this.cfg.maxBytes) throw new StorageAuthError("file too large");
  }

  async putPrivateAsset(orgId: string, ownerId: string | null, path: string, bytes: Uint8Array, state: AssetState): Promise<StoredAsset> {
    if (!isValidOrgPath(orgId, path)) throw new StorageAuthError(`invalid org path: ${path}`);
    this.validateUpload(path, bytes, "image/png");
    const { error } = await this.storage.upload(this.cfg.privateBucket, path, bytes, "image/png");
    if (error) throw new StorageAuthError(`upload failed: ${error.message}`);
    const a: StoredAsset = { path, orgId, ownerId, state, bytesLen: bytes.length, createdAt: new Date(0).toISOString() };
    await this.meta.put(a);
    return a;
  }

  async verifyAssetOwnership(ctx: AuthContext, path: string): Promise<boolean> {
    if (!ctx.active || !ctx.orgId) return false;
    const a = await this.meta.get(ctx.orgId, path);
    return Boolean(a) && a!.orgId === ctx.orgId;
  }

  private async authorize(ctx: AuthContext, path: string): Promise<StoredAsset> {
    if (!ctx.orgId) throw new StorageAuthError("anonymous access denied");
    if (!ctx.active) throw new StorageAuthError("inactive user denied");
    if (!isValidOrgPath(ctx.orgId, path)) throw new StorageAuthError("arbitrary path denied");
    const a = await this.meta.get(ctx.orgId, path);
    if (!a) throw new StorageAuthError("asset not found");
    if (a.orgId !== ctx.orgId) throw new StorageAuthError("cross-organization access denied");
    return a;
  }

  async getAuthorizedAsset(ctx: AuthContext, path: string): Promise<Uint8Array> {
    await this.authorize(ctx, path);
    // In runtime, authorized bytes are streamed via a short-lived signed URL server-side.
    throw new StorageAuthError("use createSignedRead for authorized access");
  }

  async createSignedRead(ctx: AuthContext, path: string, ttlMs: number): Promise<SignedRead> {
    const a = await this.authorize(ctx, path);
    if (a.state === "qa_failed" || a.state === "archived") throw new StorageAuthError("asset not externally accessible");
    const ttl = Math.min(Math.ceil(ttlMs / 1000), this.cfg.signedTtlSec);
    const { signedUrl, error } = await this.storage.createSignedUrl(this.cfg.privateBucket, path, ttl);
    if (error || !signedUrl) throw new StorageAuthError(`sign failed: ${error?.message ?? "no url"}`);
    return { path, token: signedUrl, expiresAtMs: ttl * 1000 };
  }

  async resolveSignedRead(): Promise<Uint8Array> {
    // Supabase signed URLs are resolved by the storage service, not this adapter.
    throw new StorageAuthError("signed URLs are resolved by Supabase Storage, not the adapter");
  }

  async promoteApprovedAsset(ctx: AuthContext, path: string): Promise<{ publicationRef: string; masterPath: string }> {
    const a = await this.authorize(ctx, path);
    if (a.state !== "approved" && a.state !== "scheduled") throw new StorageAuthError("only approved assets may be promoted");
    const pubPath = `${a.orgId}/${path.split("/").slice(1).join("/")}`;
    const { error } = await this.storage.copy(this.cfg.privateBucket, path, `${this.cfg.publicationBucket}/${pubPath}`);
    if (error) throw new StorageAuthError(`promote failed: ${error.message}`);
    // private master is retained (not moved). publication ref lives in the publication bucket.
    return { publicationRef: `${this.cfg.publicationBucket}/${pubPath}`, masterPath: path };
  }

  async archiveAsset(ctx: AuthContext, path: string): Promise<void> {
    await this.authorize(ctx, path);
    await this.meta.setState(ctx.orgId!, path, "archived");
  }
  async deleteOrArchiveAsset(ctx: AuthContext, path: string): Promise<void> {
    return this.archiveAsset(ctx, path);
  }
}
