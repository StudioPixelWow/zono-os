// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — OAuth START (server route).
// GET /api/whatsapp/oauth → begins per-org WhatsApp Business Embedded Signup.
// Requires an authenticated session; refuses unless the Meta app env is
// configured AND operator-enabled. Signs a CSRF state, stores the nonce in an
// httpOnly cookie, redirects to the Meta consent dialog. No token created here.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getWaOAuthConfig, buildAuthorizeUrl, createSignedState, stateSecret } from "@/lib/whatsapp/business/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.redirect(new URL("/login", origin));

  const cfg = getWaOAuthConfig();
  if (!cfg.ready) {
    return NextResponse.redirect(new URL(`/settings/whatsapp?wa_error=${cfg.configured ? "not_enabled" : "not_configured"}`, origin));
  }
  const { state, nonce } = createSignedState(sc.profile.org_id, sc.user.id, stateSecret());
  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, state));
  res.cookies.set("wa_oauth_nonce", nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/whatsapp/oauth", maxAge: 600 });
  return res;
}
