// ============================================================================
// ZONO — Meta OAuth START (server-only). Generates a CSRF state bound to the
// org/user, sets it as an httpOnly cookie, and redirects to the Facebook Login
// dialog with the minimal initial scope. No token handling here.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getMetaOAuthConfig, createSignedState, buildAuthorizeUrl } from "@/lib/distribution/meta-oauth";

const SETTINGS = "/settings/distribution-connections";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (params: string) => NextResponse.redirect(new URL(`${SETTINGS}?${params}`, origin));

  // Must be a logged-in org user.
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) {
    return NextResponse.redirect(new URL("/login", origin));
  }

  // Honest setup error if env is missing — never crash, never fake.
  const cfg = getMetaOAuthConfig();
  if (!cfg.configured) return back("meta=setup_required");

  const secret = process.env.META_APP_SECRET as string; // present (configured === true)
  const { state, nonce } = createSignedState(profile.org_id, user.id, secret);

  const res = NextResponse.redirect(buildAuthorizeUrl(cfg, state));
  res.cookies.set("meta_oauth_nonce", nonce, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/api/oauth/meta", maxAge: 600,
  });
  return res;
}
