// ============================================================================
// 🟦 ZONO OS — Batch 6.5 · GOOGLE WORKSPACE OS — DISCONNECT (server route).
//
// POST /api/google/disconnect → revokes the connection. Requires the session;
// revokes the refresh token AT Google (Part 7 — token revocation), clears the
// stored ciphertext (status → disconnected), and audits. Best-effort revoke:
// even if Google is unreachable we still clear local tokens so nothing lingers.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getMyConnection, decryptRefreshToken, clearConnectionTokens } from "@/lib/google/tokens";
import { revokeToken } from "@/lib/google/oauth";
import { logAudit } from "@/lib/audit/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const conn = await getMyConnection();
  if (!conn) return NextResponse.json({ ok: true, alreadyDisconnected: true });

  const refresh = decryptRefreshToken(conn);
  if (refresh) await revokeToken(refresh);                 // best-effort revoke at Google
  await clearConnectionTokens(conn.id, "disconnected");

  await logAudit({
    action: "google.disconnected", category: "configuration", entityType: "google_connection", entityId: conn.googleSub ?? conn.id,
    summary: `Google Workspace disconnected: ${conn.email ?? conn.id}`,
  });
  return NextResponse.json({ ok: true });
}
