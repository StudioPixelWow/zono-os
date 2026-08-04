// ============================================================================
// ZONO — provider-neutral private asset storage (interface + local adapter).
//
// Draft / QA-failed / review / rejected / internal-master assets are PRIVATE:
// organization-scoped paths, server-authorized signed reads with expiry, no
// anonymous access, no arbitrary client paths. Approved publication assets are
// promoted to a publication-safe reference while the private master stays
// private. The local adapter is a REAL enforcer (not a permissive fake) used by
// contract tests; a Supabase adapter implements the same interface for runtime.
// ============================================================================

export type AssetState = "draft" | "qa_failed" | "review" | "approved" | "scheduled" | "published" | "archived";

export interface StoredAsset {
  path: string;         // org-scoped: "<orgId>/creative/<outputId>/<name>"
  orgId: string;
  ownerId: string | null;
  state: AssetState;
  bytesLen: number;
  createdAt: string;
}

export interface AuthContext {
  orgId: string | null;   // null = anonymous
  userId: string | null;
  active: boolean;        // inactive users are denied
}

export class StorageAuthError extends Error {
  constructor(message: string) { super(message); this.name = "StorageAuthError"; }
}

export interface SignedRead {
  path: string;
  token: string;
  expiresAtMs: number;
}

export interface AssetStorage {
  putPrivateAsset(orgId: string, ownerId: string | null, path: string, bytes: Uint8Array, state: AssetState): Promise<StoredAsset>;
  verifyAssetOwnership(ctx: AuthContext, path: string): Promise<boolean>;
  getAuthorizedAsset(ctx: AuthContext, path: string): Promise<Uint8Array>;
  createSignedRead(ctx: AuthContext, path: string, ttlMs: number): Promise<SignedRead>;
  resolveSignedRead(token: string, path: string, nowMs: number): Promise<Uint8Array>;
  promoteApprovedAsset(ctx: AuthContext, path: string): Promise<{ publicationRef: string; masterPath: string }>;
  deleteOrArchiveAsset(ctx: AuthContext, path: string): Promise<void>;
}

/** Org-scoped path must be "<orgId>/..." with no traversal. Pure. */
export function isValidOrgPath(orgId: string, path: string): boolean {
  if (!path || path.includes("..") || path.startsWith("/") || path.includes("\\")) return false;
  return path === orgId || path.startsWith(orgId + "/");
}

function deterministicToken(path: string, expiresAtMs: number, secret: string): string {
  // Deterministic, non-guessable-per-path token (test-grade HMAC substitute).
  let h = 2166136261 >>> 0;
  const s = `${secret}|${path}|${expiresAtMs}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return `sig_${h.toString(16)}_${expiresAtMs}`;
}

/**
 * In-memory local adapter that REALLY enforces org scope, ownership, lifecycle,
 * expiry, path validation and anonymous denial. Used by contract tests + local
 * runtime. `now` is injectable for deterministic expiry tests.
 */
export class LocalPrivateStorage implements AssetStorage {
  private assets = new Map<string, StoredAsset>();
  private bytes = new Map<string, Uint8Array>();
  private published = new Map<string, string>(); // publicationRef -> masterPath
  constructor(private secret = "local-test-secret", private now: () => number = () => 0) {}

  async putPrivateAsset(orgId: string, ownerId: string | null, path: string, data: Uint8Array, state: AssetState): Promise<StoredAsset> {
    if (!isValidOrgPath(orgId, path)) throw new StorageAuthError(`invalid org path: ${path}`);
    const a: StoredAsset = { path, orgId, ownerId, state, bytesLen: data.length, createdAt: new Date(this.now()).toISOString() };
    this.assets.set(path, a); this.bytes.set(path, data);
    return a;
  }

  async verifyAssetOwnership(ctx: AuthContext, path: string): Promise<boolean> {
    const a = this.assets.get(path);
    if (!a) return false;
    if (!ctx.active || !ctx.orgId) return false;
    return a.orgId === ctx.orgId;
  }

  private authorize(ctx: AuthContext, path: string): StoredAsset {
    const a = this.assets.get(path);
    if (!a) throw new StorageAuthError("asset not found");
    if (!ctx.orgId) throw new StorageAuthError("anonymous access denied");
    if (!ctx.active) throw new StorageAuthError("inactive user denied");
    if (a.orgId !== ctx.orgId) throw new StorageAuthError("cross-organization access denied");
    if (!isValidOrgPath(ctx.orgId, path)) throw new StorageAuthError("arbitrary path denied");
    return a;
  }

  async getAuthorizedAsset(ctx: AuthContext, path: string): Promise<Uint8Array> {
    this.authorize(ctx, path);
    return this.bytes.get(path)!;
  }

  async createSignedRead(ctx: AuthContext, path: string, ttlMs: number): Promise<SignedRead> {
    const a = this.authorize(ctx, path);
    if (a.state === "qa_failed" || a.state === "archived") throw new StorageAuthError("asset not externally accessible");
    const expiresAtMs = this.now() + ttlMs;
    return { path, token: deterministicToken(path, expiresAtMs, this.secret), expiresAtMs };
  }

  async resolveSignedRead(token: string, path: string, nowMs: number): Promise<Uint8Array> {
    const a = this.assets.get(path);
    if (!a) throw new StorageAuthError("asset not found");
    // token encodes expiry; validate signature + expiry without a session
    const parts = token.split("_");
    const expiresAtMs = Number(parts[2]);
    if (!Number.isFinite(expiresAtMs)) throw new StorageAuthError("malformed token");
    const expected = deterministicToken(path, expiresAtMs, this.secret);
    if (expected !== token) throw new StorageAuthError("invalid signature / arbitrary path denied");
    if (nowMs > expiresAtMs) throw new StorageAuthError("expired signed token denied");
    // rejected/archived assets are never externally exposed
    if (a.state === "qa_failed" || a.state === "archived") throw new StorageAuthError("asset not externally accessible");
    return this.bytes.get(path)!;
  }

  async promoteApprovedAsset(ctx: AuthContext, path: string): Promise<{ publicationRef: string; masterPath: string }> {
    const a = this.authorize(ctx, path);
    if (a.state !== "approved" && a.state !== "scheduled") throw new StorageAuthError("only approved assets may be promoted");
    const publicationRef = `pub/${a.orgId}/${path.split("/").slice(1).join("/")}`;
    this.published.set(publicationRef, path);          // publication retains provenance to the private master
    return { publicationRef, masterPath: path };
  }

  async deleteOrArchiveAsset(ctx: AuthContext, path: string): Promise<void> {
    const a = this.authorize(ctx, path);
    this.assets.set(path, { ...a, state: "archived" });   // lifecycle: archive, never hard-delete masters
  }
}
