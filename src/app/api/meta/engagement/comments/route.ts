// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · comments list + backfill. Phase 1.
// GET  /api/meta/engagement/comments?objectId=… → this org's comments + threads.
// POST /api/meta/engagement/comments  { providerObjectId } → enqueue a backfill.
// Authenticated, org server-side, role + capability gated. Safe DTOs.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { listComments, listThreads, backfillComments, canViewComments } from "@/lib/meta/engagement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) };
}

export async function GET(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewComments(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const objectId = new URL(request.url).searchParams.get("objectId");
  if (!objectId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const [comments, threads] = await Promise.all([listComments(c.orgId, objectId), listThreads(c.orgId, objectId)]);
  return NextResponse.json({ comments, threads });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const providerObjectId = String(body?.providerObjectId ?? "");
  if (!providerObjectId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await backfillComments(c.orgId, c.role, providerObjectId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "capability_denied" ? 409 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
