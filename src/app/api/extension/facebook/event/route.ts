// ============================================================================
// POST /api/extension/facebook/event  (Phase 21)
// Authenticated by extension instance. Records a lightweight, non-publishing
// interaction event (opened | copied) onto the prepared post so ZONO can show
// per-group progress. NOT a publish — never changes status to published.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance, recordPostEvent, type PostEventKind } from "@/lib/distribution/extension-service";

const VALID: PostEventKind[] = ["opened", "copied"];

export async function POST(req: NextRequest) {
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { postId?: string; event?: PostEventKind };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }
  if (!body.postId || !body.event || !VALID.includes(body.event)) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }
  const ok = await recordPostEvent(inst, body.postId, body.event);
  return NextResponse.json({ ok });
}
