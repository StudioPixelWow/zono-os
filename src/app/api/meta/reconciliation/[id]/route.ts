// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION detail route. Phase 3C.
// GET /api/meta/reconciliation/[id] → one discrepancy (safe DTO), org-scoped.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { getDiscrepancyDetail, canRequestVerification } from "@/lib/meta/reconcile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await resolveRoleKey(sc.profile);
  if (!canRequestVerification(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const detail = await getDiscrepancyDetail(sc.profile.org_id, id);
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ discrepancy: detail });
}
