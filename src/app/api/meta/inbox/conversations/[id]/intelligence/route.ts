// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · conversation engagement intelligence. Phase 4.
// GET /api/meta/inbox/conversations/[id]/intelligence → current signal + bounded
//   suggestions + signal history (safe DTO). Authenticated, org server-side,
//   role gated. AI output is a suggestion — nothing here executes.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getConversationIntelligence, canViewIntelligence } from "@/lib/meta/intelligence/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, role: (sc.profile as { role?: string })?.role ?? "agent" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewIntelligence(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json({ intelligence: await getConversationIntelligence(c.orgId, id) });
}
