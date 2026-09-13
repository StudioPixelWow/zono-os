// ============================================================================
// Broker listing-claim API. GET → detect claimable listings for the signed-in
// office; POST {action:"confirm"|"dismiss"} → assign them permanently or dismiss.
// The org is ALWAYS resolved from the session (never client-supplied), so an
// office can only ever claim into its own inventory.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { getOfficeActivation } from "@/lib/activation/activation-server";
import { detectClaimableListings, confirmListingClaim, dismissListingClaim } from "@/lib/activation/listing-claim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const act = await getOfficeActivation();
    if (!act) return NextResponse.json({ ok: false, status: "none" });
    const res = await detectClaimableListings(act.identity.orgId);
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    console.error("[listing-claim] GET failed:", e);
    return NextResponse.json({ ok: false, status: "none" });
  }
}

export async function POST(req: NextRequest) {
  try {
    const act = await getOfficeActivation();
    if (!act) return NextResponse.json({ ok: false, error: "no_office" }, { status: 401 });
    const body = (await req.json().catch(() => ({}))) as { action?: string };
    const orgId = act.identity.orgId;
    if (body.action === "confirm") {
      const r = await confirmListingClaim(orgId);
      return NextResponse.json({ ok: r.ok, count: r.count });
    }
    if (body.action === "dismiss") {
      await dismissListingClaim(orgId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, error: "bad_action" }, { status: 400 });
  } catch (e) {
    console.error("[listing-claim] POST failed:", e);
    return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
  }
}
