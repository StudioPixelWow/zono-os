// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · unified inbox conversation action. Phase 3.
// POST /api/meta/inbox/conversations/[id]/action  { action, assigneeUserId?, labelId?, snoozedUntil?, priority? }
//   → apply a LOCAL state change (read/unread/archive/unarchive/resolve/reopen/
//     snooze/assign/unassign/add_label/remove_label). NEVER touches Meta.
// Authenticated, org server-side, role gated (assign requires assigner role).
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { applyInboxAction } from "@/lib/meta/inbox/service";
import type { InboxAction } from "@/lib/meta/inbox/state";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIONS = new Set<InboxAction>(["mark_read", "mark_unread", "archive", "unarchive", "resolve", "reopen", "snooze", "assign", "unassign", "add_label", "remove_label"]);

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action ?? "") as InboxAction;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const payload = {
    assigneeUserId: body?.assigneeUserId === null ? null : body?.assigneeUserId ? String(body.assigneeUserId) : undefined,
    labelId: body?.labelId ? String(body.labelId) : undefined,
    snoozedUntil: body?.snoozedUntil ? String(body.snoozedUntil) : undefined,
    priority: typeof body?.priority === "number" ? body.priority : undefined,
  };
  const r = await applyInboxAction(c.orgId, c.userId, c.role, id, action, payload);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
