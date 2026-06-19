import { NextResponse, type NextRequest } from "next/server";
import { organizationsWithActiveLocalities, syncExternalListingsForOrganization } from "@/lib/external-listings/service";

/**
 * Nightly external-listings sync (Vercel Cron, 02:00). Secured by CRON_SECRET.
 * Loops orgs that have active operating localities; service-role, no session.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const orgs = await organizationsWithActiveLocalities();
    const results = [];
    for (const orgId of orgs) {
      try {
        results.push(await syncExternalListingsForOrganization(orgId));
      } catch (e) {
        results.push({ success: false, organizationId: orgId, error: e instanceof Error ? e.message : "sync failed" });
      }
    }
    return NextResponse.json({ ok: true, organizations: orgs.length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "cron failed" }, { status: 500 });
  }
}
