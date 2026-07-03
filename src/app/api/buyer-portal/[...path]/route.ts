// ============================================================================
// 🛒 ZONO — Buyer Portal — authenticated JSON API. 32.3. Part: PUBLIC API.
// Every endpoint resolves the SIGNED-IN buyer server-side (no client buyerId) and
// scopes reads to that buyer only. GET reads; POST /ask.
// GET  /api/buyer-portal/dashboard | favorites | profile | appointments |
//      messages | documents | recommendations | property/:id
// POST /api/buyer-portal/ask   { query }
// ============================================================================
import { NextResponse } from "next/server";
import { getBuyerDashboard, getBuyerFavorites, getBuyerProfile, getBuyerAppointments, getBuyerMessages, getBuyerDocuments, getBuyerRecommendations, getBuyerProperty, askBuyer, type PortalResult } from "@/lib/buyer-portal";

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
  const [seg, ...rest] = path;
  switch (seg) {
    case "dashboard": return wrap(await getBuyerDashboard());
    case "favorites": return wrap(await getBuyerFavorites());
    case "profile": return wrap(await getBuyerProfile());
    case "appointments": return wrap(await getBuyerAppointments());
    case "messages": return wrap(await getBuyerMessages());
    case "documents": return wrap(await getBuyerDocuments());
    case "recommendations": return wrap(await getBuyerRecommendations());
    case "property": return rest[0] ? wrap(await getBuyerProperty(rest[0])) : notFound();
    default: return notFound();
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  if (path[0] !== "ask") return notFound();
  let body: { query?: string } = {};
  try { body = (await req.json()) as { query?: string }; } catch { body = {}; }
  return wrap(await askBuyer((body.query ?? "").slice(0, 500)));
}
