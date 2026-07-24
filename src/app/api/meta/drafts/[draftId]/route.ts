// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · DRAFT editor route. Phase 2.
// GET → safe draft editor DTO. PATCH → optimistic-concurrency field edit.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getDraftEditor, updateDraftFields } from "@/lib/meta/content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id, role: (sc.profile as { role?: string })?.role ?? "agent" };
}

export async function GET(_req: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { draftId } = await params;
  const dto = await getDraftEditor(c.orgId, draftId);
  if (!dto) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ draft: dto });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ draftId: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { draftId } = await params;
  const body = await request.json().catch(() => ({}));
  const expectedRevision = Number(body?.expectedRevision ?? -1);
  const result = await updateDraftFields(c.orgId, c.userId, c.role, draftId, body?.patch ?? {}, expectedRevision);
  if ("error" in result) return NextResponse.json(result, { status: result.error === "conflict" ? 409 : result.error === "forbidden" ? 403 : 400 });
  return NextResponse.json({ draft: result });
}
