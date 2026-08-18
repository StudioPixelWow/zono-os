// ============================================================================
// ZONO — External Customer Communication: signed UNSUBSCRIBE tokens (server-only).
// A stateless, tamper-proof one-click opt-out link for outbound customer emails
// (compliance requirement). HMAC-SHA256 over the contact identity; no DB lookup
// needed to validate. The public /u/[token] route verifies and records opt-out.
// ============================================================================
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ContactType, CustomerChannel } from "./consent";

export interface UnsubPayload {
  o: string;                    // orgId
  t: ContactType;               // contact type
  c: string;                    // contact id
  ch: CustomerChannel | "all";  // channel to opt out of ("all" = every channel)
}

function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}
const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/** Sign a contact+channel into a URL-safe token, or null when no secret is set. */
export function signUnsubToken(p: UnsubPayload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const sig = b64url(createHmac("sha256", `zono:unsub:${key}`).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify a token and return its payload, or null when invalid/tampered/unconfigured. */
export function verifyUnsubToken(token: string): UnsubPayload | null {
  const key = secret();
  if (!key || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", `zono:unsub:${key}`).update(body).digest());
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(fromB64url(body).toString("utf8")) as UnsubPayload;
    if (!p.o || !p.t || !p.c || !p.ch) return null;
    return p;
  } catch { return null; }
}

/** Absolute unsubscribe URL for an email footer (null when unsignable / no base URL). */
export function unsubUrl(p: UnsubPayload): string | null {
  const token = signUnsubToken(p);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return base ? `${base.replace(/\/$/, "")}/u/${token}` : `/u/${token}`;
}
