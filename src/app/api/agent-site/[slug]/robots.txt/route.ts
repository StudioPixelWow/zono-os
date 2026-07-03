// ============================================================================
// 👤 ZONO — AI Agent Website — robots.txt per broker. 32.2. Part: SEO.
// ============================================================================
import { agentRobotsTxt } from "@/lib/agent-site";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const origin = new URL(req.url).origin;
  return new Response(agentRobotsTxt(origin, slug), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
