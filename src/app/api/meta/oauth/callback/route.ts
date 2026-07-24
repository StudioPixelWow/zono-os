// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · OAUTH CALLBACK (server route). Phase 1.
//
// GET /api/meta/oauth/callback → completes the handshake. Verifies the signed
// state against the httpOnly nonce AND the current session, exchanges the code
// for a (long-lived) token, discovers granted permissions + Business / Page /
// Instagram assets, verifies ownership, and stores the ENCRYPTED connection via
// the service role. Tokens never reach the browser and are never logged.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { completeCallback } from "@/lib/meta/connection/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const done = (q: string) => NextResponse.redirect(new URL(`/settings/meta?${q}`, origin));

  const err = url.searchParams.get("error");
  if (err) return done(`meta_error=${encodeURIComponent(err)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return done("meta_error=missing_code");

  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.redirect(new URL("/login", origin));

  const cookieNonce = request.headers.get("cookie")?.match(/(?:^|;\s*)meta_oauth_nonce=([^;]+)/)?.[1] ?? "";

  try {
    const result = await completeCallback({
      orgId: sc.profile.org_id, userId: sc.user.id, code,
      state, cookieNonce: decodeURIComponent(cookieNonce),
    });
    const { businesses, pages, instagram } = result.inventory;
    return done(`meta_connected=1&biz=${businesses}&pages=${pages}&ig=${instagram}`);
  } catch (e) {
    const reason = e instanceof Error && e.message === "bad_state" ? "bad_state" : "connect_failed";
    return done(`meta_error=${reason}`);
  }
}
