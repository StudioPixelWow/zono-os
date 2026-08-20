// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · manual rescore. Phase 4.
// POST /api/meta/inbox/conversations/[id]/intelligence/rescore → enqueue a bounded
//   rescore (durable queue → Reasoning boundary). Authenticated, org server-side,
//   role + capability gated. No provider write, no auto-execution.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { requestRescore } from "@/lib/meta/intelligence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  void request;
  const r = await requestRescore(c.orgId, c.role, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "capability_denied" ? 409 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
