// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · refresh a listening source. Phase 5.
// POST /api/meta/listening/sources/[id]/refresh { kind?: "poll"|"backfill" } →
//   schedule a bounded pull only (no synchronous provider call). Role + capability gated.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { refreshSource } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, role: await resolveRoleKey(sc.profile) }; }

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const kind = body?.kind === "backfill" ? "backfill" : "poll";
  const r = await refreshSource(c.orgId, c.role, id, kind);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "not_found" ? 404 : r.error === "capability_denied" ? 409 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
