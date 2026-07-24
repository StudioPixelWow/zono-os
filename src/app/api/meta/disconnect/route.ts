// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · DISCONNECT (server route). Phase 1.
// POST /api/meta/disconnect { connectionId } → revokes permissions at Meta,
// purges the encrypted token, and tombstones the org's assets. Session-scoped;
// only the caller's own org connection can be disconnected.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { disconnect } from "@/lib/meta/connection/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let connectionId = "";
  try { connectionId = (await request.json())?.connectionId ?? ""; } catch { /* empty body */ }
  if (!connectionId) return NextResponse.json({ error: "missing_connection_id" }, { status: 400 });

  try {
    const descriptor = await disconnect(sc.profile.org_id, connectionId);
    return NextResponse.json({ ok: true, status: descriptor.status });
  } catch {
    return NextResponse.json({ error: "disconnect_failed" }, { status: 500 });
  }
}
