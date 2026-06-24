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
  if (!post) return NextResponse.json({ ok: true, post: null });
  return NextResponse.json({ ok: true, post });
}
