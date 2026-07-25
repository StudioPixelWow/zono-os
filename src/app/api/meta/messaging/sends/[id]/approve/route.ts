// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · approve + release an outbound send. Phase 6.
// POST /api/meta/messaging/sends/[id]/approve → approve (privileged role) → enqueues a
//   SINGLE provider write via the queue. Window + tag + capability re-checked at send.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { approveAndSend } from "@/lib/meta/messaging/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, userId: sc.user.id, role: (sc.profile as { role?: string })?.role ?? "agent" }; }
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(); if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await approveAndSend(c.orgId, c.userId, c.role, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
