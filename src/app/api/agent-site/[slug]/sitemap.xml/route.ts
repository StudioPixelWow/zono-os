// ============================================================================
// 👤 ZONO — AI Agent Website — sitemap.xml per broker. 32.2. Part: SEO.
// ============================================================================
import { getAgentSitemap, sitemapXml } from "@/lib/agent-site";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const origin = new URL(req.url).origin;
  const entries = await getAgentSitemap(slug, origin);
  return new Response(sitemapXml(entries), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
