// ============================================================================
// GET /api/extension/facebook/next-post  (Phase 20)
// Authenticated by extension instance. Returns the next prepared GROUP/
// MARKETPLACE post for browser-assisted, human-confirmed publishing. Returns
// NO tokens and no user data unrelated to the post. requiresHumanConfirm=true.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance, getNextPost } from "@/lib/distribution/extension-service";

export async function GET(req: NextRequest) {
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const post = await getNextPost(inst);
  if (post && "updateRequired" in post) {
    // Too old to render a multi-image job; the post was released back to the queue.
    return NextResponse.json(
      { ok: false, error: "update_required", message: "גרסת התוסף אינה נתמכת לפרסום מרובה תמונות. עדכן את התוסף לגרסה האחרונה." },
      { status: 426 },
    );
  }
  if (!post) return NextResponse.json({ ok: true, post: null });
  return NextResponse.json({ ok: true, post });
}
