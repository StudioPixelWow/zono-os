// POST /api/meta/messaging/conversations/[id]/draft → a reviewable Copilot reply draft (never sends).
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { draftReply } from "@/lib/meta/messaging/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, role: await resolveRoleKey(sc.profile) }; }
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(); if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await draftReply(c.orgId, c.role, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true, body: r.body });
}
