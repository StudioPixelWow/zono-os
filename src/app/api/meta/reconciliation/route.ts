// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · RECONCILIATION list route. Phase 3C.
// GET /api/meta/reconciliation → this org's discrepancies (safe DTOs). Authenticated,
// org resolved server-side. No generic Graph inspection, no raw webhook browser.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { listDiscrepancies, canRequestVerification } from "@/lib/meta/reconcile/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = (sc.profile as { role?: string })?.role ?? "agent";
  if (!canRequestVerification(role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json({ discrepancies: await listDiscrepancies(sc.profile.org_id) });
}
