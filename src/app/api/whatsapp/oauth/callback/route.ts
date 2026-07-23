// ============================================================================
// 💬 ZONO OS — Batch 6.6 · WHATSAPP BUSINESS — OAuth CALLBACK (server route).
//
// GET /api/whatsapp/oauth/callback → completes the handshake. Verifies the
// signed state against the httpOnly nonce AND that it belongs to the current
// session, exchanges the code for a (long-lived) business token, discovers the
// granted WABA + phone numbers, subscribes our app for webhooks, and stores the
// ENCRYPTED connection via the service role. When a live phone number already
// exists it is auto-selected (status=connected); otherwise the connection is
// stored as pending_number (awaiting a connected business phone). Tokens never
// reach the browser and are never logged.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  getWaOAuthConfig, verifySignedState, stateSecret, exchangeCodeForToken, exchangeForLongLived,
  fetchGrantedWabaIds, getWaba, listPhoneNumbers, subscribeApp,
} from "@/lib/whatsapp/business/oauth";
import { WA_SCOPES } from "@/lib/whatsapp/business/types";
import { storeConnection } from "@/lib/whatsapp/business/tokens";
import { logAudit } from "@/lib/audit/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const done = (q: string) => NextResponse.redirect(new URL(`/settings/whatsapp?${q}`, origin));

  const err = url.searchParams.get("error");
  if (err) return done(`wa_error=${encodeURIComponent(err)}`);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return done("wa_error=missing_code");

  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.redirect(new URL("/login", origin));

  const nonce = request.headers.get("cookie")?.match(/(?:^|;\s*)wa_oauth_nonce=([^;]+)/)?.[1] ?? "";
  const payload = verifySignedState(state, decodeURIComponent(nonce), stateSecret());
  if (!payload || payload.userId !== sc.user.id || payload.orgId !== sc.profile.org_id) return done("wa_error=bad_state");

  const cfg = getWaOAuthConfig();
  if (!cfg.configured) return done("wa_error=not_configured");

  try {
    const short = await exchangeCodeForToken(cfg, code);
    const long = await exchangeForLongLived(cfg, short.accessToken);
    const token = long.accessToken;

    // Discover the granted WABA (first, if several) + its phone numbers.
    const wabaIds = await fetchGrantedWabaIds(cfg, token);
    const wabaId = wabaIds[0] ?? null;
    const waba = wabaId ? await getWaba(cfg, token, wabaId) : null;
    const numbers = wabaId ? (await listPhoneNumbers(cfg, token, wabaId)).numbers : [];
    if (wabaId) await subscribeApp(cfg, token, wabaId);        // webhooks for this WABA

    const live = numbers[0] ?? null;                           // auto-select a live number if present
    await storeConnection({
      orgId: sc.profile.org_id, createdBy: sc.user.id, accessToken: token, expiresInSec: long.expiresInSec,
      scopes: [...WA_SCOPES], businessId: (waba as { id?: string } | null)?.id ?? null, wabaId,
      phoneNumberId: live?.id ?? null, displayPhoneNumber: live?.displayPhoneNumber ?? null,
      verifiedName: live?.verifiedName ?? null,
      status: live ? "connected" : (wabaId ? "pending_number" : "permission_missing"),
    });

    await logAudit({
      action: "whatsapp.connected", category: "configuration", entityType: "whatsapp_connection", entityId: wabaId ?? "unknown",
      summary: `WhatsApp Business connected: WABA ${wabaId ?? "?"}${live ? ` · ${live.displayPhoneNumber}` : " (no number yet)"}`,
      metadata: { wabaId, numbers: numbers.length },          // NEVER a token
    });
  } catch {
    return done("wa_error=exchange_failed");
  }

  const res = done("wa_connected=1");
  res.cookies.set("wa_oauth_nonce", "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/whatsapp/oauth", maxAge: 0 });
  return res;
}
