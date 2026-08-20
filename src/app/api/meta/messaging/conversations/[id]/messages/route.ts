// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · DM messages (decrypted server-side). Phase 6.
// GET /api/meta/messaging/conversations/[id]/messages → the thread's messages. Bodies
//   are decrypted server-side for this authorized read; ciphertext/keys never leave.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { listMessages, canViewMessaging } from "@/lib/meta/messaging/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function ctx() { const sc = await getSessionContext(); if (sc.state !== "ready" || !sc.profile?.org_id) return null; return { orgId: sc.profile.org_id, role: await resolveRoleKey(sc.profile) }; }

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canViewMessaging(c.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;
  return NextResponse.json({ messages: await listMessages(c.orgId, id) });
}
