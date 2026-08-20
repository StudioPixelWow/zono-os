// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · change a mention's local status. Phase 5.
// POST /api/meta/listening/mentions/[id]/status { status } → local, audited status
//   change (new|reviewed|actionable|ignored|resolved). NEVER a provider write.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { changeMentionStatus } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) }; }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = String(body?.status ?? "");
  const r = await changeMentionStatus(c.orgId, c.userId, c.role, id, status);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
