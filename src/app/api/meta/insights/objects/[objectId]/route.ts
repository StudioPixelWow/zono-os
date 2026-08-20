// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · object insights. Phase 2.
// GET  /api/meta/insights/objects/[objectId] → the post's metric series (safe DTO).
// POST → enqueue a bounded refresh. Authenticated, org server-side, role +
// capability gated. Read-only analytics — no write path to the provider.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { getObjectInsights, refreshObjectInsights, canViewInsights } from "@/lib/meta/insights/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, role: await resolveRoleKey(sc.profile) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ objectId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewInsights(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { objectId } = await params;
  return NextResponse.json({ insights: await getObjectInsights(c.orgId, objectId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ objectId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { objectId } = await params;
  void request;
  const r = await refreshObjectInsights(c.orgId, c.role, objectId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "capability_denied" ? 409 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
