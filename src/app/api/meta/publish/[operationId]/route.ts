// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH operation detail route. Phase 3A.
// GET /api/meta/publish/[operationId] → safe operation detail (targets + status).
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getOperationDetail, publishRateCheck } from "@/lib/meta/publish/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!publishRateCheck("status", `${sc.profile.org_id}:${sc.user.id}`)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const { operationId } = await params;
  const detail = await getOperationDetail(sc.profile.org_id, operationId);
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ operation: detail });
}
