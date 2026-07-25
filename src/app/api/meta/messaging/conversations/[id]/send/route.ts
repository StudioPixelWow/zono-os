// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · create an outbound DM draft (send). Phase 6.
// POST /api/meta/messaging/conversations/[id]/send { body, policyTag? } → creates a
//   PENDING approval-gated send (window + supported-tag evaluated). NEVER sends here.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { createDraftSend } from "@/lib/meta/messaging/service";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, userId: sc.user.id, role: (sc.profile as { role?: string })?.role ?? "agent" }; }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx(); if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params; const body = await request.json().catch(() => ({}));
  const text = String(body?.body ?? ""); const policyTag = body?.policyTag ? String(body.policyTag) : null;
  const r = await createDraftSend(c.orgId, c.userId, c.role, id, text, policyTag);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ ok: true, send: r.send, note: r.error ?? null });
}
