// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · project a mention to the inbox. Phase 5.
// POST /api/meta/listening/mentions/[id]/project-to-inbox → additive Phase-3 inbox
//   projection (dedup by subject) + Phase-4 scoring on the existing path. No Meta write.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { projectMentionToInbox } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, userId: sc.user.id, role: (sc.profile as { role?: string })?.role ?? "agent" }; }

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await projectMentionToInbox(c.orgId, c.userId, c.role, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : r.error === "unmatched_not_actionable" ? 409 : 400 });
  return NextResponse.json({ ok: true, conversationId: r.conversationId });
}
