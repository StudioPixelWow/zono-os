import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { isManagerRole } from "@/lib/auth/office-roles";
import { getGeoPipelineStatus } from "@/lib/geo/geo-pipeline-status";

export const runtime = "nodejs";

/**
 * ZONO GEO — ops/admin status for the automatic geocoding pipeline (§12).
 * Manager/owner only — never exposed to brokers. Returns coverage, cache size,
 * last run, provider calls today and the recent cache-hit rate as JSON.
 */
export async function GET() {
  const { profile, state } = await getSessionContext();
  if (state !== "ready" || !profile?.org_id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const role = await resolveRoleKey(profile);
  if (!isManagerRole(role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const status = await getGeoPipelineStatus(profile.org_id);
  return NextResponse.json(status);
}
