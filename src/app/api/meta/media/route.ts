// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · MEDIA route. Phase 2.
// GET → list org media (short-lived signed URLs only). POST → complete an upload
// (metadata recorded after SERVER-side inspection; no bytes in the DB).
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { listMedia, completeUpload } from "@/lib/meta/media/service";

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
  return NextResponse.json({ media: await listMedia(c.orgId) });
}

export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const facts = await request.json().catch(() => null);
  if (!facts?.storageRef || !facts?.actualMime || !facts?.checksum) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const result = await completeUpload(c.orgId, c.userId, facts);
  if (!result.ok) return NextResponse.json({ error: result.error, codes: result.codes ?? [] }, { status: 400 });
  return NextResponse.json({ media: result.media, deduped: result.deduped });
}
