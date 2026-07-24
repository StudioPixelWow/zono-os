// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · DRAFTS route. Phase 2.
// GET /api/meta/drafts → list org drafts. POST → create a draft.
// Session-scoped; org resolved server-side. No Meta call. No publish action.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { listDrafts, createDraft } from "@/lib/meta/content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return null;
  return { orgId: sc.profile.org_id, userId: sc.user.id };
}

export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ drafts: await listDrafts(c.orgId) });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let name = "טיוטה חדשה";
  try { name = (await request.json())?.internalName ?? name; } catch { /* default */ }
  const result = await createDraft(c.orgId, c.userId, name);
  if ("error" in result) return NextResponse.json(result, { status: 429 });
  return NextResponse.json({ draft: result });
}
