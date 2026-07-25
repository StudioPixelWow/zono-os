// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · disable a listening source. Phase 5.
// POST /api/meta/listening/sources/[id]/disable → disable (stops future polling). Role gated.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { setSourceEnabled } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, role: (sc.profile as { role?: string })?.role ?? "agent" }; }

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await setSourceEnabled(c.orgId, c.role, id, false);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : 400 });
  return NextResponse.json({ ok: true });
}
