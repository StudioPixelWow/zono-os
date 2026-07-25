// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · accept a next-best-action. Phase 4.
// POST /api/meta/intelligence/suggestions/[id]/accept → route into an EXISTING
//   workflow: create a reviewable Copilot draft, open the Phase-1 approval-gated
//   moderation action, or route through Phase-3 inbox controls. NEVER executes a
//   provider write / auto-send. Authenticated, org server-side, role gated.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { acceptSuggestion } from "@/lib/meta/intelligence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: (sc.profile as { role?: string })?.role ?? "agent" };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  void request;
  const r = await acceptSuggestion(c.orgId, c.userId, c.role, id);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true, route: r.route, draft: r.draft, navigate: r.navigate });
}
