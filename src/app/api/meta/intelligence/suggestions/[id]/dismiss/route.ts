// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · dismiss a next-best-action. Phase 4.
// POST /api/meta/intelligence/suggestions/[id]/dismiss { reason? } → records the
//   actor + time (+ optional safe reason). Authenticated, org server-side, role
//   gated. Dismissing never resolves the conversation on its own.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { dismissSuggestion } from "@/lib/meta/intelligence/service";

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
  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 200) : undefined;
  const r = await dismissSuggestion(c.orgId, c.userId, c.role, id, reason);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
