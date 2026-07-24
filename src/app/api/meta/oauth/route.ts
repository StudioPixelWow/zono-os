// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · OAUTH START (server route). Phase 1.
// GET /api/meta/oauth → begins the per-org Meta connection (Facebook Login for
// Business). Requires an authenticated session; refuses unless the Meta app env
// is configured AND operator-enabled. Signs a CSRF state, stores the nonce in an
// httpOnly cookie, redirects to the Meta consent dialog. No token created here.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { startConnection } from "@/lib/meta/connection/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.redirect(new URL("/login", origin));

  const started = startConnection(sc.profile.org_id, sc.user.id);
  if ("error" in started) return NextResponse.redirect(new URL(`/settings/meta?meta_error=${started.error}`, origin));

  const res = NextResponse.redirect(started.authorizeUrl);
  res.cookies.set("meta_oauth_nonce", started.nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/meta/oauth", maxAge: 600 });
  return res;
}
