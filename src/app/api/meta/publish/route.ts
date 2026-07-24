// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · PUBLISH route. Phase 3A.
// POST /api/meta/publish { draftId, targetIds[] } → create + immediately execute
// an immediate publish operation (role-gated, rate-limited, idempotent).
// GET → publishing history. Publishing sends content to Meta immediately.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createPublish, listPublishHistory } from "@/lib/meta/publish/service";

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
  return NextResponse.json({ operations: await listPublishHistory(c.orgId) });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const draftId = String(body?.draftId ?? "");
  const targetIds: string[] = Array.isArray(body?.targetIds) ? body.targetIds.map(String) : [];
  if (!draftId || targetIds.length === 0) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await createPublish(c.orgId, c.userId, c.role, draftId, targetIds);
  if (!result.ok) return NextResponse.json({ error: result.error, blocked: result.blocked }, { status: result.error === "forbidden" ? 403 : result.error === "rate_limited" ? 429 : 400 });
  return NextResponse.json({ operation: result.detail, resumed: result.resumed });
}
