// ============================================================================
// POST /api/extension/facebook/comments  (Facebook Groups social-lead ingest)
// Authenticated by extension instance (x-zono-instance-id + x-zono-extension-secret).
// The extension reports comments it observes on the group posts WE published (it
// already holds our post id from the prepared-post hand-off). We persist + classify
// them and spin high-intent comments into distribution_leads. The server NEVER
// receives Facebook cookies/passwords/tokens — only comment text/author the user
// can see, tied to a post we own.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance } from "@/lib/distribution/extension-service";
import { importScannedComments, type ScannedComment } from "@/lib/distribution/comment-import-service";

export async function POST(req: NextRequest) {
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { comments?: ScannedComment[] };
  try { body = await req.json(); } catch { body = {}; }
  if (!Array.isArray(body.comments)) {
    return NextResponse.json({ ok: false, error: "comments[] required" }, { status: 400 });
  }

  const result = await importScannedComments(inst, body.comments);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
