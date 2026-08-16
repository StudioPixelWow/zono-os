// ============================================================================
// POST /api/extension/facebook/groups/reconcile  (P9.8 group-network reconcile)
// Authenticated by extension instance. Receives the COMPLETE set of external group
// ids the user is currently a member of (a full-scan completion signal) and marks
// any org scan-group no longer present → UNAVAILABLE (never deletes, preserves the
// agent's ACTIVE/IGNORED choices and manual groups). No FB credentials involved.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance } from "@/lib/distribution/extension-service";
import { reconcileScannedGroups } from "@/lib/distribution/group-network-service";

export async function POST(req: NextRequest) {
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { seenExternalIds?: unknown };
  try { body = await req.json(); } catch { body = {}; }
  const seen = Array.isArray(body.seenExternalIds) ? body.seenExternalIds.filter((x): x is string => typeof x === "string") : null;
  if (!seen) return NextResponse.json({ ok: false, error: "seenExternalIds[] required" }, { status: 400 });

  const result = await reconcileScannedGroups(inst.orgId, inst.userId, seen);
  return NextResponse.json({ ok: true, ...result });
}
