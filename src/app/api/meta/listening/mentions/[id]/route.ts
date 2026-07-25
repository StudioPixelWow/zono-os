// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · listening mention detail. Phase 5.
// GET /api/meta/listening/mentions/[id] → one mention (safe DTO), org-scoped.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getMention, canViewListening } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, role: (sc.profile as { role?: string })?.role ?? "agent" }; }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewListening(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  const mention = await getMention(c.orgId, id);
  if (!mention) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ mention });
}
