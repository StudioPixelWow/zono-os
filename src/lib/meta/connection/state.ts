// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SIGNED OAUTH STATE. Phase 1.
// ----------------------------------------------------------------------------
// CSRF protection for the Meta OAuth handshake, mirroring the proven Business
// WhatsApp pattern: an HMAC-signed state payload (org + user + nonce + expiry)
// bound to an httpOnly nonce cookie. Pure Node crypto — no server-only, no
// network, so it is unit-testable. No token or secret is ever placed in state.
// ============================================================================
import crypto from "node:crypto";

export interface MetaStatePayload {
  orgId: string;
  userId: string;
  nonce: string;
  exp: number;
}

const b64url = (buf: Buffer) => buf.toString("base64url");
const hmac = (data: string, secret: string) => crypto.createHmac("sha256", secret).update(data).digest("base64url");

/** The secret used to sign OAuth state (falls back to the encryption key). */
export function metaStateSecret(): string {
  return process.env.META_WORKSPACE_OAUTH_STATE_SECRET?.trim()
    || process.env.ZONO_ENCRYPTION_KEY?.trim()
    || "zono-meta-workspace-oauth-state";
}

/** Create a signed state + its nonce (store the nonce in an httpOnly cookie). */
export function createSignedState(orgId: string, userId: string, secret: string, nowMs = Date.now()): { state: string; nonce: string } {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload: MetaStatePayload = { orgId, userId, nonce, exp: nowMs + 10 * 60 * 1000 };
  const body = b64url(Buffer.from(JSON.stringify(payload), "utf8"));
  return { state: `${body}.${hmac(body, secret)}`, nonce };
}

/** Verify a signed state against the httpOnly nonce. Returns null on any failure. */
export function verifySignedState(state: string, cookieNonce: string, secret: string, nowMs = Date.now()): MetaStatePayload | null {
  try {
    const [body, sig] = state.split(".");
    if (!body || !sig) return null;
    const expected = hmac(body, secret);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as MetaStatePayload;
    if (typeof payload.exp !== "number" || payload.exp < nowMs) return null;
    if (!payload.nonce || payload.nonce !== cookieNonce) return null;
    if (!payload.orgId || !payload.userId) return null;
    return payload;
  } catch {
    return null;
  }
}
