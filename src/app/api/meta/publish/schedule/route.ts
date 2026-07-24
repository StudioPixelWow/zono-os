// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE route. Phase 3B.
// POST /api/meta/publish/schedule { draftId, targetIds[], localDateTime, timezone }
//   → schedule an approved draft version for a future local time (role-gated,
//   timezone-safe, idempotent). GET → this org's scheduled/queued jobs.
// User-facing + authenticated; the actual execution is done later, in the
// background, by the protected internal worker — never here.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { schedulePublish, listScheduledOperations } from "@/lib/meta/schedule/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: (sc.profile as { role?: string })?.role ?? "agent" };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ jobs: await listScheduledOperations(c.orgId) });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const draftId = String(body?.draftId ?? "");
  const targetIds: string[] = Array.isArray(body?.targetIds) ? body.targetIds.map(String) : [];
  const localDateTime = String(body?.localDateTime ?? "");
  const timezone = String(body?.timezone ?? "");
  if (!draftId || targetIds.length === 0 || !localDateTime || !timezone) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await schedulePublish(c.orgId, c.userId, c.role, draftId, targetIds, localDateTime, timezone);
  if (!result.ok) return NextResponse.json({ error: result.error, blocked: result.blocked }, { status: result.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ job: result.job });
}
