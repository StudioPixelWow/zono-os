// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · unified inbox conversation detail. Phase 3.
// GET /api/meta/inbox/conversations/[id] → one conversation (safe DTO), org-scoped.
// Authenticated, org server-side, role gated. No Graph model, no secret.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { getInboxConversation, canViewInbox } from "@/lib/meta/inbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, role: await resolveRoleKey(sc.profile) };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewInbox(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const conversation = await getInboxConversation(c.orgId, id);
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ conversation });
}
