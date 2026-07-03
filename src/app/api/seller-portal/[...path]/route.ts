// ============================================================================
// 🏷️ ZONO — Seller Portal — authenticated JSON API. 32.4. Part: PUBLIC API.
// Every endpoint resolves the SIGNED-IN seller server-side (no client id) and
// scopes reads to that seller only. GET reads; POST /ask.
// GET  /api/seller-portal/dashboard | property | buyers | activity |
//      appointments | messages | documents | profile
// POST /api/seller-portal/ask   { query }
// ============================================================================
import { NextResponse } from "next/server";
import { getSellerDashboard, getSellerProperty, getSellerBuyerDemand, getSellerActivity, getSellerAppointments, getSellerMessages, getSellerDocuments, getSellerProfile, askSeller, type PortalResult } from "@/lib/seller-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function wrap<T>(r: PortalResult<T>) {
  if (r.state === "unauthenticated") return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (r.state === "unlinked") return NextResponse.json({ error: "unlinked", email: r.email }, { status: 403 });
  return NextResponse.json({ ok: true, data: r.data });
}
const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function GET(_req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  switch (path[0]) {
    case "dashboard": return wrap(await getSellerDashboard());
    case "property": return wrap(await getSellerProperty());
    case "buyers": return wrap(await getSellerBuyerDemand());
    case "activity": return wrap(await getSellerActivity());
    case "appointments": return wrap(await getSellerAppointments());
    case "messages": return wrap(await getSellerMessages());
    case "documents": return wrap(await getSellerDocuments());
    case "profile": return wrap(await getSellerProfile());
    default: return notFound();
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  if (path[0] !== "ask") return notFound();
  let body: { query?: string } = {};
  try { body = (await req.json()) as { query?: string }; } catch { body = {}; }
  return wrap(await askSeller((body.query ?? "").slice(0, 500)));
}
