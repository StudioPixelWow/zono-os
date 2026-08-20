// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · request verification. Phase 3C.
// POST /api/meta/reconciliation/[id]/verify → enqueue a manual provider
// verification for the discrepancy's target/operation (role-gated).
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { getDiscrepancyDetail, requestVerification } from "@/lib/meta/reconcile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await resolveRoleKey(sc.profile);
  const { id } = await params;
  const d = await getDiscrepancyDetail(sc.profile.org_id, id);
  if (!d) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = await requestVerification(sc.profile.org_id, sc.user.id, role, { targetId: d.targetId ?? undefined, operationId: d.operationId ?? undefined });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
