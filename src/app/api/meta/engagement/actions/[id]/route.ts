// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · approve / reject moderation. Phase 1.
// POST /api/meta/engagement/actions/[id]  { decision: "approve" | "reject" }
//   → approve (enqueue execution) or reject a pending moderation action.
//   Approval is a distinct privileged role from requesting; both are audited.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { approveModeration, rejectModeration } from "@/lib/meta/engagement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const decision = String(body?.decision ?? "");
  const r = decision === "approve" ? await approveModeration(sc.profile.org_id, sc.user.id, role, id) : decision === "reject" ? await rejectModeration(sc.profile.org_id, sc.user.id, role, id) : { ok: false, error: "bad_request" };
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
