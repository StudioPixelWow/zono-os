// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · unified inbox conversation list. Phase 3.
// GET /api/meta/inbox/conversations?status=&platform=&assignee=&unread=&label=&q=&sort=&limit=&offset=
//   → this org's unified conversations (filtered/sorted/paginated) + unread count.
// POST { platform } → enqueue a bounded inbox sync (local projection; no Graph).
// Authenticated, org server-side, role + capability gated. Safe DTOs only.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { listInboxConversations, getInboxUnreadCount, seedInboxSync, canViewInbox } from "@/lib/meta/inbox/service";
import type { InboxFilter, InboxSort, InboxStatus } from "@/lib/meta/inbox/domain";
import type { MetaPlatform } from "@/lib/meta/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) };
}

const STATUSES = new Set<InboxStatus>(["open", "snoozed", "archived", "resolved"]);
const PLATFORMS = new Set<MetaPlatform>(["facebook", "instagram"]);
const SORTS = new Set<InboxSort>(["recent", "oldest", "priority"]);

export async function GET(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewInbox(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const filter: InboxFilter = {};
  const status = sp.get("status"); if (status && STATUSES.has(status as InboxStatus)) filter.status = status as InboxStatus;
  const platform = sp.get("platform"); if (platform && PLATFORMS.has(platform as MetaPlatform)) filter.platform = platform as MetaPlatform;
  const assignee = sp.get("assignee"); if (assignee === "none") filter.assigneeUserId = null; else if (assignee) filter.assigneeUserId = assignee;
  if (sp.get("unread") === "1" || sp.get("unread") === "true") filter.unreadOnly = true;
  const label = sp.get("label"); if (label) filter.labelId = label;
  const q = sp.get("q"); if (q && q.trim()) filter.query = q.trim().slice(0, 200);
  const sortParam = sp.get("sort"); const sort: InboxSort = SORTS.has(sortParam as InboxSort) ? (sortParam as InboxSort) : "recent";
  const limit = Math.max(1, Math.min(100, Number(sp.get("limit") ?? 25) || 25));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const [page, unread] = await Promise.all([
    listInboxConversations(c.orgId, filter, sort, { limit, offset }),
    getInboxUnreadCount(c.orgId),
  ]);
  return NextResponse.json({ items: page.items, total: page.total, unread, limit, offset });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const platform = String(body?.platform ?? "");
  if (!PLATFORMS.has(platform as MetaPlatform)) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await seedInboxSync(c.orgId, c.role, platform as MetaPlatform);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "capability_denied" ? 409 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
