// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · request comment moderation. Phase 1.
// POST /api/meta/engagement/comments/[id]/moderate { actionKind, replyText? }
//   → create an APPROVAL-GATED moderation action (reply/hide/unhide/delete). It is
//   never executed here; a privileged approver must approve it first.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { requestModeration } from "@/lib/meta/engagement/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set(["reply", "hide", "unhide", "delete"]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const actionKind = String(body?.actionKind ?? "");
  if (!KINDS.has(actionKind)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await requestModeration(sc.profile.org_id, sc.user.id, role, { targetCommentId: id, actionKind: actionKind as never, replyText: body?.replyText ? String(body.replyText) : undefined });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true, action: r.action });
}
