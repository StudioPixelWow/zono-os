// ============================================================================
// ZONO — Buyer portal → property VIEW hop (GET, public + token-scoped). The portal
// property card links here; we record an honest property-view (throttled, membership
// -guarded) and 302 to the canonical PUBLIC property page /p/[id]. Never links the
// buyer to the internal /properties/[id]. Revocation is enforced before recording.
// ============================================================================
import { NextResponse } from "next/server";
import { verifyPortalToken } from "@/lib/customer-portal/portal-tokens";
import { currentPortalVersion } from "@/lib/customer-portal/buyer-portal";
import { recordPortalPropertyView } from "@/lib/customer-portal/portal-tracking";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string; propertyId: string }> }) {
  const { token, propertyId } = await ctx.params;
  const dest = new URL(`/p/${propertyId}`, req.url);
  const p = verifyPortalToken(token);
  if (!p || p.t !== "buyer" || !propertyId) return NextResponse.redirect(dest, { status: 302 });

  // Enforce revocation before recording anything.
  const db = createServiceRoleClient();
  const liveVer = await currentPortalVersion(db, p.o, "buyer", p.c);
  if (liveVer == null || liveVer !== p.v) return NextResponse.redirect(dest, { status: 302 });

  try { await recordPortalPropertyView(p.o, p.c, propertyId, db); } catch { /* tracking never blocks navigation */ }
  return NextResponse.redirect(dest, { status: 302 });
}
