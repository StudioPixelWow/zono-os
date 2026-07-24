// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · APPROVAL route. Phase 2.
// POST { action: 'submit'|'approve'|'reject'|'request_changes', reason? }
// Role-gated; creators cannot self-approve. Approval never publishes or queues.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { submitForApproval, decideApproval } from "@/lib/meta/content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  const { draftId } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "");

  const orgId = sc.profile.org_id, userId = sc.user.id;
  let result;
  if (action === "submit") result = await submitForApproval(orgId, userId, role, draftId);
  else if (action === "approve" || action === "reject" || action === "request_changes") result = await decideApproval(orgId, userId, role, draftId, action, body?.reason ?? null);
  else return NextResponse.json({ error: "bad_action" }, { status: 400 });

  if ("error" in result) return NextResponse.json(result, { status: 400 });
  return NextResponse.json({ draft: result });
}
