// ============================================================================
// ZONO — Buyer PORTAL secure token (server-only). A PERSISTENT, revocable HMAC
// link to /my/[token] scoped to org + customer identity + version. Unlike the
// bundle-scoped /r token, this stays useful over time. Revocation = bump the
// customer's stored portal version (buyers.preferences.portal_token_version); the
// server re-checks that version AND the (org, contact) relationship on every load.
// Distinct HMAC prefix → not interchangeable with /r /v /s /u tokens.
// ============================================================================
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface PortalTokenPayload {
  o: string;                 // orgId
  t: "buyer" | "lead";       // contact type
  c: string;                 // contact id
  v: number;                 // token version (revocation)
}

function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}
const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signPortalToken(p: PortalTokenPayload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const sig = b64url(createHmac("sha256", `zono:portal:${key}`).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyPortalToken(token: string): PortalTokenPayload | null {
  const key = secret();
  if (!key || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", `zono:portal:${key}`).update(body).digest());
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(fromB64url(body).toString("utf8")) as PortalTokenPayload;
    if (!p.o || (p.t !== "buyer" && p.t !== "lead") || !p.c || typeof p.v !== "number") return null;
    return p;
  } catch { return null; }
}

export function portalUrl(p: PortalTokenPayload): string | null {
  const token = signPortalToken(p);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return base ? `${base.replace(/\/$/, "")}/my/${token}` : `/my/${token}`;
}
