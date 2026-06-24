// ============================================================================
// POST /api/extension/facebook/publish-result  (Phase 20)
// Authenticated by extension instance. The extension reports the HUMAN-confirmed
// outcome of a browser-assisted publish. ZONO updates the queue accordingly:
//   user_confirmed_published → published   user_cancelled → cancelled
//   failed → failed                         needs_manual_action → queued
// No fake success: a post becomes 'published' ONLY on user_confirmed_published.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance, recordPublishResult, type PublishResultKind } from "@/lib/distribution/extension-service";

const VALID: PublishResultKind[] = ["user_confirmed_published", "user_cancelled", "failed", "needs_manual_action", "user_skipped"];

export async function POST(req: NextRequest) {
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { postId?: string; result?: PublishResultKind; externalPostUrl?: string | null; errorMessage?: string | null };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }
  if (!body.postId || !body.result || !VALID.includes(body.result)) {
    return NextResponse.json({ ok: false, error: "invalid_result" }, { status: 400 });
  }

  const ok = await recordPublishResult(inst, {
    postId: body.postId, result: body.result,
    externalPostUrl: body.externalPostUrl ?? null, errorMessage: body.errorMessage ?? null,
  });
  return NextResponse.json({ ok });
}
