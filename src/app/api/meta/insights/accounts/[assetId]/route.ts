// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · account insights. Phase 2.
// GET  /api/meta/insights/accounts/[assetId] → account metric series (safe DTO).
// POST → enqueue a bounded refresh. Authenticated, role + capability gated.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getAccountInsights, refreshAccountInsights, canViewInsights } from "@/lib/meta/insights/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, role: (sc.profile as { role?: string })?.role ?? "agent" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewInsights(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { assetId } = await params;
  return NextResponse.json({ insights: await getAccountInsights(c.orgId, assetId) });
}

export async function POST(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { assetId } = await params;
  const body = await request.json().catch(() => ({}));
  const platform = body?.platform === "instagram" ? "instagram" : "facebook";
  const r = await refreshAccountInsights(c.orgId, c.role, assetId, platform);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "capability_denied" ? 409 : 400 });
  return NextResponse.json({ ok: true, jobId: r.jobId });
}
