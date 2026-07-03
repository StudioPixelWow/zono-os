// ============================================================================
// 🌐 ZONO — AI Brokerage Website — robots.txt per office. 32.1. Part: SEO.
// ============================================================================
import { robotsTxt } from "@/lib/brokerage-site";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const origin = new URL(req.url).origin;
  return new Response(robotsTxt(origin, slug), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
