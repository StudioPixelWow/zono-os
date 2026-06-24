// ============================================================================
// POST /api/extension/facebook/heartbeat  (Phase 20)
// Authenticated by extension instance (x-zono-instance-id + x-zono-extension-secret).
// The extension reports ONLY: version, facebook_session_detected, optional FB
// profile name/id. Updates instance + chrome_extension path status. The server
// NEVER receives or stores Facebook cookies, passwords, or session tokens.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance, recordHeartbeat } from "@/lib/distribution/extension-service";

export async function POST(req: NextRequest) {
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { version?: string; facebookSessionDetected?: boolean; facebookProfileName?: string | null; facebookProfileId?: string | null };
  try { body = await req.json(); } catch { body = {}; }

  const status = await recordHeartbeat(inst, {
    version: body.version,
    facebookSessionDetected: body.facebookSessionDetected === true,
    facebookProfileName: body.facebookProfileName ?? null,
    facebookProfileId: body.facebookProfileId ?? null,
  });
  return NextResponse.json({ ok: true, status });
}
