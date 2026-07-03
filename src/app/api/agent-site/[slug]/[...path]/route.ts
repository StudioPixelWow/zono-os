// ============================================================================
// 👤 ZONO — AI Agent Website — public JSON API. 32.2. Part: PUBLIC API.
// Public, read-only, PUBLIC-SAFE endpoints per broker slug. GET reads; POST /ask.
// GET  /api/agent-site/:slug                 → home
// GET  /api/agent-site/:slug/properties      → broker listings
// GET  /api/agent-site/:slug/property/:id
// GET  /api/agent-site/:slug/areas
// GET  /api/agent-site/:slug/area/:name
// GET  /api/agent-site/:slug/about
// POST /api/agent-site/:slug/ask             { query }
// ============================================================================
import { NextResponse } from "next/server";
import { getAgentHomeAi, getAgentProperties, getAgentPropertyAi, getAgentAreas, getAgentAreaAi, getAgentAbout, askAgent } from "@/lib/agent-site";

export const runtime = "nodejs";
export const revalidate = 300;

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
const disabled = () => NextResponse.json({ error: "site_unavailable" }, { status: 404 });
const wrap = (r: unknown) => (r === null ? notFound() : r === "disabled" ? disabled() : NextResponse.json({ ok: true, data: r }));

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path = [] } = await ctx.params;
  const [seg, ...rest] = path;
  if (!seg) return wrap(await getAgentHomeAi(slug));
  if (seg === "properties") return wrap(await getAgentProperties(slug));
  if (seg === "property" && rest[0]) return wrap(await getAgentPropertyAi(slug, rest[0]));
  if (seg === "areas") return wrap(await getAgentAreas(slug));
  if (seg === "area" && rest[0]) return wrap(await getAgentAreaAi(slug, decodeURIComponent(rest[0])));
  if (seg === "about") return wrap(await getAgentAbout(slug));
  return notFound();
}

export async function POST(req: Request, ctx: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path = [] } = await ctx.params;
  if (path[0] !== "ask") return notFound();
  let body: { query?: string } = {};
  try { body = (await req.json()) as { query?: string }; } catch { body = {}; }
  return wrap(await askAgent(slug, (body.query ?? "").slice(0, 500)));
}
