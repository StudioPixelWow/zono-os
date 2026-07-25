// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · unified inbox labels. Phase 3.
// GET  /api/meta/inbox/labels → this org's labels (safe DTO).
// POST { name, color? } → create a label (manage-gated).
// Authenticated, org server-side, role gated. Local metadata; never touches Meta.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { listInboxLabels, createInboxLabel, canViewInbox } from "@/lib/meta/inbox/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, role: (sc.profile as { role?: string })?.role ?? "agent" };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewInbox(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ labels: await listInboxLabels(c.orgId) });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const name = String(body?.name ?? "");
  const color = body?.color ? String(body.color).slice(0, 24) : null;
  const r = await createInboxLabel(c.orgId, c.role, name, color);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ ok: true, id: r.id });
}
