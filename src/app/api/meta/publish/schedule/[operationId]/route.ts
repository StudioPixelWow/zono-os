// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · SCHEDULE reschedule/cancel. Phase 3B.
// PATCH /api/meta/publish/schedule/[operationId] { localDateTime, timezone } →
//   reschedule a not-yet-claimed scheduled operation.
// DELETE → cancel a scheduled operation before it executes.
// Role-gated + authenticated; org-scoped server-side.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { reschedule, cancelScheduled } from "@/lib/meta/schedule/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: (sc.profile as { role?: string })?.role ?? "agent" };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { operationId } = await params;
  const body = await request.json().catch(() => ({}));
  const localDateTime = String(body?.localDateTime ?? "");
  const timezone = String(body?.timezone ?? "");
  if (!localDateTime || !timezone) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await reschedule(c.orgId, c.role, operationId, localDateTime, timezone);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ job: r.job });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ operationId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { operationId } = await params;
  const r = await cancelScheduled(c.orgId, c.role, operationId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ ok: true });
}
