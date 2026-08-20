// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · listening sources list + create. Phase 5.
// GET  /api/meta/listening/sources → this org's sources (safe DTO).
// POST /api/meta/listening/sources { assetId, sourceKind } → create a source from a
//   CONNECTED asset (never an arbitrary target). Authenticated, org server-side,
//   role + capability gated.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { listSources, createSource, canViewListening } from "@/lib/meta/listening/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: await resolveRoleKey(sc.profile) };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewListening(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ sources: await listSources(c.orgId) });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const assetId = String(body?.assetId ?? "");
  const sourceKind = String(body?.sourceKind ?? "");
  if (!assetId || !sourceKind) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await createSource(c.orgId, c.userId, c.role, { assetId, sourceKind });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : r.error === "asset_not_connected" ? 409 : 400 });
  return NextResponse.json({ ok: true, id: r.id, blockedReason: r.blockedReason ?? null });
}
