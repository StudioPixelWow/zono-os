// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · acknowledge discrepancy. Phase 3C.
// POST /api/meta/reconciliation/[id]/acknowledge { reason } → role-gated, audited.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { acknowledgeDiscrepancy } from "@/lib/meta/reconcile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const r = await acknowledgeDiscrepancy(sc.profile.org_id, sc.user.id, role, id, String(body?.reason ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
