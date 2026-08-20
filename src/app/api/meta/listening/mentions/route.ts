// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · listening mentions feed. Phase 5.
// GET /api/meta/listening/mentions?source=&platform=&kind=&match=&status=&sentiment=
//   &intent=&urgency=&q=&since=&until=&sort=&limit=&offset= → safe feed DTOs.
// Authenticated, org server-side, role gated. No token / raw payload / raw cursor.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { listMentions, canViewListening } from "@/lib/meta/listening/service";
import type { MentionFilter, MentionSort } from "@/lib/meta/listening/domain";
import { isMentionKind, isMentionStatus } from "@/lib/meta/listening/domain";
import type { MetaPlatform } from "@/lib/meta/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, role: await resolveRoleKey(sc.profile) }; }
const PLATFORMS = new Set<MetaPlatform>(["facebook", "instagram"]);

export async function GET(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewListening(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const sp = new URL(request.url).searchParams;
  const filter: MentionFilter = {};
  const source = sp.get("source"); if (source) filter.sourceId = source;
  const platform = sp.get("platform"); if (platform && PLATFORMS.has(platform as MetaPlatform)) filter.platform = platform as MetaPlatform;
  const kind = sp.get("kind"); if (kind && isMentionKind(kind)) filter.mentionKind = kind;
  const match = sp.get("match"); if (match === "matched" || match === "unmatched") filter.matchState = match;
  const status = sp.get("status"); if (status && isMentionStatus(status)) filter.status = status;
  const sentiment = sp.get("sentiment"); if (sentiment) filter.sentiment = sentiment;
  const intent = sp.get("intent"); if (intent) filter.intent = intent;
  const urgency = sp.get("urgency"); if (urgency) filter.urgency = urgency;
  const q = sp.get("q"); if (q && q.trim()) filter.query = q.trim().slice(0, 200);
  const since = sp.get("since"); if (since) filter.sinceIso = since;
  const until = sp.get("until"); if (until) filter.untilIso = until;
  const sort: MentionSort = sp.get("sort") === "oldest" ? "oldest" : "recent";
  const limit = Math.max(1, Math.min(100, Number(sp.get("limit") ?? 25) || 25));
  const offset = Math.max(0, Number(sp.get("offset") ?? 0) || 0);
  const r = await listMentions(c.orgId, filter, sort, { limit, offset });
  return NextResponse.json({ items: r.items, total: r.total, limit, offset });
}
