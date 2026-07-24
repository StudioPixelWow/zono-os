// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CANCEL route. Phase 3A.
// POST /api/meta/publish/[operationId]/cancel → cancel a pre-execution operation
// only. Rejected once provider execution has started. Idempotent.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { cancelOperation } from "@/lib/meta/publish/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  const { operationId } = await params;
  const r = await cancelOperation(sc.profile.org_id, role, operationId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 409 });
  return NextResponse.json({ ok: true });
}
