// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · DM conversations list. Phase 6.
// GET /api/meta/messaging/conversations?platform=&status=&assignee=&unread=&q=&sort=&limit=&offset=
//   → this org's DM conversations (safe DTO; no bodies). Authenticated, role gated.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { listConversations, canViewMessaging } from "@/lib/meta/messaging/service";
import type { ConversationFilter, ConversationSort } from "@/lib/meta/messaging/domain";
import { isConversationStatus } from "@/lib/meta/messaging/domain";
import type { MetaPlatform } from "@/lib/meta/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) }; }
const PLATFORMS = new Set<MetaPlatform>(["facebook", "instagram"]);

export async function GET(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewMessaging(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const filter: ConversationFilter = {};
  const platform = sp.get("platform"); if (platform && PLATFORMS.has(platform as MetaPlatform)) filter.platform = platform as MetaPlatform;
  const status = sp.get("status"); if (status && isConversationStatus(status)) filter.status = status;
  const assignee = sp.get("assignee"); if (assignee === "none") filter.assigneeUserId = null; else if (assignee === "me") filter.assigneeUserId = c.userId;
  if (sp.get("unread") === "1") filter.unreadOnly = true;
  const q = sp.get("q"); if (q && q.trim()) filter.query = q.trim().slice(0, 200);
  const sort: ConversationSort = sp.get("sort") === "oldest" ? "oldest" : "recent";
  const limit = Math.max(1, Math.min(100, Number(sp.get("limit") ?? 25) || 25));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const r = await listConversations(c.orgId, filter, sort, { limit, offset });
  return NextResponse.json({ items: r.items, total: r.total, limit, offset });
}
