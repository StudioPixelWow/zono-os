// ============================================================================
// POST /api/extension/facebook/pairing/complete  (Phase 20)
// The extension submits the pairing code (+ optional version). On success we
// create an instance, return { instanceId, secret } ONCE (secret stored hashed),
// and mark the chrome_extension path 'installed'. No Facebook credentials.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { completePairing } from "@/lib/distribution/extension-service";

export async function POST(req: NextRequest) {
  let body: { code?: string; version?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 }); }
  if (!body.code) return NextResponse.json({ ok: false, error: "missing_code" }, { status: 400 });

  const res = await completePairing(body.code, body.version);
  if (!res.ok) return NextResponse.json({ ok: false, error: res.message }, { status: 400 });
  // The secret is returned exactly once; the extension must store it locally.
  return NextResponse.json({ ok: true, instanceId: res.instanceId, secret: res.secret });
}
