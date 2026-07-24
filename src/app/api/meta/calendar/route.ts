// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CALENDAR route. Phase 2.
// GET → editorial planning read model (scheduled + unscheduled). Planning only —
// creates NO publishing job, runs NO scheduler, calls NO Meta endpoint.
// ============================================================================
import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { getCalendar } from "@/lib/meta/content/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.user || !sc.profile?.org_id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ calendar: await getCalendar(sc.profile.org_id) });
}
