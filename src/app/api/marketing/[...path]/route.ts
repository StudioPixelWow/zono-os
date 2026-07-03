// ============================================================================
// 📣 ZONO — Marketing Core — internal JSON API. 33.0.
// POST /api/marketing/ask     { query }          → Marketing Ask (reuses Ask ZONO)
// POST /api/marketing/propose { campaignId }      → approval-gated action proposal
// Nothing publishes; nothing auto-executes.
// ============================================================================
import { NextResponse } from "next/server";
import { askMarketing, proposeCampaignActions } from "@/lib/marketing-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { body = {}; }
  if (path[0] === "ask") {
    const query = typeof body.query === "string" ? body.query.slice(0, 400) : "";
    return NextResponse.json({ ok: true, data: await askMarketing(query) });
  }
  if (path[0] === "propose") {
    const id = typeof body.campaignId === "string" ? body.campaignId : "";
    const r = await proposeCampaignActions(id);
    return r ? NextResponse.json({ ok: true, data: r }) : notFound();
  }
  return notFound();
}
