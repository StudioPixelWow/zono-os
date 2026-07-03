// ============================================================================
// 🌍 ZONO — Area Portal — public JSON API. 32.5. Part: PUBLIC API.
// Public, read-only, PUBLIC-SAFE market intelligence per area. GET reads; POST
// /ask and /lead.
// GET  /api/area/city/:city
// GET  /api/area/neighborhood/:city/:neighborhood
// GET  /api/area/street/:city/:neighborhood/:street
// POST /api/area/ask   { city, neighborhood?, street?, query }
// POST /api/area/lead  { kind, city, neighborhood?, name?, phone?, email?, message? }
// ============================================================================
import { NextResponse } from "next/server";
import { getCity, getNeighborhood, getStreet, askArea, submitAreaLead } from "@/lib/area-portal";

export const runtime = "nodejs";
export const revalidate = 600;

const notFound = () => NextResponse.json({ error: "not_found" }, { status: 404 });
const dec = (v?: string) => (v ? decodeURIComponent(v) : "");
const wrap = (r: unknown) => (r === null ? notFound() : NextResponse.json({ ok: true, data: r }));

export async function GET(_req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  const [seg, ...rest] = path;
  if (seg === "city" && rest[0]) return wrap(await getCity(dec(rest[0])));
  if (seg === "neighborhood" && rest[0] && rest[1]) return wrap(await getNeighborhood(dec(rest[0]), dec(rest[1])));
  if (seg === "street" && rest[0] && rest[1] && rest[2]) return wrap(await getStreet(dec(rest[0]), dec(rest[1]), dec(rest[2])));
  return notFound();
}

export async function POST(req: Request, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path = [] } = await ctx.params;
  let body: Record<string, unknown> = {};
  try { body = (await req.json()) as Record<string, unknown>; } catch { body = {}; }
  const str = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : undefined);
  if (path[0] === "ask") {
    const city = str("city"); if (!city) return notFound();
    return wrap(await askArea(city, str("neighborhood") ?? null, str("street") ?? null, (str("query") ?? "").slice(0, 400)));
  }
  if (path[0] === "lead") {
    const city = str("city"); if (!city) return notFound();
    return wrap(await submitAreaLead({ kind: str("kind") ?? "contact", city, neighborhood: str("neighborhood"), name: str("name"), phone: str("phone"), email: str("email"), message: str("message") }));
  }
  return notFound();
}
