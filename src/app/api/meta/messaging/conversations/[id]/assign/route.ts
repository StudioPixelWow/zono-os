// POST /api/meta/messaging/conversations/[id]/assign { assigneeUserId? } → local assignment.
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { assignConversation } from "@/lib/meta/messaging/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) }; }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(); if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const body = await request.json().catch(() => ({}));
  const assignee = body?.assigneeUserId === null ? null : body?.assigneeUserId === "me" ? c.userId : body?.assigneeUserId ? String(body.assigneeUserId) : null;
  const r = await assignConversation(c.orgId, c.role, id, assignee);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ ok: true });
}
