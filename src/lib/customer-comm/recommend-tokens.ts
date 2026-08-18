// ============================================================================
// ZONO — Buyer Match Bundles: signed RECOMMENDATION-VIEW tokens (server-only).
// A stateless, tamper-proof link to the customer-facing bundle view /r/[token].
// HMAC-SHA256 over (org, contact, bundle) — validated with no DB lookup, scoped
// to exactly one bundle so a customer can never enumerate another's or another
// org's recommendations. Mirrors the unsubscribe-token design.
// ============================================================================
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ContactType } from "./consent";

export interface RecoTokenPayload {
  o: string;                // orgId
  t: Extract<ContactType, "buyer" | "lead">;
  c: string;                // contact id
  b: string;                // bundle id
}

function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}
const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signRecoToken(p: RecoTokenPayload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const sig = b64url(createHmac("sha256", `zono:reco:${key}`).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyRecoToken(token: string): RecoTokenPayload | null {
  const key = secret();
  if (!key || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", `zono:reco:${key}`).update(body).digest());
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(fromB64url(body).toString("utf8")) as RecoTokenPayload;
    if (!p.o || !p.t || !p.c || !p.b) return null;
    return p;
  } catch { return null; }
}

export function recoUrl(p: RecoTokenPayload): string | null {
  const token = signRecoToken(p);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return base ? `${base.replace(/\/$/, "")}/r/${token}` : `/r/${token}`;
}
