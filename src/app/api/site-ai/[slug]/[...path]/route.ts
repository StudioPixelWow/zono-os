// ============================================================================
// 🌐 ZONO — AI Brokerage Website — public JSON API. 32.1. Part: PUBLIC API.
// Public, read-only, PUBLIC-SAFE endpoints per office slug. GET reads; POST /ask.
// GET  /api/site-ai/:slug            → home
// GET  /api/site-ai/:slug/property/:id
// GET  /api/site-ai/:slug/neighborhood/:name
// GET  /api/site-ai/:slug/office
// POST /api/site-ai/:slug/ask         { query }
// ============================================================================
import { NextResponse } from "next/server";
import { getHomeAi, getPropertyAi, getNeighborhoodAi, getOfficeAi, askPublic } from "@/lib/brokerage-site";

export const runtime = "nodejs";
export const revalidate = 300;   // ISR-friendly caching

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
const disabled = () => NextResponse.json({ error: "site_unavailable" }, { status: 404 });
const wrap = (r: unknown) => (r === null ? notFound() : r === "disabled" ? disabled() : NextResponse.json({ ok: true, data: r }));

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path = [] } = await ctx.params;
  const [seg, ...rest] = path;
  if (!seg) return wrap(await getHomeAi(slug));
  if (seg === "property" && rest[0]) return wrap(await getPropertyAi(slug, rest[0]));
  if (seg === "neighborhood" && rest[0]) return wrap(await getNeighborhoodAi(slug, decodeURIComponent(rest[0])));
  if (seg === "office") return wrap(await getOfficeAi(slug));
  return notFound();
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path = [] } = await ctx.params;
  if (path[0] !== "ask") return notFound();
  let body: { query?: string } = {};
  try { body = (await req.json()) as { query?: string }; } catch { body = {}; }
  return wrap(await askPublic(slug, (body.query ?? "").slice(0, 500)));
}
