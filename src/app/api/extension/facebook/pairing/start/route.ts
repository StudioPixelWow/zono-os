// ============================================================================
// POST /api/extension/facebook/pairing/start  (Phase 20)
// Authenticated ZONO user only. Creates a short-lived (10 min), one-time pairing
// code bound to org_id + user_id. Returns the raw code to display in the ZONO UI.
// No Facebook credentials involved.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { startPairing } from "@/lib/distribution/extension-service";

export async function POST() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id || !profile.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const res = await startPairing(profile.org_id, profile.id);
  if (!res) return NextResponse.json({ ok: false, error: "pairing_unavailable" }, { status: 500 });
  return NextResponse.json({ ok: true, code: res.code, expiresAt: res.expiresAt });
}
