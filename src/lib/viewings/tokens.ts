// ============================================================================
// ZONO — Viewing automation: signed CONFIRM / FEEDBACK tokens (server-only).
// A stateless, tamper-proof link to the customer-facing viewing page /v/[token].
// HMAC-SHA256 over (org, meeting, kind) — validated with NO DB lookup, scoped to
// exactly one meeting so a customer can never touch another viewing or another
// org's data. The `kind` binds a token to a single purpose: a confirm token can
// never post feedback and vice-versa. Mirrors the reco/unsubscribe token design;
// a DISTINCT HMAC prefix makes viewing tokens non-interchangeable with those.
// ============================================================================
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export type ViewingTokenKind = "confirm" | "feedback";

export interface ViewingTokenPayload {
  o: string;              // orgId
  m: string;              // meeting id (the viewing)
  k: ViewingTokenKind;    // purpose binding
}

function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}
const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signViewingToken(p: ViewingTokenPayload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const sig = b64url(createHmac("sha256", `zono:viewing:${key}`).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyViewingToken(token: string): ViewingTokenPayload | null {
  const key = secret();
  if (!key || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", `zono:viewing:${key}`).update(body).digest());
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(fromB64url(body).toString("utf8")) as ViewingTokenPayload;
    if (!p.o || !p.m || (p.k !== "confirm" && p.k !== "feedback")) return null;
    return p;
  } catch { return null; }
}

export function viewingUrl(p: ViewingTokenPayload): string | null {
  const token = signViewingToken(p);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return base ? `${base.replace(/\/$/, "")}/v/${token}` : `/v/${token}`;
}
