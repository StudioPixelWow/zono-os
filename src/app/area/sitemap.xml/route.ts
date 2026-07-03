// ============================================================================
// 🌍 ZONO — Area Portal — global sitemap index. 32.5. Part: SEO.
// Lists every city page (per-city + neighborhood entries are linked from each).
// ============================================================================
import { listAreaCities, sitemapXml, cityUrl } from "@/lib/area-portal";
import type { SitemapEntry } from "@/lib/brokerage-site/types";

export const runtime = "nodejs";
export const revalidate = 3600;

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const cities = await listAreaCities().catch(() => [] as string[]);
  const entries: SitemapEntry[] = cities.map((c) => ({ loc: cityUrl(origin, c), changefreq: "daily", priority: 0.9 }));
  return new Response(sitemapXml(entries), { headers: { "content-type": "application/xml; charset=utf-8" } });
}
