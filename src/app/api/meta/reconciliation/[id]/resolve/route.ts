// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · resolve discrepancy (false positive). Phase 3C.
// POST /api/meta/reconciliation/[id]/resolve { reason } → role-gated; an explicit
// reason is REQUIRED. There is no generic "mark as successful" action.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { resolveFalsePositive } from "@/lib/meta/reconcile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await resolveRoleKey(sc.profile);
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const r = await resolveFalsePositive(sc.profile.org_id, sc.user.id, role, id, String(body?.reason ?? ""));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
