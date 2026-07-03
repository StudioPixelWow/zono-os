// ============================================================================
// 🌐 ZONO — AI Brokerage Website — sitemap.xml per office. 32.1. Part: SEO.
// ============================================================================
import { getSitemap, sitemapXml } from "@/lib/brokerage-site";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const origin = new URL(req.url).origin;
  const entries = await getSitemap(slug, origin);
  return new Response(sitemapXml(entries), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
