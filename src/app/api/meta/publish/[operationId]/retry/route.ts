// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MANUAL RETRY route. Phase 3A.
// POST /api/meta/publish/[operationId]/retry { targetId } → manual retry of an
// eligible FAILED target only (never automatic; never republishes a success;
// ambiguous failures are not retryable).
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { retryTarget } from "@/lib/meta/publish/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  const body = await request.json().catch(() => ({}));
  const targetId = String(body?.targetId ?? "");
  if (!targetId) return NextResponse.json({ error: "missing_target" }, { status: 400 });
  const r = await retryTarget(sc.profile.org_id, sc.user.id, role, targetId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ operation: r.detail });
}
