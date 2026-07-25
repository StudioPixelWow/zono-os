// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · DM conversation detail. Phase 6.
// GET /api/meta/messaging/conversations/[id] → detail + 24h window state (safe DTO).
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getConversation, canViewMessaging } from "@/lib/meta/messaging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, role: (sc.profile as { role?: string })?.role ?? "agent" }; }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewMessaging(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const conversation = await getConversation(c.orgId, id);
  if (!conversation) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ conversation });
}
