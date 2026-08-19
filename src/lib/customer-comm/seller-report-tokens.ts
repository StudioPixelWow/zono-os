// ============================================================================
// ZONO — Seller REPORT secure token (server-only). A stateless HMAC link to the
// seller-facing /s/[token] property report — scoped to exactly one org+seller+
// property so a seller can only ever see THEIR property's aggregate report (never
// buyers, other properties, or CRM internals). Mirrors the reco/unsub/viewing
// token design; a DISTINCT HMAC prefix makes seller-report tokens non-usable for
// any other feature.
// ============================================================================
import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface SellerReportTokenPayload {
  o: string;   // orgId
  c: string;   // sellerId
  p: string;   // propertyId
}

function secret(): string | null {
  return process.env.UNSUBSCRIBE_SECRET || process.env.CRON_SECRET || null;
}
const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export function signSellerReportToken(p: SellerReportTokenPayload): string | null {
  const key = secret();
  if (!key) return null;
  const body = b64url(Buffer.from(JSON.stringify(p)));
  const sig = b64url(createHmac("sha256", `zono:sreport:${key}`).update(body).digest());
  return `${body}.${sig}`;
}

export function verifySellerReportToken(token: string): SellerReportTokenPayload | null {
  const key = secret();
  if (!key || !token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(createHmac("sha256", `zono:sreport:${key}`).update(body).digest());
  try {
    const a = Buffer.from(sig), b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const p = JSON.parse(fromB64url(body).toString("utf8")) as SellerReportTokenPayload;
    if (!p.o || !p.c || !p.p) return null;
    return p;
  } catch { return null; }
}

export function sellerReportUrl(p: SellerReportTokenPayload): string | null {
  const token = signSellerReportToken(p);
  if (!token) return null;
  const base = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  return base ? `${base.replace(/\/$/, "")}/s/${token}` : `/s/${token}`;
}
