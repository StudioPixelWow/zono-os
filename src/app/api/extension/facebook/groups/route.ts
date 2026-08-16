// ============================================================================
// POST /api/extension/facebook/groups  (Facebook Groups import)
// Authenticated by extension instance (x-zono-instance-id + x-zono-extension-secret).
// The extension — while the user is signed into THEIR OWN Facebook — reports the
// groups that user is a member of. We upsert them into the canonical
// distribution_groups registry (idempotent on external_group_id) and audit each.
// The server NEVER receives Facebook cookies, passwords, or session tokens — only
// the group metadata the user themselves can see, on their explicit import.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { authInstance } from "@/lib/distribution/extension-service";
import { importScannedGroups, type ScannedGroup } from "@/lib/distribution/group-import-service";

export async function POST(req: NextRequest) {
  const inst = await authInstance(req.headers.get("x-zono-instance-id"), req.headers.get("x-zono-extension-secret"));
  if (!inst) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { groups?: ScannedGroup[]; fullScan?: boolean };
  try { body = await req.json(); } catch { body = {}; }
  if (!Array.isArray(body.groups)) {
    return NextResponse.json({ ok: false, error: "groups[] required" }, { status: 400 });
  }

  // fullScan=true marks the batch as the COMPLETE joined-groups list, enabling
  // reconciliation (mark vanished groups unavailable). Absent/false = partial.
  const result = await importScannedGroups(inst, body.groups, { fullScan: body.fullScan === true });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
