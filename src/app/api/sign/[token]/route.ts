// ============================================================================
// ZONO — Internal Remote E-Signature: public SIGN submit (POST).
// Token-authed (no session). The server revalidates the token, expiry, revocation,
// completion, and document-version safety, then atomically records the signature,
// stores the immutable signed artifact, locks the document, and notifies the broker.
// Idempotent: a double-submit returns the existing completion, never double-signs.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { completeSignature } from "@/lib/e-signature/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!token) return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });

  let body: { signatureDataUrl?: string; consent?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad_body" }, { status: 400 }); }
  if (!body.signatureDataUrl || typeof body.signatureDataUrl !== "string") {
    return NextResponse.json({ ok: false, error: "missing_signature" }, { status: 400 });
  }

  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "").trim() || null;
  const userAgent = req.headers.get("user-agent");

  const result = await completeSignature({
    rawToken: token, signatureDataUrl: body.signatureDataUrl, consent: !!body.consent, ip, userAgent,
  });

  if (!result.ok) {
    const status = result.error === "expired" || result.error === "revoked" || result.error === "document_changed" ? 409 : 400;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, alreadyCompleted: result.alreadyCompleted ?? false, documentTitle: result.documentTitle ?? null, signedAt: result.signedAt ?? null });
}
